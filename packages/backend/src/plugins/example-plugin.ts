/**
 * Example plugin template showing how to create a MatterHubPlugin.
 *
 * This file is NOT loaded at runtime — it serves as documentation
 * and a starting point for plugin developers.
 *
 * To create an external plugin:
 * 1. Create a new npm package
 * 2. Implement MatterHubPlugin
 * 3. Export your class as default export
 * 4. Install the package in MatterHub's plugin directory
 *
 * Example: A Tuya cloud integration that exposes Tuya devices via Matter.
 */

import type { MatterHubPlugin, PluginContext } from "./types.js";

export class ExampleCloudPlugin implements MatterHubPlugin {
  readonly name = "example-cloud-plugin";
  readonly version = "1.0.0";

  private context?: PluginContext;
  private pollInterval?: ReturnType<typeof setInterval>;

  async onStart(context: PluginContext): Promise<void> {
    this.context = context;

    // Example: Restore previously discovered devices from storage
    const savedDevices =
      (await context.storage.get<string[]>("device_ids")) ?? [];
    context.log.info(`Restoring ${savedDevices.length} cached devices`);

    // Example: Register a static device
    await context.registerDevice({
      id: "cloud_light_001",
      name: "Cloud Light",
      deviceType: "on_off_light",
      clusters: [
        {
          clusterId: "onOff",
          attributes: { onOff: false },
        },
      ],
      async onCommand(clusterId, command, _args) {
        if (clusterId === "onOff" && command === "on") {
          // Call your cloud API to turn on the light
          context.log.info("Turning on cloud light");
        }
        if (clusterId === "onOff" && command === "off") {
          context.log.info("Turning off cloud light");
        }
      },
    });

    // Example: Poll cloud API for state changes
    this.pollInterval = setInterval(() => {
      this.pollCloudState();
    }, 30_000);
  }

  async onConfigure(): Promise<void> {
    // Called after bridge is fully operational.
    // Restore persistent attribute values here if needed.
  }

  async onShutdown(_reason?: string): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    // Save device list for faster restart
    await this.context?.storage.set("device_ids", ["cloud_light_001"]);
  }

  getConfigSchema() {
    return {
      title: "Example Cloud Plugin",
      description: "Connect your cloud devices to Matter",
      properties: {
        apiKey: {
          type: "string" as const,
          title: "API Key",
          description: "Your cloud provider API key",
          required: true,
        },
        pollInterval: {
          type: "number" as const,
          title: "Poll Interval (seconds)",
          description: "How often to check for state changes",
          default: 30,
        },
      },
    };
  }

  private pollCloudState(): void {
    // Example: Fetch state from cloud API and update devices
    // this.context?.updateDeviceState("cloud_light_001", "onOff", { onOff: true });
  }
}

// Default export for external plugin loading
export default ExampleCloudPlugin;
