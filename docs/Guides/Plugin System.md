# Plugin System

Home Assistant Matter Hub supports plugins that register additional Matter devices on the bridge. Plugins can provide virtual devices or integrate third-party services.

## Installing a Plugin

### From npm

1. Open the **Plugins** page in the HAMH web UI
2. Enter the npm package name (e.g., `hamh-plugin-example`)
3. Click **Install**
4. Restart the bridge to load the plugin

### From a local `.tgz` file

Upload a packaged plugin via the API:

```bash
curl -X POST http://localhost:8482/api/plugins/upload \
  -H "Content-Type: application/octet-stream" \
  --data-binary @hamh-plugin-example-1.0.0.tgz
```

### From a local folder (development)

Link a local plugin directory:

```bash
curl -X POST http://localhost:8482/api/plugins/install-local \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/your/plugin"}'
```

This creates a symlink, so changes to your plugin source apply on bridge restart.

## Writing a Plugin

A plugin is an npm package that exports a class implementing the `MatterHubPlugin` interface.

### Minimal Structure

```
my-plugin/
  package.json
  index.js
```

**package.json:**

```json
{
  "name": "hamh-plugin-my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module"
}
```

**index.js:**

```javascript
export default class MyPlugin {
  readonly name = "hamh-plugin-my-plugin";
  readonly version = "1.0.0";

  async onStart(context) {
    await context.registerDevice({
      id: "my-device-1",
      name: "My Device",
      deviceType: "temperature_sensor",
      clusters: [
        {
          clusterId: "temperatureMeasurement",
          attributes: { measuredValue: 2150 },
        },
      ],
    });
  }

  async onShutdown() {
    // Clean up timers, connections, etc.
  }
}
```

### Plugin Lifecycle

| Hook | When | Purpose |
|------|------|---------|
| `onStart(context)` | Bridge starts | Register devices, set up connections |
| `onConfigure()` | After all devices registered | Restore persistent state |
| `onShutdown(reason?)` | Bridge stops | Clean up resources |
| `getConfigSchema()` | On demand | Provide config UI schema |
| `onConfigChanged(config)` | User updates config | Apply new configuration |

### PluginContext API

The `context` object passed to `onStart` provides:

- **`registerDevice(device)`** — Register a Matter device on the bridge
- **`unregisterDevice(deviceId)`** — Remove a previously registered device
- **`updateDeviceState(deviceId, clusterId, attributes)`** — Push attribute updates to a device
- **`storage`** — Persistent key-value store (survives restarts)
- **`log`** — Scoped logger (`info`, `warn`, `error`, `debug`)
- **`bridgeId`** — ID of the bridge this plugin is attached to

### Supported Device Types

| Key | Matter Device |
|-----|--------------|
| `on_off_light` | On/Off Light (0x0100) |
| `dimmable_light` | Dimmable Light (0x0101) |
| `on_off_plugin_unit` | On/Off Plug-in Unit (0x010A) |
| `temperature_sensor` | Temperature Sensor (0x0302) |
| `humidity_sensor` | Humidity Sensor (0x0307) |
| `light_sensor` | Light Sensor (0x0106) |
| `occupancy_sensor` | Occupancy Sensor (0x0107) |
| `contact_sensor` | Contact Sensor (0x0015) |
| `thermostat` | Thermostat (0x0301) |
| `door_lock` | Door Lock (0x000A) |
| `fan` | Fan (0x002B) |

### Cluster IDs

Use Matter.js behavior key names as cluster IDs. Common ones:

| Cluster ID | Description |
|-----------|------------|
| `onOff` | On/Off state |
| `levelControl` | Brightness level |
| `colorControl` | Color (hue/saturation/temperature) |
| `temperatureMeasurement` | Temperature (in 0.01°C units) |
| `relativeHumidityMeasurement` | Relative humidity (in 0.01% units) |
| `booleanState` | Binary state (open/closed) |
| `occupancySensing` | Occupancy detection |
| `fanControl` | Fan speed and mode |
| `doorLock` | Lock state |

### Handling Controller Commands

When a Matter controller writes an attribute (e.g., turns a light on), your device's `onAttributeWrite` callback is called:

```typescript
await context.registerDevice({
  id: "my-light",
  name: "My Light",
  deviceType: "on_off_light",
  clusters: [
    { clusterId: "onOff", attributes: { onOff: false } },
  ],
  onAttributeWrite: async (clusterId, attribute, value) => {
    if (clusterId === "onOff" && attribute === "onOff") {
      console.log(`Light turned ${value ? "on" : "off"}`);
      // Forward to your actual hardware/service
    }
  },
});
```

### Persistent Storage

Use `context.storage` to persist data across restarts:

```typescript
// Save
await context.storage.set("lastState", { temperature: 21.5 });

// Restore
const saved = await context.storage.get("lastState");
```

### Plugin Config Schema

Plugins can provide a JSON-schema-like config for the UI:

```typescript
getConfigSchema() {
  return {
    title: "My Plugin Config",
    properties: {
      pollingInterval: { type: "number", title: "Polling Interval (ms)" },
      apiKey: { type: "string", title: "API Key" },
    },
  };
}

async onConfigChanged(config) {
  this.pollingInterval = config.pollingInterval ?? 30000;
}
```

## Error Handling

Plugins run in-process with a safety wrapper:

- **Timeout**: Each lifecycle call has a 10-second timeout
- **Circuit breaker**: 3 consecutive failures auto-disable the plugin
- **Recovery**: Use the **Reset** button in the Plugins UI to re-enable a disabled plugin

The bridge continues running even if a plugin fails.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Plugin not loading after install | Restart the bridge — plugins load on startup |
| "Circuit breaker tripped" | Check logs for the error, fix the issue, then click Reset |
| Device not appearing in controller | Verify `deviceType` is in the supported list above |
| Attribute updates ignored | Ensure `clusterId` matches a behavior key (e.g., `onOff`, not `OnOff`) |
| Plugin crashes on start | Check that `onStart` doesn't throw — wrap risky code in try/catch |

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plugins` | GET | List installed packages and active plugins per bridge |
| `/api/plugins/install` | POST | Install from npm (`{ packageName }`) |
| `/api/plugins/upload` | POST | Install from uploaded `.tgz` (binary body) |
| `/api/plugins/install-local` | POST | Link local folder (`{ path }`) |
| `/api/plugins/uninstall` | POST | Uninstall package (`{ packageName }`) |
| `/api/plugins/:bridgeId/:pluginName/enable` | POST | Enable a plugin |
| `/api/plugins/:bridgeId/:pluginName/disable` | POST | Disable a plugin |
| `/api/plugins/:bridgeId/:pluginName/reset` | POST | Reset circuit breaker |
| `/api/plugins/:bridgeId/:pluginName/config-schema` | GET | Get config schema |
| `/api/plugins/:bridgeId/:pluginName/config` | POST | Update config (`{ config }`) |
