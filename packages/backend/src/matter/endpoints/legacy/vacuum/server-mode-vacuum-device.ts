import type { VacuumDeviceAttributes } from "@home-assistant-matter-hub/common";
import type { EndpointType } from "@matter/main";
import { RoboticVacuumCleanerDevice } from "@matter/main/devices";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../behaviors/identify-server.js";
import { VacuumOnOffServer } from "./behaviors/vacuum-on-off-server.js";
import { VacuumPowerSourceServer } from "./behaviors/vacuum-power-source-server.js";
import {
  createDefaultRvcCleanModeServer,
  createVacuumRvcCleanModeServer,
  resolveFanSpeedList,
  resolveMopIntensityList,
  supportsCleaningModes,
} from "./behaviors/vacuum-rvc-clean-mode-server.js";
import { VacuumRvcOperationalStateServer } from "./behaviors/vacuum-rvc-operational-state-server.js";
import { createVacuumRvcRunModeServer } from "./behaviors/vacuum-rvc-run-mode-server.js";
import {
  createDefaultServiceAreaServer,
  createVacuumServiceAreaServer,
} from "./behaviors/vacuum-service-area-server.js";
import { parseVacuumRooms } from "./utils/parse-vacuum-rooms.js";

/**
 * Server Mode Vacuum Endpoint Type.
 *
 * This is different from the normal VacuumDevice:
 * - NO BridgedDeviceBasicInformationServer (BasicInformationServer)
 * - NO OnOff cluster (not part of RoboticVacuumCleaner device type spec)
 * - The device appears as a standalone Matter device, not bridged
 * - Required for Apple Home Siri voice commands and Alexa discovery
 *
 * Only clusters from the Matter RoboticVacuumCleaner device type (0x74) are included:
 * Required: Identify, RvcRunMode, RvcOperationalState
 * Optional: RvcCleanMode, ServiceArea
 * Additional: PowerSource (for battery info)
 *
 * The BasicInformation comes from the ServerNode itself, not the endpoint.
 */
const ServerModeVacuumEndpointType = RoboticVacuumCleanerDevice.with(
  IdentifyServer,
  HomeAssistantEntityBehavior,
  VacuumRvcOperationalStateServer,
);

/**
 * Creates a Server Mode Vacuum Device endpoint.
 *
 * Unlike the bridged VacuumDevice, this version does NOT include
 * BridgedDeviceBasicInformationServer, making it appear as a
 * standalone (non-bridged) Matter device.
 */
export function ServerModeVacuumDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
  includeOnOff = false,
): EndpointType | undefined {
  if (homeAssistantEntity.entity.state === undefined) {
    return undefined;
  }

  const attributes = homeAssistantEntity.entity.state
    .attributes as VacuumDeviceAttributes;

  // Add RvcRunModeServer with initial supportedModes (including room modes if available)
  let device = ServerModeVacuumEndpointType.with(
    createVacuumRvcRunModeServer(attributes),
  ).set({ homeAssistantEntity });

  // OnOff is NOT part of the RoboticVacuumCleaner device type spec.
  // Including it may confuse Apple Home's UI rendering (shows "Updating"
  // or renders as switch instead of vacuum). Only enabled via feature flag
  // for Alexa compatibility (maps OnOff to PowerController for start/stop).
  if (includeOnOff) {
    device = device.with(VacuumOnOffServer);
  }

  // PowerSource — always included.
  device = device.with(VacuumPowerSourceServer);

  // ServiceArea — always included.
  const roomEntities = homeAssistantEntity.mapping?.roomEntities;
  const rooms = parseVacuumRooms(attributes);
  if (rooms.length > 0 || (roomEntities && roomEntities.length > 0)) {
    device = device.with(
      createVacuumServiceAreaServer(attributes, roomEntities),
    );
  } else {
    device = device.with(createDefaultServiceAreaServer());
  }

  // RvcCleanMode — always included.
  // Alexa probes for cluster 0x55 during discovery and may refuse the device without it.
  const hasCleaningModeEntity =
    !!homeAssistantEntity.mapping?.cleaningModeEntity;
  const fanSpeedList = resolveFanSpeedList(
    attributes,
    homeAssistantEntity.mapping?.suctionLevelEntity,
  );
  const mopIntensityList = resolveMopIntensityList(
    homeAssistantEntity.mapping?.mopIntensityEntity,
  );
  const hasCleanTypes =
    supportsCleaningModes(attributes) || hasCleaningModeEntity;
  if (hasCleanTypes || fanSpeedList || mopIntensityList) {
    device = device.with(
      createVacuumRvcCleanModeServer(
        attributes,
        fanSpeedList,
        mopIntensityList,
        hasCleanTypes,
      ),
    );
  } else {
    device = device.with(createDefaultRvcCleanModeServer());
  }

  return device;
}
