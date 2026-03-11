import type {
  EntityMappingConfig,
  HomeAssistantEntityState,
  SensorDeviceAttributes,
  VacuumDeviceAttributes,
} from "@home-assistant-matter-hub/common";
import { SensorDeviceClass } from "@home-assistant-matter-hub/common";
import {
  DestroyedDependencyError,
  Logger,
  TransactionDestroyedError,
} from "@matter/general";
import type { EndpointType } from "@matter/main";
import debounce from "debounce";
import type { BridgeRegistry } from "../../../services/bridges/bridge-registry.js";
import type { HomeAssistantStates } from "../../../services/home-assistant/home-assistant-registry.js";
import { HomeAssistantEntityBehavior } from "../../behaviors/home-assistant-entity-behavior.js";
import {
  EntityEndpoint,
  getMappedEntityIds,
} from "../../endpoints/entity-endpoint.js";
import { ComposedAirPurifierEndpoint } from "../composed/composed-air-purifier-endpoint.js";
import { ComposedSensorEndpoint } from "../composed/composed-sensor-endpoint.js";
import { createLegacyEndpointType } from "./create-legacy-endpoint-type.js";
import { supportsCleaningModes } from "./vacuum/behaviors/vacuum-rvc-clean-mode-server.js";

const logger = Logger.get("LegacyEndpoint");

/**
 * @deprecated
 */
