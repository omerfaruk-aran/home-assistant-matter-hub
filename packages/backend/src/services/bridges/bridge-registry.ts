import type {
  HomeAssistantDeviceRegistry,
  HomeAssistantEntityRegistry,
  HomeAssistantFilter,
  SensorDeviceAttributes,
} from "@home-assistant-matter-hub/common";
import { SensorDeviceClass } from "@home-assistant-matter-hub/common";
import { keys, pickBy, values } from "lodash-es";
import type {
  HomeAssistantDevices,
  HomeAssistantEntities,
  HomeAssistantRegistry,
  HomeAssistantStates,
} from "../home-assistant/home-assistant-registry.js";
import type { BridgeDataProvider } from "./bridge-data-provider.js";
import { testMatchers } from "./matcher/matches-entity-filter.js";

export interface BridgeRegistryProps {
  readonly registry: HomeAssistantRegistry;
  readonly dataProvider: BridgeDataProvider;
}

export class BridgeRegistry {
  get entityIds() {
    return keys(this._entities);
  }

  private _devices: HomeAssistantDevices = {};
  private _entities: HomeAssistantEntities = {};
  private _states: HomeAssistantStates = {};

  // Track battery entities that have been auto-assigned to other devices
  private _usedBatteryEntities: Set<string> = new Set();
  // Track humidity entities that have been auto-assigned to temperature sensors
  private _usedHumidityEntities: Set<string> = new Set();

  deviceOf(entityId: string): HomeAssistantDeviceRegistry {
    const entity = this._entities[entityId];
    return this._devices[entity.device_id];
  }
  entity(entityId: string) {
    return this._entities[entityId];
  }
  initialState(entityId: string) {
    return this._states[entityId];
  }

  /**
   * Get all entities that belong to the same HA device as the given entity.
   * This enables domain endpoints to access neighbor entities (e.g., a thermostat
   * accessing an external temperature sensor from the same device).
   */
  neighborsOf(entityId: string): Map<string, HomeAssistantEntityRegistry> {
    const entity = this._entities[entityId];
    if (!entity?.device_id) {
      return new Map();
    }

    const neighbors = new Map<string, HomeAssistantEntityRegistry>();
    for (const [id, ent] of Object.entries(this.registry.entities)) {
      if (ent.device_id === entity.device_id && id !== entityId) {
        neighbors.set(id, ent);
      }
    }
    return neighbors;
  }

  /**
   * Get neighbor entity information including state for domain endpoints.
   */
  neighborInfoOf(
    entityId: string,
  ): Map<
    string,
    { entity: HomeAssistantEntityRegistry; state: HomeAssistantStates[string] }
  > {
    const neighbors = this.neighborsOf(entityId);
    const result = new Map<
      string,
      {
        entity: HomeAssistantEntityRegistry;
        state: HomeAssistantStates[string];
      }
    >();

    for (const [id, entity] of neighbors) {
      const state = this.registry.states[id];
      if (state) {
        result.set(id, { entity, state });
      }
    }
    return result;
  }

  /**
   * Find a battery sensor entity that belongs to the same HA device.
   * Returns the entity_id of the battery sensor, or undefined if none found.
   */
  findBatteryEntityForDevice(deviceId: string): string | undefined {
    // Search the FULL HA registry, not the filtered bridge entities.
    // The battery sensor might not match the bridge filter (e.g., vacuum
    // server bridges only include vacuum.* entities, not sensor.*).
    const entities = values(this.registry.entities);
    for (const entity of entities) {
      if (entity.device_id !== deviceId) continue;
      if (!entity.entity_id.startsWith("sensor.")) continue;

      const state = this.registry.states[entity.entity_id];
      if (!state) continue;

      const attrs = state.attributes as SensorDeviceAttributes;
      if (attrs.device_class === SensorDeviceClass.battery) {
        return entity.entity_id;
      }
    }
    return undefined;
  }

  /**
   * Mark a battery entity as used (auto-assigned to another device).
   */
  markBatteryEntityUsed(entityId: string): void {
    this._usedBatteryEntities.add(entityId);
  }

  /**
   * Check if a battery entity has been auto-assigned to another device.
   */
  isBatteryEntityUsed(entityId: string): boolean {
    return this._usedBatteryEntities.has(entityId);
  }

  /**
   * Check if auto battery mapping is enabled for this bridge.
   */
  isAutoBatteryMappingEnabled(): boolean {
    return this.dataProvider.featureFlags?.autoBatteryMapping === true;
  }

  /**
   * Check if auto humidity mapping is enabled for this bridge.
   * Default: false (disabled by default, user must explicitly enable).
   * When enabled, humidity sensors on the same device as a temperature sensor
   * are combined into a single TemperatureHumiditySensor endpoint.
   * Note: Apple Home does not display humidity on TemperatureSensorDevice
   * endpoints, so users on Apple Home should keep this disabled.
   * See: https://github.com/RiDDiX/home-assistant-matter-hub/issues/133
   */
  isAutoHumidityMappingEnabled(): boolean {
    return this.dataProvider.featureFlags?.autoHumidityMapping === true;
  }

