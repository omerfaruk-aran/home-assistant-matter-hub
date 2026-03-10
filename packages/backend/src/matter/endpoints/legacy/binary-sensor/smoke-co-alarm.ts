import type { HomeAssistantEntityInformation } from "@home-assistant-matter-hub/common";
import { SmokeCoAlarmServer as Base } from "@matter/main/behaviors/smoke-co-alarm";
import { SmokeCoAlarm } from "@matter/main/clusters";
import { SmokeCoAlarmDevice } from "@matter/main/devices";
import { EntityStateProvider } from "../../../../services/bridges/entity-state-provider.js";
import { applyPatchState } from "../../../../utils/apply-patch-state.js";
import { BasicInformationServer } from "../../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../behaviors/identify-server.js";
import { PowerSourceServer } from "../../../behaviors/power-source-server.js";

const SmokeAlarmServerWithFeature = Base.with(SmokeCoAlarm.Feature.SmokeAlarm);
const CoAlarmServerWithFeature = Base.with(SmokeCoAlarm.Feature.CoAlarm);

class SmokeAlarmServerImpl extends SmokeAlarmServerWithFeature {
  override async initialize() {
    await super.initialize();
    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    this.update(homeAssistant.entity);
    this.reactTo(homeAssistant.onChange, this.update);
  }

  private update(entity: HomeAssistantEntityInformation) {
    const isOn =
      this.agent.get(HomeAssistantEntityBehavior).isAvailable &&
      entity.state.state === "on";
    applyPatchState(this.state, {
      smokeState: isOn
        ? SmokeCoAlarm.AlarmState.Warning
        : SmokeCoAlarm.AlarmState.Normal,
    });
  }
}

class CoAlarmServerImpl extends CoAlarmServerWithFeature {
  override async initialize() {
    await super.initialize();
    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    this.update(homeAssistant.entity);
    this.reactTo(homeAssistant.onChange, this.update);
  }

  private update(entity: HomeAssistantEntityInformation) {
    const isOn =
      this.agent.get(HomeAssistantEntityBehavior).isAvailable &&
      entity.state.state === "on";
    applyPatchState(this.state, {
      coState: isOn
        ? SmokeCoAlarm.AlarmState.Warning
        : SmokeCoAlarm.AlarmState.Normal,
    });
  }
}

// PowerSource configuration for battery-powered smoke/CO alarms
const AlarmPowerSourceServer = PowerSourceServer({
  getBatteryPercent: (entity, agent) => {
    // First check for battery entity from mapping (auto-assigned or manual)
    const homeAssistant = agent.get(HomeAssistantEntityBehavior);
    const batteryEntity = homeAssistant.state.mapping?.batteryEntity;
    if (batteryEntity) {
      const stateProvider = agent.env.get(EntityStateProvider);
      const battery = stateProvider.getBatteryPercent(batteryEntity);
      if (battery != null) {
        return Math.max(0, Math.min(100, battery));
      }
    }

    // Fallback to entity's own battery attribute
    const attrs = entity.attributes as {
      battery?: number;
      battery_level?: number;
    };
    const level = attrs.battery_level ?? attrs.battery;
    if (level == null || Number.isNaN(Number(level))) {
      return null;
    }
    return Number(level);
  },
});

export const SmokeAlarmType = SmokeCoAlarmDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  SmokeAlarmServerImpl,
);

export const SmokeAlarmWithBatteryType = SmokeCoAlarmDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  SmokeAlarmServerImpl,
  AlarmPowerSourceServer,
);

export const CoAlarmType = SmokeCoAlarmDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  CoAlarmServerImpl,
);

export const CoAlarmWithBatteryType = SmokeCoAlarmDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  CoAlarmServerImpl,
  AlarmPowerSourceServer,
);
