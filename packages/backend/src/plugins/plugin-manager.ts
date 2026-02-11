import { Logger } from "@matter/general";
import { FilePluginStorage } from "./plugin-storage.js";
import type {
  MatterHubPlugin,
  MatterHubPluginConstructor,
  PluginContext,
  PluginDevice,
  PluginMetadata,
} from "./types.js";

const logger = Logger.get("PluginManager");

interface PluginInstance {
  plugin: MatterHubPlugin;
  context: PluginContext;
  metadata: PluginMetadata;
  devices: Map<string, PluginDevice>;
}

/**
 * Manages plugin lifecycle, device registration, and state updates.
 *
 * Each bridge gets its own PluginManager instance. Plugins register devices
 * which are then exposed as Matter endpoints on the bridge.
 */
export class PluginManager {
  private readonly instances = new Map<string, PluginInstance>();
  private readonly storageDir: string;
  private readonly bridgeId: string;

  /** Callback invoked when a plugin registers a new device */
  onDeviceRegistered?: (
    pluginName: string,
    device: PluginDevice,
  ) => Promise<void>;

  /** Callback invoked when a plugin removes a device */
  onDeviceUnregistered?: (
    pluginName: string,
    deviceId: string,
  ) => Promise<void>;

  /** Callback invoked when a plugin updates device state */
  onDeviceStateUpdated?: (
    pluginName: string,
    deviceId: string,
    clusterId: string,
    attributes: Record<string, unknown>,
  ) => void;

  constructor(bridgeId: string, storageDir: string) {
    this.bridgeId = bridgeId;
    this.storageDir = storageDir;
  }

  /**
   * Load and register a built-in plugin instance.
   */
  async registerBuiltIn(plugin: MatterHubPlugin): Promise<void> {
    const metadata: PluginMetadata = {
      name: plugin.name,
      version: plugin.version,
      source: "builtin",
      enabled: true,
      config: {},
    };
    await this.register(plugin, metadata);
  }

  /**
   * Load an external plugin from an npm package path.
   */
  async loadExternal(
    packagePath: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    try {
      const module = await import(packagePath);
      const PluginClass: MatterHubPluginConstructor =
        module.default ?? module.MatterHubPlugin;

      if (!PluginClass || typeof PluginClass !== "function") {
        throw new Error(
          `Plugin at ${packagePath} does not export a valid MatterHubPlugin class`,
        );
      }

      const plugin = new PluginClass(config);
      const metadata: PluginMetadata = {
        name: plugin.name,
        version: plugin.version,
        source: packagePath,
        enabled: true,
        config,
      };

      await this.register(plugin, metadata);
    } catch (e) {
      logger.error(`Failed to load external plugin from ${packagePath}:`, e);
      throw e;
    }
  }

  private async register(
    plugin: MatterHubPlugin,
    metadata: PluginMetadata,
  ): Promise<void> {
    if (this.instances.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    const storage = new FilePluginStorage(this.storageDir, plugin.name);
    const devices = new Map<string, PluginDevice>();
    const pluginLogger = Logger.get(`Plugin:${plugin.name}`);

    const context: PluginContext = {
      bridgeId: this.bridgeId,
      storage,
      log: pluginLogger,

      registerDevice: async (device: PluginDevice) => {
        if (devices.has(device.id)) {
          pluginLogger.warn(
            `Device "${device.id}" already registered, updating`,
          );
        }
        devices.set(device.id, device);
        await this.onDeviceRegistered?.(plugin.name, device);
        pluginLogger.debug(`Registered device: ${device.name} (${device.id})`);
      },

      unregisterDevice: async (deviceId: string) => {
        if (!devices.has(deviceId)) {
          pluginLogger.warn(`Device "${deviceId}" not found`);
          return;
        }
        devices.delete(deviceId);
        await this.onDeviceUnregistered?.(plugin.name, deviceId);
        pluginLogger.debug(`Unregistered device: ${deviceId}`);
      },

      updateDeviceState: (
        deviceId: string,
        clusterId: string,
        attributes: Record<string, unknown>,
      ) => {
        if (!devices.has(deviceId)) {
          pluginLogger.warn(
            `Cannot update state: device "${deviceId}" not found`,
          );
          return;
        }
        this.onDeviceStateUpdated?.(
          plugin.name,
          deviceId,
          clusterId,
          attributes,
        );
      },
    };

    this.instances.set(plugin.name, { plugin, context, metadata, devices });
    logger.info(
      `Registered plugin: ${plugin.name} v${plugin.version} (${metadata.source})`,
    );
  }

  /**
   * Start all registered plugins.
   */
  async startAll(): Promise<void> {
    for (const [name, instance] of this.instances) {
      if (!instance.metadata.enabled) continue;
      try {
        logger.info(`Starting plugin: ${name}`);
        await instance.plugin.onStart(instance.context);
      } catch (e) {
        logger.error(`Plugin "${name}" failed to start:`, e);
      }
    }
  }

  /**
   * Configure all started plugins (called after bridge is operational).
   */
  async configureAll(): Promise<void> {
    for (const [name, instance] of this.instances) {
      if (!instance.metadata.enabled) continue;
      try {
        await instance.plugin.onConfigure?.();
      } catch (e) {
        logger.error(`Plugin "${name}" failed to configure:`, e);
      }
    }
  }

  /**
   * Shut down all plugins.
   */
  async shutdownAll(reason?: string): Promise<void> {
    for (const [name, instance] of this.instances) {
      try {
        await instance.plugin.onShutdown?.(reason);
        logger.info(`Plugin "${name}" shut down`);
      } catch (e) {
        logger.error(`Plugin "${name}" failed to shut down:`, e);
      }
    }
    this.instances.clear();
  }

  getPlugin(name: string): MatterHubPlugin | undefined {
    return this.instances.get(name)?.plugin;
  }

  getMetadata(): PluginMetadata[] {
    return Array.from(this.instances.values()).map((i) => i.metadata);
  }

  getDevices(pluginName: string): PluginDevice[] {
    const instance = this.instances.get(pluginName);
    return instance ? Array.from(instance.devices.values()) : [];
  }

  getAllDevices(): Array<{ pluginName: string; device: PluginDevice }> {
    const result: Array<{ pluginName: string; device: PluginDevice }> = [];
    for (const [pluginName, instance] of this.instances) {
      for (const device of instance.devices.values()) {
        result.push({ pluginName, device });
      }
    }
    return result;
  }
}
