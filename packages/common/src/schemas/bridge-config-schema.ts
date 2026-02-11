import type { JSONSchema7 } from "json-schema";
import { HomeAssistantMatcherType } from "../home-assistant-filter.js";

const homeAssistantMatcherSchema: JSONSchema7 = {
  type: "object",
  default: { type: "", value: "" },
  properties: {
    type: {
      title: "Type",
      type: "string",
      enum: Object.values(HomeAssistantMatcherType),
    },
    value: {
      title: "Value",
      description:
        "For labels, use the label_id (slug), not the display name. You can find the label_id in Home Assistant under Settings > Labels. Example: 'my_smart_lights' instead of 'My Smart Lights'.",
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
      title: "Swap Open/Close Commands for Covers",
      description:
        "Swap the open and close commands for covers. Enable this if Alexa voice commands are reversed " +
        "(saying 'close' opens the blinds and vice versa). This affects open/close commands only, not percentage control.",
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

    autoForceSync: {
      title: "Auto Force Sync (Google Home & Alexa workaround)",
      description:
        "Periodically push all device states to connected controllers every 60 seconds. " +
        "This is a workaround for Google Home and Alexa which sometimes lose subscriptions and show devices as offline/unresponsive. " +
        "Only enable this if you experience state sync issues or disconnections after a few hours.",
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
