import type { HomeAssistantFilter } from "./home-assistant-filter.js";

interface AllBridgeFeatureFlags {
  readonly coverDoNotInvertPercentage: boolean;
  readonly coverUseHomeAssistantPercentage: boolean;
  readonly coverSwapOpenClose: boolean;
  readonly includeHiddenEntities: boolean;
  readonly alexaPreserveBrightnessOnTurnOn: boolean;
  readonly vacuumIncludeUnnamedRooms: boolean;
  /**
   * Server Mode: Expose devices directly as standalone Matter devices instead of bridged devices.
   * This is required for Apple Home to properly support Siri voice commands for Robot Vacuums (RVC).
   * When enabled, only ONE device should be in this bridge - it will be exposed as the root device.
   * Multiple devices in server mode will cause errors.
   */
  readonly serverMode: boolean;
  /**
   * Auto Battery Mapping: Automatically assign battery sensors from the same Home Assistant device
   * to the main entity. When enabled, battery sensors will be merged into their parent devices
   * instead of appearing as separate devices in Matter controllers.
   * Default: false (disabled)
   */
  readonly autoBatteryMapping: boolean;
  /**
   * Auto Humidity Mapping: Automatically combine humidity sensors with temperature sensors
   * from the same Home Assistant device. When enabled, humidity sensors will be merged into
   * temperature sensors to create combined TemperatureHumiditySensor devices.
   * Default: true (enabled)
   */
  readonly autoHumidityMapping: boolean;
  /**
   * Auto Pressure Mapping: Automatically combine pressure sensors with temperature sensors
   * from the same Home Assistant device. When enabled, pressure sensors will be merged into
   * temperature sensors to create combined sensor devices.
   * Default: true (enabled)
   */
  readonly autoPressureMapping: boolean;
  /**
   * Auto Force Sync: Periodically push all device states to connected controllers.
   * This is a workaround for Google Home and Alexa which sometimes lose subscriptions
   * and show devices as offline/unresponsive after a few hours.
   * When enabled, the bridge will push all device states every 60 seconds.
   * Default: false (disabled)
   */
  readonly autoForceSync: boolean;
}

export type BridgeFeatureFlags = Partial<AllBridgeFeatureFlags>;

export type BridgeIconType =
  | "light"
  | "switch"
  | "climate"
  | "cover"
  | "fan"
  | "lock"
  | "sensor"
  | "media_player"
  | "vacuum"
  | "remote"
  | "humidifier"
  | "speaker"
  | "garage"
  | "door"
  | "window"
  | "motion"
  | "battery"
  | "power"
  | "camera"
  | "default";

export interface BridgeConfig {
  readonly name: string;
  readonly port: number;
  readonly filter: HomeAssistantFilter;
  readonly featureFlags?: BridgeFeatureFlags;
  readonly countryCode?: string;
  readonly icon?: BridgeIconType;
  /** Startup priority - lower values start first. Default: 100 */
  readonly priority?: number;
}

export interface CreateBridgeRequest extends BridgeConfig {}

export interface UpdateBridgeRequest extends BridgeConfig {
  readonly id: string;
}

export interface BridgeBasicInformation {
  vendorId: number;
  vendorName: string;
  productId: number;
  productName: string;
  productLabel: string;
  hardwareVersion: number;
  softwareVersion: number;
}

export interface BridgeData extends BridgeConfig {
  readonly id: string;
  readonly basicInformation: BridgeBasicInformation;
}

export interface FailedEntity {
  readonly entityId: string;
  readonly reason: string;
}

export interface BridgeDataWithMetadata extends BridgeData {
  readonly status: BridgeStatus;
  readonly statusReason?: string;
  readonly commissioning?: BridgeCommissioning | null;
  readonly deviceCount: number;
  readonly failedEntities?: FailedEntity[];
}

export enum BridgeStatus {
  Starting = "starting",
  Running = "running",
  Stopped = "stopped",
  Failed = "failed",
}

export interface BridgeCommissioning {
  readonly isCommissioned: boolean;
  readonly passcode: number;
  readonly discriminator: number;
  readonly manualPairingCode: string;
  readonly qrPairingCode: string;
  readonly fabrics: BridgeFabric[];
}

export interface BridgeFabric {
  readonly fabricIndex: number;
  readonly fabricId: number;
  readonly nodeId: number;
  readonly rootNodeId: number;
  readonly rootVendorId: number;
  readonly label: string;
}
