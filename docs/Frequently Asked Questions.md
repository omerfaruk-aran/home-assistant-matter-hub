# Frequently Asked Questions

## I've got connectivity issues, what can I do?

Please follow the [troubleshooting guide](./Guides/Connectivity%20Issues.md).

## I'd like to connect my bridge to multiple assistants

Please follow the [multi-fabric guide](./Guides/Connect%20Multiple%20Fabrics.md).

## I'm running HAMH as a docker image and want to access it via a reverse proxy

Please follow the [reverse proxy guide](./Guides/Reverse%20Proxy.md).

## Changes on names and labels in Home Assistant have no effect in HAMH

When performing changes on entities, like adding or removing a label or renaming your entity, you need to reload the
affected bridge for the changes to take effect. This happens automatically every 30 seconds, but you can enforce it by
editing the bridge (even without making changes), or when restarting the whole addon.

## I added a label to my entities, but HAMH won't find any device

- Labels and areas in Home Assistant are technically represented by their "slugs".
- Slugs are technical identifiers used in the background.
- Slugs are always lowercase and only allow a-z and underscores, so everything else will be replaced with an
  underscore.
- Even when renaming a label or area, the slug doesn't change. Never.
  You can retrieve the slug using the following templates in Home Assistant:
- `{{ labels() }}` - returns all labels
- `{{ labels("light.my_entity") }}` - returns the labels of a specific entity
- `{{ areas() }}` - returns all areas

If you just can't get it working with your labels, try to delete your label and re-create it.

## My Vacuum does not appear in the Apple Home App

1. **Use Server Mode** — Apple Home requires robot vacuums as standalone devices. Create a dedicated Server Mode bridge with only your vacuum.
2. **Update all Home Hubs** — Ensure **all** home hubs are updated to **iOS/tvOS/AudioOS 18.4** or later. If **any** hub is below 18.4, the vacuum won't show up.
3. **Re-pair** — After enabling Server Mode, remove the old accessory and pair the new bridge.

See the [Robot Vacuum Guide](./Devices/Robot%20Vacuum.md) for full setup instructions.

## How do I access the Health Dashboard?

Click the heart icon (❤️) in the top navigation bar of the web UI, or navigate directly to `/health`.

## My bridge keeps failing and restarting

The automatic recovery feature will restart failed bridges. If a bridge keeps failing:

1. Check the logs for specific error messages
2. Reduce the number of devices in the bridge
3. Verify all entities in the bridge are valid
4. Try factory resetting the bridge

## How do I use the Bridge Wizard?

1. Go to the Bridges page
2. Click the **Wizard** button
3. Follow the guided steps to create bridges
4. Ports are automatically assigned starting from 5540

## What sensors are supported?

Currently supported sensor types:
- Temperature (with auto humidity and pressure mapping)
- Humidity
- Pressure
- Flow
- Illuminance (Light)
- Air Quality (AQI, PM2.5, PM10, CO2, TVOC)

See [Temperature & Humidity Sensor](./Devices/Temperature%20Humidity%20Sensor.md) for details on combining temperature, humidity, pressure, and battery into a single device.

## The app keeps crashing or restarting on my HA Yellow / Raspberry Pi / VM

Low-resource devices (1–2 GB RAM) or VMs with limited memory allocation can run out of memory. Since v2.0.25, HAMH dynamically sizes the Node.js heap to 25% of your system RAM (clamped between 256 MB and 1024 MB). The startup log shows the calculated value: `System RAM: 2048MB → Node.js heap: 512MB`. The total process memory (including matter.js cluster definitions, SQLite, and V8 overhead) can reach 400–600 MB even before bridges start.

The telltale sign of an OOM kill is the log showing `Killed` with no error message or stack trace — this means the Linux kernel terminated the process.

If crashes persist:

