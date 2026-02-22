import {
  type VacuumDeviceAttributes,
  VacuumDeviceFeature,
  VacuumState,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import type { Agent } from "@matter/main";
import { ServiceAreaBehavior } from "@matter/main/behaviors";
import { RvcRunMode } from "@matter/main/clusters";
import { testBit } from "../../../../../utils/test-bit.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import {
  RvcRunModeServer,
  RvcSupportedRunMode,
} from "../../../../behaviors/rvc-run-mode-server.js";
import {
  getRoomIdFromMode,
  getRoomModeValue,
  isDreameVacuum,
  isEcovacsVacuum,
  isRoborockVacuum,
  isXiaomiMiotVacuum,
  parseVacuumRooms,
} from "../utils/parse-vacuum-rooms.js";
import { toAreaId } from "./vacuum-service-area-server.js";

const logger = Logger.get("VacuumRvcRunModeServer");

/**
 * Build supported modes from vacuum attributes.
 * This includes base modes (Idle, Cleaning) plus room-specific modes if available.
 *
 * @param attributes - Vacuum device attributes
 * @param includeUnnamedRooms - If true, includes rooms with generic names like "Room 7". Default: false
 */
function buildSupportedModes(
  _attributes: VacuumDeviceAttributes,
  _includeUnnamedRooms = false,
): RvcRunMode.ModeOption[] {
  // Only include base modes (Idle, Cleaning).
  // Room-specific cleaning is handled via ServiceArea cluster.
  // Apple Home has issues mapping room-specific modes correctly when both
  // ServiceArea and RvcRunMode room modes are present - it uses incorrect
  // index-based mode selection instead of the actual mode values.
  const modes: RvcRunMode.ModeOption[] = [
    {
      label: "Idle",
      mode: RvcSupportedRunMode.Idle,
      modeTags: [{ value: RvcRunMode.ModeTag.Idle }],
    },
    {
      label: "Cleaning",
      mode: RvcSupportedRunMode.Cleaning,
      modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }],
    },
  ];

  return modes;
}

