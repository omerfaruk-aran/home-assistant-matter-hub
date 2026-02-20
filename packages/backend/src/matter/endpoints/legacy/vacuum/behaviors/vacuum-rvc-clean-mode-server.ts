import type { VacuumDeviceAttributes } from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import type { Agent } from "@matter/main";
import { RvcCleanMode } from "@matter/main/clusters";
import { EntityStateProvider } from "../../../../../services/bridges/entity-state-provider.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";
import {
  RvcCleanModeServer,
  type RvcCleanModeServerInitialState,
} from "../../../../behaviors/rvc-clean-mode-server.js";
import {
  isDreameVacuum,
  isEcovacsVacuum,
} from "../utils/parse-vacuum-rooms.js";

const logger = Logger.get("VacuumRvcCleanModeServer");

// ---------------------------------------------------------------------------
// Mode IDs — flat structure matching the pattern Apple Home expects.
// Cleaning-type modes and fan-speed modes are siblings, NOT cross-products.
// Apple Home groups modes by their tags:
//   • Cleaning types (Vacuum / Mop / Vacuum+Mop / VacuumThenMop) appear
//     in the main mode selector.
//   • Fan-speed modes that share the Vacuum tag but add Quiet / Max
//     appear in the "extra features" panel.
// ---------------------------------------------------------------------------

const MODE_VACUUM = 0;
const MODE_VACUUM_AND_MOP = 1;
const MODE_MOP = 2;
const MODE_VACUUM_THEN_MOP = 6;

/** Base mode value for dynamically generated fan speed modes */
const FAN_SPEED_MODE_BASE = 10;

/** Check if a mode value represents a fan speed mode */
function isFanSpeedMode(mode: number): boolean {
  return mode >= FAN_SPEED_MODE_BASE;
}

enum CleanType {
  Sweeping = 0,
  Mopping = 1,
  SweepingAndMopping = 2,
  MoppingAfterSweeping = 3,
}

// ---------------------------------------------------------------------------
// Supported mode lists
// ---------------------------------------------------------------------------

function buildSupportedModes(
  fanSpeedList?: string[],
): RvcCleanMode.ModeOption[] {
  const modes: RvcCleanMode.ModeOption[] = [
    {
      label: "Vacuum",
      mode: MODE_VACUUM,
      modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }],
    },
    {
      label: "Vacuum & Mop",
      mode: MODE_VACUUM_AND_MOP,
      modeTags: [
        { value: RvcCleanMode.ModeTag.Vacuum },
        { value: RvcCleanMode.ModeTag.Mop },
      ],
    },
    {
      label: "Mop",
      mode: MODE_MOP,
      modeTags: [{ value: RvcCleanMode.ModeTag.Mop }],
    },
  ];

  // Fan-speed modes are generated dynamically from fan_speed_list.
  // Apple Home shows them as "extra features" when the Vacuum cleaning
  // type is active (they share the Vacuum tag with an intensity tag).
  if (fanSpeedList && fanSpeedList.length > 0) {
    modes.push(...buildFanSpeedModes(fanSpeedList));
  }

  // VacuumThenMop always last — uses DeepClean + Vacuum + Mop tags
  modes.push({
    label: "Vacuum Then Mop",
    mode: MODE_VACUUM_THEN_MOP,
    modeTags: [
      { value: RvcCleanMode.ModeTag.DeepClean },
      { value: RvcCleanMode.ModeTag.Vacuum },
      { value: RvcCleanMode.ModeTag.Mop },
    ],
  });

  return modes;
}

// ---------------------------------------------------------------------------
// Cleaning mode aliases (HA select entity option names → our CleanType)
// ---------------------------------------------------------------------------

const CLEANING_MODE_ALIASES: Record<CleanType, string[]> = {
  [CleanType.Sweeping]: [
    "Sweeping",
    "Vacuum",
    "Vacuuming",
    "Sweep",
    "vacuum",
    "sweeping",
  ],
  [CleanType.Mopping]: ["Mopping", "Mop", "mopping", "mop", "wet_mop"],
  [CleanType.SweepingAndMopping]: [
    "Sweeping and mopping",
    "Vacuum and mop",
    "Vacuum & Mop",
    "Vacuum & mop",
    "vacuum_and_mop",
    "sweeping_and_mopping",
  ],
  [CleanType.MoppingAfterSweeping]: [
    "Mopping after sweeping",
    "mopping_after_sweeping",
    "Vacuum then mop",
    "Mop after vacuum",
    "vacuum_then_mop",
    "mop_after_vacuum",
  ],
};

const CLEAN_TYPE_LABELS: Record<CleanType, string> = {
  [CleanType.Sweeping]: "Sweeping",
  [CleanType.Mopping]: "Mopping",
  [CleanType.SweepingAndMopping]: "Sweeping and mopping",
  [CleanType.MoppingAfterSweeping]: "Mopping after sweeping",
};

