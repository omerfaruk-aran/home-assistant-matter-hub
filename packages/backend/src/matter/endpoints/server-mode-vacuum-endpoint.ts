import type {
  EntityMappingConfig,
  HomeAssistantEntityState,
} from "@home-assistant-matter-hub/common";
import {
  DestroyedDependencyError,
  Logger,
  TransactionDestroyedError,
} from "@matter/general";
import type { EndpointType } from "@matter/main";
import debounce from "debounce";
import type { BridgeRegistry } from "../../services/bridges/bridge-registry.js";
import type { HomeAssistantStates } from "../../services/home-assistant/home-assistant-registry.js";
import { HomeAssistantEntityBehavior } from "../behaviors/home-assistant-entity-behavior.js";
import { EntityEndpoint } from "./entity-endpoint.js";
import { ServerModeVacuumDevice } from "./legacy/vacuum/server-mode-vacuum-device.js";

const logger = Logger.get("ServerModeVacuumEndpoint");

/**
 * Server Mode Vacuum Endpoint.
 *
 * This endpoint does NOT include BridgedDeviceBasicInformationServer,
 * making it appear as a standalone Matter device rather than a bridged device.
 * This is required for Apple Home Siri voice commands and Alexa discovery.
 */
export class ServerModeVacuumEndpoint extends EntityEndpoint {
  public static async create(
    registry: BridgeRegistry,
    entityId: string,
    mapping?: EntityMappingConfig,
  ): Promise<ServerModeVacuumEndpoint | undefined> {
    const deviceRegistry = registry.deviceOf(entityId);
    const state = registry.initialState(entityId);
    const entity = registry.entity(entityId);

    if (!state) {
      return undefined;
    }

    const payload = {
      entity_id: entityId,
      state,
      registry: entity,
      deviceRegistry,
    };

    const customName = mapping?.customName;
    const endpointType = ServerModeVacuumDevice({
      entity: payload,
      customName,
      mapping,
    });

    if (!endpointType) {
      return undefined;
    }

    return new ServerModeVacuumEndpoint(endpointType, entityId, customName);
  }

  private lastState?: HomeAssistantEntityState;
  private readonly flushUpdate: ReturnType<typeof debounce>;

  private constructor(
    type: EndpointType,
    entityId: string,
    customName?: string,
  ) {
    super(type, entityId, customName);
    // Debounce state updates to batch rapid changes into a single transaction.
    // HA sends vacuum state updates every 5-10s even when unchanged.
    // Without debouncing, each triggers a separate Matter.js transaction.
    this.flushUpdate = debounce(this.flushPendingUpdate.bind(this), 50);
  }

  override async delete() {
    this.flushUpdate.clear();
    await super.delete();
  }

  async updateStates(states: HomeAssistantStates): Promise<void> {
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
    try {
      await this.construction.ready;
    } catch {
      return;
    }

    try {
      const current = this.stateOf(HomeAssistantEntityBehavior).entity;
      await this.setStateOf(HomeAssistantEntityBehavior, {
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
}
