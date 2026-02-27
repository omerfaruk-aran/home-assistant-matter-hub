import type {
  ClimateDeviceAttributes,
  EntityMappingConfig,
  FanDeviceAttributes,
  HomeAssistantEntityInformation,
  HomeAssistantEntityState,
  SensorDeviceAttributes,
} from "@home-assistant-matter-hub/common";
import {
  ClimateDeviceFeature,
  ClimateHvacMode,
  FanDeviceFeature,
} from "@home-assistant-matter-hub/common";
import {
  DestroyedDependencyError,
  Logger,
  TransactionDestroyedError,
} from "@matter/general";
import { Endpoint, type EndpointType } from "@matter/main";
import { FixedLabelServer } from "@matter/main/behaviors";
import type { FanControl } from "@matter/main/clusters";
import {
  HumiditySensorDevice,
  TemperatureSensorDevice,
  ThermostatDevice,
} from "@matter/main/devices";
import { BridgedNodeEndpoint } from "@matter/main/endpoints";
import { DeviceTypeId } from "@matter/main/types";
import debounce from "debounce";
import type { BridgeRegistry } from "../../../services/bridges/bridge-registry.js";
import { EntityStateProvider } from "../../../services/bridges/entity-state-provider.js";
import { HomeAssistantConfig } from "../../../services/home-assistant/home-assistant-config.js";
import type { HomeAssistantStates } from "../../../services/home-assistant/home-assistant-registry.js";
import { Temperature } from "../../../utils/converters/temperature.js";
import type { FeatureSelection } from "../../../utils/feature-selection.js";
import { testBit } from "../../../utils/test-bit.js";
import { BasicInformationServer } from "../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../behaviors/home-assistant-entity-behavior.js";
import {
  type HumidityMeasurementConfig,
  HumidityMeasurementServer,
} from "../../behaviors/humidity-measurement-server.js";
import { IdentifyServer } from "../../behaviors/identify-server.js";
import { PowerSourceServer } from "../../behaviors/power-source-server.js";
import {
  type TemperatureMeasurementConfig,
  TemperatureMeasurementServer,
} from "../../behaviors/temperature-measurement-server.js";
import { ThermostatUiConfigServer } from "../../behaviors/thermostat-ui-config-server.js";
import { AirPurifierHepaFilterMonitoringServer } from "../legacy/air-purifier/behaviors/air-purifier-hepa-filter-monitoring-server.js";
import { ClimateHumidityMeasurementServer } from "../legacy/climate/behaviors/climate-humidity-measurement-server.js";
import { ClimateOnOffServer } from "../legacy/climate/behaviors/climate-on-off-server.js";
import { ClimateThermostatServer } from "../legacy/climate/behaviors/climate-thermostat-server.js";
import { FanFanControlServer } from "../legacy/fan/behaviors/fan-fan-control-server.js";
import { FanOnOffServer } from "../legacy/fan/behaviors/fan-on-off-server.js";

const logger = Logger.get("ComposedAirPurifierEndpoint");

// --- Direct configs for sub-endpoints (read from own entity state) ---

const temperatureConfig: TemperatureMeasurementConfig = {
  getValue(entity, agent) {
    const fallbackUnit =
      agent.env.get(HomeAssistantConfig).unitSystem.temperature;
    const state = entity.state;
    const attributes = entity.attributes as SensorDeviceAttributes;
    const temperature = state == null || Number.isNaN(+state) ? null : +state;
    if (temperature == null) return undefined;
    return Temperature.withUnit(
      temperature,
      attributes.unit_of_measurement ?? fallbackUnit,
    );
  },
};

const humidityConfig: HumidityMeasurementConfig = {
  getValue({ state }: HomeAssistantEntityState) {
    if (state == null || Number.isNaN(+state)) return null;
    return +state;
  },
};

const batteryConfig = {
  getBatteryPercent: (
    _entity: HomeAssistantEntityState,
    agent: { get: Function; env: { get: Function } },
  ): number | null => {
    const homeAssistant = agent.get(HomeAssistantEntityBehavior);
    const batteryEntity = homeAssistant.state.mapping?.batteryEntity;
    if (batteryEntity) {
      const stateProvider = agent.env.get(EntityStateProvider);
      const battery = stateProvider.getNumericState(batteryEntity);
      if (battery != null) return Math.max(0, Math.min(100, battery));
    }
    return null;
  },
};

