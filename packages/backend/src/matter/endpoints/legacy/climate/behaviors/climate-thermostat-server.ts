import {
  type ClimateDeviceAttributes,
  ClimateDeviceFeature,
  ClimateHvacAction,
  ClimateHvacMode,
  type HomeAssistantEntityState,
} from "@home-assistant-matter-hub/common";
import type { Agent } from "@matter/main";
import { Thermostat } from "@matter/main/clusters";
import { HomeAssistantConfig } from "../../../../../services/home-assistant/home-assistant-config.js";
import { Temperature } from "../../../../../utils/converters/temperature.js";
import { testBit } from "../../../../../utils/test-bit.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import {
  ThermostatServer,
  type ThermostatServerConfig,
  type ThermostatServerFeatures,
  type ThermostatServerInitialState,
} from "../../../../behaviors/thermostat-server.js";

const getUnit = (agent: Agent) =>
  agent.env.get(HomeAssistantConfig).unitSystem.temperature;
const attributes = (entity: HomeAssistantEntityState) =>
  <ClimateDeviceAttributes>entity.attributes;
const getTemp = (
  agent: Agent,
  entity: HomeAssistantEntityState,
  attributeName: keyof ClimateDeviceAttributes,
) => {
  const temperature = attributes(entity)[attributeName] as
    | string
    | number
    | null
    | undefined;
  const unit = getUnit(agent);
  if (temperature != null) {
    return Temperature.withUnit(+temperature, unit);
  }
};

const systemModeToHvacMode: Record<Thermostat.SystemMode, ClimateHvacMode> = {
  [Thermostat.SystemMode.Auto]: ClimateHvacMode.heat_cool,
  [Thermostat.SystemMode.Precooling]: ClimateHvacMode.cool,
  [Thermostat.SystemMode.Cool]: ClimateHvacMode.cool,
  [Thermostat.SystemMode.Heat]: ClimateHvacMode.heat,
  [Thermostat.SystemMode.EmergencyHeat]: ClimateHvacMode.heat,
  [Thermostat.SystemMode.FanOnly]: ClimateHvacMode.fan_only,
  [Thermostat.SystemMode.Dry]: ClimateHvacMode.dry,
  [Thermostat.SystemMode.Sleep]: ClimateHvacMode.off,
  [Thermostat.SystemMode.Off]: ClimateHvacMode.off,
};
const hvacActionToRunningMode: Record<
  ClimateHvacAction,
  Thermostat.ThermostatRunningMode
> = {
  [ClimateHvacAction.preheating]: Thermostat.ThermostatRunningMode.Heat,
  [ClimateHvacAction.defrosting]: Thermostat.ThermostatRunningMode.Heat,
  [ClimateHvacAction.heating]: Thermostat.ThermostatRunningMode.Heat,
  [ClimateHvacAction.drying]: Thermostat.ThermostatRunningMode.Heat,
  [ClimateHvacAction.cooling]: Thermostat.ThermostatRunningMode.Cool,
  [ClimateHvacAction.fan]: Thermostat.ThermostatRunningMode.Off,
  [ClimateHvacAction.idle]: Thermostat.ThermostatRunningMode.Off,
  [ClimateHvacAction.off]: Thermostat.ThermostatRunningMode.Off,
};
const hvacModeToSystemMode: Record<ClimateHvacMode, Thermostat.SystemMode> = {
  [ClimateHvacMode.heat]: Thermostat.SystemMode.Heat,
  [ClimateHvacMode.cool]: Thermostat.SystemMode.Cool,
  [ClimateHvacMode.auto]: Thermostat.SystemMode.Auto,
  [ClimateHvacMode.heat_cool]: Thermostat.SystemMode.Auto,
  [ClimateHvacMode.dry]: Thermostat.SystemMode.Dry,
  [ClimateHvacMode.fan_only]: Thermostat.SystemMode.FanOnly,
  [ClimateHvacMode.off]: Thermostat.SystemMode.Off,
};

/**
 * Detect heat_cool-only zones: entities that have heat_cool but no explicit
 * heat or cool mode. These zones follow the main system and can't independently
 * switch between heating and cooling. Per Matter spec, they SHOULD report
 * CoolingOnly or HeatingOnly based on the current capability.
 */
function isHeatCoolOnly(modes: ClimateHvacMode[]): boolean {
  return (
    modes.includes(ClimateHvacMode.heat_cool) &&
    !modes.includes(ClimateHvacMode.heat) &&
    !modes.includes(ClimateHvacMode.cool)
  );
}

/**
 * Track last known active HVAC direction for heat_cool-only zones.
 * When idle, hvac_action doesn't reveal the main system's mode,
 * so we remember the last active direction to avoid mode flipping.
 */
