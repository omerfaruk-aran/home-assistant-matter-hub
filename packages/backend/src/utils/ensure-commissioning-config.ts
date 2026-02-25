import type { ServerNode } from "@matter/main/node";
import { CommissioningConfigProvider } from "@matter/main/protocol";
import type { CommissioningOptions } from "@matter/main/types";

/**
 * Workaround for matter.js 0.16.10 bug:
 * CommissioningServer.#enterOfflineMode() deletes CommissioningConfigProvider
 * from the environment, but initialize() only runs once (at construction).
 * On cancel() + start() of an uncommissioned node, enterCommissionableMode()
 * fails with "Required dependency CommissioningConfigProvider is not available".
 *
 * This re-registers the provider before start() if it was deleted during offline.
 * See: https://github.com/RiDDiX/home-assistant-matter-hub/issues/210
 */
class ServerNodeConfigProvider extends CommissioningConfigProvider {
  readonly #node: ServerNode;

  constructor(node: ServerNode) {
    super();
    this.#node = node;
  }

  override get values(): CommissioningOptions.Configuration {
    const { commissioning, productDescription, network } = this.#node.state;
    return {
      ...commissioning,
      productDescription,
      ble: !!network.ble,
    } as CommissioningOptions.Configuration;
  }
}

export function ensureCommissioningConfig(server: ServerNode): void {
  if (!server.env.has(CommissioningConfigProvider)) {
    server.env.set(
      CommissioningConfigProvider,
      new ServerNodeConfigProvider(server),
    );
  }
}
