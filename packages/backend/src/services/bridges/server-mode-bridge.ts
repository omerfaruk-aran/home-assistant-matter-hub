import {
  BridgeStatus,
  type UpdateBridgeRequest,
} from "@home-assistant-matter-hub/common";
import type { Logger } from "@matter/general";
import { SessionManager } from "@matter/main/protocol";
import type { LoggerService } from "../../core/app/logger.js";
import type { ServerModeServerNode } from "../../matter/endpoints/server-mode-server-node.js";
import type {
  BridgeDataProvider,
  BridgeServerStatus,
} from "./bridge-data-provider.js";
import type { ServerModeEndpointManager } from "./server-mode-endpoint-manager.js";

// Auto Force Sync interval in milliseconds (60 seconds)
const AUTO_FORCE_SYNC_INTERVAL_MS = 60_000;

// Number of consecutive force sync cycles with 0 subscriptions before
// closing a dead session to force the controller to reconnect.
// With 60s intervals, 3 checks = ~3 minutes grace period.
const DEAD_SESSION_THRESHOLD = 3;

/**
 * ServerModeBridge exposes a single device as a standalone Matter device.
 * This is required for Apple Home to properly support Siri voice commands
 * for Robot Vacuums (RVC) and similar device types.
 */
export class ServerModeBridge {
  private readonly log: Logger;

  private status: BridgeServerStatus = {
    code: BridgeStatus.Stopped,
    reason: undefined,
  };

  private autoForceSyncTimer: ReturnType<typeof setInterval> | null = null;

  // Tracks sessions with 0 active subscriptions across consecutive force sync cycles.
  // Key: session ID (number), Value: consecutive checks with 0 subscriptions.
  private deadSessionCounts = new Map<number, number>();

  get id(): string {
    return this.dataProvider.id;
  }

  get data() {
    return this.dataProvider.withMetadata(
      this.status,
      this.server,
      this.endpointManager.device ? 1 : 0,
      this.endpointManager.failedEntities,
    );
  }

  constructor(
    logger: LoggerService,
    private readonly dataProvider: BridgeDataProvider,
    private readonly endpointManager: ServerModeEndpointManager,
    readonly server: ServerModeServerNode,
  ) {
    this.log = logger.get(`ServerModeBridge / ${dataProvider.id}`);
  }

  async initialize(): Promise<void> {
    await this.server.construction.ready.then();
    await this.refreshDevices();
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  async refreshDevices(): Promise<void> {
    await this.endpointManager.refreshDevices();
  }

  async start(): Promise<void> {
    if (this.status.code === BridgeStatus.Running) {
      return;
    }
    try {
      this.status = {
        code: BridgeStatus.Starting,
        reason: "The server mode bridge is starting... Please wait.",
      };
      await this.refreshDevices();
      this.endpointManager.startObserving();
      await this.server.start();
      this.status = { code: BridgeStatus.Running };
      this.startAutoForceSyncIfEnabled();
      this.log.info("Server mode bridge started successfully");
    } catch (e) {
      const reason = "Failed to start server mode bridge due to error:";
      this.log.error(reason, e);
      await this.stop(BridgeStatus.Failed, `${reason}\n${e?.toString()}`);
    }
  }

  async stop(
    code: BridgeStatus = BridgeStatus.Stopped,
    reason = "Manually stopped",
  ): Promise<void> {
    this.stopAutoForceSync();
    this.endpointManager.stopObserving();
    try {
      await this.server.cancel();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (!errorMessage.includes("mutex-closed")) {
        this.log.warn("Error stopping server mode bridge:", e);
      }
    }
    this.status = { code, reason };
  }

  async update(update: UpdateBridgeRequest): Promise<void> {
    try {
      this.dataProvider.update(update);
      await this.refreshDevices();
      // Re-evaluate auto force sync setting after config update
      if (this.status.code === BridgeStatus.Running) {
        this.startAutoForceSyncIfEnabled();
      }
    } catch (e) {
      const reason = "Failed to update server mode bridge due to error:";
      this.log.error(reason, e);
      await this.stop(BridgeStatus.Failed, `${reason}\n${e?.toString()}`);
    }
  }

  async factoryReset(): Promise<void> {
    if (this.status.code !== BridgeStatus.Running) {
      return;
    }
    await this.server.factoryReset();
    this.status = { code: BridgeStatus.Stopped };
    await this.start();
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

  async delete(): Promise<void> {
    await this.server.delete();
  }

  /**
   * Force sync the device state to all connected Matter controllers.
   * This triggers a state refresh, pushing current values to all subscribed
   * controllers without requiring re-pairing.
   */
  async forceSync(): Promise<number> {
    if (this.status.code !== BridgeStatus.Running) {
      this.log.warn("Cannot force sync - server mode bridge is not running");
      return 0;
    }

    const device = this.endpointManager.device;
    if (!device) {
      this.log.warn("Cannot force sync - no device endpoint");
      return 0;
    }

    this.log.info("Force sync: Pushing device state to controllers...");

    try {
      // Import dynamically to avoid circular dependencies
      const { HomeAssistantEntityBehavior } = await import(
        "../../matter/behaviors/home-assistant-entity-behavior.js"
      );

      // Check if this endpoint has the HomeAssistantEntityBehavior
      if (!device.behaviors.has(HomeAssistantEntityBehavior)) {
        this.log.warn(
          "Force sync: Device does not have HomeAssistantEntityBehavior",
        );
        return 0;
      }

      // Get the current entity state and re-emit it
      const behavior = device.stateOf(HomeAssistantEntityBehavior);
      const currentEntity = behavior.entity;

      if (currentEntity?.state) {
        // Re-set the state to trigger the entity$Changed event
        await device.setStateOf(HomeAssistantEntityBehavior, {
          entity: {
            ...currentEntity,
            state: { ...currentEntity.state },
          },
        });
        this.log.info("Force sync: Completed for 1 device");

        // Check subscription health (same as Bridge - see comments there)
        await this.checkSubscriptionHealth();

        return 1;
      }
    } catch (e) {
      this.log.debug("Force sync: Failed due to error:", e);
    }

    return 0;
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
}
