import type {
  HomeAssistantDeviceRegistry,
  HomeAssistantEntityRegistry,
  HomeAssistantEntityState,
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
  // Track pressure entities that have been auto-assigned to temperature sensors
  private _usedPressureEntities: Set<string> = new Set();
  // Track power entities that have been auto-assigned to switch/plug entities
  private _usedPowerEntities: Set<string> = new Set();
  // Track energy entities that have been auto-assigned to switch/plug entities
  private _usedEnergyEntities: Set<string> = new Set();

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

  /**
   * Check if auto pressure mapping is enabled for this bridge.
   * Default: true (enabled by default).
   * When enabled, pressure sensors on the same device as a temperature sensor
   * are combined into a single endpoint with PressureMeasurement cluster.
   */
  isAutoPressureMappingEnabled(): boolean {
    return this.dataProvider.featureFlags?.autoPressureMapping !== false;
  }

  /**
   * Find a pressure sensor entity that belongs to the same HA device.
   * Returns the entity_id of the pressure sensor, or undefined if none found.
   */
  findPressureEntityForDevice(deviceId: string): string | undefined {
    const entities = values(this.registry.entities);
    for (const entity of entities) {
      if (entity.device_id !== deviceId) continue;
      if (!entity.entity_id.startsWith("sensor.")) continue;

      const state = this.registry.states[entity.entity_id];
      if (!state) continue;

      const attrs = state.attributes as SensorDeviceAttributes;
      if (
        attrs.device_class === SensorDeviceClass.pressure ||
        attrs.device_class === SensorDeviceClass.atmospheric_pressure
      ) {
        return entity.entity_id;
      }
    }
    return undefined;
  }

  /**
   * Mark a pressure entity as used (auto-assigned to a temperature sensor).
   */
  markPressureEntityUsed(entityId: string): void {
    this._usedPressureEntities.add(entityId);
  }

  /**
   * Check if a pressure entity has been auto-assigned to a temperature sensor.
   */
  isPressureEntityUsed(entityId: string): boolean {
    return this._usedPressureEntities.has(entityId);
  }

  /**
   * Find a power sensor entity (device_class: power) on the same HA device.
   */
  findPowerEntityForDevice(deviceId: string): string | undefined {
    const entities = values(this.registry.entities);
    for (const entity of entities) {
      if (entity.device_id !== deviceId) continue;
      if (!entity.entity_id.startsWith("sensor.")) continue;

      const state = this.registry.states[entity.entity_id];
      if (!state) continue;

      const attrs = state.attributes as SensorDeviceAttributes;
      if (attrs.device_class === SensorDeviceClass.power) {
        return entity.entity_id;
      }
    }
    return undefined;
  }

  /**
   * Find an energy sensor entity (device_class: energy) on the same HA device.
   */
  findEnergyEntityForDevice(deviceId: string): string | undefined {
    const entities = values(this.registry.entities);
    for (const entity of entities) {
      if (entity.device_id !== deviceId) continue;
      if (!entity.entity_id.startsWith("sensor.")) continue;

      const state = this.registry.states[entity.entity_id];
      if (!state) continue;

      const attrs = state.attributes as SensorDeviceAttributes;
      if (attrs.device_class === SensorDeviceClass.energy) {
        return entity.entity_id;
      }
    }
    return undefined;
  }

  markPowerEntityUsed(entityId: string): void {
    this._usedPowerEntities.add(entityId);
  }

  isPowerEntityUsed(entityId: string): boolean {
    return this._usedPowerEntities.has(entityId);
  }

  markEnergyEntityUsed(entityId: string): void {
    this._usedEnergyEntities.add(entityId);
  }

  isEnergyEntityUsed(entityId: string): boolean {
    return this._usedEnergyEntities.has(entityId);
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
    this._usedPressureEntities.clear();
    this._usedPowerEntities.clear();
    this._usedEnergyEntities.clear();

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
      const state = this.registry.states[entity.entity_id];
      return this.matchesFilter(filter, entity, device, state);
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

    // First pass: Find all temperature sensors and mark their humidity + pressure entities
    for (const entity of entities) {
      if (!entity.device_id) continue;
      if (!entity.entity_id.startsWith("sensor.")) continue;

      const state = this._states[entity.entity_id];
      if (!state) continue;

      const attrs = state.attributes as SensorDeviceAttributes;
      if (attrs.device_class === SensorDeviceClass.temperature) {
        if (this.isAutoHumidityMappingEnabled()) {
          const humidityEntityId = this.findHumidityEntityForDevice(
            entity.device_id,
          );
          if (humidityEntityId && humidityEntityId !== entity.entity_id) {
            this._usedHumidityEntities.add(humidityEntityId);
          }
        }
        if (this.isAutoPressureMappingEnabled()) {
          const pressureEntityId = this.findPressureEntityForDevice(
            entity.device_id,
          );
          if (pressureEntityId && pressureEntityId !== entity.entity_id) {
            this._usedPressureEntities.add(pressureEntityId);
          }
        }
      }
    }

    // Second pass: Find power and energy entities for switch/light entities
    for (const entity of entities) {
      if (!entity.device_id) continue;
      const domain = entity.entity_id.split(".")[0];
      if (domain !== "switch" && domain !== "light") continue;

      const powerEntityId = this.findPowerEntityForDevice(entity.device_id);
      if (powerEntityId && powerEntityId !== entity.entity_id) {
        if (!this._usedPowerEntities.has(powerEntityId)) {
          this._usedPowerEntities.add(powerEntityId);
        }
      }

      const energyEntityId = this.findEnergyEntityForDevice(entity.device_id);
      if (energyEntityId && energyEntityId !== entity.entity_id) {
        if (!this._usedEnergyEntities.has(energyEntityId)) {
          this._usedEnergyEntities.add(energyEntityId);
        }
      }
    }

    // Third pass: Find all "main" entities and mark their battery entities
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
    entityState?: HomeAssistantEntityState,
  ) {
    const labels = this.registry.labels;
    if (
      filter.include.length > 0 &&
      !testMatchers(
        filter.include,
        device,
        entity,
        filter.includeMode,
        entityState,
        labels,
      )
    ) {
      return false;
    }
    if (
      filter.exclude.length > 0 &&
      testMatchers(filter.exclude, device, entity, "any", entityState, labels)
    ) {
      return false;
    }
    return true;
  }
}