1. Reduce the number of devices per bridge
2. Split large bridges into smaller ones (e.g. per room)
3. Stop other memory-heavy add-ons (Frigate, Whisper, Piper, Music Assistant, Python Matter Server)
4. For VMs (`qemux86-64`): increase RAM allocation to at least 4 GB
5. Consider using a device with more RAM

See [#190](https://github.com/RiDDiX/home-assistant-matter-hub/issues/190) and [#141](https://github.com/RiDDiX/home-assistant-matter-hub/issues/141) for details.

## Alexa loses connection after a few hours

This is typically caused by stale sessions — Alexa goes offline but the bridge keeps the old session alive, blocking new subscriptions. The bridge includes an automatic force-sync mechanism that periodically pushes state updates to all connected controllers. If you still experience this:

1. Update to the latest version
2. Remove and re-pair the bridge in the Alexa app
3. Check your network for multicast/mDNS issues (see [Connectivity Issues](./Guides/Connectivity%20Issues.md))

See [#105](https://github.com/RiDDiX/home-assistant-matter-hub/issues/105) for details.

## My cover / blinds open and close commands are inverted

Matter and Home Assistant use different conventions for cover position percentages. Use the bridge feature flags to fix this:

- **`coverSwapOpenClose`** — Swaps open/close commands (fixes reversed Alexa commands)
- **`coverDoNotInvertPercentage`** — Skips percentage inversion
- **`coverUseHomeAssistantPercentage`** — Uses HA percentages directly

Configure these in your Bridge Settings → Feature Flags. See [#107](https://github.com/RiDDiX/home-assistant-matter-hub/issues/107), [#109](https://github.com/RiDDiX/home-assistant-matter-hub/issues/109).

## Battery shows as a separate device instead of being part of the sensor

HAMH has **Auto Battery Mapping** which automatically finds battery sensors on the same HA device and combines them with the primary sensor (temperature, climate, fan, vacuum). This feature is **disabled by default**. If batteries show separately:

1. Check that the battery entity belongs to the same HA *device* as the primary entity
2. Make sure `autoBatteryMapping` is enabled in your Bridge Settings → Feature Flags
3. Alternatively, use **Entity Mapping** to manually set `batteryEntity` on the primary sensor

See [#99](https://github.com/RiDDiX/home-assistant-matter-hub/issues/99).

## My thermostat doesn't work correctly in auto mode

Matter's "Auto" mode means the thermostat automatically switches between heating and cooling based on temperature. This maps to HA's `heat_cool` mode, *not* `auto`. Since v2.0.17:

- **Heat-only** thermostats (e.g. TRVs) are exposed with only the Heating feature
- **Cool-only** thermostats (e.g. ACs) are exposed with only the Cooling feature
- **Full HVAC** thermostats get Heating + Cooling + Auto features

This prevents Alexa from rejecting commands on single-capability thermostats. See [#143](https://github.com/RiDDiX/home-assistant-matter-hub/issues/143), [#136](https://github.com/RiDDiX/home-assistant-matter-hub/issues/136).

## My water heater / kettle max temperature is capped at 50°C

Previously the default Matter thermostat limits capped water heaters at 50°C. Since v2.0.17, HAMH reads the actual `min_temp` and `max_temp` from your HA entity and passes them correctly. Update to the latest version to fix this.

See [#145](https://github.com/RiDDiX/home-assistant-matter-hub/issues/145), [#97](https://github.com/RiDDiX/home-assistant-matter-hub/issues/97).

## Matter hub appears multiple times in Alexa / duplicate connections

This can happen when a bridge is factory-reset or re-created while still paired in Alexa. To fix:

1. Remove all duplicate entries from the Alexa app
2. Factory reset the bridge in HAMH (Bridge Settings → Factory Reset)
3. Re-pair the bridge in Alexa

See [#152](https://github.com/RiDDiX/home-assistant-matter-hub/issues/152).

## My binary sensor shows "Open/Closed" instead of "On/Off" (running, plug, power)

Binary sensors with device_class `running`, `plug`, `power`, `battery_charging`, or `light` are now mapped to **OnOffSensor** (On/Off) instead of ContactSensor (Open/Closed). This was fixed in v2.0.17.

If you're on an older version, update to get the correct mapping. See [#154](https://github.com/RiDDiX/home-assistant-matter-hub/issues/154).

## My devices are not assigned to the correct rooms

HAMH sends your Home Assistant area names to Matter controllers using the FixedLabel cluster (`label: "room", value: "<area name>"`). However, **no major controller** (Google Home, Apple Home, Alexa) currently reads this label for automatic room assignment. You need to assign rooms manually in each controller app during or after pairing.

The FixedLabel data is kept in the bridge for future controller support. The room name is limited to 16 characters per the Matter spec — longer HA area names are truncated automatically.

## How do I control Media Player playback?

Media players now support Play, Pause, Stop, Next Track, and Previous Track controls through Matter. However, not all controllers support these features yet. Volume control is also available.

## How do I control my vacuum's cleaning mode (Vacuum / Mop / Vacuum & Mop)?

HAMH needs a **cleaning mode select entity** to switch between modes. Dreame and Ecovacs vacuums have one auto-detected. For Roborock and others that don't expose one, you can create a Home Assistant **template select entity** with an automation that applies the correct fan speed and mop intensity settings.

See [Creating a Cleaning Mode Helper](./Devices/Robot%20Vacuum.md#creating-a-cleaning-mode-helper-roborock--others) in the Robot Vacuum guide for step-by-step instructions.

## Why does Apple Home show the same intensity options (Quiet / Automatic / Max) for both Vacuum and Mop mode?

This is an Apple Home limitation. Apple renders intensity labels based on Matter mode tags, and both fan speed and mop intensity use the same tags (Quiet, Auto, Max). The routing behind the labels is correct — selecting "Quiet" in Mop mode sets the mop intensity, while "Quiet" in Vacuum mode sets fan speed.

## My vacuum's mop intensity doesn't show in Apple Home

Mop intensity requires a **cleaning mode entity** to be configured. Without one, HAMH cannot determine when the vacuum is in Mop mode. If your integration doesn't provide a cleaning mode entity natively, create one using the [Cleaning Mode Helper](./Devices/Robot%20Vacuum.md#creating-a-cleaning-mode-helper-roborock--others) approach.

Also ensure you've set the **Mop Intensity Entity** in the Entity Mapping for your vacuum.

## What are select / input_select entities used for?

Since v2.0.26, `select` and `input_select` entities are automatically mapped to Matter **ModeSelectDevice**. Each option becomes a selectable mode in your controller. Use cases include washing machine programs, HVAC modes, irrigation zones, or scene selectors.

## How do I expose my alarm control panel to Matter?

Since v2.0.27, `alarm_control_panel` entities are automatically exposed as Matter **ModeSelectDevice**. Each alarm state (Disarmed, Armed Home, Armed Away, etc.) becomes a selectable mode. An OnOff fallback is also included for Apple Home compatibility — turning "on" arms the alarm, turning "off" disarms it. See [#209](https://github.com/RiDDiX/home-assistant-matter-hub/issues/209).

## My Valetudo vacuum rooms aren't working

Since v2.0.27, HAMH has native Valetudo support. Room cleaning uses `mqtt.publish` with `segment_cleanup` instead of `vacuum.send_command`. Requirements:

1. Valetudo firmware with MQTT autodiscovery enabled
2. Home Assistant MQTT integration configured
3. Vacuum entity exposes `segments` attribute with room data
4. Server Mode bridge for Apple Home / Alexa

If rooms still don't appear, check the HAMH logs for segment detection messages. See [#205](https://github.com/RiDDiX/home-assistant-matter-hub/issues/205).

## My thermostat crashes with "CoolingAndHeating" conformance error

Fixed in v2.0.27. Devices with `auto` + `cool` but no explicit `heat` mode (e.g. SmartIR ACs) were reporting `CoolingAndHeating` as the control sequence, which Matter.js rejected for non-AutoMode devices. HAMH now dynamically sets `CoolingOnly` or `HeatingOnly` based on the device's actual capabilities. See [#28](https://github.com/RiDDiX/home-assistant-matter-hub/issues/28).

## My zoned AC (heat_cool only) doesn't show the correct mode in Apple Home

Fixed in v2.0.27. Devices with only `heat_cool` mode (no explicit `heat` or `cool`) now dynamically report `CoolingOnly` or `HeatingOnly` based on `hvac_action`, and the `systemMode` switches between Heat and Cool accordingly. See [#207](https://github.com/RiDDiX/home-assistant-matter-hub/issues/207).

## What's the difference between Stable and Alpha?

- **Stable** (v2.0.30): Production-ready, recommended for daily use
- **Alpha**: New features for testing, may contain bugs

See the [Alpha Features Guide](./Guides/Alpha%20Features.md) for details on alpha features.

## How do I report an Alpha bug?

When reporting Alpha issues, include:
- Alpha version number (visible in Health Dashboard)
- Full logs from the add-on/container
- Steps to reproduce
- Controller type (Google, Apple, Alexa)

## My thermostat doesn't turn on when I set the temperature

Since v2.0.24, thermostats support **auto-resume** — when off and you set a temperature (even the same one), it automatically turns on. This works with all voice assistants.

If not working:
- Update to v2.0.30+
- Only works for single-temp mode (not range/auto)
- Thermostat must be in "Off" state

## Vacuum shows "Paused" instead of "Docked"

Fixed in v2.0.24. Previously some vacuums (Ecovacs, some Roborock) reported `idle` while docked, showing as "Paused". Now correctly shows "Docked" when charging.

## Too many "No battery entity found" log messages

Fixed in v2.0.24. Battery sensor auto-mapping now uses caching and reduced log levels (debug only). Previously every entity without battery logged a warning.

## Bridge runs out of memory after several days

Fixed in v2.0.24. Endpoint disposal was improved in `BridgeEndpointManager` and `ServerModeEndpointManager`. Previously endpoints weren't cleaned up during restarts, causing memory leaks.

## How do I use the Dashboard landing page?

Since v2.0.24, the app opens with a **Dashboard** showing:
- Bridge count, device count, fabric connections
- Quick navigation to all pages
- Bridge Wizard and Create Bridge buttons
- Version and uptime

Refreshes every 15 seconds.

## What is "Auto Composed Devices"?

**Auto Composed Devices** (`autoComposedDevices` feature flag, since v2.0.20) combines related entities from the same HA device into one Matter endpoint:
- Temperature + Humidity + Pressure + Battery = one device
- Switches/Lights with power/energy monitoring show consumption in one device
- Uses real Matter Composed Devices with sub-endpoints for proper controller display

Enable in Bridge Settings → Feature Flags.

## I changed the device type in Entity Mapping but nothing happened

Since v2.0.25, entity mapping changes (device type, custom name, or any other field) are detected automatically on the next refresh cycle (~30 seconds). The old endpoint is deleted and recreated with the new config. You'll see a log line like `Mapping changed for media_player.tv, recreating endpoint`.

If changes still don't apply, check the logs for errors during endpoint recreation.

## How do I use the webhook event bridge (hamh_action)?

Since v2.0.26, HAMH fires `hamh_action` events on the HA event bus when controllers interact with exposed devices. You can use these in HA automations:

```yaml
trigger:
  - platform: event
    event_type: hamh_action
    event_data:
      entity_id: event.doorbell_press
      action: press
```

Event data includes `entity_id`, `action`, `data`, and `source` (either `matter_controller` or `matter_bridge`).