// --- Sub-endpoint types (without BasicInformationServer) ---

const TemperatureSubType = TemperatureSensorDevice.with(
  IdentifyServer,
  HomeAssistantEntityBehavior,
  TemperatureMeasurementServer(temperatureConfig),
);

const HumiditySubType = HumiditySensorDevice.with(
  IdentifyServer,
  HomeAssistantEntityBehavior,
  HumidityMeasurementServer(humidityConfig),
);

// --- Helper ---

function createEndpointId(entityId: string, customName?: string): string {
  const baseName = customName || entityId;
  return baseName.replace(/\./g, "_").replace(/\s+/g, "_");
}

function buildEntityPayload(
  registry: BridgeRegistry,
  entityId: string,
): HomeAssistantEntityInformation | undefined {
  const state = registry.initialState(entityId);
  if (!state) return undefined;
  const entity = registry.entity(entityId);
  const deviceRegistry = registry.deviceOf(entityId);
  return {
    entity_id: entityId,
    state,
    registry: entity,
    deviceRegistry,
  };
}

// --- Air Purifier attributes ---

interface AirPurifierAttributes extends FanDeviceAttributes {
  filter_life?: number;
  filter_life_remaining?: number;
  filter_life_level?: number;
}

// --- Thermostat sub-endpoint type builder ---

const coolingModes: ClimateHvacMode[] = [
  ClimateHvacMode.heat_cool,
  ClimateHvacMode.cool,
];
const heatingModes: ClimateHvacMode[] = [
  ClimateHvacMode.heat_cool,
  ClimateHvacMode.heat,
];
const autoOnlyMode: ClimateHvacMode[] = [ClimateHvacMode.auto];
const ventilationOnlyModes: ClimateHvacMode[] = [
  ClimateHvacMode.fan_only,
  ClimateHvacMode.dry,
];

function toMatterTemp(
  value: string | number | null | undefined,
): number | undefined {
  if (value == null) return undefined;
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return undefined;
  return Math.round(num * 100);
}

