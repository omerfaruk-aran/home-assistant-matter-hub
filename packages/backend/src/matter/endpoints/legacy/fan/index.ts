import {
  type FanDeviceAttributes,
  FanDeviceFeature,
} from "@home-assistant-matter-hub/common";
import type { EndpointType } from "@matter/main";
import type { FanControl } from "@matter/main/clusters";
import {
  FanDevice as Device,
  OnOffPlugInUnitDevice,
} from "@matter/main/devices";
import { EntityStateProvider } from "../../../../services/bridges/entity-state-provider.js";
import type { FeatureSelection } from "../../../../utils/feature-selection.js";
import { testBit } from "../../../../utils/test-bit.js";
import { BasicInformationServer } from "../../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../behaviors/identify-server.js";
import { PowerSourceServer } from "../../../behaviors/power-source-server.js";
import { FanFanControlServer } from "./behaviors/fan-fan-control-server.js";
import { FanOnOffServer } from "./behaviors/fan-on-off-server.js";

const FanPowerSourceServer = PowerSourceServer({
  getBatteryPercent: (entity, agent) => {
    // First check for battery entity from mapping (auto-assigned or manual)
    const homeAssistant = agent.get(HomeAssistantEntityBehavior);
    const batteryEntity = homeAssistant.state.mapping?.batteryEntity;
    if (batteryEntity) {
      const stateProvider = agent.env.get(EntityStateProvider);
      const battery = stateProvider.getBatteryPercent(batteryEntity);
      if (battery != null) {
        return Math.max(0, Math.min(100, battery));
      }
    }

    // Fallback to entity's own battery attribute
    const attrs = entity.attributes as {
      battery?: number;
      battery_level?: number;
    };
    const level = attrs.battery_level ?? attrs.battery;
    if (level == null || Number.isNaN(Number(level))) {
      return null;
    }
    return Number(level);
  },
});

export function FanDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
): EndpointType {
  const attributes = homeAssistantEntity.entity.state
    .attributes as FanDeviceAttributes & {
    battery?: number;
    battery_level?: number;
  };
  const supportedFeatures = attributes.supported_features ?? 0;
  const hasBatteryAttr =
    attributes.battery_level != null || attributes.battery != null;
  const hasBatteryEntity = !!homeAssistantEntity.mapping?.batteryEntity;
  const hasBattery = hasBatteryAttr || hasBatteryEntity;

  const hasSetSpeed = testBit(supportedFeatures, FanDeviceFeature.SET_SPEED);
  const hasPresetMode = testBit(
    supportedFeatures,
    FanDeviceFeature.PRESET_MODE,
  );
  const presetModes = attributes.preset_modes ?? [];
  // Filter out "Auto" from presets for speed calculation
  const speedPresets = presetModes.filter((m) => m.toLowerCase() !== "auto");

  // On/off-only fan: no speed control and no speed-capable preset modes.
  // Use OnOffPlugInUnitDevice to avoid controllers showing percentage/speed
  // controls from the FanControl cluster's mandatory percentSetting attribute.
  if (!hasSetSpeed && speedPresets.length === 0) {
    const onOffDevice = hasBattery
      ? OnOffPlugInUnitDevice.with(
          IdentifyServer,
          BasicInformationServer,
          HomeAssistantEntityBehavior,
          FanOnOffServer,
          FanPowerSourceServer,
        )
      : OnOffPlugInUnitDevice.with(
          IdentifyServer,
          BasicInformationServer,
          HomeAssistantEntityBehavior,
          FanOnOffServer,
        );
    return onOffDevice.set({ homeAssistantEntity });
  }

  const features: FeatureSelection<FanControl.Cluster> = new Set();

  // Enable MultiSpeed and Step for fans with percentage control OR preset modes
  // For preset-only fans, speeds are mapped to preset modes (Low/Medium/High etc.)
  if (hasSetSpeed || speedPresets.length > 0) {
    features.add("MultiSpeed");
    features.add("Step");
  }

  // Enable Auto if fan supports preset modes (including "Auto" preset)
  if (hasPresetMode) {
    features.add("Auto");
  }
  if (testBit(supportedFeatures, FanDeviceFeature.DIRECTION)) {
    features.add("AirflowDirection");
  }
  // Enable Rocking (oscillation) if fan supports it
  if (testBit(supportedFeatures, FanDeviceFeature.OSCILLATE)) {
    features.add("Rocking");
  }
  // Enable Wind mode if fan has natural/sleep preset modes
  const hasWindModes = presetModes.some(
    (m) =>
      m.toLowerCase() === "natural" ||
      m.toLowerCase() === "nature" ||
      m.toLowerCase() === "sleep",
  );
  if (hasWindModes) {
    features.add("Wind");
  }

  const device = hasBattery
    ? Device.with(
        IdentifyServer,
        BasicInformationServer,
        HomeAssistantEntityBehavior,
        FanOnOffServer,
        FanFanControlServer.with(...features),
        FanPowerSourceServer,
      )
    : Device.with(
        IdentifyServer,
        BasicInformationServer,
        HomeAssistantEntityBehavior,
        FanOnOffServer,
        FanFanControlServer.with(...features),
      );
  return device.set({ homeAssistantEntity });
}
