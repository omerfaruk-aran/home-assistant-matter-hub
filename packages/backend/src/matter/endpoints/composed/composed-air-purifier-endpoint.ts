import type {
  EntityMappingConfig,
  FanDeviceAttributes,
  HomeAssistantEntityInformation,
  HomeAssistantEntityState,
  SensorDeviceAttributes,
} from "@home-assistant-matter-hub/common";
import { FanDeviceFeature } from "@home-assistant-matter-hub/common";
import {
  DestroyedDependencyError,
  Logger,
  TransactionDestroyedError,
} from "@matter/general";
import { Endpoint, type EndpointType } from "@matter/main";
import { FixedLabelServer } from "@matter/main/behaviors";
import type { FanControl } from "@matter/main/clusters";
import { AirPurifierDevice } from "@matter/main/devices";
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
import { AirPurifierHepaFilterMonitoringServer } from "../legacy/air-purifier/behaviors/air-purifier-hepa-filter-monitoring-server.js";
import { FanFanControlServer } from "../legacy/fan/behaviors/fan-fan-control-server.js";
import { FanOnOffServer } from "../legacy/fan/behaviors/fan-on-off-server.js";

const logger = Logger.get("ComposedAirPurifierEndpoint");

// --- Measurement configs (read sensor data from separate HA entities via EntityStateProvider) ---

function createTemperatureConfig(
  temperatureEntityId: string,
): TemperatureMeasurementConfig {
  return {
    getValue(_entity, agent) {
      const stateProvider = agent.env.get(EntityStateProvider);
      const tempState = stateProvider.getState(temperatureEntityId);
      if (!tempState) return undefined;
      const temperature = Number.parseFloat(tempState.state);
      if (Number.isNaN(temperature)) return undefined;
      const fallbackUnit =
        agent.env.get(HomeAssistantConfig).unitSystem.temperature;
      const attrs = tempState.attributes as SensorDeviceAttributes;
      return Temperature.withUnit(
        temperature,
        attrs.unit_of_measurement ?? fallbackUnit,
      );
    },
  };
}

function createHumidityConfig(
  humidityEntityId: string,
): HumidityMeasurementConfig {
  return {
    getValue(_entity, agent) {
      const stateProvider = agent.env.get(EntityStateProvider);
      const humState = stateProvider.getState(humidityEntityId);
      if (!humState) return null;
      const humidity = Number.parseFloat(humState.state);
      if (Number.isNaN(humidity)) return null;
      return humidity;
    },
  };
}

const batteryConfig = {
  getBatteryPercent: (
    _entity: HomeAssistantEntityState,
    agent: { get: Function; env: { get: Function } },
  ): number | null => {
    const homeAssistant = agent.get(HomeAssistantEntityBehavior);
    const batteryEntity = homeAssistant.state.mapping?.batteryEntity;
    if (batteryEntity) {
      const stateProvider = agent.env.get(EntityStateProvider);
      const battery = stateProvider.getBatteryPercent(batteryEntity);
      if (battery != null) return Math.max(0, Math.min(100, battery));
    }
    return null;
  },
};

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

// --- Config interface ---

export interface ComposedAirPurifierConfig {
  registry: BridgeRegistry;
  primaryEntityId: string;
  temperatureEntityId?: string;
  humidityEntityId?: string;
  batteryEntityId?: string;
  mapping?: EntityMappingConfig;
  customName?: string;
  areaName?: string;
}

// --- Main class ---

/**
 * An air purifier endpoint with optional temperature and humidity measurement
 * clusters directly on the parent endpoint. Sub-endpoints are NOT used because
 * Apple Home unpredictably picks sub-endpoint device types as the primary tile,
 * causing the air purifier to show as a sensor instead.
 *
 * Sensor data is read from separate HA entities via EntityStateProvider,
 * following the same pattern as battery and filter life.
 *
 * Structure:
 *   AirPurifierDevice (flat endpoint: fan control + optional temp/hum + optional battery)
 */