function buildThermostatSubType(
  payload: HomeAssistantEntityInformation,
): EndpointType | undefined {
  const state = payload.state;
  const attributes = state.attributes as ClimateDeviceAttributes & {
    battery?: number;
    battery_level?: number;
  };
  const supportedFeatures = attributes.supported_features ?? 0;

  const heatCoolOnly =
    attributes.hvac_modes.includes(ClimateHvacMode.heat_cool) &&
    !attributes.hvac_modes.includes(ClimateHvacMode.heat) &&
    !attributes.hvac_modes.includes(ClimateHvacMode.cool);

  const supportsCooling = heatCoolOnly
    ? false
    : coolingModes.some((mode) => attributes.hvac_modes.includes(mode));
  const hasExplicitHeating = heatingModes.some((mode) =>
    attributes.hvac_modes.includes(mode),
  );
  const isAutoOnly =
    !hasExplicitHeating &&
    !supportsCooling &&
    autoOnlyMode.some((mode) => attributes.hvac_modes.includes(mode));
  const isVentilationOnly =
    !hasExplicitHeating &&
    !supportsCooling &&
    !isAutoOnly &&
    ventilationOnlyModes.some((mode) => attributes.hvac_modes.includes(mode));
  const supportsHeating = hasExplicitHeating || isAutoOnly || isVentilationOnly;

  if (!supportsCooling && !supportsHeating) {
    return undefined;
  }

  const supportsHumidity =
    attributes.current_humidity != null ||
    testBit(supportedFeatures, ClimateDeviceFeature.TARGET_HUMIDITY);
  const supportsOnOff =
    testBit(supportedFeatures, ClimateDeviceFeature.TURN_ON) &&
    testBit(supportedFeatures, ClimateDeviceFeature.TURN_OFF);

  const autoMode =
    supportsHeating &&
    supportsCooling &&
    attributes.hvac_modes.includes(ClimateHvacMode.heat_cool) &&
    (attributes.hvac_modes.includes(ClimateHvacMode.heat) ||
      attributes.hvac_modes.includes(ClimateHvacMode.cool));

  const initialState = {
    localTemperature: toMatterTemp(attributes.current_temperature),
    occupiedHeatingSetpoint:
      toMatterTemp(attributes.target_temp_low) ??
      toMatterTemp(attributes.temperature) ??
      2000,
    occupiedCoolingSetpoint:
      toMatterTemp(attributes.target_temp_high) ??
      toMatterTemp(attributes.temperature) ??
      2400,
    minHeatSetpointLimit: toMatterTemp(attributes.min_temp) ?? 0,
    maxHeatSetpointLimit: toMatterTemp(attributes.max_temp) ?? 5000,
    minCoolSetpointLimit: toMatterTemp(attributes.min_temp) ?? 0,
    maxCoolSetpointLimit: toMatterTemp(attributes.max_temp) ?? 5000,
  };

  const thermostatServer = ClimateThermostatServer(initialState, {
    heating: supportsHeating,
    cooling: supportsCooling,
    autoMode,
  });

  let device = ThermostatDevice.with(
    IdentifyServer,
    HomeAssistantEntityBehavior,
    thermostatServer,
    ThermostatUiConfigServer,
  );

  if (supportsOnOff) {
    device = device.with(ClimateOnOffServer);
  }
  if (supportsHumidity) {
    device = device.with(ClimateHumidityMeasurementServer);
  }

  return device.set({
    homeAssistantEntity: { entity: payload },
    thermostat: {
      ...(supportsHeating
        ? {
            absMinHeatSetpointLimit: initialState.minHeatSetpointLimit ?? 0,
            absMaxHeatSetpointLimit: initialState.maxHeatSetpointLimit ?? 5000,
            minHeatSetpointLimit: initialState.minHeatSetpointLimit ?? 0,
            maxHeatSetpointLimit: initialState.maxHeatSetpointLimit ?? 5000,
            occupiedHeatingSetpoint:
              initialState.occupiedHeatingSetpoint ?? 2000,
          }
        : {}),
      ...(supportsCooling
        ? {
            absMinCoolSetpointLimit: initialState.minCoolSetpointLimit ?? 0,
            absMaxCoolSetpointLimit: initialState.maxCoolSetpointLimit ?? 5000,
            minCoolSetpointLimit: initialState.minCoolSetpointLimit ?? 0,
            maxCoolSetpointLimit: initialState.maxCoolSetpointLimit ?? 5000,
            occupiedCoolingSetpoint:
              initialState.occupiedCoolingSetpoint ?? 2400,
          }
        : {}),
      localTemperature: initialState.localTemperature ?? null,
      ...(autoMode ? { minSetpointDeadBand: 0 } : {}),
    },
  });
}

// --- Config interface ---

export interface ComposedAirPurifierConfig {
  registry: BridgeRegistry;
  primaryEntityId: string;
  temperatureEntityId?: string;
  humidityEntityId?: string;
  climateEntityId?: string;
  batteryEntityId?: string;
  mapping?: EntityMappingConfig;
  customName?: string;
  areaName?: string;
}

// --- Main class ---

/**
 * A composed air purifier endpoint. The parent is a BridgedNodeEndpoint
 * with BOTH BridgedNode (0x0013) and AirPurifierDevice (0x002D) in its
 * deviceTypeList (Matter spec §9.4.4). BridgedNode is required for Apple
 * Home to identify the root of the bridged composed device. AirPurifier
 * tells controllers to render it as an air purifier.
 *
 * Structure:
 *   BridgedNode + AirPurifier (parent - fan control + basic info + optional battery)
 *     ├── TemperatureSensorDevice (sub-endpoint, if mapped)
 *     ├── HumiditySensorDevice (sub-endpoint, if mapped)
 *     └── ThermostatDevice (sub-endpoint, if mapped)
 */
export class ComposedAirPurifierEndpoint extends Endpoint {
  readonly entityId: string;
  private subEndpoints = new Map<string, Endpoint>();
  private lastStates = new Map<string, string>();
  private debouncedUpdates = new Map<
    string,
    ReturnType<
      typeof debounce<(ep: Endpoint, s: HomeAssistantEntityState) => void>
    >
  >();

