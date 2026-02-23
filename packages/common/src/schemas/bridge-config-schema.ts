import type { JSONSchema7 } from "json-schema";

const homeAssistantMatcherSchema: JSONSchema7 = {
  type: "object",
  default: { type: "", value: "" },
  properties: {
    type: {
      title: "Type",
      type: "string",
      oneOf: [
        {
          const: "pattern",
          title: "pattern",
          description:
            "Wildcard pattern matching entity IDs. Use * as wildcard. Example: 'light.living_room_*' matches all lights in the living room.",
        },
        {
          const: "regex",
          title: "regex",
          description:
            "Full regular expression matching entity IDs. Use ^ and $ for anchors. Example: '^(light|switch)\\.kitchen_.*' matches all kitchen lights and switches.",
        },
        {
          const: "domain",
          title: "domain",
          description:
            "Match entities by their domain (the part before the dot). Example: 'light', 'switch', 'sensor'.",
        },
        {
          const: "platform",
          title: "platform",
          description:
            "Match entities by their integration/platform. Example: 'hue', 'zwave', 'mqtt'.",
        },
        {
          const: "entity_label",
          title: "entity_label",
          description:
            "Matches only entities that have this label assigned directly. Other entities of the same device are NOT included.",
        },
        {
          const: "device_label",
          title: "device_label",
          description:
            "Matches ALL entities of a device if the device has this label. Use this to include a complete device with all its entities.",
        },
        {
          const: "area",
          title: "area",
          description:
            "Match entities by their area slug. Example: 'living_room', 'bedroom'.",
        },
        {
          const: "entity_category",
          title: "entity_category",
          description:
            "Match entities by their category. Example: 'config', 'diagnostic' to exclude configuration entities.",
        },
        {
          const: "device_name",
          title: "device_name",
          description:
            "Match entities by their device name. Supports wildcards. Example: '*Philips*' matches all Philips devices.",
        },
        {
          const: "product_name",
          title: "product_name",
          description:
            "Match entities by their product/model name. Supports wildcards. Example: 'Hue*Bulb'.",
        },
        {
          const: "device_class",
          title: "device_class",
          description:
            "Match entities by their device class attribute. Example: 'temperature', 'motion', 'door', 'window'.",
        },
      ],
    },
    value: {
      title: "Value",
      description:
        "For labels, use the display name or the label_id (slug). You can look up both on the Labels page in the sidebar.",
      type: "string",
      minLength: 1,
    },
  },
  required: ["type", "value"],
  additionalProperties: false,
};

const homeAssistantFilterSchema: JSONSchema7 = {
  title: "Include or exclude entities",
  type: "object",
  properties: {
    include: {
      title: "Include",
      type: "array",
      items: homeAssistantMatcherSchema,
    },
    exclude: {
      title: "Exclude",
      type: "array",
      items: homeAssistantMatcherSchema,
    },
    includeMode: {
      title: "Include Mode",
      type: "string",
      description:
        "How to combine include rules: 'any' matches if ANY rule matches (OR), 'all' matches only if ALL rules match (AND). Default: 'any'",
      enum: ["any", "all"],
      default: "any",
    },
  },
  required: ["include", "exclude"],
  additionalProperties: false,
};

