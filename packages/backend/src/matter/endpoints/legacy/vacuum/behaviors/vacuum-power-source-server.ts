import {
  type VacuumDeviceAttributes,
  VacuumState,
} from "@home-assistant-matter-hub/common";
import { EntityStateProvider } from "../../../../../services/bridges/entity-state-provider.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import { PowerSourceServer } from "../../../../behaviors/power-source-server.js";

export const VacuumPowerSourceServer = PowerSourceServer({
  getBatteryPercent(entity, agent) {
    // First check for battery entity from mapping (for Roomba, Deebot, etc.)
    const homeAssistant = agent.get(HomeAssistantEntityBehavior);
    const batteryEntity = homeAssistant.state.mapping?.batteryEntity;
    if (batteryEntity) {
      const stateProvider = agent.env.get(EntityStateProvider);
      const battery = stateProvider.getBatteryPercent(batteryEntity);
      if (battery != null) {
        return Math.max(0, Math.min(100, battery));
      }
    }

    // Fallback to vacuum entity attributes (Dreame, Xiaomi, etc.)
    const attributes = entity.attributes as VacuumDeviceAttributes;
    // Some vacuums use 'battery_level', others use 'battery' (e.g. Dreame)
    const batteryLevel = attributes.battery_level ?? attributes.battery;
    if (batteryLevel == null || typeof batteryLevel !== "number") {
      return null;
    }
    return batteryLevel;
  },
  isCharging(entity) {
    const state = entity.state as VacuumState | "unavailable";
    // Vacuum is typically charging when docked
    return state === VacuumState.docked;
  },
});
