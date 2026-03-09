import {
  BridgeStatus,
  type UpdateBridgeRequest,
} from "@home-assistant-matter-hub/common";
import type { Logger } from "@matter/general";
import { CommissioningServer } from "@matter/main/node";
import { SessionManager } from "@matter/main/protocol";
import type { LoggerService } from "../../core/app/logger.js";
import type { ServerModeServerNode } from "../../matter/endpoints/server-mode-server-node.js";
import { ensureCommissioningConfig } from "../../utils/ensure-commissioning-config.js";
import { logMemoryUsage } from "../../utils/log-memory.js";
import { diagnosticEventBus } from "../diagnostics/diagnostic-event-bus.js";
import type {
  BridgeDataProvider,
  BridgeServerStatus,
} from "./bridge-data-provider.js";
import type { ServerModeEndpointManager } from "./server-mode-endpoint-manager.js";

// Auto Force Sync interval in milliseconds (90 seconds).
// When autoForceSync is enabled, this pushes changed entity states to
// Matter controllers. matter.js handles subscription keepalive internally
// via empty DataReports every ~sendInterval.
const AUTO_FORCE_SYNC_INTERVAL_MS = 90_000;

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

  // Called whenever the bridge status changes. Set by BridgeService to
  // broadcast updates via WebSocket so the frontend sees every transition.
  public onStatusChange?: () => void;

  private autoForceSyncTimer: ReturnType<typeof setInterval> | null = null;
  private warmStartTimer: ReturnType<typeof setTimeout> | null = null;

  // Tracks the last synced state JSON per entity to avoid pushing unchanged states.
  private lastSyncedState: string | undefined;

  // Session lifecycle diagnostic handlers (non-destructive, logging only).
  // biome-ignore lint/suspicious/noExplicitAny: matter.js internal types
  private sessionDiagHandler?: (session: any, subscription: any) => void;
  // biome-ignore lint/suspicious/noExplicitAny: matter.js internal types
  private sessionAddedHandler?: (session: any) => void;
  // biome-ignore lint/suspicious/noExplicitAny: matter.js internal types
  private sessionDeletedHandler?: (session: any) => void;

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

  getSessionInfo(): {
    sessions: Array<{
      id: number;
      peerNodeId: string;
      subscriptionCount: number;
    }>;
    totalSessions: number;
    totalSubscriptions: number;
  } {
    try {
      const sessionManager = this.server.env.get(SessionManager);
      const sessions = [...sessionManager.sessions];
      let totalSubscriptions = 0;
      const sessionList = sessions.map((s) => {
        const subCount = s.subscriptions.size;
        totalSubscriptions += subCount;
        return {
          id: s.id,
          peerNodeId: String(s.peerNodeId),
          subscriptionCount: subCount,
        };
      });
      return {
        sessions: sessionList,
        totalSessions: sessions.length,
        totalSubscriptions,
      };
    } catch {
      return {
        sessions: [],
        totalSessions: 0,
        totalSubscriptions: 0,
      };
    }
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

  private setStatus(status: BridgeServerStatus) {
    this.status = status;
    this.onStatusChange?.();
  }

  async start(): Promise<void> {
    if (this.status.code === BridgeStatus.Running) {
      return;
    }
    this.lastSyncedState = undefined;
    try {
      this.setStatus({
        code: BridgeStatus.Starting,
        reason: "The server mode bridge is starting... Please wait.",
      });
      await this.refreshDevices();
      logMemoryUsage(this.log, "after refreshDevices (server mode)");
      this.endpointManager.startObserving();
      ensureCommissioningConfig(this.server);
      await this.server.start();
      this.setStatus({ code: BridgeStatus.Running });
      this.startAutoForceSyncIfEnabled();
      this.wireSessionDiagnostics();
      this.scheduleWarmStart();
      logMemoryUsage(this.log, "server mode bridge running");
      this.log.info("Server mode bridge started successfully");
      diagnosticEventBus.emit("bridge_started", "Server mode bridge started", {
        bridgeId: this.id,
        bridgeName: this.dataProvider.name,
      });
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
    this.unwireSessionDiagnostics();
    this.cancelWarmStart();
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
    this.setStatus({ code, reason });
    diagnosticEventBus.emit(
      "bridge_stopped",
      `Server mode bridge stopped: ${reason}`,
      {
        bridgeId: this.id,
        bridgeName: this.dataProvider.name,
      },
    );
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
    this.setStatus({ code: BridgeStatus.Stopped });
    await this.start();
  }

  async openCommissioningWindow(): Promise<void> {
    if (this.status.code !== BridgeStatus.Running) {
      throw new Error("Bridge is not running");
    }
    const commissioning = this.server.state.commissioning;
    if (!commissioning.commissioned) {
      throw new Error("Bridge is not yet commissioned");
    }
    await this.server.act((agent) =>
      agent.get(CommissioningServer).enterCommissionableMode(),
    );
    this.log.info("Opened basic commissioning window for multi-fabric pairing");
  }

  private startAutoForceSyncIfEnabled() {
    // Stop any existing timer first
    this.stopAutoForceSync();

    const forceSyncEnabled =
      this.dataProvider.featureFlags?.autoForceSync ?? false;

    if (!forceSyncEnabled) {
      return;
    }

    // Force sync pushes changed entity states to Matter controllers.
    // matter.js handles subscription keepalive internally via empty DataReports.
    this.autoForceSyncTimer = setInterval(() => {
      this.forceSync().catch((e) => {
        this.log.warn("Auto force sync failed:", e);
      });
    }, AUTO_FORCE_SYNC_INTERVAL_MS);

    this.log.info(`Force sync: every ${AUTO_FORCE_SYNC_INTERVAL_MS / 1000}s`);
  }

  private wireSessionDiagnostics() {
    try {
      const sessionManager = this.server.env.get(SessionManager);
      this.sessionDiagHandler = (session: {
        id: number;
        peerNodeId: unknown;
        subscriptions: { size: number };
      }) => {
        const sessions = [...sessionManager.sessions];
        let totalSubs = 0;
        for (const s of sessions) {
          totalSubs += s.subscriptions.size;
        }
        this.log.info(
          `Session ${session.id} (peer ${session.peerNodeId}): subscriptions=${session.subscriptions.size} | total: sessions=${sessions.length} subscriptions=${totalSubs}`,
        );
        if (totalSubs === 0 && sessions.length > 0) {
          this.log.warn(
            `All subscriptions lost — ${sessions.length} session(s) still active, waiting for controller to re-subscribe`,
          );
        }
      };
      sessionManager.subscriptionsChanged.on(this.sessionDiagHandler);

      this.sessionAddedHandler = (newSession: {
        id: number;
        peerNodeId: unknown;
        fabric?: { fabricIndex: unknown };
      }) => {
        this.log.info(
          `Session opened: id=${newSession.id} peer=${newSession.peerNodeId}`,
        );
        // Clean up stale sessions from the same peer that have lost all
        // subscriptions. matter.js 0.16.10 CaseServer does not close
        // previous sessions when establishing a new CASE session, causing
        // unbounded session accumulation over time (#105).
        for (const s of [...sessionManager.sessions]) {
          if (
            s !== newSession &&
            !s.isClosing &&
            s.peerNodeId === newSession.peerNodeId &&
            s.fabric?.fabricIndex === newSession.fabric?.fabricIndex &&
            s.subscriptions.size === 0
          ) {
            this.log.info(
              `Closing stale session ${s.id} (peer ${s.peerNodeId}, 0 subs) — replaced by session ${newSession.id}`,
            );
            s.initiateForceClose().catch(() => {});
          }
        }
      };
      this.sessionDeletedHandler = (session: {
        id: number;
        peerNodeId: unknown;
      }) => {
        const sessions = [...sessionManager.sessions];
        this.log.warn(
          `Session closed: id=${session.id} peer=${session.peerNodeId} | remaining sessions=${sessions.length}`,
        );
      };
      sessionManager.sessions.added.on(this.sessionAddedHandler);
      sessionManager.sessions.deleted.on(this.sessionDeletedHandler);
    } catch {
      // SessionManager not yet available
    }
  }

  private unwireSessionDiagnostics() {
    try {
      const sessionManager = this.server.env.get(SessionManager);
      if (this.sessionDiagHandler) {
        sessionManager.subscriptionsChanged.off(this.sessionDiagHandler);
      }
      if (this.sessionAddedHandler) {
        sessionManager.sessions.added.off(this.sessionAddedHandler);
      }
      if (this.sessionDeletedHandler) {
        sessionManager.sessions.deleted.off(this.sessionDeletedHandler);
      }
    } catch {
      // Already disposed
    }
    this.sessionDiagHandler = undefined;
    this.sessionAddedHandler = undefined;
    this.sessionDeletedHandler = undefined;
  }

  private stopAutoForceSync() {
    if (this.autoForceSyncTimer) {
      clearInterval(this.autoForceSyncTimer);
      this.autoForceSyncTimer = null;
    }
  }

  /**
   * Schedule a one-time state push shortly after bridge start.
   * This refreshes internal attribute versions so that controllers
   * reading attributes after session establishment get current data.
   */
  private scheduleWarmStart() {
    this.cancelWarmStart();
    this.warmStartTimer = setTimeout(() => {
      this.warmStartTimer = null;
      this.pushCurrentState().catch((e) => {
        this.log.debug("Warm-start state push failed:", e);
      });
    }, 15_000);
  }

  private cancelWarmStart() {
    if (this.warmStartTimer) {
      clearTimeout(this.warmStartTimer);
      this.warmStartTimer = null;
    }
  }

  /**
   * Push the current device state unconditionally.
   * Unlike forceSync, this ignores the autoForceSync flag and always pushes.
   */
  private async pushCurrentState(): Promise<void> {
    if (this.status.code !== BridgeStatus.Running) {
      return;
    }
    const device = this.endpointManager.device;
    if (!device) {
      return;
    }
    try {
      const { HomeAssistantEntityBehavior } = await import(
        "../../matter/behaviors/home-assistant-entity-behavior.js"
      );
      if (!device.behaviors.has(HomeAssistantEntityBehavior)) {
        return;
      }
      const behavior = device.stateOf(HomeAssistantEntityBehavior);
      const currentEntity = behavior.entity;
      if (currentEntity?.state) {
        await device.setStateOf(HomeAssistantEntityBehavior, {
          entity: {
            ...currentEntity,
            state: { ...currentEntity.state },
          },
        });
        this.log.info("Warm-start: Pushed initial device state");
      }
    } catch (e) {
      this.log.debug("Warm-start: Failed to push state:", e);
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
      return 0;
    }

    if (!this.dataProvider.featureFlags?.autoForceSync) {
      return 0;
    }

    const device = this.endpointManager.device;
    if (!device) {
      return 0;
    }

    try {
      // Import dynamically to avoid circular dependencies
      const { HomeAssistantEntityBehavior } = await import(
        "../../matter/behaviors/home-assistant-entity-behavior.js"
      );

      if (!device.behaviors.has(HomeAssistantEntityBehavior)) {
        return 0;
      }

      const behavior = device.stateOf(HomeAssistantEntityBehavior);
      const currentEntity = behavior.entity;

      if (currentEntity?.state) {
        // Compare only meaningful fields — ignore volatile HA metadata
        // (last_changed, last_updated, context) to avoid unnecessary MRP traffic.
        const stateJson = JSON.stringify({
          s: currentEntity.state.state,
          a: currentEntity.state.attributes,
        });

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
          return 1;
        }
      }
    } catch (e) {
      this.log.debug("Force sync: Failed due to error:", e);
    }

    return 0;
  }
}
