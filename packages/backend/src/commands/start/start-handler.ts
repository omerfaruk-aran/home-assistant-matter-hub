import * as ws from "ws";
import type { ArgumentsCamelCase } from "yargs";
import { WebApi } from "../../api/web-api.js";
import { configureDefaultEnvironment } from "../../core/app/configure-default-environment.js";
import { Options } from "../../core/app/options.js";
import { AppEnvironment } from "../../core/ioc/app-environment.js";
import { patchLevelControlTlv } from "../../matter/patches/patch-level-control-tlv.js";
import { BackupService } from "../../services/backup/backup-service.js";
import { BridgeService } from "../../services/bridges/bridge-service.js";
import { EntityIsolationService } from "../../services/bridges/entity-isolation-service.js";
import { HomeAssistantRegistry } from "../../services/home-assistant/home-assistant-registry.js";
import type { StartOptions } from "./start-options.js";

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    // HA WebSocket error: { type: 'result', success: false, error: { code: N, message: '...' } }
    if (typeof obj.error === "object" && obj.error !== null) {
      const inner = obj.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
    }
    if (typeof obj.message === "string") return obj.message;
  }
  return String(error);
}

// Check if an error should be suppressed (not crash the process)
function shouldSuppressError(error: unknown): boolean {
  const msg = extractErrorMessage(error);
  return (
    msg.includes("Connection lost") ||
    msg.includes("Endpoint storage inaccessible") ||
    msg.includes("Invalid intervalMs") ||
    msg.includes("generalDiagnostics") ||
    msg.includes("Behaviors have errors") ||
    msg.includes("TransactionDestroyedError") ||
    msg.includes("DestroyedDependencyError") ||
    msg.includes("UninitializedDependencyError") ||
    msg.includes("mutex-closed") ||
    msg.includes("not a node and is not owned") ||
    msg.includes("aggregator.")
  );
}

// Check if an error is isolatable (can isolate the entity causing it)
function isIsolatableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("Invalid intervalMs") ||
    msg.includes("Behaviors have errors") ||
    msg.includes("TransactionDestroyedError") ||
    msg.includes("DestroyedDependencyError") ||
    msg.includes("UninitializedDependencyError") ||
    msg.includes("Endpoint storage inaccessible") ||
    msg.includes("aggregator.")
  );
}

// Register early error handlers to catch errors before Matter.js initializes
process.on("uncaughtException", (error) => {
  if (shouldSuppressError(error)) {
    return; // Suppress this specific error
  }
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (shouldSuppressError(reason)) {
    return; // Suppress this specific error
  }
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

// Re-register error handlers after Matter.js initialization to override its handlers
// Matter.js registers its own handlers that call process.exit(1), so we need to be last
function registerFinalErrorHandlers() {
  // Remove all listeners and re-add ours as the only ones
  // This ensures our suppression logic takes precedence
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");

  process.on("uncaughtException", (error) => {
    if (shouldSuppressError(error)) {
      // Try to isolate the problematic entity instead of just suppressing
      if (isIsolatableError(error)) {
        EntityIsolationService.isolateFromError(error).catch(() => {
          // Isolation failed, but error is still suppressed
        });
      }
      console.warn("Suppressed Matter.js internal error:", error);
      return;
    }
    console.error("Uncaught exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    if (shouldSuppressError(reason)) {
      // Try to isolate the problematic entity instead of just suppressing
      if (isIsolatableError(reason)) {
        EntityIsolationService.isolateFromError(reason).catch(() => {
          // Isolation failed, but error is still suppressed
        });
      }
      console.warn("Suppressed Matter.js internal error:", reason);
      return;
    }
    console.error("Unhandled rejection:", reason);
    process.exit(1);
  });
}

export async function startHandler(
  startOptions: ArgumentsCamelCase<StartOptions>,
  webUiDist?: string,
): Promise<void> {
  Object.assign(globalThis, {
    WebSocket: globalThis.WebSocket ?? ws.WebSocket,
  });

  // Patch Matter.js TLV schemas before any clusters are instantiated
  patchLevelControlTlv();

  const options = new Options({ ...startOptions, webUiDist });
  const rootEnv = configureDefaultEnvironment(options);
  const appEnvironment = await AppEnvironment.create(rootEnv, options);

  // Register final error handlers AFTER Matter.js initialization
  // This overrides Matter.js's crash handlers that would otherwise call process.exit(1)
  registerFinalErrorHandlers();

  const bridgeService$ = appEnvironment.load(BridgeService);
  const webApi$ = appEnvironment.load(WebApi);
  const registry$ = appEnvironment.load(HomeAssistantRegistry);
  const backupService$ = appEnvironment.load(BackupService);

  // Wire up WebSocket broadcasts for bridge status changes.
  // This ensures the frontend receives live updates as each bridge
  // transitions through Starting → Running during startup.
  const [bridgeService, webApi, backupService] = await Promise.all([
    bridgeService$,
    webApi$,
    backupService$,
  ]);
  bridgeService.onBridgeChanged = (bridgeId) => {
    webApi.websocket.broadcastBridgeUpdate(bridgeId);
  };

  // Register graceful shutdown handlers.
  // When the process receives SIGTERM (Docker stop) or SIGINT (Ctrl+C),
  // stop all bridges cleanly so matter.js persists fabric/subscription state.
  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await Promise.race([
        backupService.createAutoBackup(),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    } catch (e) {
      console.warn("Auto-backup during shutdown failed:", e);
    }
    try {
      await Promise.race([
        bridgeService.dispose(),
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);
    } catch (e) {
      console.warn("Error during graceful shutdown:", e);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  const initBridges = bridgeService.startAll();
  const initApi = webApi.start();

  const enableAutoRefresh = initBridges
    .then(() => registry$)
    .then((r) => r.enableAutoRefresh(() => bridgeService.refreshAll()));

  await Promise.all([initBridges, initApi, enableAutoRefresh]);
}
