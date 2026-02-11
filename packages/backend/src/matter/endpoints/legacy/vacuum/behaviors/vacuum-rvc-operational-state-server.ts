import {
  VacuumDeviceFeature,
  VacuumState,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import { RvcOperationalState } from "@matter/main/clusters";
import { testBit } from "../../../../../utils/test-bit.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import { RvcOperationalStateServer } from "../../../../behaviors/rvc-operational-state-server.js";

const logger = Logger.get("VacuumRvcOperationalStateServer");

export const VacuumRvcOperationalStateServer = RvcOperationalStateServer({
  getOperationalState(entity): RvcOperationalState.OperationalState {
    const state = entity.state as VacuumState | "unavailable";

    // All cleaning-related states should map to Running
    const cleaningStates: string[] = [
      VacuumState.cleaning,
      VacuumState.segment_cleaning,
      VacuumState.zone_cleaning,
      VacuumState.spot_cleaning,
      VacuumState.mop_cleaning,
    ];

    let operationalState: RvcOperationalState.OperationalState;

    if (state === VacuumState.docked) {
      operationalState = RvcOperationalState.OperationalState.Docked;
    } else if (state === VacuumState.returning) {
      operationalState = RvcOperationalState.OperationalState.SeekingCharger;
    } else if (cleaningStates.includes(state)) {
      operationalState = RvcOperationalState.OperationalState.Running;
    } else if (state === VacuumState.paused || state === VacuumState.idle) {
      operationalState = RvcOperationalState.OperationalState.Paused;
    } else if (state === "unavailable") {
      operationalState = RvcOperationalState.OperationalState.Error;
    } else {
      // Unknown state - log it and treat as Running if it contains "clean"
      if (state.toLowerCase().includes("clean")) {
        logger.info(
          `Unknown vacuum state "${state}" contains 'clean', treating as Running`,
        );
        operationalState = RvcOperationalState.OperationalState.Running;
      } else {
        logger.info(`Unknown vacuum state "${state}", treating as Paused`);
        operationalState = RvcOperationalState.OperationalState.Paused;
      }
    }

    logger.debug(
      `Vacuum operationalState: "${state}" -> ${RvcOperationalState.OperationalState[operationalState]}`,
    );
    return operationalState;
  },
  pause: (_, agent) => {
    const supportedFeatures =
      agent.get(HomeAssistantEntityBehavior).entity.state.attributes
        .supported_features ?? 0;
    if (testBit(supportedFeatures, VacuumDeviceFeature.PAUSE)) {
      return { action: "vacuum.pause" };
    }
    return { action: "vacuum.stop" };
  },
  resume: () => ({
    action: "vacuum.start",
  }),
  goHome: () => ({
    action: "vacuum.return_to_base",
  }),
});
