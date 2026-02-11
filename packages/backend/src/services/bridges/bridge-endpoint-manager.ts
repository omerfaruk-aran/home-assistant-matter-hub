import type {
  EntityMappingConfig,
  FailedEntity,
} from "@home-assistant-matter-hub/common";
import type { Logger } from "@matter/general";
import type { Endpoint } from "@matter/main";
import { Service } from "../../core/ioc/service.js";
import { AggregatorEndpoint } from "../../matter/endpoints/aggregator-endpoint.js";
import { createDomainEndpoint } from "../../matter/endpoints/domains/create-domain-endpoint.js";
import type { EntityEndpoint } from "../../matter/endpoints/entity-endpoint.js";
import { LegacyEndpoint } from "../../matter/endpoints/legacy/legacy-endpoint.js";
import { subscribeEntities } from "../home-assistant/api/subscribe-entities.js";
import type { HomeAssistantClient } from "../home-assistant/home-assistant-client.js";
import type { HomeAssistantStates } from "../home-assistant/home-assistant-registry.js";
import type { EntityMappingStorage } from "../storage/entity-mapping-storage.js";
import type { BridgeRegistry } from "./bridge-registry.js";
import { EntityIsolationService } from "./entity-isolation-service.js";

const MAX_ENTITY_ID_LENGTH = 150;

export class BridgeEndpointManager extends Service {
  readonly root: Endpoint;
  private entityIds: string[] = [];
  private unsubscribe?: () => void;
  private _failedEntities: FailedEntity[] = [];

  get failedEntities(): FailedEntity[] {
    // Combine static failed entities with dynamically isolated entities
    const isolated = EntityIsolationService.getIsolatedEntities(this.bridgeId);
    return [...this._failedEntities, ...isolated];
  }

  constructor(
    private readonly client: HomeAssistantClient,
    private readonly registry: BridgeRegistry,
    private readonly mappingStorage: EntityMappingStorage,
    private readonly bridgeId: string,
    private readonly log: Logger,
  ) {
    super("BridgeEndpointManager");
    this.root = new AggregatorEndpoint("aggregator");

    // Register callback to isolate problematic entities at runtime
    EntityIsolationService.registerIsolationCallback(
      bridgeId,
      this.isolateEntity.bind(this),
    );
  }

  /**
   * Isolate an entity by removing it from the aggregator.
   * Called by EntityIsolationService when a runtime error is detected.
   */
  async isolateEntity(entityName: string): Promise<void> {
    const endpoints = this.root.parts.map((p) => p as EntityEndpoint);
    const endpoint = endpoints.find(
      (e) => e.id === entityName || e.entityId === entityName,
    );

    if (endpoint) {
      this.log.warn(
        `Isolating entity ${endpoint.entityId} due to runtime error`,
      );
      try {
        await endpoint.delete();
      } catch (e) {
        this.log.error(`Failed to delete isolated endpoint:`, e);
      }
    }
  }

  private getEntityMapping(entityId: string): EntityMappingConfig | undefined {
    return this.mappingStorage.getMapping(this.bridgeId, entityId);
  }

  override async dispose(): Promise<void> {
    this.stopObserving();
    EntityIsolationService.unregisterIsolationCallback(this.bridgeId);
    EntityIsolationService.clearIsolatedEntities(this.bridgeId);
  }

  async startObserving() {
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

  stopObserving() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  async refreshDevices() {
    this.registry.refresh();
    this._failedEntities = [];

    const endpoints = this.root.parts.map((p) => p as EntityEndpoint);
    this.entityIds = this.registry.entityIds;

    const existingEndpoints: EntityEndpoint[] = [];
    for (const endpoint of endpoints) {
      if (!this.entityIds.includes(endpoint.entityId)) {
        try {
          await endpoint.delete();
        } catch (e) {
          this.log.warn(`Failed to delete endpoint ${endpoint.entityId}:`, e);
        }
      } else {
        existingEndpoints.push(endpoint);
      }
    }

    for (const entityId of this.entityIds) {
      const mapping = this.getEntityMapping(entityId);

      if (mapping?.disabled) {
        this.log.debug(`Skipping disabled entity: ${entityId}`);
        continue;
      }

      if (entityId.length > MAX_ENTITY_ID_LENGTH) {
        const reason = `Entity ID too long (${entityId.length} chars, max ${MAX_ENTITY_ID_LENGTH}). This would cause filesystem errors.`;
        this.log.warn(`Skipping entity: ${entityId}. Reason: ${reason}`);
        this._failedEntities.push({ entityId, reason });
        continue;
      }

      let endpoint = existingEndpoints.find((e) => e.entityId === entityId);
      if (!endpoint) {
        try {
          // Vision 1: All known domains use DomainEndpoint.
          // LegacyEndpoint kept as fallback for unknown/future domains only.
          endpoint =
            createDomainEndpoint(this.registry, entityId, mapping) ??
            (await LegacyEndpoint.create(this.registry, entityId, mapping));
        } catch (e) {
          // Handle all endpoint creation errors gracefully to prevent boot crashes
          const reason = this.extractErrorReason(e);
          this.log.warn(`Failed to create device ${entityId}: ${reason}`);
          this._failedEntities.push({ entityId, reason });
          continue;
        }

        if (endpoint) {
          try {
            await this.root.add(endpoint);
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            // Handle all endpoint initialization errors gracefully
            this.log.warn(
              `Failed to add endpoint for ${entityId}: ${errorMessage}`,
            );
            this._failedEntities.push({
              entityId,
              reason: this.extractErrorReason(e),
            });
          }
        }
      }
    }

    if (this.unsubscribe) {
      this.startObserving();
    }
  }

  async updateStates(states: HomeAssistantStates) {
    const endpoints = this.root.parts.map((p) => p as EntityEndpoint);
    // Process state updates in parallel for faster response times
    // Use allSettled so one failing endpoint doesn't block all others
    const results = await Promise.allSettled(
      endpoints.map((endpoint) => endpoint.updateStates(states)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        this.log.warn("State update failed for endpoint:", result.reason);
      }
    }
  }

  private extractErrorReason(error: unknown): string {
    if (error instanceof Error) {
      // Check for nested cause (common in Matter.js errors)
      const cause = (error as Error & { cause?: Error }).cause;
      if (cause?.message) {
        return `${error.message}: ${cause.message}`;
      }
      return error.message;
    }
    return String(error);
  }
}