export class ComposedAirPurifierEndpoint extends Endpoint {
  readonly entityId: string;
  readonly mappedEntityIds: string[];
  private trackedEntityIds: string[];
  private lastStates = new Map<string, string>();
  private debouncedFlush?: ReturnType<
    typeof debounce<(s: HomeAssistantEntityState) => void>
  >;

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

    // Build parent type: AirPurifierDevice as a flat endpoint (no sub-endpoints).
    let parentType = AirPurifierDevice.with(
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

    // Add TemperatureMeasurement directly on parent (reads from separate entity)
    if (config.temperatureEntityId) {
      parentType = parentType.with(
        TemperatureMeasurementServer(
          createTemperatureConfig(config.temperatureEntityId),
        ),
      );
    }

    // Add RelativeHumidityMeasurement directly on parent (reads from separate entity)
    if (config.humidityEntityId) {
      parentType = parentType.with(
        HumidityMeasurementServer(
          createHumidityConfig(config.humidityEntityId),
        ),
      );
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

    const endpointId = createEndpointId(primaryEntityId, config.customName);

    const parentTypeWithState = parentType.set({
      homeAssistantEntity: {
        entity: primaryPayload,
        customName: config.customName,
        mapping: mapping as EntityMappingConfig,
      },
    });

    // Track all entity IDs for change detection
    const trackedEntityIds = [primaryEntityId];
    if (config.temperatureEntityId)
      trackedEntityIds.push(config.temperatureEntityId);
    if (config.humidityEntityId) trackedEntityIds.push(config.humidityEntityId);

    // Expose non-primary entities so bridge-endpoint-manager subscribes to
    // their state changes via WebSocket (without this, sensor data goes stale).
    const mappedIds = trackedEntityIds.filter((id) => id !== primaryEntityId);

    const endpoint = new ComposedAirPurifierEndpoint(
      parentTypeWithState,
      primaryEntityId,
      endpointId,
      trackedEntityIds,
      mappedIds,
    );

    const clusterLabels = [
      "AirPurifier",
      config.temperatureEntityId ? "+Temp" : "",
      config.humidityEntityId ? "+Hum" : "",
      config.batteryEntityId ? "+Bat" : "",
    ]
      .filter(Boolean)
      .join("");

    logger.info(`Created air purifier ${primaryEntityId}: ${clusterLabels}`);

    return endpoint;
  }

  private constructor(
    type: EndpointType,
    entityId: string,
    id: string,
    trackedEntityIds: string[],
    mappedEntityIds: string[],
  ) {
    super(type, { id });
    this.entityId = entityId;
    this.trackedEntityIds = trackedEntityIds;
    this.mappedEntityIds = mappedEntityIds;
  }

  async updateStates(states: HomeAssistantStates): Promise<void> {
    // Check if any tracked entity (fan, temp sensor, hum sensor) changed
    let anyChanged = false;
    for (const entityId of this.trackedEntityIds) {
      const state = states[entityId];
      if (!state) continue;
      const stateJson = JSON.stringify({
        s: state.state,
        a: state.attributes,
      });
      if (this.lastStates.get(entityId) !== stateJson) {
        this.lastStates.set(entityId, stateJson);
        anyChanged = true;
      }
    }

    if (!anyChanged) return;

    // Flush parent with fan state — measurement servers re-read from EntityStateProvider
    const primaryState = states[this.entityId];
    if (!primaryState) return;

    if (!this.debouncedFlush) {
      this.debouncedFlush = debounce(
        (s: HomeAssistantEntityState) => this.flushUpdate(s),
        50,
      );
    }
    this.debouncedFlush(primaryState);
  }

  private async flushUpdate(state: HomeAssistantEntityState) {
    try {
      await this.construction.ready;
    } catch {
      return;
    }

    try {
      const current = this.stateOf(HomeAssistantEntityBehavior).entity;
      await this.setStateOf(HomeAssistantEntityBehavior, {
        entity: { ...current, state: { ...state } },
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
    this.debouncedFlush?.clear();
    await super.delete();
  }
}
