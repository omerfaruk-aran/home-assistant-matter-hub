# Alpha Features Guide

This guide covers features available in the Alpha version of Home-Assistant-Matter-Hub.

> [!NOTE]
> **Alpha and Stable are currently in sync (v2.0.20).** All previously alpha-only features have been promoted to the stable release. New experimental features will appear here before being promoted.

> [!WARNING]
> Alpha versions are for testing only and may contain bugs. Use at your own risk!

## Installing the Alpha Version

### Home Assistant Add-on

1. Add the repository: `https://github.com/riddix/home-assistant-addons`
2. Install **Home-Assistant-Matter-Hub (Alpha)** from the Add-on Store
3. The Alpha add-on runs independently from the stable version

### Docker

Use the `alpha` tag instead of `latest`:

```bash
docker run -d \
  --name home-assistant-matter-hub-alpha \
  --network host \
  -v /path/to/data:/data \
  -e HAMH_HOME_ASSISTANT_URL=http://homeassistant.local:8123 \
  -e HAMH_HOME_ASSISTANT_ACCESS_TOKEN=your_token \
  ghcr.io/riddix/home-assistant-matter-hub:alpha
```

---

## Features Now in Stable (v2.0.20)

The following features have graduated from Alpha to Stable:

**New in v2.0.20:**
- **Bridge Templates / Presets** - 10 predefined bridge templates with auto-configured filters and feature flags
- **Enhanced Bridge Wizard** - 4-step flow: Template → Bridge Info → Entity Filter → Review & Create
- **Live Filter Preview** - Auto-refresh on filter changes with domain hints and contextual warnings
- **Entity Diagnostics** - Per-entity diagnostics panel showing HA state, attributes, and all mappings
- **Multi-Bridge Bulk Operations** - Start All, Stop All, Restart All, and bridge cloning
- **Entity Health Indicators** - Unavailable/unknown entities visually marked with filter toggle
- **Session/Subscription Info** - Health dashboard shows connectivity details per bridge
- **Diagnostic Export** - Export full diagnostic data as JSON for troubleshooting
- **Thermostat AutoMode Fix** - AutoMode only for devices with `heat_cool` (dual setpoint), fixes Apple Home mode flipping
- **Roborock Room Names** - Show friendly names instead of entity IDs (#106)
- **Ecovacs Cleaning Modes** - Auto-detect vacuum/mop/both support (#165)
- **Ecovacs Room Cleaning** - Native Deebot room cleaning via spot_area (#165)
- **Cover Fix** - Restore coverSwapOpenClose force inversion (#117)
- **Media Player TV Detection** - Auto-detect TV device_class (#162)
- **Subscription Stability** - Prevent Offline/Updating status (#103)
- **Orphan Detection** - Handle commissioned bridges without active sessions (#105)
- **Pressure Unit Conversion** - Fix auto-mapped pressure entities (#166)
- **Graceful Entity Unavailability** - Unavailable entities handled gracefully

**Previously promoted in v2.0.19:**
- EntityLabel & DeviceLabel Filters (#164)
- Filter Reference Page
- Power & Energy Measurement clusters
- Event Domain Support (GenericSwitch)
- device_class Filter
- Session Recovery Improvements (#105)
- Server Mode Auto-Battery (#112)

**Previously promoted (v2.0.17/v2.0.18):**
- **Automatic Room Assignment** - Entities auto-assigned to rooms based on HA areas using FixedLabel cluster
- **Thermostat Overhaul** - Feature variants (heat-only, cool-only, full HVAC), negative temps, hvac_action-based running state
- **Lock Unlatch/Unbolt** - Apple Home Unlatch button for locks with HA OPEN support
- **Auto Pressure Mapping** - Pressure sensors combined with temperature sensors automatically
- **Binary Sensor Fix** - running/plug/power mapped to OnOffSensor instead of ContactSensor
- **Vacuum Fixes** - Apple Home "Updating" fix, GoHome, OperationCompletion, deduplication
- **Cover Fix** - coverSwapOpenClose position display fix
- **Fan Oscillation Fix** - Proper rockSupport/windSupport defaults
- **Dead Session Recovery** - Auto force-close dead Alexa sessions
- **Water Heater Limits** - Correct min/max from HA entity
- **Memory Limit** - 512MB heap limit for low-resource devices
- **Crash Resilience** - Per-property error handling in applyPatchState
- **Network Map** - React Flow visualization in frontend
- **Mobile UI** - Responsive navigation with hamburger menu
- **Page Size Selector** - Configurable page size on All Devices page
- **Behavior Error Logging** - Enhanced diagnostic logging for "Behaviors have errors"
- **TVOC Sensor** - Manual entity mapping option for VOC sensors
- **Humidity Auto-Mapping Fix** - Standalone humidity endpoints preserved
- **Battery Search Fix** - Full HA registry search for related entities
- **Speaker Volume Fix** - Prevent LevelControlServer from overwriting volume
- **Alexa Brightness** - Brightness-reset workaround always active
- **Scene/Automation Reset** - Proper onOff true→false transition

---

## Current Alpha Features

### Auto Composed Devices (Master Toggle)

**Feature Flag:** `autoComposedDevices` (default: `false`)

A master toggle that automatically combines related Home Assistant entities from the same physical device into single Matter endpoints. When enabled, it activates all auto-mapping sub-features at once: battery, humidity, pressure, power, and energy mapping.

This eliminates the need to enable individual auto-mapping flags separately and provides a cleaner device experience in Matter controllers. For example, a Shelly Plug with power monitoring appears as one Matter device with `OnOff` + `ElectricalPowerMeasurement` + `ElectricalEnergyMeasurement` clusters instead of three separate endpoints.

#### How It Works

The feature operates in two phases during bridge initialization:

**Phase 1 — Entity Discovery** (`BridgeRegistry.preCalculateAutoAssignments`)

Before any Matter endpoints are created, the bridge registry scans the **full Home Assistant entity and device registry** (not just filtered bridge entities) to find related sensor entities that belong to the same HA device (`device_id`). It searches for:

| Sensor Type | HA Domain | device_class | Target Entity Domains |
|---|---|---|---|
| Battery | `sensor.*` | `battery` | All domains |
| Humidity | `sensor.*` | `humidity` | `sensor.temperature` |
| Pressure | `sensor.*` | `atmospheric_pressure` | `sensor.temperature` |
| Power | `sensor.*` | `power` | `switch`, `light` |
| Energy | `sensor.*` | `energy` | `switch`, `light` |

**Phase 2 — Endpoint Construction** (`LegacyEndpoint.create`)

When each Matter endpoint is created, the auto-mapping logic runs in a strict order:

1. **Skip check** — If this entity was already consumed as a sub-entity (e.g., a humidity sensor already merged into a temperature endpoint), it is skipped entirely. No duplicate Matter endpoint is created.

2. **Auto-assign in order** (only if `device_id` is present and no manual mapping exists):
   - **Humidity → Temperature sensor** — Adds `RelativeHumidityMeasurement` cluster
   - **Pressure → Temperature sensor** — Adds `PressureMeasurement` cluster
   - **Battery → Any entity** — Adds `PowerSource` cluster (done last so battery goes to the combined T+H sensor, not separately)
   - **Power → Switch/Light** — Adds `ElectricalPowerMeasurement` cluster
   - **Energy → Switch/Light** — Adds `ElectricalEnergyMeasurement` cluster

3. **Endpoint type resolution** — `createLegacyEndpointType()` receives the effective mapping (original + auto-assigned entities) and constructs the appropriate `EndpointType` with all required behaviors/clusters.

#### Implementation Details

**Flag Wiring** (`BridgeRegistry`)

Each sub-feature check (`isAutoBatteryMappingEnabled()`, `isAutoHumidityMappingEnabled()`, `isAutoPressureMappingEnabled()`) was extended to also check the master flag:

```typescript
isAutoBatteryMappingEnabled(): boolean {
  return (
    this.dataProvider.featureFlags?.autoBatteryMapping === true ||
    this.dataProvider.featureFlags?.autoComposedDevices === true
  );
}
```

Power and energy auto-mapping runs unconditionally for `switch`/`light` domains (no feature flag gate) because it only applies to domains where it's always beneficial.

**Entity Resolution** (`BridgeRegistry.findBatteryEntityForDevice`, etc.)

All `find*EntityForDevice()` methods search the **full HA registry** (`this.registry.entities`), not the filtered bridge entity list. This is critical because:
- A bridge filter might include `switch.shelly_plug` but exclude `sensor.shelly_plug_power`
- The power sensor must still be found and auto-assigned even though it's filtered out
- The auto-assigned entity is then consumed (marked as used) and won't create its own endpoint

**Duplicate Prevention**

Each auto-assigned entity is tracked in a Set (`_usedBatteryEntities`, `_usedHumidityEntities`, etc.). Before creating any endpoint, `LegacyEndpoint.create()` checks if the entity was already consumed. If so, it's skipped:

```typescript
if (
  registry.isAutoBatteryMappingEnabled() &&
  registry.isBatteryEntityUsed(entityId)
) {
  return; // Skip — already merged into another endpoint
}
```

**Matter Cluster Mapping**

The auto-assigned entities are passed as `effectiveMapping` fields to `createLegacyEndpointType()`, which adds the corresponding Matter server behaviors:

| Mapping Field | Matter Cluster | Server Behavior |
|---|---|---|
| `batteryEntity` | PowerSource (0x002F) | `PowerSourceServer` |
| `humidityEntity` | RelativeHumidityMeasurement (0x0405) | `HumidityMeasurementServer` |
| `pressureEntity` | PressureMeasurement (0x0403) | `PressureMeasurementServer` |
| `powerEntity` | ElectricalPowerMeasurement (0x0090) | `ElectricalPowerMeasurementServer` |
| `energyEntity` | ElectricalEnergyMeasurement (0x0091) | `ElectricalEnergyMeasurementServer` |

Each server behavior independently subscribes to its source entity's state changes and updates its Matter attributes accordingly.

#### Example: Shelly Plug S with Power Monitoring

**Home Assistant entities** (same `device_id`):
- `switch.shelly_plug_s` — state: on/off
- `sensor.shelly_plug_s_power` — device_class: power, state: 42.5 (W)
- `sensor.shelly_plug_s_energy` — device_class: energy, state: 123.4 (kWh)

**Without autoComposedDevices** (3 separate Matter endpoints):
- Endpoint 1: `OnOffPlugInUnitDevice` (switch) — `OnOff` cluster
- Endpoint 2: Skipped (no Matter device type for power sensors)
- Endpoint 3: Skipped (no Matter device type for energy sensors)

**With autoComposedDevices** (1 composed Matter endpoint):
- Endpoint 1: `OnOffPlugInUnitDevice` (switch) — `OnOff` + `ElectricalPowerMeasurement` + `ElectricalEnergyMeasurement` clusters

#### Example: Aqara Temperature/Humidity/Pressure Sensor

**Home Assistant entities** (same `device_id`):
- `sensor.aqara_temperature` — device_class: temperature
- `sensor.aqara_humidity` — device_class: humidity
- `sensor.aqara_pressure` — device_class: atmospheric_pressure
- `sensor.aqara_battery` — device_class: battery

**Without autoComposedDevices** (4 separate Matter endpoints):
- Endpoint 1: `TemperatureSensorDevice` — `TemperatureMeasurement`
- Endpoint 2: `HumiditySensorDevice` — `RelativeHumidityMeasurement`
- Endpoint 3: Skipped (no standalone pressure device type)
- Endpoint 4: Skipped (battery sensor alone)

**With autoComposedDevices** (1 composed Matter endpoint):
- Endpoint 1: `TemperatureSensorDevice` — `TemperatureMeasurement` + `RelativeHumidityMeasurement` + `PressureMeasurement` + `PowerSource` clusters

#### Configuration

Enable via bridge configuration JSON or the UI:

```json
{
  "featureFlags": {
    "autoComposedDevices": true
  }
}
```

Or enable individual sub-features selectively:

```json
{
  "featureFlags": {
    "autoBatteryMapping": true,
    "autoHumidityMapping": true,
    "autoPressureMapping": true
  }
}
```

> **Note:** `autoComposedDevices` is a pure OR with each sub-flag. It never overrides an explicitly disabled sub-flag — it only adds. If `autoComposedDevices: true`, all sub-features are treated as enabled regardless of their individual values.

#### Relevant Source Files

| File | Purpose |
|---|---|
| `packages/common/src/bridge-data.ts` | `AllBridgeFeatureFlags` type definition |
| `packages/common/src/schemas/bridge-config-schema.ts` | JSON schema for UI form generation |
| `packages/backend/src/services/bridges/bridge-registry.ts` | Entity discovery, flag checks, `find*EntityForDevice()` |
| `packages/backend/src/matter/endpoints/legacy/legacy-endpoint.ts` | Auto-assign logic, skip-if-used checks |
| `packages/backend/src/matter/endpoints/legacy/create-legacy-endpoint-type.ts` | Endpoint type construction with composed clusters |

### Live Diagnostics (WebSocket Event Streaming)

Real-time diagnostic event streaming integrated into the Health Dashboard. Emits events for bridge lifecycle changes (start/stop) with more event types planned. Events are streamed via WebSocket to subscribed clients.

**How to use:**
- Navigate to the **Health Dashboard** (`/health`)
- The **Live Diagnostics** card shows real-time events with color-coded event types
- Click the filter icon to show/hide specific event types
- Event type chips show counts and act as toggle filters

**Event types:** `bridge_started`, `bridge_stopped`, `state_update`, `command_received`, `entity_error`, `session_opened`, `session_closed`, `subscription_changed`

**WebSocket protocol:**
```json
// Subscribe
{ "type": "subscribe_diagnostics" }

// Receive initial snapshot
{ "type": "diagnostic_snapshot", "data": { "bridges": [...], "recentEvents": [...], "system": {...} } }

// Receive live events
{ "type": "diagnostic_event", "data": { "id": "diag_1", "timestamp": 1740000000000, "type": "bridge_started", "message": "Bridge started", "bridgeId": "...", "bridgeName": "..." } }

// Unsubscribe
{ "type": "unsubscribe_diagnostics" }
```

---

## Reference: Feature Documentation

The following sections document features that are now in stable but provide detailed usage instructions.

### 1. Full Backup & Restore System

Create complete backups of your configuration as ZIP files, including all bridges and entity mappings.

**Features:**
- Download complete backup as ZIP file
- Includes bridge configurations and entity mappings
- Selective restore - choose which bridges to restore
- Option to overwrite existing bridges
- Preview backup contents before restoring

**Using Backup:**
1. Go to the Bridges page
2. Click **Download Backup** to create a ZIP backup
3. To restore, click **Restore from Backup** and select a ZIP file
4. Preview the contents and select which bridges to restore
5. Choose options (overwrite existing, include mappings)
6. Click **Restore**

### 2. Filter Preview

Preview which entities will match your filter configuration before saving.

**Features:**
- Test filters without saving changes
- See matching entity count
- View entity names and domains
- Identify included/excluded entities

### 3. Smoke/CO Detector Support

Binary sensors with `smoke`, `carbon_monoxide`, or `gas` device class are now mapped to Matter Smoke CO Alarm devices.

**Supported Device Classes:**
- `smoke` - Smoke detector
- `carbon_monoxide` - CO detector  
- `gas` - Gas detector

### 4. Dark Mode Toggle

Switch between light and dark themes directly from the UI.

**Using Dark Mode:**
- Click the sun/moon icon in the top navigation bar
- Theme preference is saved in your browser

### 5. Device List Sorting

Sort the endpoint/device list by different criteria.

**Sort Options:**
- **Name** - Alphabetical by device name
- **Endpoint ID** - Numerical by Matter endpoint ID
- **Type** - Grouped by device type

### 6. Health Monitoring Dashboard

The Health Dashboard provides real-time monitoring of your bridges and fabric connections.

**Accessing the Dashboard:**
- Click the heart icon (❤️) in the top navigation bar
- Or navigate to `/health` in your browser

**Features:**
- **System Overview**: Version, uptime, and Home Assistant connection status
- **Bridge Status**: Real-time status of all bridges (running, stopped, failed)
- **Fabric Connections**: See which controllers (Google, Apple, Alexa, Samsung) are connected
- **Device Count**: Number of devices per bridge
- **Recovery Status**: View auto-recovery attempts and status

### 2. Automatic Bridge Recovery

Failed bridges are automatically restarted to ensure maximum uptime.

**How it works:**
- The system monitors bridge health every 30 seconds
- Failed bridges are automatically restarted
- Recovery attempts are logged and visible in the Health Dashboard
- Configurable recovery intervals prevent restart loops

**Recovery Status Indicators:**
- 🟢 **Running**: Bridge is healthy
- 🟡 **Starting**: Bridge is initializing
- 🔴 **Failed**: Bridge has failed (auto-recovery will attempt restart)
- ⚪ **Stopped**: Bridge is manually stopped

### 3. Bridge Wizard

The Bridge Wizard simplifies creating multiple bridges with automatic configuration.

**Using the Wizard:**
1. Go to the Bridges page
2. Click the **Wizard** button
3. Follow the guided steps:
   - Enter bridge name
   - Select entities using filters
   - Port is automatically assigned
4. Create multiple bridges in one session
5. Review and confirm before creation

**Automatic Port Assignment:**
- Starting port: 5540 (Alexa-compatible)
- Each new bridge gets the next available port
- Prevents port conflicts automatically

### 4. Water Valve Support

Control water valves through Matter.

**Supported Features:**
- Open/Close valve control
- Current position status
- Works with Home Assistant `valve` domain entities

**Controller Support:**
- Apple Home: ✅ Supported
- Google Home: ⚠️ Limited support
- Alexa: ⚠️ Limited support

### 5. Health Check API

REST API endpoints for monitoring and Kubernetes integration.

**Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Basic health status |
| `GET /api/health/detailed` | Detailed status with bridge info |
| `GET /api/health/live` | Kubernetes liveness probe |
| `GET /api/health/ready` | Kubernetes readiness probe |

**Example Response (`/api/health`):**
```json
{
  "status": "healthy",
  "version": "2.0.0-alpha.1",
  "uptime": 3600,
  "services": {
    "homeAssistant": { "connected": true },
    "bridges": { "total": 2, "running": 2, "failed": 0 }
  }
}
```

### 6. WebSocket Live Updates

Real-time updates without polling.

**Connecting:**
```javascript
const ws = new WebSocket('ws://your-hamh-host:8482/api/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
};
```

**Event Types:**
- `bridge:status` - Bridge status changes
- `bridge:devices` - Device count changes
- `fabric:connected` - New fabric connection
- `fabric:disconnected` - Fabric disconnected

### 7. Entity Mapping Customization

Override Matter device types and names per entity.

**Use Cases:**
- Force a specific Matter device type
- Custom names for entities in Matter
- Disable specific entities from a bridge

---

## Tips for Alpha Testing

### 1. Backup Your Data

Before upgrading to Alpha, backup your configuration:

```bash
# Docker
cp -r /path/to/data /path/to/data-backup

# Home Assistant Add-on
# Data is stored in /config/home-assistant-matter-hub
```

### 2. Run Alpha Separately

You can run both Stable and Alpha versions simultaneously:
- Use different ports (e.g., 8482 for stable, 8483 for alpha)
- Use different data directories
- Use different Matter ports for bridges

### 3. Reporting Issues

When reporting Alpha issues, please include:
- Alpha version number
- Logs from the add-on/container
- Steps to reproduce the issue
- Controller type (Google, Apple, Alexa)

### 4. Common Alpha Issues

**Bridge not starting:**
- Check logs for specific errors
- Verify port is not in use
- Try factory reset of the bridge

**Entities not appearing:**
- Verify filter configuration
- Check entity is supported
- Review logs for errors during device creation

**Controller not connecting:**
- Ensure IPv6 is enabled
- Check mDNS/UDP routing
- Verify port is accessible

---

## Configuration Tips

### Optimal Bridge Setup

```json
{
  "name": "Living Room",
  "port": 5540,
  "filter": {
    "include": [
      { "type": "area", "value": "living_room" }
    ],
    "exclude": [
      { "type": "entity_category", "value": "diagnostic" },
      { "type": "entity_category", "value": "config" }
    ]
  }
}
```

### Multiple Bridges Strategy

1. **By Area**: One bridge per room/area
2. **By Controller**: Separate bridges for different ecosystems
3. **By Device Type**: Group similar devices together

### Performance Recommendations

- **Max devices per bridge**: 50-80 for Alexa, 100+ for others
- **Separate vacuum devices**: Put vacuums in their own bridge
- **Monitor health**: Use the Health Dashboard to track issues

---

## Reverting to Stable

If you encounter issues with Alpha:

1. Stop the Alpha add-on/container
2. Install the Stable version
3. Your paired devices should reconnect automatically
4. Some new features may not be available

> [!NOTE]
> Configuration data is compatible between versions. Your bridges and settings will be preserved.

---

## Acknowledgments

Special thanks to the community members who help improve this project by reporting issues and providing detailed information:

- **[@codyc1515](https://github.com/codyc1515)** - For reporting the Apple Home "Not Responding" issue with lights ([#5](https://github.com/RiDDiX/home-assistant-matter-hub/issues/5)), which helped identify and fix the `CurrentLevel` null value problem affecting controller compatibility.
