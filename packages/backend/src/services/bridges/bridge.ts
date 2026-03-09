import {
  BridgeStatus,
  type UpdateBridgeRequest,
} from "@home-assistant-matter-hub/common";
import type { Environment, Logger } from "@matter/general";
import type { Endpoint } from "@matter/main";
import { CommissioningServer } from "@matter/main/node";
import { SessionManager } from "@matter/main/protocol";
import type { LoggerService } from "../../core/app/logger.js";
import { BridgeServerNode } from "../../matter/endpoints/bridge-server-node.js";
import { ensureCommissioningConfig } from "../../utils/ensure-commissioning-config.js";
import { logMemoryUsage } from "../../utils/log-memory.js";
import { diagnosticEventBus } from "../diagnostics/diagnostic-event-bus.js";
import type {
  BridgeDataProvider,
  BridgeServerStatus,
} from "./bridge-data-provider.js";
import type { BridgeEndpointManager } from "./bridge-endpoint-manager.js";

// Auto Force Sync interval in milliseconds (90 seconds).
// When autoForceSync is enabled, this pushes changed entity states to
// Matter controllers. matter.js handles subscription keepalive internally
// via empty DataReports every ~sendInterval.
const AUTO_FORCE_SYNC_INTERVAL_MS = 90_000;

export class Bridge {
  private readonly log: Logger;
  readonly server: BridgeServerNode;

  private status: BridgeServerStatus = {
    code: BridgeStatus.Stopped,
    reason: undefined,
  };

  // Called whenever the bridge status changes. Set by BridgeService to
  // broadcast updates via WebSocket so the frontend sees every transition
  // (e.g. Stopped → Starting → Running).
  public onStatusChange?: () => void;

  private autoForceSyncTimer: ReturnType<typeof setInterval> | null = null;

  // Tracks the last synced state JSON per entity to avoid pushing unchanged states.
  // Key: entity_id, Value: JSON.stringify of entity.state
  private lastSyncedStates = new Map<string, string>();

  // Session lifecycle diagnostic handlers (non-destructive, logging only).
  // biome-ignore lint/suspicious/noExplicitAny: matter.js internal types
  private sessionDiagHandler?: (session: any, subscription: any) => void;
  // biome-ignore lint/suspicious/noExplicitAny: matter.js internal types
  private sessionAddedHandler?: (session: any) => void;
  // biome-ignore lint/suspicious/noExplicitAny: matter.js internal types
  private sessionDeletedHandler?: (session: any) => void;

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

  get aggregator() {
    return this.endpointManager.root;
  }

  get pluginInfo() {
    return this.endpointManager.getPluginInfo();
  }

  enablePlugin(pluginName: string): void {
    this.endpointManager.enablePlugin(pluginName);
  }

  disablePlugin(pluginName: string): void {
    this.endpointManager.disablePlugin(pluginName);
  }

  resetPlugin(pluginName: string): void {
    this.endpointManager.resetPlugin(pluginName);
  }

  getPluginConfigSchema(
    pluginName: string,
  ): Record<string, unknown> | undefined {
    return this.endpointManager.getPluginConfigSchema(pluginName);
  }

  async updatePluginConfig(
    pluginName: string,
    config: Record<string, unknown>,
  ): Promise<boolean> {
    return this.endpointManager.updatePluginConfig(pluginName, config);
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
    // Prune stale entries from lastSyncedStates for entities that were removed
    const currentEntityIds = new Set(
      [...this.aggregator.parts].map(
        (p) => (p as { entityId?: string }).entityId,
      ),
    );
    for (const entityId of this.lastSyncedStates.keys()) {
      if (!currentEntityIds.has(entityId)) {
        this.lastSyncedStates.delete(entityId);
      }
    }
  }

  private setStatus(status: BridgeServerStatus) {
    this.status = status;
    this.onStatusChange?.();
  }

