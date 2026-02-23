# Alpha Features Guide

This guide covers features available in the Alpha version of Home-Assistant-Matter-Hub.

> [!NOTE]
> Alpha contains new features beyond Stable (v2.0.25). See the **Current Alpha Features** section below for what's new.

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

## Current Alpha Features

The following features are available in the current Alpha version and have not yet been promoted to Stable.

### Select / Input Select Entity Support (ModeSelectDevice)

Home Assistant `select` and `input_select` entities are now mapped to Matter `ModeSelectDevice` (0x0027). Each option in the select entity becomes a selectable mode in your Matter controller. When you change the mode from a controller, HAMH calls `select.select_option` back to Home Assistant.

**Use cases:** Washing machine programs, HVAC operation modes, irrigation zones, scene selectors, or any entity with a fixed list of options.

**Configuration:** No special setup needed. `select` and `input_select` entities matching your bridge filter are automatically exposed. You can also manually assign the `Mode Select` device type via Entity Mapping.

### Compatibility Warnings in Bridge Editor

The bridge configuration editor now shows dynamic warnings when potentially conflicting feature flags are enabled:

- **Vacuum OnOff** — Warns that this breaks Apple Home and Google Home (Alexa only)
- **Server Mode** — Reminds that only one device should be on the bridge
- **Server Mode + Vacuum OnOff** — Error: conflicting combination (Server Mode targets Apple Home, Vacuum OnOff breaks it)
- **Auto Force Sync + Auto Composed Devices** — Warns about increased network traffic

Warnings update in real-time as you toggle flags, before you save.

### Expandable Cluster Diagnostics on Device Cards

Click the **Clusters** header on any device card (All Devices page or Bridge Details) to expand a full per-cluster state inspection. The expanded view shows:

- **Home Assistant entity state** — Current HA state, device type ID, endpoint number
- **All cluster attributes** — Every attribute value for each active cluster (onOff, thermostat, modeSelect, etc.)

This removes the need to parse backend logs when debugging why a specific entity behaves unexpectedly in a controller.

### Webhook Event Bridge (hamh_action)

HAMH now fires `hamh_action` events on the Home Assistant event bus whenever a Matter controller interacts with an exposed device. This creates a bidirectional bridge: HA entities are exposed to Matter controllers, and controller actions are reported back to HA as events.

**Two sources of events:**

1. **Controller commands** (`source: matter_controller`) — When a controller sends a command (on/off, mode change, setpoint, etc.), HAMH fires `hamh_action` with the action and data.
2. **GenericSwitch presses** (`source: matter_bridge`) — When HAMH emits a button press event to controllers, it also fires `hamh_action` with the press type and count.

**HA automation trigger example:**

```yaml
trigger:
  - platform: event
    event_type: hamh_action
    event_data:
      entity_id: event.doorbell_press
      action: press
```

**Event data fields:**

| Field | Description |
|-------|-------------|
| `entity_id` | The HA entity that was acted upon |
| `action` | The action performed (e.g., `homeassistant.turn_on`, `press`) |
| `data` | Action-specific data (e.g., `{ option: "eco" }` for mode changes) |
| `source` | `matter_controller` for controller commands, `matter_bridge` for GenericSwitch events |
| `event_type` | (GenericSwitch only) The original HA event type (e.g., `press`, `double_press`) |
| `press_count` | (GenericSwitch only) Number of presses detected (1, 2, or 3) |

---

## Features Now in Stable (v2.0.25)

The following features have graduated from Alpha to Stable:

