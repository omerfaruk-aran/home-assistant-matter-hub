import type {
  HomeAssistantAreaRegistry,
  HomeAssistantDeviceRegistry,
  HomeAssistantEntityRegistry,
} from "@home-assistant-matter-hub/common";
import type { Connection } from "home-assistant-js-websocket";

export async function getRegistry(
  connection: Connection,
): Promise<HomeAssistantEntityRegistry[]> {
  return await connection.sendMessagePromise<HomeAssistantEntityRegistry[]>({
    type: "config/entity_registry/list",
  });
}

export async function getDeviceRegistry(
  connection: Connection,
): Promise<HomeAssistantDeviceRegistry[]> {
  return connection.sendMessagePromise<HomeAssistantDeviceRegistry[]>({
    type: "config/device_registry/list",
  });
}

export interface HomeAssistantLabel {
  label_id: string;
  name: string;
  icon?: string;
  color?: string;
}

export async function getLabelRegistry(
  connection: Connection,
): Promise<HomeAssistantLabel[]> {
  return connection.sendMessagePromise<HomeAssistantLabel[]>({
    type: "config/label_registry/list",
  });
}

export async function getAreaRegistry(
  connection: Connection,
): Promise<HomeAssistantAreaRegistry[]> {
  return connection.sendMessagePromise<HomeAssistantAreaRegistry[]>({
    type: "config/area_registry/list",
  });
}
