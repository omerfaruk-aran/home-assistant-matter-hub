import type { EventDeviceAttributes } from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import { SwitchServer as Base } from "@matter/main/behaviors";
import { HomeAssistantEntityBehavior } from "./home-assistant-entity-behavior.js";

const logger = Logger.get("GenericSwitchServer");

const FeaturedBase = Base.with(
  "MomentarySwitch",
  "MomentarySwitchRelease",
  "MomentarySwitchMultiPress",
);

// biome-ignore lint/correctness/noUnusedVariables: Used via namespace below
class GenericSwitchServerBase extends FeaturedBase {
  declare state: GenericSwitchServerBase.State;

  override async initialize() {
    await super.initialize();

    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    const entityId = homeAssistant.entityId;

    logger.debug(`[${entityId}] GenericSwitch initialized`);

    this.reactTo(homeAssistant.onChange, this.handleEventChange);
  }

  private handleEventChange() {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const entity = homeAssistant.entity;
    if (!entity?.state) return;

    const attrs = entity.state.attributes as EventDeviceAttributes;
    const eventType = attrs.event_type;

    if (!eventType) return;

    const entityId = homeAssistant.entityId;
    logger.debug(`[${entityId}] Event fired: ${eventType}`);

    // Map HA event types to Matter Switch actions
    // For momentary switches, we simulate press -> release
    this.triggerPress(eventType);
  }

  private triggerPress(eventType: string) {
    // Determine number of presses from event type
    const pressCount = this.getPressCount(eventType);

    // 1. Initial press
    this.state.currentPosition = 1;
    this.events.initialPress?.emit({ newPosition: 1 }, this.context);

    if (pressCount > 1) {
      // Multi-press: emit multiPressComplete with totalNumberOfPressesCounted
      this.events.multiPressComplete?.emit(
        {
          previousPosition: 0,
          totalNumberOfPressesCounted: pressCount,
        },
        this.context,
      );
    }

    // Release after a short delay
    setTimeout(
      this.callback(() => {
        this.events.shortRelease?.emit({ previousPosition: 1 }, this.context);
        this.state.currentPosition = 0;
      }),
      100,
    );

    // Bridge the Matter event back to HA as a fired event
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    homeAssistant.fireEvent("hamh_action", {
      action: "press",
      event_type: eventType,
      press_count: pressCount,
      source: "matter_bridge",
    });
  }

  private getPressCount(eventType: string): number {
    const lower = eventType.toLowerCase();

    // Common multi-press patterns
    if (
      lower.includes("triple") ||
      lower.includes("3_press") ||
      lower.includes("three")
    ) {
      return 3;
    }
    if (
      lower.includes("double") ||
      lower.includes("2_press") ||
      lower.includes("two") ||
      lower.includes("multi")
    ) {
      return 2;
    }

    // Single press (default)
    return 1;
  }
}

namespace GenericSwitchServerBase {
  export class State extends FeaturedBase.State {}
}

export const HaGenericSwitchServer = GenericSwitchServerBase.set({
  numberOfPositions: 2,
  currentPosition: 0,
  multiPressMax: 3,
});
