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

// Auto Force Sync interval in milliseconds (5 minutes).
// A longer interval reduces MRP traffic and gives controllers more time
// to recover from brief network interruptions before a report triggers
// an MRP retransmission failure → session loss.
const AUTO_FORCE_SYNC_INTERVAL_MS = 300_000;

// Number of consecutive force sync cycles with 0 subscriptions before
// closing a dead session to force the controller to reconnect.
// With 300s intervals, 3 checks = ~15 minutes grace period.
const DEAD_SESSION_THRESHOLD = 3;

// Number of consecutive checks with 0 sessions (for a commissioned bridge)
// before clearing resumption records to force full CASE re-establishment.
// With 300s intervals, 5 checks = ~25 minutes grace period.
const ORPHAN_SESSION_THRESHOLD = 5;

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

  // Tracks consecutive checks where a commissioned bridge has 0 active sessions.
  private noSessionCount = 0;

  // Whether the bridge has ever had an active session (meaning it was paired and connected).
  private hadActiveSession = false;

  // Tracks the last synced state JSON per entity to avoid pushing unchanged states.
  private lastSyncedState: string | undefined;

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
      // Clear stale resumption records from previous runs so controllers
      // always perform a fresh CASE handshake after a restart.
      await this.clearResumptionRecordsOnStart();
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
   * Only pushes state when the entity state has actually changed since
   * the last sync to avoid unnecessary MRP traffic.
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

    try {
      // Import dynamically to avoid circular dependencies
      const { HomeAssistantEntityBehavior } = await import(
        "../../matter/behaviors/home-assistant-entity-behavior.js"
      );

      if (!device.behaviors.has(HomeAssistantEntityBehavior)) {
        this.log.warn(
          "Force sync: Device does not have HomeAssistantEntityBehavior",
        );
        return 0;
      }

      const behavior = device.stateOf(HomeAssistantEntityBehavior);
      const currentEntity = behavior.entity;

      if (currentEntity?.state) {
        const stateJson = JSON.stringify(currentEntity.state);
        let pushed = false;

        if (stateJson !== this.lastSyncedState) {
          // State has changed since last sync — push update
          await device.setStateOf(HomeAssistantEntityBehavior, {
            entity: {
              ...currentEntity,
              state: { ...currentEntity.state },
            },
          });
          this.lastSyncedState = stateJson;
          this.log.info("Force sync: Pushed 1 changed device");
          pushed = true;
        } else {
          this.log.debug("Force sync: No changes detected");
        }

        // Check subscription health (same as Bridge - see comments there)
        await this.checkSubscriptionHealth();

        return pushed ? 1 : 0;
      }
    } catch (e) {
      this.log.debug("Force sync: Failed due to error:", e);
    }

    return 0;
  }

  private async checkSubscriptionHealth(): Promise<void> {
    try {
      const sessionManager = this.server.env.get(SessionManager);
      const sessions = [...sessionManager.sessions];
      const seenSessionIds = new Set<number>();

      let totalSubscriptions = 0;
      for (const session of sessions) {
        const sessionId = session.id;
        seenSessionIds.add(sessionId);
        totalSubscriptions += session.subscriptions.size;

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

      // Track whether we ever had active sessions
      if (sessions.length > 0) {
        this.hadActiveSession = true;
        this.noSessionCount = 0;
      }

      // Detect orphaned bridge: was previously connected but now has 0 sessions.
      if (sessions.length === 0 && this.hadActiveSession) {
        this.noSessionCount++;

        if (this.noSessionCount === 1) {
          this.log.warn(
            `Subscription health: Bridge has 0 active sessions but was previously connected. ` +
              `Controller may have disconnected. Waiting for reconnection... (${this.noSessionCount}/${ORPHAN_SESSION_THRESHOLD})`,
          );
        }

        if (this.noSessionCount >= ORPHAN_SESSION_THRESHOLD) {
          this.log.warn(
            `Subscription health: Bridge has been orphaned for ${this.noSessionCount} consecutive checks (~${this.noSessionCount} minutes). ` +
              `Clearing session resumption records to force full CASE re-establishment on next controller reconnection.`,
          );
          await this.clearResumptionRecords(sessionManager);
          this.noSessionCount = 0;
        }
      }

      // Log diagnostic summary when orphaned or no subscriptions
      if (this.noSessionCount > 0 || totalSubscriptions === 0) {
        this.log.debug(
          `Subscription health: sessions=${sessions.length}, subscriptions=${totalSubscriptions}, orphanChecks=${this.noSessionCount}/${ORPHAN_SESSION_THRESHOLD}`,
        );
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

  /**
   * Clear resumption records on bridge start to ensure controllers always
   * do a fresh CASE handshake. Stale resumption data from previous runs
   * can prevent controllers from reconnecting properly.
   */
  private async clearResumptionRecordsOnStart(): Promise<void> {
    try {
      const sessionManager = this.server.env.get(SessionManager);
      await this.clearResumptionRecords(sessionManager);
    } catch (e) {
      this.log.debug("Failed to clear resumption records on start:", e);
    }
  }

  /**
   * Clear all session resumption records to force controllers to do full CASE
   * re-establishment instead of trying to resume a potentially stale session.
   * This is called when the bridge is in an orphaned state and on bridge start.
   */
  private async clearResumptionRecords(
    sessionManager: SessionManager,
  ): Promise<void> {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: FabricManager not exported from @matter/main/protocol
      const fabrics = (sessionManager as any).context?.fabrics;
      if (!fabrics) {
        this.log.debug(
          "Cannot clear resumption records: FabricManager not accessible",
        );
        return;
      }

      let cleared = 0;
      for (const fabric of fabrics) {
        try {
          const deleted =
            await sessionManager.deleteResumptionRecordsForFabric(fabric);
          if (deleted) cleared++;
        } catch (e) {
          this.log.debug(
            `Failed to clear resumption records for fabric ${fabric.fabricIndex}:`,
            e,
          );
        }
      }

      if (cleared > 0) {
        this.log.info(
          `Cleared resumption records for ${cleared} fabric(s). Controllers will perform full CASE on next connection.`,
        );
      }
    } catch (e) {
      this.log.debug("Failed to clear resumption records:", e);
    }
  }
}