  async start() {
    if (this.status.code === BridgeStatus.Running) {
      return;
    }
    this.lastSyncedStates.clear();
    try {
      this.setStatus({
        code: BridgeStatus.Starting,
        reason: "The bridge is starting... Please wait.",
      });
      await this.refreshDevices();
      logMemoryUsage(
        this.log,
        `after refreshDevices (${this.aggregator.parts.size} endpoints)`,
      );
      this.endpointManager.startObserving();
      ensureCommissioningConfig(this.server);
      await this.server.start();
      await this.endpointManager.startPlugins();
      this.setStatus({ code: BridgeStatus.Running });
      this.startAutoForceSyncIfEnabled();
      this.wireSessionDiagnostics();
      logMemoryUsage(this.log, "bridge running");
      diagnosticEventBus.emit("bridge_started", `Bridge started`, {
        bridgeId: this.id,
        bridgeName: this.dataProvider.name,
        details: { deviceCount: this.aggregator.parts.size },
      });
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
    this.unwireSessionDiagnostics();
    this.stopAutoForceSync();
    await this.endpointManager.stopPlugins();
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
    this.setStatus({ code, reason });
    diagnosticEventBus.emit("bridge_stopped", `Bridge stopped: ${reason}`, {
      bridgeId: this.id,
      bridgeName: this.dataProvider.name,
    });
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
    this.setStatus({ code: BridgeStatus.Stopped });
    await this.start();
  }

  /**
   * Open a basic commissioning window so additional controllers can pair.
   * After first commissioning the bridge stops advertising; this re-enables
   * mDNS commissionable advertising with the original passcode/discriminator
   * for the standard 15-minute window.
   */
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

  /**
   * Force sync all device states to connected controllers.
   * Only pushes state for endpoints whose entity state has actually changed
   * since the last sync. This avoids unnecessary MRP traffic that could
   * trigger session loss during brief network interruptions.
   */
  async forceSync(): Promise<number> {
    if (this.status.code !== BridgeStatus.Running) {
      return 0;
    }

    if (!this.dataProvider.featureFlags?.autoForceSync) {
      return 0;
    }

    // Import dynamically to avoid circular dependencies
    const { HomeAssistantEntityBehavior } = await import(
      "../../matter/behaviors/home-assistant-entity-behavior.js"
    );

    // Collect all endpoints recursively to include sub-endpoints
    // of composed devices (e.g., ComposedSensorEndpoint has T/H/P sub-endpoints)
    const allEndpoints: Endpoint[] = [];
    const collect = (ep: Endpoint) => {
      allEndpoints.push(ep);
      for (const child of ep.parts) {
        collect(child);
      }
    };
    for (const ep of this.aggregator.parts) {
      collect(ep);
    }

    let syncedCount = 0;
    let skippedCount = 0;

    for (const endpoint of allEndpoints) {
      try {
        if (!endpoint.behaviors.has(HomeAssistantEntityBehavior)) {
          continue;
        }

        const behavior = endpoint.stateOf(HomeAssistantEntityBehavior);
        const currentEntity = behavior.entity;

        if (currentEntity?.state) {
          const entityId = currentEntity.entity_id;
          // Compare only meaningful fields — ignore volatile HA metadata
          // (last_changed, last_updated, context) to avoid unnecessary MRP traffic.
          const stateJson = JSON.stringify({
            s: currentEntity.state.state,
            a: currentEntity.state.attributes,
          });
          const lastJson = this.lastSyncedStates.get(entityId);

          if (stateJson !== lastJson) {
            // State has changed since last sync — push update
            await endpoint.setStateOf(HomeAssistantEntityBehavior, {
              entity: {
                ...currentEntity,
                state: { ...currentEntity.state },
              },
            });
            this.lastSyncedStates.set(entityId, stateJson);
            syncedCount++;
          } else {
            skippedCount++;
          }
        }
      } catch (e) {
        this.log.debug(`Force sync: Skipped endpoint due to error:`, e);
      }
    }

    if (syncedCount > 0) {
      this.log.info(
        `Force sync: Pushed ${syncedCount} changed device(s), skipped ${skippedCount} unchanged`,
      );
    }

    return syncedCount;
  }

  async delete() {
    await this.server.delete();
  }
}