const vacuumRvcRunModeConfig = {
  getCurrentMode: (entity: { state: string }) => {
    const state = entity.state as VacuumState;
    // All cleaning-related states should map to Cleaning mode
    const cleaningStates: string[] = [
      VacuumState.cleaning,
      VacuumState.segment_cleaning,
      VacuumState.zone_cleaning,
      VacuumState.spot_cleaning,
      VacuumState.mop_cleaning,
    ];
    const isCleaning = cleaningStates.includes(state);
    logger.debug(
      `Vacuum state: "${state}", isCleaning: ${isCleaning}, currentMode: ${isCleaning ? "Cleaning" : "Idle"}`,
    );
    return isCleaning ? RvcSupportedRunMode.Cleaning : RvcSupportedRunMode.Idle;
  },

  getSupportedModes: (entity: { attributes: unknown }) => {
    const attributes = entity.attributes as VacuumDeviceAttributes;
    return buildSupportedModes(attributes);
  },

  // biome-ignore lint/suspicious/noConfusingVoidType: Required by ValueSetter<void> interface
  start: (_: void, agent: Agent) => {
    // Check if there are selected areas from ServiceArea
    try {
      const serviceArea = agent.get(ServiceAreaBehavior);
      const selectedAreas = serviceArea.state.selectedAreas;

      if (selectedAreas && selectedAreas.length > 0) {
        const homeAssistant = agent.get(HomeAssistantEntityBehavior);
        const entity = homeAssistant.entity;
        const attributes = entity.state.attributes as VacuumDeviceAttributes;

        // Check if we have button entities mapped for rooms (Roborock integration)
        const roomEntities = homeAssistant.state.mapping?.roomEntities;
        if (roomEntities && roomEntities.length > 0) {
          // Find button entity IDs for selected areas
          const buttonEntityIds: string[] = [];
          for (const areaId of selectedAreas) {
            const buttonEntityId = roomEntities.find(
              (id) => toAreaId(id) === areaId,
            );
            if (buttonEntityId) {
              buttonEntityIds.push(buttonEntityId);
            }
          }

          if (buttonEntityIds.length > 0) {
            logger.info(
              `Roborock: Pressing button entities for selected rooms: ${buttonEntityIds.join(", ")}`,
            );

            // Clear selected areas after use
            serviceArea.state.selectedAreas = [];

            // Dispatch extra button presses directly — the caller can only
            // handle a single returned action, so press buttons 1..N here.
            for (let i = 1; i < buttonEntityIds.length; i++) {
              homeAssistant.callAction({
                action: "button.press",
                target: buttonEntityIds[i],
              });
            }

            return {
              action: "button.press",
              target: buttonEntityIds[0],
            };
          }
        }

        // Fallback: Try to find rooms from vacuum attributes (Dreame, Xiaomi Miot)
        const rooms = parseVacuumRooms(attributes);

        // Convert area IDs back to room IDs
        // Use originalId if available (Dreame multi-floor: id is deduplicated, originalId is per-floor)
        const roomIds: (string | number)[] = [];
        for (const areaId of selectedAreas) {
          const room = rooms.find((r) => toAreaId(r.id) === areaId);
          if (room) {
            roomIds.push(room.originalId ?? room.id);
          }
        }

        if (roomIds.length > 0) {
          logger.info(
            `Starting cleaning with selected areas: ${roomIds.join(", ")}`,
          );

          // Clear selected areas after use
          serviceArea.state.selectedAreas = [];

          // Dreame vacuums use their own service
          if (isDreameVacuum(attributes)) {
            return {
              action: "dreame_vacuum.vacuum_clean_segment",
              data: {
                segments: roomIds.length === 1 ? roomIds[0] : roomIds,
              },
            };
          }

          // Roborock/Xiaomi Miot vacuums use vacuum.send_command with app_segment_clean
          if (isRoborockVacuum(attributes) || isXiaomiMiotVacuum(attributes)) {
            return {
              action: "vacuum.send_command",
              data: {
                command: "app_segment_clean",
                params: roomIds,
              },
            };
          }

          // Ecovacs/Deebot vacuums use vacuum.send_command with spot_area
          // Params must be a dict (not a list) with comma-separated room IDs as string
          if (isEcovacsVacuum(attributes)) {
            const roomIdStr = roomIds.join(",");
            logger.info(
              `Ecovacs vacuum: Using spot_area for rooms: ${roomIdStr}`,
            );
            return {
              action: "vacuum.send_command",
              data: {
                command: "spot_area",
                params: {
                  mapID: 0,
                  cleanings: 1,
                  rooms: roomIdStr,
                },
              },
            };
          }

          // Unknown vacuum type - fall back to regular start.
          // app_segment_clean is Roborock-specific and will fail on other
          // integrations (e.g. Ecovacs/Deebot rejects list params).
          logger.warn(
            `Room cleaning via send_command not supported for this vacuum type. Rooms: ${roomIds.join(", ")}. Falling back to vacuum.start`,
          );
        }
      }
    } catch {
      // ServiceArea not available, fall through to regular start
    }

    logger.info("Starting regular cleaning (no areas selected)");
    return { action: "vacuum.start" };
  },
  returnToBase: () => ({ action: "vacuum.return_to_base" }),
  pause: (
    // biome-ignore lint/suspicious/noConfusingVoidType: Required by ValueSetter<void> interface
    _: void,
    agent: {
      get: (
        type: typeof HomeAssistantEntityBehavior,
      ) => HomeAssistantEntityBehavior;
    },
  ) => {
    const supportedFeatures =
      agent.get(HomeAssistantEntityBehavior).entity.state.attributes
        .supported_features ?? 0;
    if (testBit(supportedFeatures, VacuumDeviceFeature.PAUSE)) {
      return { action: "vacuum.pause" };
    }
    return { action: "vacuum.stop" };
  },

  cleanRoom: (
    roomMode: number,
    agent: {
      get: (
        type: typeof HomeAssistantEntityBehavior,
      ) => HomeAssistantEntityBehavior;
    },
  ) => {
    const entity = agent.get(HomeAssistantEntityBehavior).entity;
    const attributes = entity.state.attributes as VacuumDeviceAttributes;
    const rooms = parseVacuumRooms(attributes);
    const numericIdFromMode = getRoomIdFromMode(roomMode);

    logger.info(
      `cleanRoom called: roomMode=${roomMode}, numericIdFromMode=${numericIdFromMode}`,
    );
    logger.info(
      `Available rooms: ${JSON.stringify(rooms.map((r) => ({ id: r.id, name: r.name, modeValue: getRoomModeValue(r) })))}`,
    );

    // Find the room by matching mode value (ensures consistency)
    const room = rooms.find((r) => getRoomModeValue(r) === roomMode);

    logger.info(
      `Found room by mode match: ${room ? `${room.name} (id=${room.id})` : "none"}`,
    );

    if (room) {
      // Use originalId for commands (Dreame multi-floor: id is deduplicated, originalId is per-floor)
      const commandId = room.originalId ?? room.id;

      // Dreame vacuums use their own service: dreame_vacuum.vacuum_clean_segment
      if (isDreameVacuum(attributes)) {
        logger.debug(
          `Dreame vacuum detected, using dreame_vacuum.vacuum_clean_segment for room ${room.name} (commandId: ${commandId}, id: ${room.id})`,
        );
        return {
          action: "dreame_vacuum.vacuum_clean_segment",
          data: {
            segments: commandId,
          },
        };
      }

      // Roborock/Xiaomi Miot vacuums use vacuum.send_command with app_segment_clean
      if (isRoborockVacuum(attributes) || isXiaomiMiotVacuum(attributes)) {
        logger.debug(
          `Using vacuum.send_command with app_segment_clean for room ${room.name} (commandId: ${commandId}, id: ${room.id})`,
        );
        return {
          action: "vacuum.send_command",
          data: {
            command: "app_segment_clean",
            params: [commandId],
          },
        };
      }

      // Ecovacs/Deebot vacuums use vacuum.send_command with spot_area
      if (isEcovacsVacuum(attributes)) {
        const roomIdStr = String(commandId);
        logger.info(
          `Ecovacs vacuum: Using spot_area for room ${room.name} (id: ${roomIdStr})`,
        );
        return {
          action: "vacuum.send_command",
          data: {
            command: "spot_area",
            params: {
              mapID: 0,
              cleanings: 1,
              rooms: roomIdStr,
            },
          },
        };
      }

      // Unknown vacuum type - fall back to regular start
      logger.warn(
        `Room cleaning via send_command not supported for this vacuum type. Room: ${room.name} (id=${commandId}). Falling back to vacuum.start`,
      );
    }
    return { action: "vacuum.start" };
  },
};