**New in v2.0.25:**
- **Vacuum Mop Intensity** - `mopIntensityEntity` mapping adds mop intensity modes to Apple Home extra features
- **Vacuum Auto-Detection** - Cleaning mode, suction level, and mop intensity entities auto-detected for Dreame, Roborock, Ecovacs
- **Roborock Room Auto-Detect** - Rooms resolved via `roborock.get_maps` service — no manual button mapping needed (#189)
- **Live Entity Mapping** - Device type and mapping changes take effect automatically without bridge restart (#192)
- **Dynamic Heap Sizing** - Node.js heap calculated from system RAM (25%, 256–1024 MB) instead of hardcoded 768 MB (#190)
- **Multi-Fabric Commissioning** - Open commissioning window API for easier multi-fabric pairing
- **Fabric Vendor Names** - Decoded vendor names (Apple, Google, Amazon, Samsung) in bridge details and health dashboard
- **Fan Speed Label Fix** - Prevented Apple Home from renaming fan speed modes like "normal" to "Automatic"
- **Vacuum Fan Speed Modes** - Dynamic fan speed modes with multi-manufacturer regex-based tag patterns

**Previously in v2.0.24:**
- **Dashboard Landing Page** - System overview with bridge/device counts, fabric connections, HA status, uptime
- **Composed Devices** (`autoComposedDevices`) - Real Matter Composed Devices for temperature sensors with humidity/pressure (#179)
- **Bridge Wizard Feature Flags** - 5-step wizard with Auto Composed, Force Sync, Cover Inversion, Hidden Entities
- **Entity Autocomplete** - Search-as-you-type suggestions for entity ID fields
- **Light Transition Time** - Controller transition times forwarded to HA `light.turn_on` calls
- **Live Diagnostics** - Real-time WebSocket event streaming on Health Dashboard
- **Water Freeze Detector** - `binary_sensor.cold` maps to Matter WaterFreezeDetector
- **Vacuum Suction Level** - `suctionLevelEntity` mapping adds Quiet/Max intensity toggles in Apple Home (#110)
- **Vacuum Cluster Fixes** - Always include PowerSource, ServiceArea, RvcCleanMode (#183)
- **Thermostat Auto-Resume** - "Set to 20°C" works when off and already at 20°C (#176)
- **Thermostat Voice Confirmation** - Fixed Google Home skipping "turned off" confirmation (#176)
- **Vacuum Docked State** - Correctly shows "Docked" when idle and charging (#165)
- **Memory Leak Fix** - Proper endpoint disposal prevents OOM (#180)
- **Device Type Overrides** - SmokeCO, Water Leak, Water Freeze selectable as overrides
- **Battery Log Spam Fix** - Caching + reduced log level for missing battery sensors
- **Measurement Cluster Fixes** - Fixed minMeasuredValue for humidity, flow, electrical clusters
- **Lighting Feature Fix** - Removed Lighting from OnOff for non-light devices (#182)
- **Filter Tooltips** - Descriptive tooltips on filter type dropdown
- **Dashboard UX** - Alphabetical bridge sorting, navigation guide, mobile responsiveness

**Previously in v2.0.20–v2.0.23:**
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

## Feature Details (now in Stable v2.0.25)

The following sections provide detailed usage instructions for features that have been promoted to stable.

### Dashboard Landing Page

The application now opens with a dashboard overview instead of the bridges list. The dashboard provides a compact summary of your system at a glance:

- **Stat Cards** — Bridge count (with status breakdown), total device count (with failed count), fabric connections, and Home Assistant connection status
- **Version & Uptime** — Current HAMH version and system uptime
- **Create Bridge Buttons** — Prominent buttons to launch the Bridge Wizard or create a bridge manually, directly from the dashboard
- **Bridge Mini-Cards** — Each bridge shown with its name, device count, fabric count, and status chip. Click any bridge to navigate to its detail page.
- **Quick Navigation** — Cards linking to all application pages: Bridges, All Devices, Network Map, Health Dashboard, Startup Order, Lock Credentials, and Filter Reference

The dashboard fetches data from `/api/health/detailed` and refreshes every 15 seconds.

### Bridge Wizard Feature Flags

The Bridge Wizard now has a 5-step flow: **Template → Bridge Info → Entity Filter → Feature Flags → Review & Create**. The new Feature Flags step lets you enable common flags directly during bridge creation:

- **Auto Composed Devices** (`autoComposedDevices`) — Combine related entities into single Matter endpoints (recommended for Google Home / Alexa)
- **Auto Force Sync** (`autoForceSync`) — Periodically push all states to controllers (recommended for Google Home)
- **Invert Cover Direction** (`coverSwapOpenClose`) — Swap open/close direction for covers
- **Include Hidden Entities** (`includeHiddenEntities`) — Also expose hidden HA entities

When a template is selected, its flags are pre-filled but can be adjusted in this step. All other flags remain available in the full bridge editor after creation.

### Entity Autocomplete

All entity ID input fields in the Entity Mapping dialog now use an autocomplete component with search-as-you-type suggestions. This replaces the previous plain text fields where users had to type entity IDs from memory.

**How it works:**
- Start typing an entity ID or friendly name — matching entities from your Home Assistant registry are suggested
- Results are fetched from `/api/home-assistant/entities` with optional domain filtering
- Each suggestion shows the entity ID and its friendly name
- You can still type a custom entity ID manually if needed (freeSolo mode)
- Domain-specific fields (e.g., humidity, battery, power sensors) automatically filter suggestions to the `sensor` domain

**Affected fields:** Entity ID, Humidity Sensor, Pressure Sensor, Battery Sensor, Filter Life Sensor, Cleaning Mode Entity, Power Sensor, Energy Sensor.

### Light Transition Time

Matter controllers can send transition times with light commands (brightness changes, color temperature changes, hue/saturation changes). These transition times are now forwarded to Home Assistant as the `transition` parameter in `light.turn_on` service calls.

**Supported commands:**
- `moveToLevel` / `moveToLevelWithOnOff` — brightness transitions
- `moveToColorTemperature` — color temperature transitions
- `moveToHueAndSaturation` — color transitions

**Unit conversion:** Matter uses tenths of a second (e.g., `transitionTime: 10` = 1 second). Home Assistant uses seconds as a float. The conversion is `transition = transitionTime / 10`.

**Backward compatible:** Transition times of 0 or null are not forwarded, preserving current behavior (instant changes). Only non-zero transition times are included in the HA service call.

### Auto Composed Devices (Master Toggle)

> [!WARNING]
> **BREAKING CHANGE**: Enabling `autoComposedDevices` changes the Matter endpoint structure for temperature sensors with humidity/pressure. Controllers (Alexa, Google Home, Apple Home) will see these as **new devices** and you'll need to:
> - Re-assign them to rooms
> - Re-add them to routines/automations
> - Reconfigure any voice assistant aliases
>
> This only affects temperature sensors with auto-mapped humidity or pressure. The endpoint changes from a flat structure to a composed device with sub-endpoints.
>
> **Recommendation**: Only enable this for new bridges, or be prepared to reconfigure your controllers.

**Feature Flag:** `autoComposedDevices` (default: `false`)

A master toggle that automatically combines related Home Assistant entities from the same physical device into Matter endpoints. When enabled, it activates all auto-mapping sub-features at once: battery, humidity, pressure, power, and energy mapping.

For **temperature sensors** with auto-mapped humidity/pressure/battery, this flag creates **real Matter Composed Devices** — a `BridgedNodeEndpoint` parent with separate sub-endpoints for each sensor type. Each sub-endpoint uses its correct Matter device type, which is required for Apple Home, Google Home, and Amazon Alexa to properly recognize and display humidity and pressure readings.

For **switches/lights** with auto-mapped power/energy, the clusters are added directly to the switch endpoint (flat mapping), since `ElectricalPowerMeasurement` and `ElectricalEnergyMeasurement` are valid optional clusters on those device types.

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
   - **Humidity → Temperature sensor**
   - **Pressure → Temperature sensor**
   - **Battery → Any entity** (done last so battery goes to the combined sensor, not separately)
   - **Power → Switch/Light**
   - **Energy → Switch/Light**

3. **Composed device check** — If `autoComposedDevices` is enabled and this is a temperature sensor with auto-mapped humidity or pressure, a `ComposedSensorEndpoint` is created instead of a flat endpoint. This produces a `BridgedNodeEndpoint` parent with separate sub-endpoints:

   ```
   BridgedNodeEndpoint (parent)
   ├── BridgedDeviceBasicInformation + PowerSource (battery)
   ├── TemperatureSensorDevice (0x0302) sub-endpoint
   ├── HumiditySensorDevice (0x0307) sub-endpoint
   └── PressureSensorDevice (0x0305) sub-endpoint
   ```

   Each sub-endpoint has its own `HomeAssistantEntityBehavior` and reads directly from its own HA entity state.

4. **Flat endpoint fallback** — For switches/lights or if `autoComposedDevices` is not enabled, `createLegacyEndpointType()` adds the extra clusters directly to the primary endpoint type.

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

**With autoComposedDevices** (1 composed Matter device with 3 sub-endpoints):
- Parent: `BridgedNodeEndpoint` — `BridgedDeviceBasicInformation` + `PowerSource` (battery)
  - Sub 1: `TemperatureSensorDevice` (0x0302) — `TemperatureMeasurement`
  - Sub 2: `HumiditySensorDevice` (0x0307) — `RelativeHumidityMeasurement`
  - Sub 3: `PressureSensorDevice` (0x0305) — `PressureMeasurement`

**Controller behavior:**

| Controller | Temperature | Humidity | Pressure | Battery |
|---|---|---|---|---|
| Apple Home | ✅ | ✅ | ❌ (unsupported device type) | ✅ |
| Google Home | ✅ | ✅ | ✅ | ✅ |
| Amazon Alexa | ✅ (separate) | ✅ (separate) | ? | ✅ |

Sources: [Apple Support — Matter accessories](https://support.apple.com/en-us/102135) (lists supported sensor types), [matter.js ECOSYSTEMS.md](https://github.com/matter-js/matter.js/blob/main/docs/ECOSYSTEMS.md) (tested device type matrix).

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

#### Force Sync for Composed Devices

When `autoForceSync` is enabled, the periodic force sync now recursively traverses all sub-endpoints of composed devices. Previously, only direct children of the aggregator were synced, which meant sub-endpoints of `ComposedSensorEndpoint` (temperature, humidity, pressure sensors) were missed during force sync cycles. This fix ensures that all sensor readings within composed devices stay in sync with controllers.

#### Relevant Source Files

| File | Purpose |
|---|---|
| `packages/common/src/bridge-data.ts` | `AllBridgeFeatureFlags` type definition |
| `packages/common/src/schemas/bridge-config-schema.ts` | JSON schema for UI form generation |
| `packages/backend/src/services/bridges/bridge-registry.ts` | Entity discovery, flag checks, `find*EntityForDevice()` |
| `packages/backend/src/matter/endpoints/legacy/legacy-endpoint.ts` | Auto-assign logic, skip-if-used checks |
| `packages/backend/src/matter/endpoints/legacy/create-legacy-endpoint-type.ts` | Endpoint type construction (flat mapping fallback) |
| `packages/backend/src/matter/endpoints/composed/composed-sensor-endpoint.ts` | Composed device factory (BridgedNodeEndpoint + sub-endpoints) |
| `packages/backend/src/services/bridges/bridge.ts` | Force sync logic with recursive sub-endpoint traversal |

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

#### Live Diagnostics Dashboard Improvements

**Bridge Cards (v2.1.0-alpha.10+):**
- **Uniformly sized cards** — All bridge cards have consistent `minWidth: 280px`, `maxWidth: 480px`
- **Self-adjusting layout** — Cards grow/shrink together with flexbox layout
- **Alphabetical sorting** — Bridges sorted A-Z by name by default
- **Chip-based info display** — Port, device count, fabric count shown as separate chips instead of text line
- **Responsive grid** — Cards adapt: 1 (mobile) → 2 (tablet) → 2 (desktop) → 3 (lg) → 4 (xl) per row

### Thermostat Auto-Resume Fix

**Issue:** When a thermostat was off and you asked a voice assistant to "set temperature to 20°C", it only worked if the new temperature was different from the current setpoint. If already at 20°C, nothing happened.

**Fix:** When the device is off, stored setpoints are nudged by +1 centidegree (0.01°C, imperceptible) so that any controller write of the "round" value triggers a `$Changing` event, which auto-resumes to Heat/Cool mode. The nudge is skipped during the Off transition itself to avoid interfering with Google Home's voice confirmation.

**Works with:** Google Home, Alexa, Apple Home

**Technical details:**
- `update()` nudges setpoints when device was already off (`wasOffOnPreviousUpdate` flag)
- `heatingSetpointChanging` / `coolingSetpointChanging` detect `systemMode == Off` and auto-resume
- Only auto-resumes for single-temp mode (not range/auto mode)
- Uses `setSystemMode` config action to turn on the device

### Vacuum "Docked" State Fix

**Issue:** Vacuums showed "Paused" instead of "Docked" when idle and charging in their dock.

**Fix:** Corrected the operational state mapping logic in `VacuumRvcOperationalStateServer`. Now properly detects charging state for vacuums that report `idle` while docked and charging (Ecovacs, some Roborock models).

**Detection logic:**
- If HA state is `docked` → shows `Docked`
- If HA state is `idle` + charging detected → shows `Docked`  
- If HA state is `idle` + not charging → shows `Paused`

**Controller behavior:**
- Apple Home: Shows correct "Charging" or "Docked" status
- Google Home: Status displayed correctly
- Alexa: Status displayed correctly

### Memory Leak & Stability Fixes

**Issue:** Long-running bridges could experience Out-Of-Memory (OOM) errors due to improper endpoint disposal.

**Fix:** Fixed endpoint cleanup in disposal methods:
- `BridgeEndpointManager.dispose()` now properly deletes all child endpoints
- `ServerModeEndpointManager.dispose()` now properly deletes the device endpoint
- Prevents accumulation of orphaned Matter.js objects in memory

### Battery Sensor Log Spam Fix

**Issue:** Logs were flooded with "No battery entity found" messages for devices without battery sensors.

**Fix:** 
- Added caching to `findBatteryEntityForDevice()` to avoid repeated searches
- Reduced log level from `warn` to `debug` for missing battery sensors
- Cache cleared on registry refresh to prevent stale data

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
