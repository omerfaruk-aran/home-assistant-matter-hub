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
  getSystemMode: (entity) => {
    const hvacMode = entity.state as ClimateHvacMode;
    const systemMode =
      hvacModeToSystemMode[hvacMode] ?? Thermostat.SystemMode.Off;
    // For heat-only or cool-only thermostats (e.g. TRVs with auto+heat but no cool),
    // don't expose SystemMode.Auto — controllers like Alexa interpret Auto as
    // dual-setpoint and refuse single temperature commands ("keeps temperature
    // between X and Y"). Map auto → Heat or Cool based on actual capabilities.
    if (systemMode === Thermostat.SystemMode.Auto) {
      const modes = attributes(entity).hvac_modes ?? [];
      const hasCooling = modes.some(
        (m) => m === ClimateHvacMode.cool || m === ClimateHvacMode.heat_cool,
      );
      const hasHeating = modes.some(
        (m) =>
          m === ClimateHvacMode.heat ||
          m === ClimateHvacMode.heat_cool ||
          m === ClimateHvacMode.auto,
      );
      if (hasHeating && !hasCooling) {
        return Thermostat.SystemMode.Heat;
      }
      if (hasCooling && !hasHeating) {
        return Thermostat.SystemMode.Cool;
      }
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
  getControlSequence: (entity) => {
    const modes = attributes(entity).hvac_modes ?? [];
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
      return Thermostat.ControlSequenceOfOperation.CoolingAndHeating;
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

    // Handle Auto mode: prefer 'auto' if explicitly available, otherwise use 'heat_cool' (default)
    if (systemMode === Thermostat.SystemMode.Auto) {
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
