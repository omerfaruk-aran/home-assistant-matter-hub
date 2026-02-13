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

Ensure that **all** home hubs in the Apple Home app are updated to **iOS/tvOS/AudioOS 18.4** or later – if **any** home hub is below 18.4, the vacuum device will not show up. To resolve this:

1. **Check for updates**  
   - **iPhone / iPad**:  
     `Settings > General > Software Update`  
   - **HomePod**:  
     Open the Home app → Home Settings → Software Update  
   - **Apple TV**:  
     `Settings > System > Software Updates`

2. **Install any pending updates**, then **restart** each hub.

3. **Relaunch** the Home app and confirm the vacuum now appears under your accessories.

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

## The app keeps crashing or restarting on my HA Yellow / Raspberry Pi

Low-resource devices (1–2 GB RAM) can run out of memory when running many bridges or devices. Since v2.0.17, HAMH limits the Node.js heap to 512 MB to prevent uncontrolled OOM kills. If crashes persist:

1. Reduce the number of devices per bridge
2. Split large bridges into smaller ones (e.g. per room)
3. Consider using a device with more RAM

See [#141](https://github.com/RiDDiX/home-assistant-matter-hub/issues/141) for details.

## Alexa loses connection after a few hours

This was caused by "dead sessions" — Alexa goes offline but the bridge keeps the old session alive, blocking new subscriptions. Since v2.0.17, the bridge detects and force-closes dead sessions automatically. If you still experience this:

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

HAMH has **Auto Battery Mapping** enabled by default. It automatically finds battery sensors on the same HA device and combines them with the primary sensor (temperature, climate, fan, vacuum). If it still shows separately:

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

## What's the difference between Stable and Alpha?

- **Stable**: Production-ready, recommended for daily use
- **Alpha**: New features for testing, may contain bugs

See the [Alpha Features Guide](./Guides/Alpha%20Features.md) for details on alpha features.

## How do I report an Alpha bug?

When reporting Alpha issues, include:
- Alpha version number (visible in Health Dashboard)
- Full logs from the add-on/container
- Steps to reproduce
- Controller type (Google, Apple, Alexa)
