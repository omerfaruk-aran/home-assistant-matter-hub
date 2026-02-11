import type {
  EntityMappingConfig,
  HomeAssistantEntityState,
  SensorDeviceAttributes,
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
import { EntityEndpoint } from "../../endpoints/entity-endpoint.js";
import { createLegacyEndpointType } from "./create-legacy-endpoint-type.js";

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
    const state = registry.initialState(entityId);
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

    // Auto-assign related entities if not manually set and device has them
    // Order matters: Humidity first, then Battery - so battery only goes to the
    // combined TemperatureHumiditySensor, not to both Temperature AND Humidity
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

      // 2. Auto-assign battery entity AFTER humidity
      // Only applies when autoBatteryMapping feature flag is enabled (default: false)
      // This ensures battery goes to the combined T+H sensor, not separately
      if (registry.isAutoBatteryMappingEnabled() && !mapping?.batteryEntity) {
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
    }

    const payload = {
      entity_id: entityId,
      state,
      registry: entity,
      deviceRegistry,
    };
    const areaName = registry.getAreaName(entityId);
    const type = createLegacyEndpointType(payload, effectiveMapping, areaName);
    if (!type) {
      return;
    }
    const customName = effectiveMapping?.customName;
    return new LegacyEndpoint(type, entityId, customName);
  }

  private constructor(
    type: EndpointType,
    entityId: string,
    customName?: string,
  ) {
    super(type, entityId, customName);
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
    if (JSON.stringify(state) === JSON.stringify(this.lastState ?? {})) {
      return;
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