  static async create(
    config: ComposedAirPurifierConfig,
  ): Promise<ComposedAirPurifierEndpoint | undefined> {
    const { registry, primaryEntityId } = config;

    const primaryPayload = buildEntityPayload(registry, primaryEntityId);
    if (!primaryPayload) return undefined;

    // Compute Air Purifier features from entity attributes
    const airPurifierAttributes = primaryPayload.state
      .attributes as AirPurifierAttributes;
    const supportedFeatures = airPurifierAttributes.supported_features ?? 0;
    const features: FeatureSelection<FanControl.Cluster> = new Set();

    if (testBit(supportedFeatures, FanDeviceFeature.SET_SPEED)) {
      features.add("MultiSpeed");
      features.add("Step");
    }
    if (testBit(supportedFeatures, FanDeviceFeature.PRESET_MODE)) {
      features.add("Auto");
    }
    if (testBit(supportedFeatures, FanDeviceFeature.DIRECTION)) {
      features.add("AirflowDirection");
    }
    if (testBit(supportedFeatures, FanDeviceFeature.OSCILLATE)) {
      features.add("Rocking");
    }
    const presetModes = airPurifierAttributes.preset_modes ?? [];
    const hasWindModes = presetModes.some(
      (m) =>
        m.toLowerCase() === "natural" ||
        m.toLowerCase() === "nature" ||
        m.toLowerCase() === "sleep",
    );
    if (hasWindModes) {
      features.add("Wind");
    }

    // Build parent type: BridgedNodeEndpoint with AirPurifierDevice type
    // in the deviceTypeList (Matter spec §9.4.4). A bridged composed device
    // root MUST have BridgedNode (0x0013) so controllers can identify the
    // root endpoint. We also add AirPurifierDevice (0x002D) so Apple Home
    // renders it as an air purifier tile.
    let parentType = BridgedNodeEndpoint.with(
      BasicInformationServer,
      IdentifyServer,
      HomeAssistantEntityBehavior,
      FanOnOffServer,
      FanFanControlServer.with(...features),
    );

    // Add HEPA filter monitoring if available
    const hasFilterLife =
      airPurifierAttributes.filter_life != null ||
      airPurifierAttributes.filter_life_remaining != null ||
      airPurifierAttributes.filter_life_level != null ||
      !!config.mapping?.filterLifeEntity;
    if (hasFilterLife) {
      parentType = parentType.with(AirPurifierHepaFilterMonitoringServer);
    }

    const mapping: EntityMappingConfig = {
      entityId: primaryEntityId,
      ...(config.batteryEntityId
        ? { batteryEntity: config.batteryEntityId }
        : {}),
      ...(config.mapping?.filterLifeEntity
        ? { filterLifeEntity: config.mapping.filterLifeEntity }
        : {}),
    };

    if (config.batteryEntityId) {
      parentType = parentType.with(PowerSourceServer(batteryConfig));
    }

    if (config.areaName) {
      const truncatedName =
        config.areaName.length > 16
          ? config.areaName.substring(0, 16)
          : config.areaName;
      parentType = parentType.with(
        FixedLabelServer.set({
          labelList: [{ label: "room", value: truncatedName }],
        }),
      );
    }

    // Build sub-endpoints (sensors + thermostat only — air purifier is the parent)
    const endpointId = createEndpointId(primaryEntityId, config.customName);
    const parts: Endpoint[] = [];
    const subEndpointMap = new Map<string, Endpoint>();

    // Temperature sub-endpoint (if mapped)
    let tempSub: Endpoint | undefined;
    if (config.temperatureEntityId) {
      const tempPayload = buildEntityPayload(
        registry,
        config.temperatureEntityId,
      );
      if (tempPayload) {
        tempSub = new Endpoint(
          TemperatureSubType.set({
            homeAssistantEntity: { entity: tempPayload },
          }),
          { id: `${endpointId}_temp` },
        );
        parts.push(tempSub);
        subEndpointMap.set(config.temperatureEntityId, tempSub);
      }
    }

    // Humidity sub-endpoint (if mapped)
    let humSub: Endpoint | undefined;
    if (config.humidityEntityId) {
      const humPayload = buildEntityPayload(registry, config.humidityEntityId);
      if (humPayload) {
        humSub = new Endpoint(
          HumiditySubType.set({
            homeAssistantEntity: { entity: humPayload },
          }),
          { id: `${endpointId}_humidity` },
        );
        parts.push(humSub);
        subEndpointMap.set(config.humidityEntityId, humSub);
      }
    }

    // Thermostat sub-endpoint (if mapped)
    let climateSub: Endpoint | undefined;
    if (config.climateEntityId) {
      const climatePayload = buildEntityPayload(
        registry,
        config.climateEntityId,
      );
      if (climatePayload) {
        const thermostatType = buildThermostatSubType(climatePayload);
        if (thermostatType) {
          climateSub = new Endpoint(thermostatType, {
            id: `${endpointId}_climate`,
          });
          parts.push(climateSub);
          subEndpointMap.set(config.climateEntityId, climateSub);
        }
      }
    }

    // Create parent endpoint with sub-endpoints as parts.
    // Pre-set deviceTypeList with BOTH BridgedNode + AirPurifierDevice so
    // Apple Home identifies the root AND renders the air purifier tile.
    const parentTypeWithState = parentType.set({
      descriptor: {
        deviceTypeList: [
          { deviceType: DeviceTypeId(0x0013), revision: 3 },
          { deviceType: DeviceTypeId(0x002d), revision: 2 },
        ],
      },
      homeAssistantEntity: {
        entity: primaryPayload,
        customName: config.customName,
        mapping: mapping as EntityMappingConfig,
      },
    });

    const endpoint = new ComposedAirPurifierEndpoint(
      parentTypeWithState,
      primaryEntityId,
      endpointId,
      parts,
    );

    // Register sub-endpoints for state updates
    for (const [entityId, sub] of subEndpointMap) {
      endpoint.subEndpoints.set(entityId, sub);
    }

    const subLabels = [
      "AirPurifier(parent)",
      tempSub ? "+Temp" : "",
      humSub ? "+Hum" : "",
      climateSub ? "+Therm" : "",
      config.batteryEntityId ? "+Bat" : "",
    ]
      .filter(Boolean)
      .join("");

    logger.info(
      `Created composed air purifier ${primaryEntityId} with ${parts.length} sub-endpoint(s): ${subLabels}`,
    );

    return endpoint;
  }

