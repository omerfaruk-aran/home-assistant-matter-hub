import { Endpoint } from "@matter/main";
import type { EndpointType } from "@matter/main/node";
import type { HomeAssistantStates } from "../../services/home-assistant/home-assistant-registry.js";

export abstract class EntityEndpoint extends Endpoint {
  protected constructor(
    type: EndpointType,
    readonly entityId: string,
    customName?: string,
  ) {
    super(type, { id: createEndpointId(entityId, customName) });
  }

  abstract updateStates(states: HomeAssistantStates): Promise<void>;

  /**
   * Force a subscription keepalive by re-writing current cluster attributes.
   * Override in subclasses to push specific attributes with force: true,
   * ensuring subscription reports are generated even when state is unchanged.
   * This works around Apple Home ignoring empty keepalive reports.
   */
  async forceKeepalive(): Promise<void> {
    // Default: no-op. Subclasses override with cluster-specific writes.
  }
}

function createEndpointId(entityId: string, customName?: string): string {
  const baseName = customName || entityId;
  return baseName.replace(/\./g, "_").replace(/\s+/g, "_");
}
