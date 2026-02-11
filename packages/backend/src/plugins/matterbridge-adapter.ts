import { Logger } from "@matter/general";
import type {
  MatterHubPlugin,
  PluginClusterConfig,
  PluginContext,
  PluginDevice,
} from "./types.js";

const logger = Logger.get("MatterbridgeAdapter");

/**
 * Minimal shim of Matterbridge's MatterbridgeEndpoint for adapter use.
 * External Matterbridge plugins create these and register them.
 * The adapter translates them into PluginDevice instances.
 */
export interface MatterbridgeEndpointLike {
  deviceName?: string;
  uniqueId?: string;
  serialNumber?: string;
  /** Cluster server objects with clusterId and initial attribute values */
  clusterServersObjs?: Array<{
    clusterId: number;
    attributes?: Record<string, unknown>;
  }>;
  /** Device type list (first entry is primary) */
  deviceTypes?: Array<{ code: number; name?: string }>;
}

/**
 * Minimal shim of Matterbridge's PlatformConfig.
 */
export interface MatterbridgePlatformConfig {
  name: string;
  type?: string;
  [key: string]: unknown;
}

/**
 * Fake PlatformMatterbridge passed to the Matterbridge plugin constructor.
 * Provides only the fields that most plugins actually access.
 */
export interface FakePlatformMatterbridge {
  matterbridgeDirectory: string;
  matterbridgeVersion: string;
}

/**
 * Adapter that wraps a Matterbridge DynamicPlatform plugin to work
 * as a MatterHubPlugin. This enables migrating existing Matterbridge
 * plugins without rewriting them.
 *
 * Usage:
 *   const adapter = new MatterbridgePluginAdapter(MatterbridgeHassPlugin, pluginConfig);
 *   await pluginManager.registerBuiltIn(adapter);
 */
export class MatterbridgePluginAdapter implements MatterHubPlugin {
  readonly name: string;
  readonly version: string;

  private context?: PluginContext;
  private mbPlugin?: MatterbridgeDynamicPlatformLike;
  private readonly pluginFactory: MatterbridgePluginFactory;
  private readonly pluginConfig: MatterbridgePlatformConfig;
  private readonly registeredDevices = new Map<string, PluginDevice>();

  constructor(
    factory: MatterbridgePluginFactory,
    config: MatterbridgePlatformConfig,
  ) {
    this.pluginFactory = factory;
    this.pluginConfig = config;
    this.name = config.name;
    this.version = "1.0.0";
  }

  async onStart(context: PluginContext): Promise<void> {
    this.context = context;

    // Create a fake Matterbridge environment
    const fakeMatterbridge: FakePlatformMatterbridge = {
      matterbridgeDirectory: ".",
      matterbridgeVersion: "3.0.0",
    };

    const fakeLogger = createFakeAnsiLogger(context.log);

    // Instantiate the Matterbridge plugin
    this.mbPlugin = this.pluginFactory(
      fakeMatterbridge,
      fakeLogger,
      this.pluginConfig,
    );

    // Intercept registerDevice calls
    this.interceptRegisterDevice();

    // Start the plugin
    await this.mbPlugin.onStart?.("MatterHub adapter start");
    logger.info(
      `Matterbridge plugin "${this.name}" started with ${this.registeredDevices.size} devices`,
    );
  }

  async onConfigure(): Promise<void> {
    await this.mbPlugin?.onConfigure?.();
  }

  async onShutdown(reason?: string): Promise<void> {
    await this.mbPlugin?.onShutdown?.(reason ?? "MatterHub shutdown");
    this.registeredDevices.clear();
  }

  /**
   * Intercept the Matterbridge plugin's registerDevice method to
   * translate MatterbridgeEndpoint registrations into PluginDevice registrations.
   */
  private interceptRegisterDevice(): void {
    if (!this.mbPlugin || !this.context) return;

    // Override registerDevice on the plugin prototype
    const originalRegister = this.mbPlugin.registerDevice?.bind(this.mbPlugin);

    this.mbPlugin.registerDevice = async (
      endpoint: MatterbridgeEndpointLike,
    ) => {
      // Call original if it exists
      if (originalRegister) {
        await originalRegister(endpoint);
      }

      // Translate to PluginDevice
      const deviceId =
        endpoint.uniqueId ?? endpoint.serialNumber ?? endpoint.deviceName ?? "";
      if (!deviceId) {
        logger.warn("Skipping device without ID");
        return;
      }

      const clusters: PluginClusterConfig[] = (
        endpoint.clusterServersObjs ?? []
      ).map((cs) => ({
        clusterId: String(cs.clusterId),
        attributes: cs.attributes ?? {},
      }));

      const deviceType =
        endpoint.deviceTypes?.[0]?.name ?? "on_off_plugin_unit";

      const pluginDevice: PluginDevice = {
        id: deviceId,
        name: endpoint.deviceName ?? deviceId,
        deviceType,
        clusters,
      };

      this.registeredDevices.set(deviceId, pluginDevice);
      await this.context?.registerDevice(pluginDevice);
    };
  }
}

/**
 * Minimal interface matching what Matterbridge plugins implement.
 */
interface MatterbridgeDynamicPlatformLike {
  name?: string;
  version?: string;
  onStart?(reason?: string): Promise<void>;
  onConfigure?(): Promise<void>;
  onShutdown?(reason?: string): Promise<void>;
  registerDevice?(endpoint: MatterbridgeEndpointLike): Promise<void>;
  [key: string]: unknown;
}

/**
 * Factory function type for creating Matterbridge plugin instances.
 * Matches the constructor signature of MatterbridgeDynamicPlatform.
 */
export type MatterbridgePluginFactory = (
  matterbridge: FakePlatformMatterbridge,
  log: FakeAnsiLogger,
  config: MatterbridgePlatformConfig,
) => MatterbridgeDynamicPlatformLike;

/**
 * Minimal shim for Matterbridge's AnsiLogger.
 * Routes log calls to our Logger instance.
 */
interface FakeAnsiLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  notice?(...args: unknown[]): void;
  fatal?(...args: unknown[]): void;
}

function createFakeAnsiLogger(realLogger: Logger): FakeAnsiLogger {
  return {
    debug: (...args) => realLogger.debug(args.map(String).join(" ")),
    info: (...args) => realLogger.info(args.map(String).join(" ")),
    warn: (...args) => realLogger.warn(args.map(String).join(" ")),
    error: (...args) => realLogger.error(args.map(String).join(" ")),
    notice: (...args) => realLogger.info(args.map(String).join(" ")),
    fatal: (...args) => realLogger.error(args.map(String).join(" ")),
  };
}
