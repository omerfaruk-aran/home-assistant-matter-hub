import type { ColorControl } from "@matter/main/clusters";
import { ExtendedColorLightDevice as Device } from "@matter/main/devices";
import { EntityStateProvider } from "../../../../../services/bridges/entity-state-provider.js";
import type { FeatureSelection } from "../../../../../utils/feature-selection.js";
import { BasicInformationServer } from "../../../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../../behaviors/identify-server.js";
import { PowerSourceServer } from "../../../../behaviors/power-source-server.js";
import { LightColorControlServer } from "../behaviors/light-color-control-server.js";
import { LightLevelControlServer } from "../behaviors/light-level-control-server.js";
import { LightOnOffServer } from "../behaviors/light-on-off-server.js";

const LightPowerSourceServer = PowerSourceServer({
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

export const ExtendedColorLightType = (
  supportsColorControl: boolean,
  supportsTemperature: boolean,
  hasBattery = false,
) => {
  const features: FeatureSelection<ColorControl.Cluster> = new Set();
  if (supportsColorControl) {
    features.add("HueSaturation");
  }
  if (supportsTemperature) {
    features.add("ColorTemperature");
  }

  if (hasBattery) {
    return Device.with(
      IdentifyServer,
      BasicInformationServer,
      HomeAssistantEntityBehavior,
      LightOnOffServer,
      LightLevelControlServer,
      LightColorControlServer.with(...features),
      LightPowerSourceServer,
    );
  }

  return Device.with(
    IdentifyServer,
    BasicInformationServer,
    HomeAssistantEntityBehavior,
    LightOnOffServer,
    LightLevelControlServer,
    LightColorControlServer.with(...features),
  );
};
