import type { BridgeData } from "@home-assistant-matter-hub/common";
import type { Environment } from "@matter/main";
import { RoboticVacuumCleanerDevice } from "@matter/main/devices";
import { type Endpoint, ServerNode } from "@matter/main/node";
import { DeviceTypeId, VendorId } from "@matter/main/types";
import { trimToLength } from "../../utils/trim-to-length.js";

/**
 * ServerModeServerNode exposes a single device directly as the root endpoint.
 * This is different from BridgeServerNode which uses an AggregatorEndpoint.
 *
 * Server Mode is required for Apple Home to properly support Siri voice commands
 * for certain device types like Robot Vacuums (RVC).
 *
 * In server mode, the device endpoint becomes a child of the root node,
 * but without the Aggregator wrapper - making it appear as a standalone device.
 */
export class ServerModeServerNode extends ServerNode {
  private deviceEndpoint?: Endpoint;

  constructor(env: Environment, bridgeData: BridgeData) {
    super({
      id: bridgeData.id,
      environment: env,
      network: {
        port: bridgeData.port,
      },
      productDescription: {
        name: bridgeData.name,
        deviceType: DeviceTypeId(RoboticVacuumCleanerDevice.deviceType),
      },
      basicInformation: {
        uniqueId: bridgeData.id,
        nodeLabel: trimToLength(bridgeData.name, 32, "..."),
        vendorId: VendorId(bridgeData.basicInformation.vendorId),
        vendorName: bridgeData.basicInformation.vendorName,
        productId: bridgeData.basicInformation.productId,
        productName: bridgeData.basicInformation.productName,
        productLabel: bridgeData.basicInformation.productLabel,
        serialNumber: `server-${bridgeData.id}`.substring(0, 32),
        hardwareVersion: bridgeData.basicInformation.hardwareVersion,
        softwareVersion: bridgeData.basicInformation.softwareVersion,
        ...(bridgeData.countryCode ? { location: bridgeData.countryCode } : {}),
      },
      subscriptions: {
        persistenceEnabled: false,
      },
    });
  }

  /**
   * Add the device endpoint to this server node.
   * In server mode, only ONE device is allowed.
   * This method is idempotent - if a device already exists, it's a no-op.
   */
  async addDevice(endpoint: Endpoint): Promise<void> {
    if (this.deviceEndpoint) {
      // Already have a device - this is fine, just ignore
      return;
    }
    this.deviceEndpoint = endpoint;
    await this.add(endpoint);
  }

  /**
   * Clear the device reference after the endpoint has been deleted externally.
   * Must be called before addDevice() when replacing the device endpoint.
   */
  clearDevice(): void {
    this.deviceEndpoint = undefined;
  }

  async factoryReset(): Promise<void> {
    await this.cancel();
    await this.erase();
  }
}