export class LegacyEndpoint extends EntityEndpoint {
  public static async create(
    registry: BridgeRegistry,
    entityId: string,
    mapping?: EntityMappingConfig,
  ): Promise<LegacyEndpoint | undefined> {
    const deviceRegistry = registry.deviceOf(entityId);
    let state = registry.initialState(entityId);
    const entity = registry.entity(entityId);
    // Skip entities without state (e.g., being enabled from disabled state)
    if (!state) {
      return;
    }

    // Auto-mapping: Skip entities that have been auto-assigned to another device
    if (
      registry.isAutoBatteryMappingEnabled() &&
      registry.isBatteryEntityUsed(entityId)
    ) {
      logger.debug(
        `Skipping ${entityId} - already auto-assigned as battery to another device`,
      );
      return;
    }
    if (
      registry.isAutoHumidityMappingEnabled() &&
      registry.isHumidityEntityUsed(entityId)
    ) {
      logger.debug(
        `Skipping ${entityId} - already auto-assigned as humidity to a temperature sensor`,
      );
      return;
    }
    if (
      registry.isAutoPressureMappingEnabled() &&
      registry.isPressureEntityUsed(entityId)
    ) {
      logger.debug(
        `Skipping ${entityId} - already auto-assigned as pressure to a temperature sensor`,
      );
      return;
    }
    if (
      registry.isAutoComposedDevicesEnabled() &&
      registry.isComposedSubEntityUsed(entityId)
    ) {
      logger.debug(
        `Skipping ${entityId} - already consumed by a composed device`,
      );
      return;
    }

    // Auto-assign related entities if not manually set and device has them
    // Order matters: Humidity first, then Pressure, then Battery - so battery only goes to the
    // combined sensor, not to both Temperature AND Humidity/Pressure separately
    let effectiveMapping = mapping;
    if (entity.device_id) {
      // 1. Auto-assign humidity entity to temperature sensors FIRST
      // Only applies when autoHumidityMapping feature flag is enabled (default: false)
      if (registry.isAutoHumidityMappingEnabled()) {
        const attrs = state.attributes as SensorDeviceAttributes;
        if (
          !mapping?.humidityEntity &&
          entityId.startsWith("sensor.") &&
          attrs.device_class === SensorDeviceClass.temperature
        ) {
          const humidityEntityId = registry.findHumidityEntityForDevice(
            entity.device_id,
          );
          if (humidityEntityId && humidityEntityId !== entityId) {
            effectiveMapping = {
              ...effectiveMapping,
              entityId: effectiveMapping?.entityId ?? entityId,
              humidityEntity: humidityEntityId,
            };
            registry.markHumidityEntityUsed(humidityEntityId);
            logger.debug(
              `Auto-assigned humidity ${humidityEntityId} to ${entityId}`,
            );
          }
        }
      }

      // 2. Auto-assign pressure entity to temperature sensors
      if (registry.isAutoPressureMappingEnabled()) {
        const attrs = state.attributes as SensorDeviceAttributes;
        if (
          !mapping?.pressureEntity &&
          entityId.startsWith("sensor.") &&
          attrs.device_class === SensorDeviceClass.temperature
        ) {
          const pressureEntityId = registry.findPressureEntityForDevice(
            entity.device_id,
          );
          if (pressureEntityId && pressureEntityId !== entityId) {
            effectiveMapping = {
              ...effectiveMapping,
              entityId: effectiveMapping?.entityId ?? entityId,
              pressureEntity: pressureEntityId,
            };
            registry.markPressureEntityUsed(pressureEntityId);
            logger.debug(
              `Auto-assigned pressure ${pressureEntityId} to ${entityId}`,
            );
          }
        }
      }

      // 3. Auto-assign battery entity AFTER humidity and pressure
      // For most entities: only when autoBatteryMapping feature flag is enabled
      // For vacuum entities: always auto-map because many HA integrations freeze
      // battery_level on the vacuum entity when docked, while the standalone
      // battery sensor keeps updating. Without mapping, the fallback reads the
      // stale attribute and the controller shows a stuck battery level.
      const isVacuum = entityId.startsWith("vacuum.");
      if (
        (registry.isAutoBatteryMappingEnabled() || isVacuum) &&
        !mapping?.batteryEntity
      ) {
        const batteryEntityId = registry.findBatteryEntityForDevice(
          entity.device_id,
        );
        // Don't auto-assign battery to itself
        if (batteryEntityId && batteryEntityId !== entityId) {
          effectiveMapping = {
            ...effectiveMapping,
            entityId: effectiveMapping?.entityId ?? entityId,
            batteryEntity: batteryEntityId,
          };
          registry.markBatteryEntityUsed(batteryEntityId);
          logger.debug(
            `Auto-assigned battery ${batteryEntityId} to ${entityId}`,
          );
        }
      }

      // 4. Auto-assign power entity to switch/plug entities
      if (!mapping?.powerEntity) {
        const domain = entityId.split(".")[0];
        if (domain === "switch" || domain === "light") {
          const powerEntityId = registry.findPowerEntityForDevice(
            entity.device_id,
          );
          if (powerEntityId && powerEntityId !== entityId) {
            effectiveMapping = {
              ...effectiveMapping,
              entityId: effectiveMapping?.entityId ?? entityId,
              powerEntity: powerEntityId,
            };
            registry.markPowerEntityUsed(powerEntityId);
            logger.debug(`Auto-assigned power ${powerEntityId} to ${entityId}`);
          }
        }
      }

      // 5. Auto-assign energy entity to switch/plug entities
      if (!mapping?.energyEntity) {
        const domain = entityId.split(".")[0];
        if (domain === "switch" || domain === "light") {
          const energyEntityId = registry.findEnergyEntityForDevice(
            entity.device_id,
          );
          if (energyEntityId && energyEntityId !== entityId) {
            effectiveMapping = {
              ...effectiveMapping,
              entityId: effectiveMapping?.entityId ?? entityId,
              energyEntity: energyEntityId,
            };
            registry.markEnergyEntityUsed(energyEntityId);
            logger.debug(
              `Auto-assigned energy ${energyEntityId} to ${entityId}`,
            );
          }
        }
      }

      // 6. Auto-detect vacuum select entities (cleaning mode, suction, mop intensity)
      if (entityId.startsWith("vacuum.")) {
        const vacuumEntities = registry.findVacuumSelectEntities(
          entity.device_id,
        );
        if (
          !effectiveMapping?.cleaningModeEntity &&
          vacuumEntities.cleaningModeEntity
        ) {
          effectiveMapping = {
            ...effectiveMapping,
            entityId: effectiveMapping?.entityId ?? entityId,
            cleaningModeEntity: vacuumEntities.cleaningModeEntity,
          };
          logger.debug(
            `Auto-assigned cleaningMode ${vacuumEntities.cleaningModeEntity} to ${entityId}`,
          );
        }
        if (
          !effectiveMapping?.suctionLevelEntity &&
          vacuumEntities.suctionLevelEntity
        ) {
          effectiveMapping = {
            ...effectiveMapping,
            entityId: effectiveMapping?.entityId ?? entityId,
            suctionLevelEntity: vacuumEntities.suctionLevelEntity,
          };
          logger.debug(
            `Auto-assigned suctionLevel ${vacuumEntities.suctionLevelEntity} to ${entityId}`,
          );
        }
        if (
          !effectiveMapping?.mopIntensityEntity &&
          vacuumEntities.mopIntensityEntity
        ) {
          effectiveMapping = {
            ...effectiveMapping,
            entityId: effectiveMapping?.entityId ?? entityId,
            mopIntensityEntity: vacuumEntities.mopIntensityEntity,
          };
          logger.debug(
            `Auto-assigned mopIntensity ${vacuumEntities.mopIntensityEntity} to ${entityId}`,
          );
        }

        // Auto-detect rooms when no rooms in attributes
        const vacAttrs = state.attributes as VacuumDeviceAttributes;
        if (!vacAttrs.rooms && !vacAttrs.segments && !vacAttrs.room_mapping) {
          // Try Valetudo map segments sensor first
          const valetudoRooms = registry.findValetudoMapSegments(
            entity.device_id,
          );
          if (valetudoRooms.length > 0) {
            const roomsObj: Record<string, string> = {};
            for (const r of valetudoRooms) {
              roomsObj[String(r.id)] = r.name;
            }
            state = {
              ...state,
              attributes: {
                ...state.attributes,
                rooms: roomsObj,
              } as typeof state.attributes,
            };
            logger.debug(
              `Auto-detected ${valetudoRooms.length} Valetudo segments for ${entityId}`,
            );
          } else {
            // Try Roborock integration service call
            const roborockRooms = await registry.resolveRoborockRooms(entityId);
            if (roborockRooms.length > 0) {
              const roomsObj: Record<string, string> = {};
              for (const r of roborockRooms) {
                roomsObj[String(r.id)] = r.name;
              }
              state = {
                ...state,
                attributes: {
                  ...state.attributes,
                  rooms: roomsObj,
                } as typeof state.attributes,
              };
              logger.debug(
                `Auto-detected ${roborockRooms.length} Roborock rooms for ${entityId}`,
              );
            }
          }
        }
      }
    }

    // When autoComposedDevices is enabled and this is a temperature sensor
    // with auto-mapped humidity/pressure, create a real Matter Composed Device
    // instead of a flat endpoint with extra clusters.
    // This ensures Apple Home, Google Home, and Alexa properly display
    // humidity and pressure using their correct device types.
    if (registry.isAutoComposedDevicesEnabled()) {
      const attrs = state.attributes as SensorDeviceAttributes;
      if (
        entityId.startsWith("sensor.") &&
        attrs.device_class === SensorDeviceClass.temperature &&
        (effectiveMapping?.humidityEntity || effectiveMapping?.pressureEntity)
      ) {
        const composedAreaName = registry.getAreaName(entityId);
        const composed = await ComposedSensorEndpoint.create({
          registry,
          primaryEntityId: entityId,
          humidityEntityId: effectiveMapping?.humidityEntity,
          pressureEntityId: effectiveMapping?.pressureEntity,
          batteryEntityId: effectiveMapping?.batteryEntity,
          customName: effectiveMapping?.customName,
          areaName: composedAreaName,
        });
        // Return as LegacyEndpoint-compatible (duck typed: entityId + updateStates)
        return composed as unknown as LegacyEndpoint;
      }

      // When this is a fan entity mapped as air_purifier, create a composed
      // device with sensor/thermostat sub-endpoints from related entities on
      // the same HA device (Matter spec 9.4.4).
      const resolvedMatterType =
        mapping?.matterDeviceType ??
        (entityId.startsWith("fan.") ? "fan" : undefined);
      if (resolvedMatterType === "air_purifier" && entity.device_id) {
        const temperatureEntityId = registry.findTemperatureEntityForDevice(
          entity.device_id,
        );
        const humidityEntityId = registry.findHumidityEntityForDevice(
          entity.device_id,
        );
        // Only compose if at least one sensor sub-entity is available.
        // Climate entities stay standalone — ThermostatDevice competes with
        // the parent for Apple Home's primary tile selection.
        if (temperatureEntityId || humidityEntityId) {
          const composedAreaName = registry.getAreaName(entityId);
          const composed = await ComposedAirPurifierEndpoint.create({
            registry,
            primaryEntityId: entityId,
            temperatureEntityId,
            humidityEntityId,
            batteryEntityId: effectiveMapping?.batteryEntity,
            mapping: effectiveMapping,
            customName: effectiveMapping?.customName,
            areaName: composedAreaName,
          });
          if (composed) {
            return composed as unknown as LegacyEndpoint;
          }
        }
      }
    }

    const payload = {
      entity_id: entityId,
      state,
      registry: entity,
      deviceRegistry,
    };

    // Resolve cleaning mode options for vacuum entities
    let cleaningModeOptions: string[] | undefined;
    if (entityId.startsWith("vacuum.")) {
      if (effectiveMapping?.cleaningModeEntity) {
        const cmState = registry.initialState(
          effectiveMapping.cleaningModeEntity,
        );
        cleaningModeOptions = (
          cmState?.attributes as { options?: string[] } | undefined
        )?.options;
      }
      // Fallback: if no options from entity (unavailable / not loaded),
      // use hardcoded defaults so mop modes are still generated.
      // The runtime getCurrentMode/setCleanMode reads the entity live.
      if (
        !cleaningModeOptions &&
        (effectiveMapping?.cleaningModeEntity ||
          supportsCleaningModes(state.attributes as VacuumDeviceAttributes))
      ) {
        cleaningModeOptions = [
          "vacuum",
          "mop",
          "vacuum_and_mop",
          "vacuum_then_mop",
        ];
      }
    }

    const areaName = registry.getAreaName(entityId);
    const type = createLegacyEndpointType(payload, effectiveMapping, areaName, {
      vacuumOnOff: registry.isVacuumOnOffEnabled(),
      cleaningModeOptions,
    });
    if (!type) {
      return;
    }
    const customName = effectiveMapping?.customName;
    const mappedIds = getMappedEntityIds(effectiveMapping);
    return new LegacyEndpoint(type, entityId, customName, mappedIds);
  }

