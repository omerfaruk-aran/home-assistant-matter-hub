import {
  type VacuumDeviceAttributes,
  VacuumDeviceFeature,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import type { EndpointType } from "@matter/main";
import { RoboticVacuumCleanerDevice } from "@matter/main/devices";

const logger = Logger.get("VacuumDevice");

import { testBit } from "../../../../utils/test-bit.js";
import { BasicInformationServer } from "../../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../behaviors/identify-server.js";
import { VacuumPowerSourceServer } from "./behaviors/vacuum-power-source-server.js";
import {
  createVacuumRvcCleanModeServer,
  supportsCleaningModes,
} from "./behaviors/vacuum-rvc-clean-mode-server.js";
import { VacuumRvcOperationalStateServer } from "./behaviors/vacuum-rvc-operational-state-server.js";
import { createVacuumRvcRunModeServer } from "./behaviors/vacuum-rvc-run-mode-server.js";
import { createVacuumServiceAreaServer } from "./behaviors/vacuum-service-area-server.js";
import { parseVacuumRooms } from "./utils/parse-vacuum-rooms.js";

const VacuumEndpointType = RoboticVacuumCleanerDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  VacuumRvcOperationalStateServer,
);

export function VacuumDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
): EndpointType | undefined {
  if (homeAssistantEntity.entity.state === undefined) {
    return undefined;
  }

  const entityId = homeAssistantEntity.entity.entity_id;
  const attributes = homeAssistantEntity.entity.state
    .attributes as VacuumDeviceAttributes;
  const supportedFeatures = attributes.supported_features ?? 0;

  // Debug: Log mapping info
  logger.info(
    `Creating vacuum endpoint for ${entityId}, mapping: ${JSON.stringify(homeAssistantEntity.mapping ?? "none")}`,
  );

  // Add RvcRunModeServer with initial supportedModes (including room modes if available)
  let device = VacuumEndpointType.with(
    createVacuumRvcRunModeServer(attributes),
  ).set({ homeAssistantEntity });

  // NOTE: OnOff is intentionally NOT included.
  // It is not part of the RoboticVacuumCleaner device type spec and
  // non-standard clusters can confuse Apple Home's UI rendering.
  // When vacuum is idle, OnOff.onOff=false may cause Apple Home to show
  // "Updating" instead of using RvcOperationalState for the actual status.
  // Start/stop is handled via RvcRunMode.changeToMode(Cleaning/Idle).

  // Add PowerSource if BATTERY feature is set OR if battery attribute exists
  // OR if a battery entity is mapped (for Roomba, Deebot, etc.)
  // Some vacuums use 'battery_level', others use 'battery' (e.g. Dreame)
  const batteryValue = attributes.battery_level ?? attributes.battery;
  const hasBatteryAttr =
    batteryValue != null && typeof batteryValue === "number";
  const hasBatteryEntity = !!homeAssistantEntity.mapping?.batteryEntity;
  if (
    testBit(supportedFeatures, VacuumDeviceFeature.BATTERY) ||
    hasBatteryAttr ||
    hasBatteryEntity
  ) {
    device = device.with(VacuumPowerSourceServer);
  }

  // ServiceArea cluster for native room selection in Apple Home
  // All state is set at creation time (no custom initialize())
  // Support both: 1) rooms from vacuum attributes (Dreame, Xiaomi Miot)
  //               2) button entities from mapping (Roborock official integration)
  const roomEntities = homeAssistantEntity.mapping?.roomEntities;
  const rooms = parseVacuumRooms(attributes);
  logger.info(
    `${entityId}: roomEntities=${JSON.stringify(roomEntities ?? [])}, parsedRooms=${rooms.length}`,
  );
  if (rooms.length > 0 || (roomEntities && roomEntities.length > 0)) {
    logger.info(`${entityId}: Adding ServiceArea cluster with rooms`);
    device = device.with(
      createVacuumServiceAreaServer(attributes, roomEntities),
    );
  } else {
    logger.info(`${entityId}: No rooms found, skipping ServiceArea cluster`);
  }

  // RvcCleanMode for Dreame vacuum cleaning modes (Sweeping, Mopping, etc.)
  // Check both: isDreameVacuum OR if a cleaningModeEntity is mapped
  const hasCleaningModeEntity =
    !!homeAssistantEntity.mapping?.cleaningModeEntity;
  if (supportsCleaningModes(attributes) || hasCleaningModeEntity) {
    logger.info(
      `${entityId}: Adding RvcCleanMode cluster (isDreame=${supportsCleaningModes(attributes)}, mappedEntity=${hasCleaningModeEntity})`,
    );
    device = device.with(createVacuumRvcCleanModeServer(attributes));
  }

  return device;
}
