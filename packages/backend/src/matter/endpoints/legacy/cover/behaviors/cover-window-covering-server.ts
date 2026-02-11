import {
  type CoverDeviceAttributes,
  CoverDeviceState,
  CoverSupportedFeatures,
  type HomeAssistantEntityState,
} from "@home-assistant-matter-hub/common";
import type { Agent } from "@matter/main";
import { WindowCovering } from "@matter/main/clusters";
import { BridgeDataProvider } from "../../../../../services/bridges/bridge-data-provider.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import {
  type WindowCoveringConfig,
  WindowCoveringServer,
} from "../../../../behaviors/window-covering-server.js";

const attributes = (entity: HomeAssistantEntityState) =>
  <CoverDeviceAttributes>entity.attributes;

/**
 * Platforms known to use Matter-compatible position semantics (0=open, 100=closed).
 * These integrations report position as "% closed" which matches Matter's expectations.
 * NOTE: Overkiz/Somfy was removed - it uses standard HA semantics (0=closed, 100=open).
 * See GitHub Issue #90.
 */
const MATTER_SEMANTIC_PLATFORMS: string[] = [
  // Currently empty - no known platforms use Matter semantics by default
  // Add platforms here only if confirmed to use 0=open, 100=closed
];

/**
 * Checks if the entity uses Matter-compatible position semantics (0=open, 100=closed).
 * Currently no platforms are known to use this by default.
 */
const usesMatterSemantics = (agent: Agent): boolean => {
  const homeAssistant = agent.get(HomeAssistantEntityBehavior);
  const platform = homeAssistant.entity.registry?.platform?.toLowerCase();
  if (platform && MATTER_SEMANTIC_PLATFORMS.includes(platform)) {
    return true;
  }
  return false;
};

/**
 * Adjusts position when READING from HA to report to Matter controllers.
 * By default, inverts percentage (HA 80% open → Matter 20% = 80% closed).
 * With coverUseHomeAssistantPercentage flag, skips inversion for Alexa-friendly display.
 * With coverSwapOpenClose, skips inversion (swaps entire open/close concept).
 */
const adjustPositionForReading = (position: number, agent: Agent) => {
  const { featureFlags } = agent.env.get(BridgeDataProvider);
  if (position == null) {
    return null;
  }
  let percentValue = position;

  // Skip inversion if:
  // 1. coverSwapOpenClose: swaps entire open/close concept (position + commands + movement), OR
  // 2. User explicitly set coverDoNotInvertPercentage flag, OR
  // 3. User set coverUseHomeAssistantPercentage for Alexa-friendly display, OR
  // 4. Integration uses Matter-compatible semantics
  const skipInversion =
    featureFlags?.coverSwapOpenClose === true ||
    featureFlags?.coverDoNotInvertPercentage === true ||
    featureFlags?.coverUseHomeAssistantPercentage === true ||
    usesMatterSemantics(agent);
  if (!skipInversion) {
    percentValue = 100 - percentValue;
  }
  return percentValue;
};

/**
 * Adjusts position when WRITING to HA from Matter controller commands.
 * By default, inverts percentage (Matter 80% closed → HA 20% open).
 * With coverUseHomeAssistantPercentage, also skips inversion so commands match display.
 * With coverSwapOpenClose, skips inversion (swaps entire open/close concept).
 */
const adjustPositionForWriting = (position: number, agent: Agent) => {
  const { featureFlags } = agent.env.get(BridgeDataProvider);
  if (position == null) {
    return null;
  }
  let percentValue = position;

  // Skip inversion for writing if:
  // 1. coverSwapOpenClose: swaps entire open/close concept (position + commands + movement), OR
  // 2. User explicitly set coverDoNotInvertPercentage flag, OR
  // 3. User set coverUseHomeAssistantPercentage (so commands match displayed %), OR
  // 4. Integration uses Matter-compatible semantics
  const skipInversion =
    featureFlags?.coverSwapOpenClose === true ||
    featureFlags?.coverDoNotInvertPercentage === true ||
    featureFlags?.coverUseHomeAssistantPercentage === true ||
    usesMatterSemantics(agent);
  if (!skipInversion) {
    percentValue = 100 - percentValue;
  }
  return percentValue;
};

/**
 * Checks if open/close commands should be swapped (for Alexa compatibility).
 */
const shouldSwapOpenClose = (agent: Agent): boolean => {
  const { featureFlags } = agent.env.get(BridgeDataProvider);
  return featureFlags?.coverSwapOpenClose === true;
};

/**
 * Checks if the cover supports position control (support_set_position feature).
 */
const supportsPositionControl = (agent: Agent): boolean => {
  const homeAssistant = agent.get(HomeAssistantEntityBehavior);
  const supportedFeatures =
    attributes(homeAssistant.entity.state).supported_features ?? 0;
  return (
    (supportedFeatures & CoverSupportedFeatures.support_set_position) !== 0
  );
};