  private constructor(
    type: EndpointType,
    entityId: string,
    customName?: string,
    mappedEntityIds?: string[],
  ) {
    super(type, entityId, customName, mappedEntityIds);
    // Debounce state updates to batch rapid changes into a single transaction.
    // Home Assistant often sends multiple attribute updates in quick succession
    // (e.g., media player: volume + source + play state). Without debouncing,
    // each update triggers separate Matter.js transactions, causing overhead
    // and verbose transaction queueing logs. A 50ms window batches these updates
    // while remaining imperceptible to users.
    this.flushUpdate = debounce(this.flushPendingUpdate.bind(this), 50);
  }

  private lastState?: HomeAssistantEntityState;
  private readonly flushUpdate: ReturnType<typeof debounce>;

  override async delete() {
    // Clear any pending debounce timers to prevent callbacks firing after deletion
    this.flushUpdate.clear();
    await super.delete();
  }

  async updateStates(states: HomeAssistantStates) {
    const state = states[this.entityId] ?? {};
    const mappedChanged = this.hasMappedEntityChanged(states);
    // Compare only meaningful fields — ignore volatile HA metadata
    // (last_changed, last_updated, context) that changes on every event
    // even when the actual device state/attributes are identical.
    // Skipping these prevents unnecessary Matter subscription reports
    // and reduces MRP traffic that can cause session loss.
    if (
      !mappedChanged &&
      state.state === this.lastState?.state &&
      JSON.stringify(state.attributes) ===
        JSON.stringify(this.lastState?.attributes)
    ) {
      return;
    }

    if (mappedChanged) {
      logger.debug(
        `Mapped entity change detected for ${this.entityId}, forcing update`,
      );
    }
    logger.debug(
      `State update received for ${this.entityId}: state=${state.state}`,
    );
    this.lastState = state;
    this.flushUpdate(state);
  }

  private async flushPendingUpdate(state: HomeAssistantEntityState) {
    // Wait for endpoint to finish initializing before attempting state updates.
    // During startup, factory reset, or device re-pairing, HA may send state
    // updates while endpoints are still being constructed. Attempting setStateOf
    // during initialization causes UninitializedDependencyError crashes.
    try {
      await this.construction.ready;
    } catch {
      // If construction fails, endpoint is unusable, skip the update
      return;
    }

    try {
      const current = this.stateOf(HomeAssistantEntityBehavior).entity;
      await this.setStateOf(HomeAssistantEntityBehavior, {
        entity: { ...current, state },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Suppress errors that are expected during normal shutdown:
      // - TransactionDestroyedError: Transaction context destroyed after shutdown
      // - DestroyedDependencyError: Endpoint was destroyed/deleted
      // All other errors (crashes, invalid states, etc.) should propagate
      if (
        error instanceof TransactionDestroyedError ||
        error instanceof DestroyedDependencyError
      ) {
        return;
      }
      // Suppress transient Matter.js errors that can happen while an endpoint is
      // still being constructed/attached to a node (or during bridge refresh).
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
}