  private constructor(
    type: EndpointType,
    entityId: string,
    id: string,
    parts: Endpoint[],
  ) {
    super(type, { id, parts });
    this.entityId = entityId;
  }

  async updateStates(states: HomeAssistantStates): Promise<void> {
    // Update parent (fan control + BasicInfo reachable state, battery, etc.)
    this.scheduleUpdate(this, this.entityId, states);

    // Update sub-endpoints with their own entity states
    for (const [entityId, sub] of this.subEndpoints) {
      this.scheduleUpdate(sub, entityId, states);
    }
  }

  private scheduleUpdate(
    endpoint: Endpoint,
    entityId: string,
    states: HomeAssistantStates,
  ) {
    const state = states[entityId];
    if (!state) return;

    const key = endpoint === this ? `_parent_:${entityId}` : entityId;

    const stateJson = JSON.stringify({
      s: state.state,
      a: state.attributes,
    });
    if (this.lastStates.get(key) === stateJson) return;
    this.lastStates.set(key, stateJson);

    let debouncedFn = this.debouncedUpdates.get(key);
    if (!debouncedFn) {
      debouncedFn = debounce(
        (ep: Endpoint, s: HomeAssistantEntityState) => this.flushUpdate(ep, s),
        50,
      );
      this.debouncedUpdates.set(key, debouncedFn);
    }
    debouncedFn(endpoint, state);
  }

  private async flushUpdate(
    endpoint: Endpoint,
    state: HomeAssistantEntityState,
  ) {
    try {
      await endpoint.construction.ready;
    } catch {
      return;
    }

    try {
      const current = endpoint.stateOf(HomeAssistantEntityBehavior).entity;
      await endpoint.setStateOf(HomeAssistantEntityBehavior, {
        entity: { ...current, state },
      });
    } catch (error) {
      if (
        error instanceof TransactionDestroyedError ||
        error instanceof DestroyedDependencyError
      ) {
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes(
          "Endpoint storage inaccessible because endpoint is not a node and is not owned by another endpoint",
        )
      ) {
        return;
      }
      throw error;
    }
  }

  override async delete() {
    for (const fn of this.debouncedUpdates.values()) {
      fn.clear();
    }
    await super.delete();
  }
}
