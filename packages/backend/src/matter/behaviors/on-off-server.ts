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

export interface OnOffConfig {
  isOn?: ValueGetter<boolean>;
  turnOn?: ValueSetter<void> | null;
  turnOff?: ValueSetter<void> | null;
}

const FeaturedBase = Base.with("Lighting");

// biome-ignore lint/correctness/noUnusedVariables: Biome thinks this is unused, but it's used by the function below
class OnOffServerBase extends FeaturedBase {
  declare state: OnOffServerBase.State;

  override async initialize() {
    await super.initialize();
    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    this.update(homeAssistant.entity);
    if (homeAssistant.state.managedByEndpoint) {
      homeAssistant.registerUpdate(this.callback(this.update));
    } else {
      this.reactTo(homeAssistant.onChange, this.update);
    }
  }

  public update({ state }: HomeAssistantEntityInformation) {
    applyPatchState(this.state, {
      onOff: this.isOn(state),
    });
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
    homeAssistant.callAction(action);
    // Auto-reset for momentary actions (scenes, automations) so controllers
    // don't show a permanently "on" state after activation.
    // We must explicitly set onOff: true first because we override on() without
    // calling super.on(). Without this, onOff stays false, the auto-reset is a
    // no-op (deepEqual skips it), and controllers like Alexa that cache optimistic
    // state never receive the true→false transition notification.
    if (turnOff === null) {
      applyPatchState(this.state, { onOff: true });
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
    homeAssistant.callAction(action);
  }

  private autoReset() {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    this.update(homeAssistant.entity);
  }
}

namespace OnOffServerBase {
  export class State extends FeaturedBase.State {
    config!: OnOffConfig;
  }
}

export function OnOffServer(config: OnOffConfig = {}) {
  return OnOffServerBase.set({ config });
}
