import type { EndpointType } from "@matter/main";
import { OnOffPlugInUnitDevice } from "@matter/main/devices";
import { EntityStateProvider } from "../../../../services/bridges/entity-state-provider.js";
import { BasicInformationServer } from "../../../behaviors/basic-information-server.js";
import { HaElectricalEnergyMeasurementServer } from "../../../behaviors/electrical-energy-measurement-server.js";
import { HaElectricalPowerMeasurementServer } from "../../../behaviors/electrical-power-measurement-server.js";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../behaviors/identify-server.js";
import { OnOffServer } from "../../../behaviors/on-off-server.js";
import { PowerSourceServer } from "../../../behaviors/power-source-server.js";

const SwitchOnOffServer = OnOffServer();

const SwitchEndpointType = OnOffPlugInUnitDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  SwitchOnOffServer,
);

const SwitchWithBatteryEndpointType = OnOffPlugInUnitDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  SwitchOnOffServer,
  PowerSourceServer({
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
  }),
);

export function SwitchDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
): EndpointType {
  const attrs = homeAssistantEntity.entity.state.attributes as {
    battery?: number;
    battery_level?: number;
  };
  const hasBatteryAttr = attrs.battery_level != null || attrs.battery != null;
  const hasBatteryEntity = !!homeAssistantEntity.mapping?.batteryEntity;
  const hasPowerEntity = !!homeAssistantEntity.mapping?.powerEntity;
  const hasEnergyEntity = !!homeAssistantEntity.mapping?.energyEntity;

  let device =
    hasBatteryAttr || hasBatteryEntity
      ? SwitchWithBatteryEndpointType
      : SwitchEndpointType;

  if (hasPowerEntity) {
    device = device.with(HaElectricalPowerMeasurementServer);
  }
  if (hasEnergyEntity) {
    device = device.with(HaElectricalEnergyMeasurementServer);
  }

  return device.set({ homeAssistantEntity });
}
