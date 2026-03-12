import type {
  HomeAssistantEntityInformation,
  HomeAssistantEntityState,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import { OnOffServer as Base } from "@matter/main/behaviors";
import { applyPatchState } from "../../utils/apply-patch-state.js";
import { HomeAssistantEntityBehavior } from "./home-assistant-entity-behavior.js";
import { notifyLightTurnedOn } from "./level-control-server.js";
import type { ValueGetter, ValueSetter } from "./utils/cluster-config.js";

const logger = Logger.get("OnOffServer");

// Track optimistic on/off writes to prevent stale HA state from reverting them.
// After a controller command, composed/mapped entity updates can re-push the
// primary entity state before HA processes the command, reverting the optimistic
// value. Only skip HA updates that report a DIFFERENT (stale) value; accept
// updates that confirm the expected value immediately.
interface OptimisticOnOffState {
  expectedOnOff: boolean;
  timestamp: number;
}
const optimisticOnOffState = new Map<string, OptimisticOnOffState>();
const OPTIMISTIC_TIMEOUT_MS = 3000;

export interface OnOffConfig {
  isOn?: ValueGetter<boolean>;
  turnOn?: ValueSetter<void> | null;
  turnOff?: ValueSetter<void> | null;
}

// biome-ignore lint/correctness/noUnusedVariables: Biome thinks this is unused, but it's used by the function below
class OnOffServerBase extends Base {
  declare state: OnOffServerBase.State;

  override async initialize() {
    await super.initialize();
    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    this.update(homeAssistant.entity);
    this.reactTo(homeAssistant.onChange, this.update);
  }

  protected update({ state }: HomeAssistantEntityInformation) {
    const onOff = this.isOn(state);
    const entityId = this.agent.get(HomeAssistantEntityBehavior).entity
      .entity_id;
    const optimistic = optimisticOnOffState.get(entityId);
    if (optimistic != null) {
      if (Date.now() - optimistic.timestamp > OPTIMISTIC_TIMEOUT_MS) {
        optimisticOnOffState.delete(entityId);
      } else if (onOff === optimistic.expectedOnOff) {
        optimisticOnOffState.delete(entityId);
      } else {
        return;
      }
    }
    applyPatchState(this.state, { onOff });
  }

  private isOn(entity: HomeAssistantEntityState): boolean {
    return (
      this.state.config?.isOn?.(entity, this.agent) ??
      (this.agent.get(HomeAssistantEntityBehavior).isAvailable &&
        entity.state !== "off")
    );
  }

  override on() {
    const { turnOn, turnOff } = this.state.config;
    if (turnOn === null) {
      setTimeout(this.callback(this.autoReset), 1000);
      return;
    }
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const action = turnOn?.(void 0, this.agent) ?? {
      action: "homeassistant.turn_on",
    };
    logger.info(`[${homeAssistant.entityId}] Turning ON -> ${action.action}`);
    // Notify LevelControlServer about turn-on for Alexa brightness workaround
    notifyLightTurnedOn(homeAssistant.entityId);
    // Set onOff immediately so the controller gets instant feedback in the
    // command response. Without this, Apple Home shows "Turning on..." until
    // the async HA WebSocket state update arrives.
    applyPatchState(this.state, { onOff: true });
    optimisticOnOffState.set(homeAssistant.entityId, {
      expectedOnOff: true,
      timestamp: Date.now(),
    });
    homeAssistant.callAction(action);
    // Auto-reset for momentary actions (scenes, automations) so controllers
    // don't show a permanently "on" state after activation.
    if (turnOff === null) {
      setTimeout(this.callback(this.autoReset), 1000);
    }
  }

  override off() {
    const { turnOff } = this.state.config;
    if (turnOff === null) {
      setTimeout(this.callback(this.autoReset), 1000);
      return;
    }
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const action = turnOff?.(void 0, this.agent) ?? {
      action: "homeassistant.turn_off",
    };
    logger.info(`[${homeAssistant.entityId}] Turning OFF -> ${action.action}`);
    // Set onOff immediately so the controller gets instant feedback in the
    // command response. Without this, Apple Home shows "Turning off..." until
    // the async HA WebSocket state update arrives (#219).
    applyPatchState(this.state, { onOff: false });
    optimisticOnOffState.set(homeAssistant.entityId, {
      expectedOnOff: false,
      timestamp: Date.now(),
    });
    homeAssistant.callAction(action);
  }

  private autoReset() {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    optimisticOnOffState.delete(homeAssistant.entityId);
    this.update(homeAssistant.entity);
  }
}

namespace OnOffServerBase {
  export class State extends Base.State {
    config!: OnOffConfig;
  }
}

export function OnOffServer(config: OnOffConfig = {}) {
  return OnOffServerBase.set({ config });
}

export function setOptimisticOnOff(entityId: string, expectedOnOff: boolean) {
  optimisticOnOffState.set(entityId, {
    expectedOnOff,
    timestamp: Date.now(),
  });
}