const featureFlagSchema: JSONSchema7 = {
  title: "Feature Flags",
  type: "object",
  properties: {
    coverDoNotInvertPercentage: {
      title: "Do not invert Percentages for Covers",
      description:
        "Do not invert the percentage of covers to match Home Assistant (not Matter compliant)",
      type: "boolean",
      default: false,
    },

    coverUseHomeAssistantPercentage: {
      title: "Use Home Assistant Percentage for Covers (Alexa-friendly)",
      description:
        "Display cover percentages matching Home Assistant values in Matter controllers like Alexa. " +
        "This makes the displayed percentage match what you see in Home Assistant, but the semantic meaning differs: " +
        "in HA, higher percentage = more open; in Alexa, higher percentage is typically interpreted as more closed. " +
        "Open/Close commands will still work correctly.",
      type: "boolean",
      default: false,
    },

    coverSwapOpenClose: {
      title: "Swap Open/Close for Covers",
      description:
        "Swap open/close commands and invert position reporting for covers. Enable this if Alexa voice commands " +
        "are reversed (saying 'close' opens the blinds and vice versa).",
      type: "boolean",
      default: false,
    },

    includeHiddenEntities: {
      title: "Include Hidden Entities",
      description:
        "Include entities that are marked as hidden in Home Assistant",
      type: "boolean",
      default: false,
    },

    alexaPreserveBrightnessOnTurnOn: {
      title: "Alexa: Preserve Brightness on Turn-On (Deprecated)",
      description:
        "This workaround is now always active and this setting has no effect. " +
        "The bridge automatically ignores brightness commands that set lights to 100% immediately after a turn-on command.",
      type: "boolean",
      default: true,
    },

    serverMode: {
      title: "Server Mode (for Robot Vacuums)",
      description:
        "Expose the device as a standalone Matter device instead of a bridged device. " +
        "This is required for Apple Home to properly support Siri voice commands for Robot Vacuums. " +
        "IMPORTANT: Only ONE device should be in this bridge when server mode is enabled.",
      type: "boolean",
      default: false,
    },

    autoBatteryMapping: {
      title: "Auto Battery Mapping",
      description:
        "Automatically assign battery sensors from the same Home Assistant device to the main entity. " +
        "When enabled, battery sensors will be merged into their parent devices instead of appearing as separate devices.",
      type: "boolean",
      default: false,
    },

    autoHumidityMapping: {
      title: "Auto Humidity Mapping",
      description:
        "Automatically combine humidity sensors with temperature sensors from the same Home Assistant device. " +
        "When enabled, humidity sensors will be merged into temperature sensors to create combined TemperatureHumiditySensor devices.",
      type: "boolean",
      default: true,
    },

    autoPressureMapping: {
      title: "Auto Pressure Mapping",
      description:
        "Automatically combine pressure sensors with temperature sensors from the same Home Assistant device. " +
        "When enabled, pressure sensors will be merged into temperature sensors to create combined sensor devices.",
      type: "boolean",
      default: true,
    },

    autoComposedDevices: {
      title: "Auto Composed Devices",
      description:
        "Master toggle: automatically combine related entities from the same Home Assistant device " +
        "into single Matter endpoints. Enables battery, humidity, pressure, power, and energy auto-mapping at once. " +
        "This provides a cleaner device experience in Matter controllers (e.g., a Shelly Plug appears as one device with power monitoring).",
      type: "boolean",
      default: false,
    },

    autoForceSync: {
      title: "Auto Force Sync",
      description:
        "Periodically compare and push all device states to connected controllers every 90 seconds. " +
        "Enable this if devices get out of sync after extended periods. " +
        "Health checks for dead sessions always run regardless of this setting.",
      type: "boolean",
      default: false,
    },

    vacuumOnOff: {
      title: "Vacuum: Include OnOff Cluster (Alexa)",
      description:
        "Add an OnOff cluster to robot vacuum endpoints. " +
        "Alexa REQUIRES this (PowerController) to show robotic vacuums in the app. " +
        "Without it, Alexa commissions the device but never displays it. " +
        "WARNING: OnOff is NOT part of the Matter RVC device type specification. " +
        "Enabling this may break Apple Home (shows 'Updating') and Google Home. " +
        "Use with Server Mode for Alexa-only vacuum bridges.",
      type: "boolean",
      default: false,
    },
  },
  additionalProperties: false,
};

export const bridgeConfigSchema: JSONSchema7 = {
  type: "object",
  title: "Bridge Config",
  properties: {
    name: {
      title: "Name",
      type: "string",
      minLength: 1,
      maxLength: 32,
    },
    port: {
      title: "Port",
      type: "number",
      minimum: 1,
    },
    icon: {
      title: "Icon",
      type: "string",
      description: "Icon to display for this bridge in the UI",
      enum: [
        "light",
        "switch",
        "climate",
        "cover",
        "fan",
        "lock",
        "sensor",
        "media_player",
        "vacuum",
        "remote",
        "humidifier",
        "speaker",
        "garage",
        "door",
        "window",
        "motion",
        "battery",
        "power",
        "camera",
        "default",
      ],
    },
    countryCode: {
      title: "Country Code",
      type: "string",
      description:
        "An ISO 3166-1 alpha-2 code to represent the country in which the Node is located. Only needed if the commissioning fails due to missing country code.",
      minLength: 2,
      maxLength: 3,
    },
    priority: {
      title: "Startup Priority",
      type: "number",
      description:
        "Startup order priority. Lower values start first. Default is 100.",
      default: 100,
      minimum: 1,
      maximum: 999,
    },
    filter: homeAssistantFilterSchema,
    featureFlags: featureFlagSchema,
  },
  required: ["name", "port", "filter"],
  additionalProperties: false,
};