  /**
   * Find a humidity sensor entity that belongs to the same HA device.
   * Returns the entity_id of the humidity sensor, or undefined if none found.
   */
  findHumidityEntityForDevice(deviceId: string): string | undefined {
    // Search the FULL HA registry, not the filtered bridge entities.
    // Same reasoning as findBatteryEntityForDevice.
    const entities = values(this.registry.entities);
    for (const entity of entities) {
      if (entity.device_id !== deviceId) continue;
      if (!entity.entity_id.startsWith("sensor.")) continue;

      const state = this.registry.states[entity.entity_id];
      if (!state) continue;

      const attrs = state.attributes as SensorDeviceAttributes;
      if (attrs.device_class === SensorDeviceClass.humidity) {
        return entity.entity_id;
      }
    }
    return undefined;
  }

  /**
   * Mark a humidity entity as used (auto-assigned to a temperature sensor).
   */
  markHumidityEntityUsed(entityId: string): void {
    this._usedHumidityEntities.add(entityId);
  }

  /**
   * Check if a humidity entity has been auto-assigned to a temperature sensor.
   */
  isHumidityEntityUsed(entityId: string): boolean {
    return this._usedHumidityEntities.has(entityId);
  }

  constructor(
    private readonly registry: HomeAssistantRegistry,
    private readonly dataProvider: BridgeDataProvider,
  ) {
    this.refresh();
  }

  /**
   * Get the area name for an entity, resolving from HA area registry.
   * Priority: entity area_id > device area_id > undefined
   */
  getAreaName(entityId: string): string | undefined {
    const entity = this._entities[entityId];
    if (!entity) return undefined;

    // Entity-level area takes priority
    const entityAreaId = entity.area_id;
    if (entityAreaId) {
      const name = this.registry.areas.get(entityAreaId);
      if (name) return name;
    }

    // Fallback to device-level area
    const device = this._devices[entity.device_id];
    const deviceAreaId = device?.area_id as string | undefined;
    if (deviceAreaId) {
      const name = this.registry.areas.get(deviceAreaId);
      if (name) return name;
    }

    return undefined;
  }

  refresh() {
    // Clear used entities on refresh to allow re-assignment
    this._usedBatteryEntities.clear();
    this._usedHumidityEntities.clear();

    this._entities = pickBy(this.registry.entities, (entity) => {
      const device = this.registry.devices[entity.device_id];
      const filter = this.dataProvider.filter;
      const featureFlags = this.dataProvider.featureFlags ?? {};

      // Always exclude disabled entities
      if (entity.disabled_by != null) {
        return false;
      }

      // Hidden entities are only included if includeHiddenEntities feature flag is enabled
      const isHidden = entity.hidden_by != null;
      if (isHidden && !featureFlags.includeHiddenEntities) {
        return false;
      }

      // Check filter matching
      return this.matchesFilter(filter, entity, device);
    });
    this._states = pickBy(
      this.registry.states,
      (e) => !!this._entities[e.entity_id],
    );
    this._devices = pickBy(this.registry.devices, (d) =>
      values(this._entities)
        .map((e) => e.device_id)
        .some((id) => d.id === id),
    );

    // Pre-calculate auto-assignments BEFORE endpoints are created
    // This ensures entities are marked as "used" regardless of processing order
    this.preCalculateAutoAssignments();
  }

  /**
   * Pre-calculate which entities will be auto-assigned to other devices.
   * This must run BEFORE endpoint creation to ensure correct "used" marking
   * regardless of the order entities are processed.
   */
  private preCalculateAutoAssignments(): void {
    const entities = values(this._entities);

    // First pass: Find all temperature sensors and mark their humidity entities
    if (this.isAutoHumidityMappingEnabled()) {
      for (const entity of entities) {
        if (!entity.device_id) continue;
        if (!entity.entity_id.startsWith("sensor.")) continue;

        const state = this._states[entity.entity_id];
        if (!state) continue;

        const attrs = state.attributes as SensorDeviceAttributes;
        if (attrs.device_class === SensorDeviceClass.temperature) {
          const humidityEntityId = this.findHumidityEntityForDevice(
            entity.device_id,
          );
          if (humidityEntityId && humidityEntityId !== entity.entity_id) {
            this._usedHumidityEntities.add(humidityEntityId);
          }
        }
      }
    }

    // Second pass: Find all "main" entities and mark their battery entities
    // A "main" entity is any entity that is NOT already marked as used
    if (this.isAutoBatteryMappingEnabled()) {
      for (const entity of entities) {
        if (!entity.device_id) continue;

        // Skip entities that are already marked as used (e.g., humidity sensors)
        if (this._usedHumidityEntities.has(entity.entity_id)) continue;

        // Skip battery sensors themselves
        if (entity.entity_id.startsWith("sensor.")) {
          const state = this._states[entity.entity_id];
          if (state) {
            const attrs = state.attributes as SensorDeviceAttributes;
            if (attrs.device_class === SensorDeviceClass.battery) continue;
          }
        }

        const batteryEntityId = this.findBatteryEntityForDevice(
          entity.device_id,
        );
        if (batteryEntityId && batteryEntityId !== entity.entity_id) {
          // Only mark if not already marked (first entity wins)
          if (!this._usedBatteryEntities.has(batteryEntityId)) {
            this._usedBatteryEntities.add(batteryEntityId);
          }
        }
      }
    }
  }

  private matchesFilter(
    filter: HomeAssistantFilter,
    entity: HomeAssistantEntityRegistry,
    device: HomeAssistantDeviceRegistry,
  ) {
    if (
      filter.include.length > 0 &&
      !testMatchers(filter.include, device, entity, filter.includeMode)
    ) {
      return false;
    }
    if (
      filter.exclude.length > 0 &&
      testMatchers(filter.exclude, device, entity)
    ) {
      return false;
    }
    return true;
  }
}
