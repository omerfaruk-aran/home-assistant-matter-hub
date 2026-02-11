import type { HomeAssistantDomain } from "./home-assistant-domain.js";

export type MatterDeviceType =
  | "air_purifier"
  | "air_quality_sensor"
  | "basic_video_player"
  | "battery_storage"
  | "color_dimmer_switch"
  | "color_temperature_light"
  | "contact_sensor"
  | "dimmable_light"
  | "dimmable_plugin_unit"
  | "dimmer_switch"
  | "door_lock"
  | "extended_color_light"
  | "fan"
  | "flow_sensor"
  | "generic_switch"
  | "humidifier_dehumidifier"
  | "humidity_sensor"
  | "light_sensor"
  | "occupancy_sensor"
  | "on_off_light"
  | "on_off_plugin_unit"
  | "on_off_switch"
  | "pressure_sensor"
  | "pump"
  | "robot_vacuum_cleaner"
  | "smoke_co_alarm"
  | "speaker"
  | "temperature_sensor"
  | "thermostat"
  | "tvoc_sensor"
  | "water_heater"
  | "water_leak_detector"
  | "water_valve"
  | "window_covering";

export interface EntityMappingConfig {
  readonly entityId: string;
  readonly matterDeviceType?: MatterDeviceType;
  readonly customName?: string;
  readonly disabled?: boolean;
  /**
   * Optional: Entity ID of a sensor that provides filter life percentage (0-100).
   * Used for Air Purifiers to show HEPA filter life in Matter controllers.
   * Example: "sensor.luftreiniger_filter_life"
   */
  readonly filterLifeEntity?: string;
  /**
   * Optional: Entity ID of a select entity that controls the vacuum cleaning mode.
   * Used for Dreame vacuums where the cleaning mode is controlled via a separate select entity.
   * If not specified, it will be derived from the vacuum entity ID (e.g., vacuum.r2d2 -> select.r2d2_cleaning_mode).
   * Example: "select.r2_d2_cleaning_mode"
   */
  readonly cleaningModeEntity?: string;
  /**
   * Optional: Entity ID of a humidity sensor to combine with a temperature sensor.
   * Creates a combined Temperature+Humidity sensor in Matter instead of separate devices.
   * Example: "sensor.h_t_bad_humidity"
   */
  readonly humidityEntity?: string;
  /**
   * Optional: Entity ID of a battery sensor to include with any sensor.
   * Adds PowerSource cluster to show battery level in Matter controllers.
   * Example: "sensor.h_t_bad_battery"
   */
  readonly batteryEntity?: string;
  /**
   * Optional: Array of button entity IDs for room-based cleaning (Roborock, etc.).
   * Each button entity represents a room/scene in the vacuum app.
   * When a room is selected via Matter, the corresponding button will be pressed.
   * Example: ["button.roborock_clean_kitchen", "button.roborock_clean_living_room"]
   */
  readonly roomEntities?: string[];
  /**
   * Optional: Disable PIN requirement for this lock.
   * When true, the lock will not require PIN validation even if a PIN is configured.
   * Useful when you have multiple locks and only want PIN protection on some of them.
   * Default: false (PIN is required if configured)
   */
  readonly disableLockPin?: boolean;
}

export interface EntityMappingRequest {
  readonly bridgeId: string;
  readonly entityId: string;
  readonly matterDeviceType?: MatterDeviceType;
  readonly customName?: string;
  readonly disabled?: boolean;
  readonly filterLifeEntity?: string;
  readonly cleaningModeEntity?: string;
  readonly humidityEntity?: string;
  readonly batteryEntity?: string;
  readonly roomEntities?: string[];
  readonly disableLockPin?: boolean;
}

export interface EntityMappingResponse {
  readonly bridgeId: string;
  readonly mappings: EntityMappingConfig[];
}

export const matterDeviceTypeLabels: Record<MatterDeviceType, string> = {
  air_purifier: "Air Purifier",
  air_quality_sensor: "Air Quality Sensor",
  basic_video_player: "Basic Video Player (TV)",
  battery_storage: "Battery Sensor",
  color_dimmer_switch: "Color Dimmer Switch",
  color_temperature_light: "Color Temperature Light",
  contact_sensor: "Contact Sensor",
  dimmable_light: "Dimmable Light",
  dimmable_plugin_unit: "Dimmable Plug-in Unit",
  dimmer_switch: "Dimmer Switch",
  door_lock: "Door Lock",
  extended_color_light: "Extended Color Light",
  fan: "Fan",
  flow_sensor: "Flow Sensor",
  generic_switch: "Generic Switch (Button)",
  humidifier_dehumidifier: "Humidifier/Dehumidifier",
  humidity_sensor: "Humidity Sensor",
  light_sensor: "Light Sensor",
  occupancy_sensor: "Occupancy Sensor",
  on_off_light: "On/Off Light",
  on_off_plugin_unit: "On/Off Plug-in Unit",
  on_off_switch: "On/Off Switch",
  pressure_sensor: "Pressure Sensor",
  pump: "Pump",
  robot_vacuum_cleaner: "Robot Vacuum Cleaner",
  smoke_co_alarm: "Smoke/CO Alarm",
  speaker: "Speaker",
  temperature_sensor: "Temperature Sensor",
  thermostat: "Thermostat",
  tvoc_sensor: "TVOC / VOC Index Sensor",
  water_heater: "Water Heater",
  water_leak_detector: "Water Leak Detector",
  water_valve: "Water Valve",
  window_covering: "Window Covering",
};

export const domainToDefaultMatterTypes: Partial<
  Record<HomeAssistantDomain, MatterDeviceType[]>
> = {
  automation: ["on_off_switch"],
  binary_sensor: ["contact_sensor", "occupancy_sensor"],
  button: ["generic_switch"],
  climate: ["thermostat"],
  cover: ["window_covering"],
  fan: ["air_purifier", "fan"],
  humidifier: ["humidifier_dehumidifier"],
  input_boolean: ["on_off_plugin_unit", "on_off_switch"],
  input_button: ["generic_switch"],
  light: [
    "color_temperature_light",
    "dimmable_light",
    "extended_color_light",
    "on_off_light",
  ],
  lock: ["door_lock"],
  media_player: ["basic_video_player", "on_off_switch", "speaker"],
  scene: ["on_off_switch"],
  script: ["on_off_switch"],
  sensor: [
    "air_quality_sensor",
    "battery_storage",
    "humidity_sensor",
    "light_sensor",
    "pressure_sensor",
    "temperature_sensor",
    "tvoc_sensor",
  ],
  switch: ["on_off_plugin_unit", "on_off_switch", "pump", "water_valve"],
  vacuum: ["robot_vacuum_cleaner"],
  valve: ["water_valve", "on_off_plugin_unit"],
  water_heater: ["water_heater", "thermostat"],
};
