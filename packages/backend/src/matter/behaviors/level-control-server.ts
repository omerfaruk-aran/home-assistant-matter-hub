import type { HomeAssistantEntityInformation } from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import { LevelControlServer as Base } from "@matter/main/behaviors";
import type { LevelControl } from "@matter/main/clusters/level-control";
import { applyPatchState } from "../../utils/apply-patch-state.js";
import type { FeatureSelection } from "../../utils/feature-selection.js";
import { HomeAssistantEntityBehavior } from "./home-assistant-entity-behavior.js";
import type { ValueGetter, ValueSetter } from "./utils/cluster-config.js";

// Track when lights were turned on to detect Alexa's brightness reset pattern
const lastTurnOnTimestamps = new Map<string, number>();

/**
 * Called by OnOffServer when a light is turned on via Matter command.
 * Used to detect Alexa's brightness reset pattern.
 */
export function notifyLightTurnedOn(entityId: string): void {
  lastTurnOnTimestamps.set(entityId, Date.now());
}

const logger = Logger.get("LevelControlServer");

export interface LevelControlConfig {
  getValuePercent: ValueGetter<number | null>;
  moveToLevelPercent: ValueSetter<number>;
}

const FeaturedBase = Base.with("OnOff", "Lighting");

export class LevelControlServerBase extends FeaturedBase {
  declare state: LevelControlServerBase.State;

  override async initialize() {
    // Set default values BEFORE super.initialize() to prevent validation errors.
    // The Lighting feature requires currentLevel to be in valid range (1-254).
    // If the light is OFF, brightness from HA is null, which could cause issues.
    if (this.state.currentLevel == null) {
      this.state.currentLevel = 1; // Minimum valid level for Lighting feature
    }
    if (this.state.minLevel == null) {
      this.state.minLevel = 1;
    }
    if (this.state.maxLevel == null) {
      this.state.maxLevel = 0xfe; // 254
    }

    logger.debug(`initialize: calling super.initialize()`);
    try {
      await super.initialize();
      logger.debug(`initialize: super.initialize() completed successfully`);
    } catch (error) {
      logger.error(`initialize: super.initialize() FAILED:`, error);
      throw error;
    }
    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    this.update(homeAssistant.entity);
    this.reactTo(homeAssistant.onChange, this.update);
  }

  private update(entity: HomeAssistantEntityInformation) {
    if (!entity.state) {
      return;
    }
    const { state } = entity;
    const config = this.state.config;

    const minLevel = 1;
    const maxLevel = 0xfe;
    const levelRange = maxLevel - minLevel;

    // Get brightness as percentage (0.0-1.0) from Home Assistant
    const currentLevelPercent = config.getValuePercent(state, this.agent);
    let currentLevel =
      currentLevelPercent != null
        ? Math.round(currentLevelPercent * levelRange + minLevel)
        : null;

    if (currentLevel != null) {
      currentLevel = Math.min(Math.max(minLevel, currentLevel), maxLevel);
    }

    // Only set Matter attributes - do NOT set custom fields like currentLevelPercent
    // as Matter.js might expose them and confuse controllers.
    // Only update currentLevel if we have a valid value to prevent overwriting
    // the default set in initialize() when the light is OFF.
    // NOTE: Do NOT set onLevel here - it causes "Behaviors have errors" during initialization.
    // Let Matter.js/controllers manage onLevel.
    applyPatchState(this.state, {
      minLevel: minLevel,
      maxLevel: maxLevel,
      ...(currentLevel != null ? { currentLevel: currentLevel } : {}),
    });
  }

  // Fix for Google Home (#41): it sends moveToLevel/moveToLevelWithOnOff/step commands
  // with transitionTime as null or completely omitted. The TLV schema is patched at startup
  // (see patch-level-control-tlv.ts) to accept omitted fields. Here we default to 0 (instant).
  override async moveToLevel(request: LevelControl.MoveToLevelRequest) {
    if (request.transitionTime == null) {
      request.transitionTime = 0;
    }
    return super.moveToLevel(request);
  }

  override async moveToLevelWithOnOff(
    request: LevelControl.MoveToLevelRequest,
  ) {
    if (request.transitionTime == null) {
      request.transitionTime = 0;
    }
    return super.moveToLevelWithOnOff(request);
  }

  override step(request: LevelControl.StepRequest) {
    if (request.transitionTime == null) {
      request.transitionTime = 0;
    }
    return super.step(request);
  }

  override stepWithOnOff(request: LevelControl.StepRequest) {
    if (request.transitionTime == null) {
      request.transitionTime = 0;
    }
    return super.stepWithOnOff(request);
  }

  override moveToLevelLogic(level: number) {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const config = this.state.config;
    const entityId = homeAssistant.entity.entity_id;

    const levelRange = this.maxLevel - this.minLevel;
    const levelPercent = (level - this.minLevel) / levelRange;

    // Alexa workaround: After subscription renewal, Alexa sends on() followed by
    // moveToLevel(254) within ~50ms, resetting brightness to 100%. Ignore max
    // brightness commands that come shortly after turn-on. This is always active
    // because the 200ms window is too short for intentional human interaction.
    const lastTurnOn = lastTurnOnTimestamps.get(entityId);
    const timeSinceTurnOn = lastTurnOn ? Date.now() - lastTurnOn : Infinity;
    const isMaxBrightness = level >= this.maxLevel;

    if (isMaxBrightness && timeSinceTurnOn < 200) {
      logger.debug(
        `[${entityId}] Ignoring moveToLevel(${level}) - Alexa brightness reset detected ` +
          `(${timeSinceTurnOn}ms after turn-on)`,
      );
      return;
    }

    const current = config.getValuePercent(
      homeAssistant.entity.state,
      this.agent,
    );
    if (levelPercent === current) {
      return;
    }
    homeAssistant.callAction(
      config.moveToLevelPercent(levelPercent, this.agent),
    );
  }
}

export namespace LevelControlServerBase {
  export class State extends FeaturedBase.State {
    config!: LevelControlConfig;
  }
}

export type LevelControlFeatures = FeatureSelection<LevelControl.Cluster>;

export function LevelControlServer(config: LevelControlConfig) {
  return LevelControlServerBase.set({
    options: { executeIfOff: true },
    config,
  });
}