// ---------------------------------------------------------------------------
// Fan speed tag patterns (regex-based, manufacturer-agnostic)
// ---------------------------------------------------------------------------
// Each pattern matches the FULL fan_speed_list entry (anchored with ^ $).
// Compound names like "max_plus" deliberately do NOT match — they become
// their own untagged mode so Apple Home shows them separately.

const FAN_TAG_PATTERNS: Array<{ pattern: RegExp; tag: number }> = [
  {
    pattern: /^(quiet|silent|low|eco|gentle|min|leise)$/i,
    tag: RvcCleanMode.ModeTag.Quiet,
  },
  {
    pattern: /^(normal|standard|medium|auto|balanced|default|mittel)$/i,
    tag: RvcCleanMode.ModeTag.Auto,
  },
  {
    pattern: /^(turbo|max|strong|boost|power|high|full|stark)$/i,
    tag: RvcCleanMode.ModeTag.Max,
  },
];

function getFanSpeedTag(name: string): number | undefined {
  const s = name.toLowerCase().trim();
  for (const { pattern, tag } of FAN_TAG_PATTERNS) {
    if (pattern.test(s)) return tag;
  }
  return undefined;
}

function formatFanSpeedLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildFanSpeedModes(fanSpeedList: string[]): RvcCleanMode.ModeOption[] {
  return fanSpeedList.map((name, index) => {
    const tag = getFanSpeedTag(name);
    const modeTags: { value: number }[] = [
      { value: RvcCleanMode.ModeTag.Vacuum },
    ];
    if (tag !== undefined) {
      modeTags.push({ value: tag });
    }
    return {
      label: formatFanSpeedLabel(name),
      mode: FAN_SPEED_MODE_BASE + index,
      modeTags,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCleanType(modeString: string | undefined): CleanType {
  if (!modeString) return CleanType.Sweeping;
  const s = modeString.toLowerCase();
  if (s.includes("mopping after") || s.includes("after sweeping")) {
    return CleanType.MoppingAfterSweeping;
  }
  if (s.includes("and") || s.includes("sweeping and mopping")) {
    return CleanType.SweepingAndMopping;
  }
  if (s === "mopping" || s.includes("mop")) {
    return CleanType.Mopping;
  }
  return CleanType.Sweeping;
}

function cleanTypeToModeId(ct: CleanType): number {
  switch (ct) {
    case CleanType.Sweeping:
      return MODE_VACUUM;
    case CleanType.Mopping:
      return MODE_MOP;
    case CleanType.SweepingAndMopping:
      return MODE_VACUUM_AND_MOP;
    case CleanType.MoppingAfterSweeping:
      return MODE_VACUUM_THEN_MOP;
  }
}

function modeIdToCleanType(mode: number): CleanType {
  switch (mode) {
    case MODE_MOP:
      return CleanType.Mopping;
    case MODE_VACUUM_AND_MOP:
      return CleanType.SweepingAndMopping;
    case MODE_VACUUM_THEN_MOP:
      return CleanType.MoppingAfterSweeping;
    default:
      return CleanType.Sweeping;
  }
}

function fanSpeedToModeId(
  speed: string | undefined,
  fanSpeedList: string[],
): number | undefined {
  if (!speed) return undefined;
  const s = speed.toLowerCase();
  // Exact match
  const exactIndex = fanSpeedList.findIndex((f) => f.toLowerCase() === s);
  if (exactIndex >= 0) return FAN_SPEED_MODE_BASE + exactIndex;
  // Contains match
  const containsIndex = fanSpeedList.findIndex(
    (f) => s.includes(f.toLowerCase()) || f.toLowerCase().includes(s),
  );
  if (containsIndex >= 0) return FAN_SPEED_MODE_BASE + containsIndex;
  return undefined;
}

function findMatchingCleanOption(
  ct: CleanType,
  availableOptions: string[] | undefined,
): string {
  const aliases = CLEANING_MODE_ALIASES[ct];
  if (!availableOptions || availableOptions.length === 0) return aliases[0];

  for (const alias of aliases) {
    const match = availableOptions.find(
      (o) => o.toLowerCase() === alias.toLowerCase(),
    );
    if (match) return match;
  }
  for (const alias of aliases) {
    const match = availableOptions.find((o) =>
      o.toLowerCase().includes(alias.toLowerCase()),
    );
    if (match) return match;
  }
  logger.warn(
    `No match for ${CLEAN_TYPE_LABELS[ct]} in [${availableOptions.join(", ")}]`,
  );
  return aliases[0];
}

function matchFanSpeedOption(
  name: string,
  availableOptions: string[] | undefined,
): string | undefined {
  if (!availableOptions || availableOptions.length === 0) return undefined;
  const s = name.toLowerCase();
  // Exact match
  const exact = availableOptions.find((o) => o.toLowerCase() === s);
  if (exact) return exact;
  // Contains match
  const contains = availableOptions.find(
    (o) => o.toLowerCase().includes(s) || s.includes(o.toLowerCase()),
  );
  if (contains) return contains;
  // Alias match via tag category — find sibling names in the same group
  const tag = getFanSpeedTag(name);
  if (tag !== undefined) {
    const group = FAN_TAG_PATTERNS.find((p) => p.tag === tag);
    if (group) {
      const aliases = group.pattern.source
        .replace(/^\^\(|\)\$$/g, "")
        .split("|");
      for (const a of aliases) {
        const m = availableOptions.find(
          (o) => o.toLowerCase() === a || o.toLowerCase().includes(a),
        );
        if (m) return m;
      }
    }
  }
  return undefined;
}

/**
 * Derive the cleaning mode select entity ID from the vacuum entity ID.
 */
function deriveCleaningModeSelectEntity(vacuumEntityId: string): string {
  const vacuumName = vacuumEntityId.replace("vacuum.", "");
  return `select.${vacuumName}_cleaning_mode`;
}

function getCleaningModeSelectEntity(agent: Agent): string {
  const ha = agent.get(HomeAssistantEntityBehavior);
  const mapping = ha.state.mapping;
  if (mapping?.cleaningModeEntity) return mapping.cleaningModeEntity;
  return deriveCleaningModeSelectEntity(ha.entityId);
}

function readSelectEntity(
  entityId: string,
  agent: Agent,
): { state?: string; options?: string[] } {
  const stateProvider = agent.env.get(EntityStateProvider);
  const entityState = stateProvider.getState(entityId);
  if (!entityState) return {};
  const attrs = entityState.attributes as { options?: string[] } | undefined;
  return {
    state: entityState.state as string | undefined,
    options: attrs?.options,
  };
}

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

function createCleanModeConfig(fanSpeedList?: string[]) {
  return {
    getCurrentMode: (entity: { attributes: unknown }, agent: Agent): number => {
      const attributes = entity.attributes as VacuumDeviceAttributes & {
        cleaning_mode?: string;
      };

      // Determine cleaning type from select entity or vacuum attribute
      let cleanType: CleanType;
      if (attributes.cleaning_mode) {
        cleanType = parseCleanType(attributes.cleaning_mode);
      } else {
        const selectEntityId = getCleaningModeSelectEntity(agent);
        const { state } = readSelectEntity(selectEntityId, agent);
        cleanType = parseCleanType(state);
      }

      // Without fan speed, simply return the cleaning type mode
      if (!fanSpeedList || fanSpeedList.length === 0)
        return cleanTypeToModeId(cleanType);

      // With fan speed: if the cleaning type is vacuum (sweeping),
      // check the fan speed to pick the correct intensity mode.
      // Fan-speed modes only apply to Vacuum mode (matching Apple Home UX).
      if (cleanType === CleanType.Sweeping) {
        // Try suctionLevelEntity first, then vacuum fan_speed attribute
        const mapping = agent.get(HomeAssistantEntityBehavior).state.mapping;
        let speedState: string | undefined;

        if (mapping?.suctionLevelEntity) {
          const { state } = readSelectEntity(mapping.suctionLevelEntity, agent);
          speedState = state;
        } else {
          speedState =
            (attributes.fan_speed as string | undefined) ?? undefined;
        }

        const speedMode = fanSpeedToModeId(speedState, fanSpeedList);
        if (speedMode !== undefined) {
          logger.debug(
            `Current mode: Vacuum + fan_speed="${speedState}" -> mode ${speedMode}`,
          );
          return speedMode;
        }
      }

      return cleanTypeToModeId(cleanType);
    },

    getSupportedModes: () => buildSupportedModes(fanSpeedList),

    setCleanMode: (mode: number, agent: Agent) => {
      const homeAssistant = agent.get(HomeAssistantEntityBehavior);
      const vacuumEntityId = homeAssistant.entityId;

      // Fan-speed modes: set suction/fan speed, not cleaning type
      if (fanSpeedList && fanSpeedList.length > 0 && isFanSpeedMode(mode)) {
        const fanSpeedIndex = mode - FAN_SPEED_MODE_BASE;
        const fanSpeedName = fanSpeedList[fanSpeedIndex];
        if (!fanSpeedName) {
          logger.warn(`Invalid fan speed mode index: ${fanSpeedIndex}`);
          return undefined;
        }

        const mapping = homeAssistant.state.mapping;

        // Use suctionLevelEntity if configured
        if (mapping?.suctionLevelEntity) {
          const { options } = readSelectEntity(
            mapping.suctionLevelEntity,
            agent,
          );
          const option = matchFanSpeedOption(fanSpeedName, options);
          if (option) {
            logger.info(
              `Setting suction to: ${option} via ${mapping.suctionLevelEntity}`,
            );
            homeAssistant.callAction({
              action: "select.select_option",
              data: { option },
              target: mapping.suctionLevelEntity,
            });
          }
          return undefined;
        }

        // Otherwise use vacuum.set_fan_speed with the original name
        logger.info(
          `Setting fan speed to: ${fanSpeedName} via vacuum.set_fan_speed`,
        );
        return {
          action: "vacuum.set_fan_speed",
          data: { fan_speed: fanSpeedName },
          target: vacuumEntityId,
        };
      }

      // Cleaning-type modes: set the cleaning mode select entity
      const cleanType = modeIdToCleanType(mode);
      const selectEntityId = getCleaningModeSelectEntity(agent);
      const { options: availableOptions } = readSelectEntity(
        selectEntityId,
        agent,
      );
      const optionToUse = findMatchingCleanOption(cleanType, availableOptions);

      logger.info(
        `Setting cleaning mode to: ${optionToUse} (mode=${mode}) via ${selectEntityId}`,
      );

      return {
        action: "select.select_option",
        data: { option: optionToUse },
        target: selectEntityId,
      };
    },
  };
}

/**
 * Create a VacuumRvcCleanModeServer with cleaning modes.
 * Fan-speed modes are generated dynamically from the fanSpeedList.
 * Apple Home shows them as "extra features" in the vacuum control panel.
 */
export function createVacuumRvcCleanModeServer(
  _attributes: VacuumDeviceAttributes,
  fanSpeedList?: string[],
): ReturnType<typeof RvcCleanModeServer> {
  const supportedModes = buildSupportedModes(fanSpeedList);

  logger.info(
    `Creating VacuumRvcCleanModeServer with ${supportedModes.length} modes (fanSpeedList=${JSON.stringify(fanSpeedList ?? [])})`,
  );
  logger.info(
    `Modes: ${supportedModes.map((m) => `${m.mode}:${m.label}[${m.modeTags.map((t) => t.value).join(",")}]`).join(", ")}`,
  );

  const initialState: RvcCleanModeServerInitialState = {
    supportedModes,
    currentMode: MODE_VACUUM,
  };

  return RvcCleanModeServer(createCleanModeConfig(fanSpeedList), initialState);
}

/**
 * Create a default RvcCleanMode server with a single "Vacuum" mode.
 * Used for vacuums that don't support multiple cleaning modes
 * (e.g. Roborock via Xiaomi integration, iRobot Roomba, etc.).
 *
 * Alexa probes for RvcCleanMode (0x55) during device discovery.
 * Without it, Alexa may fail to complete CASE session establishment
 * and never subscribe, leaving the vacuum undiscoverable.
 */
export function createDefaultRvcCleanModeServer(): ReturnType<
  typeof RvcCleanModeServer
> {
  const defaultConfig = {
    getCurrentMode: () => 0,
    getSupportedModes: (): RvcCleanMode.ModeOption[] => [
      {
        label: "Vacuum",
        mode: 0,
        modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }],
      },
    ],
    setCleanMode: () => undefined,
  };

  return RvcCleanModeServer(defaultConfig);
}

/**
 * Check if vacuum supports cleaning modes.
 * Dreame and Ecovacs vacuums typically support vacuum/mop/both modes
 * via a separate select entity (e.g., select.vacuum_cleaning_mode).
 */
export function supportsCleaningModes(
  attributes: VacuumDeviceAttributes,
): boolean {
  return isDreameVacuum(attributes) || isEcovacsVacuum(attributes);
}

/**
 * Check if vacuum has fan speed options available.
 * Used to auto-detect fan speed support without requiring manual
 * suctionLevelEntity configuration.
 */
export function hasFanSpeedSupport(
  attributes: VacuumDeviceAttributes,
): boolean {
  return !!attributes.fan_speed_list && attributes.fan_speed_list.length > 1;
}

/**
 * Resolve the fan speed list for vacuum clean mode generation.
 * Uses fan_speed_list from vacuum attributes when available,
 * falls back to generic speeds when suctionLevelEntity is configured.
 */
export function resolveFanSpeedList(
  attributes: VacuumDeviceAttributes,
  suctionLevelEntity?: string,
): string[] | undefined {
  if (attributes.fan_speed_list && attributes.fan_speed_list.length > 1) {
    return attributes.fan_speed_list;
  }
  if (suctionLevelEntity) {
    return ["quiet", "standard", "strong"];
  }
  return undefined;
}