const lastHvacDirection = new Map<string, "heating" | "cooling">();

function getHeatCoolOnlyDirection(
  entity: HomeAssistantEntityState,
  agent: Agent,
): "heating" | "cooling" {
  const action = attributes(entity).hvac_action;
  const homeAssistant = agent.get(HomeAssistantEntityBehavior);
  const entityId = homeAssistant.entityId;

  if (
    action === ClimateHvacAction.heating ||
    action === ClimateHvacAction.preheating ||
    action === ClimateHvacAction.defrosting ||
    action === ClimateHvacAction.drying
  ) {
    lastHvacDirection.set(entityId, "heating");
    return "heating";
  }
  if (action === ClimateHvacAction.cooling) {
    lastHvacDirection.set(entityId, "cooling");
    return "cooling";
  }
  // idle/off/fan: use last known direction, default to heating
  return lastHvacDirection.get(entityId) ?? "heating";
}

const config: ThermostatServerConfig = {
  // Temperature range (target_temp_low/high) only works in heat_cool mode.
  // In heat or cool mode, HA expects a single "temperature" value.
  // We must check BOTH the feature flag AND the current HVAC mode.
  supportsTemperatureRange: (entity) => {
    const hasFeature = testBit(
      entity.attributes.supported_features ?? 0,
      ClimateDeviceFeature.TARGET_TEMPERATURE_RANGE,
    );
    const currentMode = entity.state as ClimateHvacMode;
    const isRangeMode =
      currentMode === ClimateHvacMode.heat_cool ||
      currentMode === ClimateHvacMode.auto;
    return hasFeature && isRangeMode;
  },
  getMinTemperature: (entity, agent) => getTemp(agent, entity, "min_temp"),
  getMaxTemperature: (entity, agent) => getTemp(agent, entity, "max_temp"),
  getCurrentTemperature: (entity, agent) =>
    getTemp(agent, entity, "current_temperature"),
  getTargetHeatingTemperature: (entity, agent) =>
    getTemp(agent, entity, "target_temp_low") ??
    getTemp(agent, entity, "target_temperature") ??
    getTemp(agent, entity, "temperature"),
  getTargetCoolingTemperature: (entity, agent) =>
    getTemp(agent, entity, "target_temp_high") ??
    getTemp(agent, entity, "target_temperature") ??
    getTemp(agent, entity, "temperature"),
  getSystemMode: (entity, agent) => {
    const hvacMode = entity.state as ClimateHvacMode;
    const systemMode =
      hvacModeToSystemMode[hvacMode] ?? Thermostat.SystemMode.Off;
    // Map SystemMode.Auto to the correct mode based on device capabilities.
    // Matter AutoMode = dual setpoint = HA heat_cool.
    // HA auto ≠ Matter Auto — it's a single-setpoint mode where the device decides.
    if (systemMode === Thermostat.SystemMode.Auto) {
      const modes = attributes(entity).hvac_modes ?? [];

      // heat_cool-only zones: dynamically switch between Heat and Cool
      // based on hvac_action to reflect the main system's mode (#207).
      if (isHeatCoolOnly(modes)) {
        const direction = getHeatCoolOnlyDirection(entity, agent);
        return direction === "cooling"
          ? Thermostat.SystemMode.Cool
          : Thermostat.SystemMode.Heat;
      }

      // Device supports heat_cool with explicit heat/cool: keep SystemMode.Auto
      const hasHeatCool = modes.includes(ClimateHvacMode.heat_cool);
      if (hasHeatCool) {
        return systemMode;
      }

      // No heat_cool: map HA auto → Heat/Cool based on device capabilities or action
      const hasCooling = modes.some((m) => m === ClimateHvacMode.cool);
      const hasHeating = modes.some(
        (m) => m === ClimateHvacMode.heat || m === ClimateHvacMode.auto,
      );
      if (hasHeating && !hasCooling) {
        return Thermostat.SystemMode.Heat;
      }
      if (hasCooling && !hasHeating) {
        return Thermostat.SystemMode.Cool;
      }
      // Both heat and cool but no heat_cool: use hvac_action to decide
      const action = attributes(entity).hvac_action;
      if (action === ClimateHvacAction.cooling) {
        return Thermostat.SystemMode.Cool;
      }
      return Thermostat.SystemMode.Heat;
    }
    return systemMode;
  },
  getRunningMode: (entity) => {
    const action = attributes(entity).hvac_action;
    if (!action) {
      return Thermostat.ThermostatRunningMode.Off;
    }
    return (
      hvacActionToRunningMode[action] ?? Thermostat.ThermostatRunningMode.Off
    );
  },
  getControlSequence: (entity, agent) => {
    const modes = attributes(entity).hvac_modes ?? [];

    // heat_cool-only zones: dynamically report HeatingOnly or CoolingOnly
    // based on hvac_action to reflect the main system's current mode (#207).
    if (isHeatCoolOnly(modes)) {
      const direction = getHeatCoolOnlyDirection(entity, agent);
      return direction === "cooling"
        ? Thermostat.ControlSequenceOfOperation.CoolingOnly
        : Thermostat.ControlSequenceOfOperation.HeatingOnly;
    }

    const hasCooling = modes.some(
      (m) => m === ClimateHvacMode.cool || m === ClimateHvacMode.heat_cool,
    );
    const hasHeating = modes.some(
      (m) =>
        m === ClimateHvacMode.heat ||
        m === ClimateHvacMode.heat_cool ||
        m === ClimateHvacMode.auto,
    );
    if (hasCooling && hasHeating) {
      // CoolingAndHeating only for devices with AutoMode (heat_cool + explicit
      // heat or cool). Devices like SmartIR ACs with auto+cool but no explicit
      // heat get dynamic CoolingOnly/HeatingOnly to avoid conformance errors
      // and match the Matter spec for non-independent-switching devices (#28).
      const hasAutoMode =
        modes.includes(ClimateHvacMode.heat_cool) &&
        (modes.includes(ClimateHvacMode.heat) ||
          modes.includes(ClimateHvacMode.cool));
      if (hasAutoMode) {
        return Thermostat.ControlSequenceOfOperation.CoolingAndHeating;
      }
      // Explicit heat+cool without heat_cool: also safe for CoolingAndHeating
      if (
        modes.includes(ClimateHvacMode.heat) &&
        modes.includes(ClimateHvacMode.cool)
      ) {
        return Thermostat.ControlSequenceOfOperation.CoolingAndHeating;
      }
      // Non-explicit: determine from current mode/action
      const hvacMode = entity.state as ClimateHvacMode;
      if (hvacMode === ClimateHvacMode.cool) {
        return Thermostat.ControlSequenceOfOperation.CoolingOnly;
      }
      if (hvacMode === ClimateHvacMode.heat) {
        return Thermostat.ControlSequenceOfOperation.HeatingOnly;
      }
      const direction = getHeatCoolOnlyDirection(entity, agent);
      return direction === "cooling"
        ? Thermostat.ControlSequenceOfOperation.CoolingOnly
        : Thermostat.ControlSequenceOfOperation.HeatingOnly;
    }
    if (hasCooling) {
      return Thermostat.ControlSequenceOfOperation.CoolingOnly;
    }
    return Thermostat.ControlSequenceOfOperation.HeatingOnly;
  },
  setSystemMode: (systemMode, agent) => {
    const homeAssistant = agent.get(HomeAssistantEntityBehavior);
    const hvacModes = attributes(homeAssistant.entity.state).hvac_modes ?? [];
    let targetMode = systemModeToHvacMode[systemMode] ?? ClimateHvacMode.off;

    // heat_cool-only zones: map any non-Off mode back to heat_cool
    // since the zone can't independently switch between heat and cool.
    if (isHeatCoolOnly(hvacModes) && systemMode !== Thermostat.SystemMode.Off) {
      targetMode = ClimateHvacMode.heat_cool;
    } else if (systemMode === Thermostat.SystemMode.Auto) {
      // Handle Auto mode: prefer 'auto' if explicitly available, otherwise use 'heat_cool' (default)
      if (hvacModes.includes(ClimateHvacMode.auto)) {
        targetMode = ClimateHvacMode.auto;
      }
      // Otherwise keep heat_cool from the static mapping
    }

    return {
      action: "climate.set_hvac_mode",
      data: { hvac_mode: targetMode },
    };
  },
  setTargetTemperature: (value, agent) => ({
    action: "climate.set_temperature",
    data: {
      temperature: value.toUnit(getUnit(agent)),
    },
  }),
  setTargetTemperatureRange: ({ low, high }, agent) => ({
    action: "climate.set_temperature",
    data: {
      target_temp_low: low.toUnit(getUnit(agent)),
      target_temp_high: high.toUnit(getUnit(agent)),
    },
  }),
};
/**
 * Creates a ClimateThermostatServer with the specified initial state.
 *
 * CRITICAL: The initial state values are passed DIRECTLY to Matter.js during
 * behavior registration. This prevents NaN validation errors because Matter.js
 * validates setpoints BEFORE our initialize() method runs.
 *
 * Pass ALL thermostat attributes during registration.
 *
 * @param initialState - Initial attribute values (temperature, setpoints, limits)
 */
export function ClimateThermostatServer(
  initialState: ThermostatServerInitialState = {},
  features?: ThermostatServerFeatures,
) {
  return ThermostatServer(config, initialState, features);
}
