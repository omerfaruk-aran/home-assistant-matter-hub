import type {
  EntityMappingConfig,
  FailedEntity,
  HomeAssistantDomain,
} from "@home-assistant-matter-hub/common";
import type { Logger } from "@matter/general";
import type { Endpoint } from "@matter/main";
import { Service } from "../../core/ioc/service.js";
import type { EntityEndpoint } from "../../matter/endpoints/entity-endpoint.js";
import { LegacyEndpoint } from "../../matter/endpoints/legacy/legacy-endpoint.js";
import type { ServerModeServerNode } from "../../matter/endpoints/server-mode-server-node.js";
import { ServerModeVacuumEndpoint } from "../../matter/endpoints/server-mode-vacuum-endpoint.js";
import { subscribeEntities } from "../home-assistant/api/subscribe-entities.js";
import type { HomeAssistantClient } from "../home-assistant/home-assistant-client.js";
import type { HomeAssistantStates } from "../home-assistant/home-assistant-registry.js";
import type { EntityMappingStorage } from "../storage/entity-mapping-storage.js";
import type { BridgeRegistry } from "./bridge-registry.js";

/**
 * ServerModeEndpointManager manages a single device endpoint for server mode.
 * Unlike BridgeEndpointManager which uses an AggregatorEndpoint,
 * this manager adds the device directly to the ServerNode.
 */
export class ServerModeEndpointManager extends Service {
  private entityIds: string[] = [];
  private unsubscribe?: () => void;
  private _failedEntities: FailedEntity[] = [];
  private deviceEndpoint?: EntityEndpoint;

  get failedEntities(): FailedEntity[] {
    return this._failedEntities;
  }

  /**
   * Returns the device endpoint (for server mode, this is the single device)
   */
  get device(): Endpoint | undefined {
    return this.deviceEndpoint;
  }

  constructor(
    private readonly serverNode: ServerModeServerNode,
    private readonly client: HomeAssistantClient,
    private readonly registry: BridgeRegistry,
    private readonly mappingStorage: EntityMappingStorage,
    private readonly bridgeId: string,
    private readonly log: Logger,
  ) {
    super("ServerModeEndpointManager");
  }

  private getEntityMapping(entityId: string): EntityMappingConfig | undefined {
    return this.mappingStorage.getMapping(this.bridgeId, entityId);
  }

  override async dispose(): Promise<void> {
    this.stopObserving();
  }

  async startObserving(): Promise<void> {
    this.stopObserving();

    if (!this.entityIds.length) {
      return;
    }

    this.unsubscribe = subscribeEntities(
      this.client.connection,
      (e) => this.updateStates(e),
      this.entityIds,
    );
  }

  stopObserving(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  async refreshDevices(): Promise<void> {
    this.registry.refresh();
    this._failedEntities = [];

    this.entityIds = this.registry.entityIds;

    // Server mode only supports a single device
    if (this.entityIds.length === 0) {
      this.log.warn("Server mode bridge has no entities configured");
      return;
    }

    if (this.entityIds.length > 1) {
      this.log.warn(
        `Server mode only supports a single device, but ${this.entityIds.length} entities are configured. ` +
          `Only the first entity will be exposed. Remove other entities from this bridge for proper operation.`,
      );
      // Mark all but the first entity as failed
      for (let i = 1; i < this.entityIds.length; i++) {
        this._failedEntities.push({
          entityId: this.entityIds[i],
          reason:
            "Server mode only supports a single device. Remove other entities from this bridge.",
        });
      }
      // Only use the first entity
      this.entityIds = [this.entityIds[0]];
    }

    const entityId = this.entityIds[0];
    const mapping = this.getEntityMapping(entityId);

    if (mapping?.disabled) {
      this.log.warn(
        `The only entity in server mode bridge is disabled: ${entityId}`,
      );
      return;
    }

    // If we already have a device endpoint, update its state instead of recreating
    if (this.deviceEndpoint) {
      this.log.debug(`Device endpoint already exists for ${entityId}`);
      return;
    }

    try {
      const domain = entityId.split(".")[0] as HomeAssistantDomain;

      // For vacuum entities, use ServerModeVacuumDevice (without bridgedDeviceBasicInformation)
      // This makes the vacuum appear as a standalone device, not bridged
      if (domain === "vacuum") {
        const endpoint = await this.createServerModeVacuumEndpoint(
          entityId,
          mapping,
        );
        if (!endpoint) {
          this._failedEntities.push({
            entityId,
            reason: "Failed to create vacuum endpoint - unsupported device",
          });
          return;
        }
        await this.serverNode.addDevice(endpoint);
        this.deviceEndpoint = endpoint;
        this.log.info(
          `Server mode: Added vacuum ${entityId} as standalone device`,
        );
        return;
      }

      // For other entity types, fall back to LegacyEndpoint (bridged)
      // Note: Server mode is primarily designed for vacuums
      const endpoint = await LegacyEndpoint.create(
        this.registry,
        entityId,
        mapping,
      );

      if (!endpoint) {
        this._failedEntities.push({
          entityId,
          reason: "Failed to create endpoint - unsupported device type",
        });
        return;
      }

      // Add directly to the server node (not to an aggregator)
      await this.serverNode.addDevice(endpoint);
      this.deviceEndpoint = endpoint;
      this.log.info(`Server mode: Added device ${entityId}`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.log.error(`Failed to create server mode device ${entityId}:`, e);
      this._failedEntities.push({ entityId, reason });
    }

    if (this.unsubscribe) {
      this.startObserving();
    }
  }

  async updateStates(states: HomeAssistantStates): Promise<void> {
    if (this.deviceEndpoint) {
      try {
        await this.deviceEndpoint.updateStates(states);
      } catch (e) {
        this.log.warn("State update failed for server mode endpoint:", e);
      }
    }
  }

  /**
   * Creates a Server Mode Vacuum endpoint without BridgedDeviceBasicInformation.
   * This makes the vacuum appear as a standalone Matter device, which is required
   * for Apple Home Siri voice commands and Alexa discovery.
   */
  private async createServerModeVacuumEndpoint(
    entityId: string,
    mapping?: EntityMappingConfig,
  ): Promise<EntityEndpoint | undefined> {
    return ServerModeVacuumEndpoint.create(this.registry, entityId, mapping);
  }
}