/**
 * Create a VacuumRvcRunModeServer with initial supportedModes.
 * The modes MUST be provided at creation time for Matter.js initialization.
 *
 * @param attributes - Vacuum device attributes
 * @param includeUnnamedRooms - If true, includes rooms with generic names like "Room 7". Default: false
 */
export function createVacuumRvcRunModeServer(
  attributes: VacuumDeviceAttributes,
  includeUnnamedRooms = false,
) {
  // Get all rooms first for logging
  const allRooms = parseVacuumRooms(attributes, true);
  const rooms = includeUnnamedRooms
    ? allRooms
    : parseVacuumRooms(attributes, false);
  const filteredCount = allRooms.length - rooms.length;

  const supportedModes = buildSupportedModes(attributes, includeUnnamedRooms);

  logger.info(
    `Creating VacuumRvcRunModeServer with ${rooms.length} rooms, ${supportedModes.length} total modes`,
  );
  if (rooms.length > 0) {
    logger.info(`Rooms found: ${rooms.map((r) => r.name).join(", ")}`);
  }
  if (filteredCount > 0) {
    const filtered = allRooms.filter((r) => !rooms.some((x) => x.id === r.id));
    logger.info(
      `Filtered out ${filteredCount} unnamed room(s): ${filtered.map((r) => r.name).join(", ")}`,
    );
  }
  if (allRooms.length === 0) {
    logger.debug(
      `No rooms found. Attributes: rooms=${JSON.stringify(attributes.rooms)}, segments=${JSON.stringify(attributes.segments)}, room_list=${attributes.room_list}`,
    );
  }

  return RvcRunModeServer(vacuumRvcRunModeConfig, {
    supportedModes,
    currentMode: RvcSupportedRunMode.Idle,
  });
}

/** @deprecated Use createVacuumRvcRunModeServer instead */
export const VacuumRvcRunModeServer = RvcRunModeServer(vacuumRvcRunModeConfig);
