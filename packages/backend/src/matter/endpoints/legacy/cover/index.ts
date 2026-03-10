import {
  type CoverDeviceAttributes,
  CoverSupportedFeatures,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import type { EndpointType } from "@matter/main";
import type { WindowCovering } from "@matter/main/clusters";
import { WindowCoveringDevice } from "@matter/main/devices";

const logger = Logger.get("CoverDevice");

import { EntityStateProvider } from "../../../../services/bridges/entity-state-provider.js";
import type { FeatureSelection } from "../../../../utils/feature-selection.js";
import { testBit } from "../../../../utils/test-bit.js";
import { BasicInformationServer } from "../../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../behaviors/identify-server.js";
import { PowerSourceServer } from "../../../behaviors/power-source-server.js";
import { CoverWindowCoveringServer } from "./behaviors/cover-window-covering-server.js";

// PowerSource configuration for battery-powered covers
const CoverPowerSourceServer = PowerSourceServer({
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

const CoverDeviceType = (
  supportedFeatures: number,
  hasBattery: boolean,
  entityId: string,
) => {
  const features: FeatureSelection<WindowCovering.Complete> = new Set();

  // Always add Lift and PositionAwareLift for all covers.
  // Apple Home requires PositionAwareLift to properly recognize WindowCovering devices.
  // Without it, Apple Home may show the device as "clima" (thermostat) instead (#78).
  // For binary covers (gates, garage doors), we report 0% (open) or 100% (closed)
  // based on the cover state - see cover-window-covering-server.ts getCurrentLiftPosition.
  if (testBit(supportedFeatures, CoverSupportedFeatures.support_open)) {
    features.add("Lift");
    features.add("PositionAwareLift");
    features.add("AbsolutePosition");
  } else {
    // Fallback: Add features even if support_open is not set
    // This ensures the WindowCovering device is always valid
    logger.warn(
      `[${entityId}] Cover has no support_open feature (supported_features=${supportedFeatures}), adding Lift anyway`,
    );
    features.add("Lift");
    features.add("PositionAwareLift");
    features.add("AbsolutePosition");
  }

  if (testBit(supportedFeatures, CoverSupportedFeatures.support_open_tilt)) {
    features.add("Tilt");
    // Same logic for tilt - only add PositionAwareTilt if position control is supported
    if (
      testBit(
        supportedFeatures,
        CoverSupportedFeatures.support_set_tilt_position,
      )
    ) {
      features.add("PositionAwareTilt");
      features.add("AbsolutePosition");
    }
  }

  logger.info(
    `[${entityId}] Creating WindowCovering with features: [${[...features].join(", ")}], supported_features=${supportedFeatures}`,
  );

  const baseBehaviors = [
    BasicInformationServer,
    IdentifyServer,
    HomeAssistantEntityBehavior,
    CoverWindowCoveringServer.with(...features),
  ] as const;

  if (hasBattery) {
    return WindowCoveringDevice.with(...baseBehaviors, CoverPowerSourceServer);
  }
  return WindowCoveringDevice.with(...baseBehaviors);
};

export function CoverDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
): EndpointType {
  const entityId = homeAssistantEntity.entity.entity_id;
  const attributes = homeAssistantEntity.entity.state
    .attributes as CoverDeviceAttributes & {
    battery?: number;
    battery_level?: number;
  };
  const hasBatteryAttr =
    attributes.battery_level != null || attributes.battery != null;
  const hasBatteryEntity = !!homeAssistantEntity.mapping?.batteryEntity;
  const hasBattery = hasBatteryAttr || hasBatteryEntity;

  if (hasBattery) {
    logger.info(
      `[${entityId}] Creating cover with PowerSource cluster, ` +
        `batteryAttr=${hasBatteryAttr}, batteryEntity=${homeAssistantEntity.mapping?.batteryEntity ?? "none"}`,
    );
  } else {
    logger.debug(
      `[${entityId}] Creating cover without battery (batteryAttr=${hasBatteryAttr}, batteryEntity=${homeAssistantEntity.mapping?.batteryEntity ?? "none"})`,
    );
  }

  return CoverDeviceType(
    attributes.supported_features ?? 0,
    hasBattery,
    entityId,
  ).set({
    homeAssistantEntity,
  });
}
