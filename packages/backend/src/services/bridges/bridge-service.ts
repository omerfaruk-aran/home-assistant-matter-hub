import crypto from "node:crypto";
import type {
  BridgeBasicInformation,
  BridgeData,
  CreateBridgeRequest,
  UpdateBridgeRequest,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import { Service } from "../../core/ioc/service.js";
import type { BridgeStorage } from "../storage/bridge-storage.js";
import type { Bridge } from "./bridge.js";
import type { BridgeFactory } from "./bridge-factory.js";

export interface BridgeServiceProps {
  basicInformation: BridgeBasicInformation;
  autoRecovery?: boolean;
  recoveryIntervalMs?: number;
}

export class BridgeService extends Service {
  private readonly log = Logger.get("BridgeService");
  public readonly bridges: Bridge[] = [];
  public autoRecoveryEnabled = false;
  public lastRecoveryAttempt?: Date;
  public recoveryCount = 0;

  // Called whenever a bridge's status changes (start, stop, update, delete, recovery).
  // Set by the caller (e.g. start-handler) to broadcast updates via WebSocket.
  public onBridgeChanged?: (bridgeId: string) => void;

  private recoveryInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly bridgeStorage: BridgeStorage,
    private readonly bridgeFactory: BridgeFactory,
    private readonly props: BridgeServiceProps,
  ) {
    super("BridgeService");
    this.autoRecoveryEnabled = props.autoRecovery ?? true;
  }

  protected override async initialize() {
    for (const data of this.bridgeStorage.bridges) {
      await this.addBridge(data);
    }
    if (this.autoRecoveryEnabled) {
      this.startAutoRecovery();
    }
  }

  private startAutoRecovery() {
    const intervalMs = this.props.recoveryIntervalMs ?? 60000;
    this.recoveryInterval = setInterval(() => {
      this.attemptRecovery();
    }, intervalMs);
  }

  private async attemptRecovery() {
    const failedBridges = this.bridges.filter(
      (b) => b.data.status === "failed",
    );
    if (failedBridges.length === 0) return;

    this.lastRecoveryAttempt = new Date();
    for (const bridge of failedBridges) {
      try {
        await bridge.start();
        this.recoveryCount++;
      } catch (e) {
        this.log.warn(`Recovery attempt failed for bridge ${bridge.id}:`, e);
      }
    }
  }

  async restartBridge(bridgeId: string): Promise<boolean> {
    const bridge = this.get(bridgeId);
    if (!bridge) return false;
    await bridge.stop();
    await bridge.start();
    return true;
  }
  override async dispose(): Promise<void> {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
    }
    await Promise.all(this.bridges.map((bridge) => bridge.dispose()));
  }

  getNextAvailablePort(startPort = 5540): number {
    const usedPorts = new Set(this.bridges.map((b) => b.data.port));
    let port = startPort;
    while (usedPorts.has(port)) {
      port++;
    }
    return port;
  }

  async startAll() {
    // Sort bridges by priority (lower = starts first), default priority is 100
    const sortedBridges = [...this.bridges].sort((a, b) => {
      const priorityA = a.data.priority ?? 100;
      const priorityB = b.data.priority ?? 100;
      return priorityA - priorityB;
    });
    for (const bridge of sortedBridges) {
      try {
        await bridge.start();
      } catch (e) {
        // Isolate per-bridge failures so one failing bridge doesn't prevent others from starting
        this.log.error(`Failed to start bridge ${bridge.id}:`, e);
      }
    }
  }

  async stopAll() {
    for (const bridge of this.bridges) {
      try {
        await bridge.stop();
        this.onBridgeChanged?.(bridge.id);
      } catch (e) {
        this.log.error(`Failed to stop bridge ${bridge.id}:`, e);
      }
    }
  }

  async restartAll() {
    for (const bridge of this.bridges) {
      try {
        await bridge.stop();
      } catch (e) {
        this.log.error(`Failed to stop bridge ${bridge.id} during restart:`, e);
      }
    }
    // Sort by priority for startup
    const sortedBridges = [...this.bridges].sort((a, b) => {
      const priorityA = a.data.priority ?? 100;
      const priorityB = b.data.priority ?? 100;
      return priorityA - priorityB;
    });
    for (const bridge of sortedBridges) {
      try {
        await bridge.start();
        this.onBridgeChanged?.(bridge.id);
      } catch (e) {
        this.log.error(
          `Failed to start bridge ${bridge.id} during restart:`,
          e,
        );
      }
    }
  }

  async refreshAll() {
    for (const bridge of this.bridges) {
      try {
        await bridge.refreshDevices();
        this.onBridgeChanged?.(bridge.id);
      } catch (e) {
        // Isolate per-bridge failures so one failing bridge doesn't block others
        this.log.error(`Failed to refresh bridge ${bridge.id}:`, e);
      }
    }
  }

  get(id: string): Bridge | undefined {
    return this.bridges.find((bridge) => bridge.id === id);
  }

  async create(request: CreateBridgeRequest): Promise<Bridge> {
    if (this.portUsed(request.port)) {
      throw new Error(`Port already in use: ${request.port}`);
    }
    const bridge = await this.addBridge({
      ...request,
      id: crypto.randomUUID().replace(/-/g, ""),
      basicInformation: this.props.basicInformation,
    });
    await this.bridgeStorage.add(bridge.data);
    await bridge.start();
    this.onBridgeChanged?.(bridge.id);
    return bridge;
  }

  async update(request: UpdateBridgeRequest): Promise<Bridge | undefined> {
    if (this.portUsed(request.port, [request.id])) {
      throw new Error(`Port already in use: ${request.port}`);
    }
    const bridge = this.get(request.id);
    if (!bridge) {
      return;
    }
    await bridge.update(request);
    await this.bridgeStorage.add(bridge.data);
    this.onBridgeChanged?.(bridge.id);
    return bridge;
  }

  async delete(bridgeId: string): Promise<void> {
    const bridge = this.bridges.find((bridge) => bridge.id === bridgeId);
    if (!bridge) {
      return;
    }
    await bridge.stop();
    try {
      await bridge.delete();
    } catch (e) {
      // Ignore Matter.js internal errors during deletion
      // These occur when endpoints are already detached from the node
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Endpoint storage inaccessible")) {
        throw e;
      }
    }
    try {
      await bridge.dispose();
    } catch {
      // Ignore disposal errors during deletion
    }
    this.bridges.splice(this.bridges.indexOf(bridge), 1);
    await this.bridgeStorage.remove(bridgeId);
    this.onBridgeChanged?.(bridgeId);
  }

  async updatePriorities(
    updates: Array<{ id: string; priority: number }>,
  ): Promise<void> {
    for (const update of updates) {
      const bridge = this.get(update.id);
      if (bridge) {
        // Update using existing update method with minimal data
        const currentData = bridge.data;
        await this.update({
          id: update.id,
          name: currentData.name,
          port: currentData.port,
          filter: currentData.filter,
          featureFlags: currentData.featureFlags,
          countryCode: currentData.countryCode,
          icon: currentData.icon,
          priority: update.priority,
        });
      }
    }
  }

  private async addBridge(bridgeData: BridgeData): Promise<Bridge> {
    const bridge = await this.bridgeFactory.create(bridgeData);
    // Wire up status change notifications so every transition
    // (Stopped → Starting → Running / Failed) is broadcast via WebSocket.
    bridge.onStatusChange = () => this.onBridgeChanged?.(bridge.id);
    this.bridges.push(bridge);
    return bridge;
  }

  private portUsed(port: number, notId?: string[]): boolean {
    return this.bridges
      .filter((bridge) => notId == null || !notId.includes(bridge.id))
      .some((bridge) => bridge.data.port === port);
  }
}
