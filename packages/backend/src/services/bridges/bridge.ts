import {
  BridgeStatus,
  type UpdateBridgeRequest,
} from "@home-assistant-matter-hub/common";
import type { Environment, Logger } from "@matter/general";
import { SessionManager } from "@matter/main/protocol";
import type { LoggerService } from "../../core/app/logger.js";
import { BridgeServerNode } from "../../matter/endpoints/bridge-server-node.js";
import type {
  BridgeDataProvider,
  BridgeServerStatus,
} from "./bridge-data-provider.js";
import type { BridgeEndpointManager } from "./bridge-endpoint-manager.js";

// Auto Force Sync interval in milliseconds (60 seconds)
const AUTO_FORCE_SYNC_INTERVAL_MS = 60_000;

// Number of consecutive force sync cycles with 0 subscriptions before
// closing a dead session to force the controller to reconnect.
// With 60s intervals, 3 checks = ~3 minutes grace period.
const DEAD_SESSION_THRESHOLD = 3;

export class Bridge {
  private readonly log: Logger;
  readonly server: BridgeServerNode;

  private status: BridgeServerStatus = {
    code: BridgeStatus.Stopped,
    reason: undefined,
  };

  private autoForceSyncTimer: ReturnType<typeof setInterval> | null = null;

  // Tracks sessions with 0 active subscriptions across consecutive force sync cycles.
  // Key: session ID (number), Value: consecutive checks with 0 subscriptions.
  private deadSessionCounts = new Map<number, number>();

  get id() {
    return this.dataProvider.id;
  }

  get data() {
    return this.dataProvider.withMetadata(
      this.status,
      this.server,
      this.aggregator.parts.size,
      this.endpointManager.failedEntities,
    );
  }

  get aggregator() {
    return this.endpointManager.root;
  }

  constructor(
    env: Environment,
    logger: LoggerService,
    private readonly dataProvider: BridgeDataProvider,
    private readonly endpointManager: BridgeEndpointManager,
  ) {
    this.log = logger.get(`Bridge / ${dataProvider.id}`);
    this.server = new BridgeServerNode(
      env,
      this.dataProvider,
      this.endpointManager.root,
    );
  }

  async initialize(): Promise<void> {
    await this.server.construction.ready.then();
    await this.refreshDevices();
  }
  async dispose(): Promise<void> {
    await this.stop();
  }

  async refreshDevices() {
    await this.endpointManager.refreshDevices();
  }

  async start() {
    if (this.status.code === BridgeStatus.Running) {
      return;
    }
    try {
      this.status = {
        code: BridgeStatus.Starting,
        reason: "The bridge is starting... Please wait.",
      };
      await this.refreshDevices();
      this.endpointManager.startObserving();
      await this.server.start();
      this.status = { code: BridgeStatus.Running };
      this.startAutoForceSyncIfEnabled();
    } catch (e) {
      const reason = "Failed to start bridge due to error:";
      this.log.error(reason, e);
      await this.stop(BridgeStatus.Failed, `${reason}\n${e?.toString()}`);
    }
  }

  async stop(
    code: BridgeStatus = BridgeStatus.Stopped,
    reason = "Manually stopped",
  ) {
    this.stopAutoForceSync();
    this.endpointManager.stopObserving();
    try {
      await this.server.cancel();
    } catch (e) {
      // Ignore mutex-closed errors during shutdown - this is expected
      // when the environment is being disposed
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (!errorMessage.includes("mutex-closed")) {
        this.log.warn("Error stopping bridge server:", e);
      }
    }
    this.status = { code, reason };
  }

  private startAutoForceSyncIfEnabled() {
    // Stop any existing timer first
    this.stopAutoForceSync();

    if (this.dataProvider.featureFlags?.autoForceSync) {
      this.log.info(
        `Auto Force Sync enabled - syncing every ${AUTO_FORCE_SYNC_INTERVAL_MS / 1000}s`,
      );
      this.autoForceSyncTimer = setInterval(() => {
        this.forceSync().catch((e) => {
          this.log.warn("Auto force sync failed:", e);
        });
      }, AUTO_FORCE_SYNC_INTERVAL_MS);
    }
  }

  private stopAutoForceSync() {
    if (this.autoForceSyncTimer) {
      clearInterval(this.autoForceSyncTimer);
      this.autoForceSyncTimer = null;
    }
  }

  async update(update: UpdateBridgeRequest) {
    try {
      this.dataProvider.update(update);
      await this.refreshDevices();
      // Re-evaluate auto force sync setting after config update
      if (this.status.code === BridgeStatus.Running) {
        this.startAutoForceSyncIfEnabled();
      }
    } catch (e) {
      const reason = "Failed to update bridge due to error:";
      this.log.error(reason, e);
      await this.stop(BridgeStatus.Failed, `${reason}\n${e?.toString()}`);
    }
  }

