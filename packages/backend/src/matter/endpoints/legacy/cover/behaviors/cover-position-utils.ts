import type { BridgeFeatureFlags } from "@home-assistant-matter-hub/common";

/**
 * Pure function to adjust cover position when READING from HA to report to Matter.
 * Extracted for testability — the behavior server delegates to this.
 *
 * @param position - HA position percentage (0=closed, 100=open)
 * @param flags - Bridge feature flags
 * @param matterSemantics - Whether the integration uses Matter-compatible semantics
 * @returns Adjusted position for Matter controllers
 */
export function adjustPositionForReading(
  position: number,
  flags: BridgeFeatureFlags | undefined,
  matterSemantics: boolean,
): number | null {
  if (position == null) {
    return null;
  }

  const skipInversion =
    flags?.coverDoNotInvertPercentage === true ||
    flags?.coverUseHomeAssistantPercentage === true ||
    matterSemantics;

  if (flags?.coverSwapOpenClose === true && !skipInversion) {
    return position;
  }

  if (!skipInversion) {
    return 100 - position;
  }

  return position;
}

/**
 * Pure function to adjust cover position when WRITING from Matter to HA.
 * Extracted for testability — the behavior server delegates to this.
 *
 * @param position - Matter position percentage
 * @param flags - Bridge feature flags
 * @param matterSemantics - Whether the integration uses Matter-compatible semantics
 * @returns Adjusted position for Home Assistant
 */
export function adjustPositionForWriting(
  position: number,
  flags: BridgeFeatureFlags | undefined,
  matterSemantics: boolean,
): number | null {
  if (position == null) {
    return null;
  }

  const skipInversion =
    flags?.coverDoNotInvertPercentage === true ||
    flags?.coverUseHomeAssistantPercentage === true ||
    matterSemantics;

  if (flags?.coverSwapOpenClose === true && !skipInversion) {
    return position;
  }

  if (!skipInversion) {
    return 100 - position;
  }

  return position;
}