/**
 * Checks if the cover supports tilt position control (support_set_tilt_position feature).
 */
const supportsTiltPositionControl = (agent: Agent): boolean => {
  const homeAssistant = agent.get(HomeAssistantEntityBehavior);
  const supportedFeatures =
    attributes(homeAssistant.entity.state).supported_features ?? 0;
  return (
    (supportedFeatures & CoverSupportedFeatures.support_set_tilt_position) !== 0
  );
};

const config: WindowCoveringConfig = {
  getCurrentLiftPosition: (entity, agent) => {
    let position = attributes(entity).current_position;
    if (position == null) {
      const coverState = entity.state as CoverDeviceState;
      // HA semantics: 0=closed, 100=open
      position =
        coverState === CoverDeviceState.closed
          ? 0
          : coverState === CoverDeviceState.open
            ? 100
            : undefined;
    }
    return position == null ? null : adjustPositionForReading(position, agent);
  },
  getCurrentTiltPosition: (entity, agent) => {
    let position = attributes(entity).current_tilt_position;
    if (position == null) {
      const coverState = entity.state as CoverDeviceState;
      // HA semantics: 0=closed, 100=open
      position =
        coverState === CoverDeviceState.closed
          ? 0
          : coverState === CoverDeviceState.open
            ? 100
            : undefined;
    }
    return position == null ? null : adjustPositionForReading(position, agent);
  },
  getMovementStatus: (entity, agent) => {
    const { featureFlags } = agent.env.get(BridgeDataProvider);
    const swapped = featureFlags?.coverSwapOpenClose === true;
    const coverState = entity.state as CoverDeviceState;
    if (coverState === CoverDeviceState.opening) {
      return swapped
        ? WindowCovering.MovementStatus.Closing
        : WindowCovering.MovementStatus.Opening;
    }
    if (coverState === CoverDeviceState.closing) {
      return swapped
        ? WindowCovering.MovementStatus.Opening
        : WindowCovering.MovementStatus.Closing;
    }
    return WindowCovering.MovementStatus.Stopped;
  },

  stopCover: () => ({ action: "cover.stop_cover" }),

  // Open/close can be swapped via coverSwapOpenClose flag for Alexa compatibility
  openCoverLift: (_, agent) => ({
    action: shouldSwapOpenClose(agent)
      ? "cover.close_cover"
      : "cover.open_cover",
  }),
  closeCoverLift: (_, agent) => ({
    action: shouldSwapOpenClose(agent)
      ? "cover.open_cover"
      : "cover.close_cover",
  }),
  setLiftPosition: (position, agent) => {
    // For binary covers (no position support), translate position to open/close
    // Matter position: 0=open, 100=closed (after inversion from HA semantics)
    if (!supportsPositionControl(agent)) {
      const adjustedPosition = adjustPositionForWriting(position, agent);
      // HA semantics: 0=closed, 100=open
      // If adjusted position < 50, cover should be more closed → close
      // If adjusted position >= 50, cover should be more open → open
      const shouldOpen = adjustedPosition != null && adjustedPosition >= 50;
      const swapped = shouldSwapOpenClose(agent);
      if (shouldOpen) {
        return { action: swapped ? "cover.close_cover" : "cover.open_cover" };
      }
      return { action: swapped ? "cover.open_cover" : "cover.close_cover" };
    }
    return {
      action: "cover.set_cover_position",
      data: { position: adjustPositionForWriting(position, agent) },
    };
  },

  // Tilt open/close also respects the swap flag
  openCoverTilt: (_, agent) => ({
    action: shouldSwapOpenClose(agent)
      ? "cover.close_cover_tilt"
      : "cover.open_cover_tilt",
  }),
  closeCoverTilt: (_, agent) => ({
    action: shouldSwapOpenClose(agent)
      ? "cover.open_cover_tilt"
      : "cover.close_cover_tilt",
  }),
  setTiltPosition: (position, agent) => {
    // For binary tilt covers (no tilt position support), translate to open/close tilt
    if (!supportsTiltPositionControl(agent)) {
      const adjustedPosition = adjustPositionForWriting(position, agent);
      const shouldOpen = adjustedPosition != null && adjustedPosition >= 50;
      const swapped = shouldSwapOpenClose(agent);
      if (shouldOpen) {
        return {
          action: swapped ? "cover.close_cover_tilt" : "cover.open_cover_tilt",
        };
      }
      return {
        action: swapped ? "cover.open_cover_tilt" : "cover.close_cover_tilt",
      };
    }
    return {
      action: "cover.set_cover_tilt_position",
      data: { tilt_position: adjustPositionForWriting(position, agent) },
    };
  },
};

export const CoverWindowCoveringServer = WindowCoveringServer(config);