  async factoryReset() {
    if (this.status.code !== BridgeStatus.Running) {
      return;
    }
    await this.server.factoryReset();
    this.status = { code: BridgeStatus.Stopped };
    await this.start();
  }

  /**
   * Force sync all device states to connected controllers.
   * This triggers a state refresh for all endpoints, pushing current values
   * to all subscribed Matter controllers without requiring re-pairing.
   *
   * This works by re-emitting the current entity state, which causes all
   * behavior servers to re-apply their state patches. Matter.js then sends
   * subscription updates to all controllers for any changed attributes.
   */
  async forceSync(): Promise<number> {
    if (this.status.code !== BridgeStatus.Running) {
      this.log.warn("Cannot force sync - bridge is not running");
      return 0;
    }

    this.log.info("Force sync: Pushing all device states to controllers...");

    // Import dynamically to avoid circular dependencies
    const { HomeAssistantEntityBehavior } = await import(
      "../../matter/behaviors/home-assistant-entity-behavior.js"
    );

    const endpoints = this.aggregator.parts;
    let syncedCount = 0;

    for (const endpoint of endpoints) {
      try {
        // Check if this endpoint has the HomeAssistantEntityBehavior
        if (!endpoint.behaviors.has(HomeAssistantEntityBehavior)) {
          continue;
        }

        // Get the current entity state and re-emit it
        // This triggers all behaviors listening to onChange to re-apply their state
        const behavior = endpoint.stateOf(HomeAssistantEntityBehavior);
        const currentEntity = behavior.entity;

        if (currentEntity?.state) {
          // Re-set the state to trigger the entity$Changed event
          // Even setting to the same value will cause behaviors to re-evaluate
          await endpoint.setStateOf(HomeAssistantEntityBehavior, {
            entity: {
              ...currentEntity,
              // Add a timestamp to force Matter.js to consider this a change
              state: { ...currentEntity.state },
            },
          });
          syncedCount++;
        }
      } catch (e) {
        this.log.debug(`Force sync: Skipped endpoint due to error:`, e);
      }
    }

    this.log.info(`Force sync: Completed for ${syncedCount} devices`);

    // Check subscription health and recover dead sessions.
    // When a controller (e.g. Alexa) loses connectivity, Matter.js cancels the
    // subscription after 3 consecutive timeouts. But the CASE session remains
    // alive, so the controller can resume the session without re-subscribing.
    // This leaves the connection in a zombie state where force sync pushes
    // state internally but no subscription exists to deliver updates.
    // Fix: detect sessions with 0 subscriptions and close them after a grace
    // period, forcing the controller to re-establish CASE with new subscriptions.
    await this.checkSubscriptionHealth();

    return syncedCount;
  }

  private async checkSubscriptionHealth(): Promise<void> {
    try {
      const sessionManager = this.server.env.get(SessionManager);
      const seenSessionIds = new Set<number>();

      for (const session of sessionManager.sessions) {
        const sessionId = session.id;
        seenSessionIds.add(sessionId);

        const subscriptionCount = session.subscriptions.size;

        if (subscriptionCount === 0) {
          const count = (this.deadSessionCounts.get(sessionId) ?? 0) + 1;
          this.deadSessionCounts.set(sessionId, count);

          if (count === 1) {
            this.log.info(
              `Subscription health: Session ${sessionId} (peer ${session.peerNodeId}) has no active subscriptions (${count}/${DEAD_SESSION_THRESHOLD})`,
            );
          }

          if (count >= DEAD_SESSION_THRESHOLD) {
            this.log.warn(
              `Subscription health: Session ${sessionId} (peer ${session.peerNodeId}) has had no subscriptions for ${count} consecutive checks. ` +
                `Force-closing session to allow controller reconnection.`,
            );
            try {
              // Use initiateForceClose instead of initiateClose.
              // initiateClose attempts a graceful close that waits for a peer response -
              // when the peer is unreachable (e.g. Alexa went offline), the session stays
              // as a zombie. initiateForceClose marks the peer as lost and immediately
              // removes the session, forcing the controller to do a full CASE re-establishment.
              await session.initiateForceClose();
            } catch (e) {
              this.log.debug(
                `Subscription health: Failed to force-close session ${sessionId}:`,
                e,
              );
            }
            this.deadSessionCounts.delete(sessionId);
          }
        } else {
          // Session has active subscriptions - reset counter if tracked
          if (this.deadSessionCounts.has(sessionId)) {
            this.log.info(
              `Subscription health: Session ${sessionId} recovered with ${subscriptionCount} subscription(s)`,
            );
            this.deadSessionCounts.delete(sessionId);
          }
        }
      }

      // Clean up tracking for sessions that no longer exist
      for (const sessionId of this.deadSessionCounts.keys()) {
        if (!seenSessionIds.has(sessionId)) {
          this.deadSessionCounts.delete(sessionId);
        }
      }
    } catch (e) {
      this.log.debug("Subscription health check failed:", e);
    }
  }

  async delete() {
    await this.server.delete();
  }
}
