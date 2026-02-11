import { createHash } from "node:crypto";
import type {
  HomeAssistantDeviceRegistry,
  HomeAssistantEntityRegistry,
  HomeAssistantEntityState,
} from "@home-assistant-matter-hub/common";
import { getStates } from "home-assistant-js-websocket";
import { fromPairs, keyBy, keys, uniq, values } from "lodash-es";
import { Service } from "../../core/ioc/service.js";
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

export type HomeAssistantDevices = Record<string, HomeAssistantDeviceRegistry>;
export type HomeAssistantEntities = Record<string, HomeAssistantEntityRegistry>;
export type HomeAssistantStates = Record<string, HomeAssistantEntityState>;
export type HomeAssistantLabels = HomeAssistantLabel[];
export type HomeAssistantAreas = Map<string, string>;

export class HomeAssistantRegistry extends Service {
  private autoRefresh?: NodeJS.Timeout;

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

  enableAutoRefresh(onRefresh: () => void) {
    this.disableAutoRefresh();

    this.autoRefresh = setInterval(async () => {
      await this.reload();
      onRefresh();
    }, this.options.refreshInterval * 1000);
  }

  disableAutoRefresh() {
    if (this.autoRefresh != null) {
      clearInterval(this.autoRefresh);
    }
    this.autoRefresh = undefined;
  }

  private async reload() {
    const connection = this.client.connection;
    const entityRegistry = await getRegistry(connection);
    entityRegistry.forEach((e) => {
      e.device_id = e.device_id ?? mockDeviceId(e.entity_id);
    });
    const entities = keyBy(entityRegistry, "entity_id");
    const states: HomeAssistantStates = keyBy(
      await getStates(connection),
      "entity_id",
    );

    const entityIds = uniq(keys(entities).concat(keys(states)));
    const allEntities = keyBy(
      entityIds.map((id) => entities[id] ?? { entity_id: id, device_id: id }),
      "entity_id",
    );
    const deviceIds = values(allEntities).map(
      (e) => e.device_id ?? e.entity_id,
    );

    const realDevices = keyBy(await getDeviceRegistry(connection), "id");
    const missingDeviceIds = uniq(deviceIds.filter((d) => !realDevices[d]));
    const missingDevices: Record<string, HomeAssistantDeviceRegistry> =
      fromPairs(missingDeviceIds.map((d) => [d, { id: d }]));

    this._devices = { ...missingDevices, ...realDevices };
    // Use allEntities to include state-only entities (e.g., YAML scripts)
    // that don't have entity registry entries but still need to be filterable
    this._entities = allEntities;
    this._states = states;

    // Fetch labels registry for UI autocomplete
    try {
      this._labels = await getLabelRegistry(connection);
    } catch {
      // Label registry might not be available in older HA versions
      this._labels = [];
    }

    // Fetch area registry for automatic room assignment via FixedLabel cluster
    try {
      const areaRegistry = await getAreaRegistry(connection);
      this._areas = new Map(areaRegistry.map((a) => [a.area_id, a.name]));
    } catch {
      // Area registry might not be available in older HA versions
      this._areas = new Map();
    }
  }
}

function mockDeviceId(entityId: string) {
  const hash = createHash("sha256")
    .update(entityId)
    .digest("hex")
    .substring(0, 29);
  return `e__${hash}`;
}
