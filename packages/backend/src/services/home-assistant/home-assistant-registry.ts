import { createHash } from "node:crypto";
import type {
  HomeAssistantDeviceRegistry,
  HomeAssistantEntityRegistry,
  HomeAssistantEntityState,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import { getStates } from "home-assistant-js-websocket";
import { fromPairs, keyBy, keys, uniq, values } from "lodash-es";
import { Service } from "../../core/ioc/service.js";
import { logMemoryUsage } from "../../utils/log-memory.js";
import { withRetry } from "../../utils/retry.js";
import {
  getAreaRegistry,
  getDeviceRegistry,
  getLabelRegistry,
  getRegistry,
  type HomeAssistantLabel,
} from "./api/get-registry.js";
import type {
  HomeAssistantClient,
  HomeAssistantClientProps,
} from "./home-assistant-client.js";

const logger = Logger.get("HomeAssistantRegistry");

export type HomeAssistantDevices = Record<string, HomeAssistantDeviceRegistry>;
export type HomeAssistantEntities = Record<string, HomeAssistantEntityRegistry>;
export type HomeAssistantStates = Record<string, HomeAssistantEntityState>;
export type HomeAssistantLabels = HomeAssistantLabel[];
export type HomeAssistantAreas = Map<string, string>;

export class HomeAssistantRegistry extends Service {
  private autoRefresh?: NodeJS.Timeout;
  private lastRegistryFingerprint = "";

  private _devices: HomeAssistantDevices = {};
  get devices() {
    return this._devices;
  }

  private _entities: HomeAssistantEntities = {};
  get entities() {
    return this._entities;
  }

  private _states: HomeAssistantStates = {};
  get states() {
    return this._states;
  }

  private _labels: HomeAssistantLabels = [];
  get labels() {
    return this._labels;
  }

  private _areas: HomeAssistantAreas = new Map();
  get areas() {
    return this._areas;
  }

  constructor(
    private readonly client: HomeAssistantClient,
    private readonly options: HomeAssistantClientProps,
  ) {
    super("HomeAssistantRegistry");
  }

  protected override async initialize(): Promise<void> {
    await this.reload();
  }

  override async dispose(): Promise<void> {
    this.disableAutoRefresh();
  }

  enableAutoRefresh(onRefresh: () => Promise<void> | void) {
    this.disableAutoRefresh();

    this.autoRefresh = setInterval(async () => {
      try {
        const changed = await this.reload();
        if (changed) {
          await onRefresh();
        }
      } catch (e) {
        logger.warn("Failed to refresh registry, will retry next interval:", e);
      }
    }, this.options.refreshInterval * 1000);
  }

  disableAutoRefresh() {
    if (this.autoRefresh != null) {
      clearInterval(this.autoRefresh);
    }
    this.autoRefresh = undefined;
  }

  async reload(): Promise<boolean> {
    return await withRetry(() => this.fetchRegistries(), {
      maxAttempts: 5,
      baseDelayMs: 2000,
      maxDelayMs: 15000,
      onRetry: (attempt, error, delayMs) => {
        logger.warn(
          `Registry fetch failed (attempt ${attempt}), retrying in ${delayMs}ms:`,
          error,
        );
      },
    });
  }

  private async fetchRegistries(): Promise<boolean> {
    const connection = this.client.connection;
    const entityRegistry = await getRegistry(connection);
    const statesList = await getStates(connection);
    const deviceRegistry = await getDeviceRegistry(connection);

    let labels: HomeAssistantLabel[] = [];
    try {
      labels = await getLabelRegistry(connection);
    } catch {
      // Label registry might not be available in older HA versions
    }

    let areas: Array<{ area_id: string; name: string }> = [];
    try {
      areas = await getAreaRegistry(connection);
    } catch {
      // Area registry might not be available in older HA versions
    }

    // Fingerprint structural registry data to detect changes.
    // State *values* change constantly (handled by WebSocket subscription);
    // we only check if entity/device/state IDs or key attributes changed.
    const hash = createHash("md5");
    for (const e of entityRegistry) {
      hash.update(
        `${e.entity_id}\0${e.device_id ?? ""}\0${e.disabled_by ?? ""}\0${e.hidden_by ?? ""}\0${e.area_id ?? ""}\0${(e.labels ?? []).join(",")}\n`,
      );
    }
    for (const s of statesList) hash.update(`${s.entity_id}\n`);
    for (const d of deviceRegistry) hash.update(`${d.id}\n`);
    for (const l of labels) hash.update(`${l.label_id}\n`);
    for (const a of areas) hash.update(`${a.area_id}\0${a.name}\n`);
    const fingerprint = hash.digest("hex");

    // Always update states (values change via WebSocket, but fresh data
    // is needed for the UI and initial endpoint state)
    this._states = keyBy(statesList, "entity_id");

    if (fingerprint === this.lastRegistryFingerprint) {
      logger.debug("Registry unchanged, skipping full refresh");
      return false;
    }
    this.lastRegistryFingerprint = fingerprint;

    // Structure changed — full rebuild
    entityRegistry.forEach((e) => {
      e.device_id = e.device_id ?? mockDeviceId(e.entity_id);
    });
    const entities = keyBy(entityRegistry, "entity_id");

    const entityIds = uniq(keys(entities).concat(keys(this._states)));
    const allEntities = keyBy(
      entityIds.map((id) => entities[id] ?? { entity_id: id, device_id: id }),
      "entity_id",
    );
    const deviceIdsList = values(allEntities).map(
      (e) => e.device_id ?? e.entity_id,
    );

    const realDevices = keyBy(deviceRegistry, "id");
    const missingDeviceIds = uniq(deviceIdsList.filter((d) => !realDevices[d]));
    const missingDevices: Record<string, HomeAssistantDeviceRegistry> =
      fromPairs(missingDeviceIds.map((d) => [d, { id: d }]));

    this._devices = { ...missingDevices, ...realDevices };
    // Use allEntities to include state-only entities (e.g., YAML scripts)
    // that don't have entity registry entries but still need to be filterable
    this._entities = allEntities;

    logger.debug(
      `Loaded HA registry: ${keys(allEntities).length} entities, ${keys(realDevices).length} devices, ${keys(this._states).length} states`,
    );
    logMemoryUsage(logger, "after HA registry load");

    this._labels = labels;
    this._areas = new Map(areas.map((a) => [a.area_id, a.name]));

    return true;
  }
}

function mockDeviceId(entityId: string) {
  const hash = createHash("sha256")
    .update(entityId)
    .digest("hex")
    .substring(0, 29);
  return `e__${hash}`;
}
