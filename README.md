<div align="center">

# Home-Assistant-Matter-Hub

!["Home-Assistant-Matter-Hub"](./docs/assets/hamh-logo-small.png)

**Expose your Home Assistant devices to Matter controllers like Apple Home, Google Home, and Alexa**

[![GitHub Release](https://img.shields.io/github/v/release/RiDDiX/home-assistant-matter-hub?label=stable&color=green)](https://github.com/RiDDiX/home-assistant-matter-hub/releases)
[![GitHub Pre-Release](https://img.shields.io/github/v/release/RiDDiX/home-assistant-matter-hub?include_prereleases&label=alpha&color=orange)](https://github.com/RiDDiX/home-assistant-matter-hub/releases)
[![GitHub Issues](https://img.shields.io/github/issues/RiDDiX/home-assistant-matter-hub)](https://github.com/RiDDiX/home-assistant-matter-hub/issues)
[![GitHub Stars](https://img.shields.io/github/stars/RiDDiX/home-assistant-matter-hub)](https://github.com/RiDDiX/home-assistant-matter-hub/stargazers)
[![License](https://img.shields.io/github/license/RiDDiX/home-assistant-matter-hub)](LICENSE)

[📖 Documentation](https://riddix.github.io/home-assistant-matter-hub) • [� Discord](https://discord.gg/Kubv7sSGyW) • [�🐛 Report Bug](https://github.com/RiDDiX/home-assistant-matter-hub/issues/new?labels=bug) • [💡 Request Feature](https://github.com/RiDDiX/home-assistant-matter-hub/issues/new?labels=enhancement)

</div>

---

> [!NOTE]
> 🔀 **Community Fork** - This is a fork of the original [t0bst4r/home-assistant-matter-hub](https://github.com/t0bst4r/home-assistant-matter-hub), which was discontinued in January 2026. We continue active development with bug fixes, new features, and community support. Thank you **t0bst4r** for the original work! ❤️
>
> **📦 Migrating?** See [Migration Guide](#migration-from-t0bst4r) - your paired devices will continue to work!

---

## 📝 About

This project simulates bridges to publish your entities from Home Assistant to any Matter-compatible controller like
Alexa, Apple Home or Google Home. Using Matter, those can be connected easily using local communication without the need
of port forwarding etc.

---

## 📦 Releases & Branches

| Channel | Branch | Current Version | Description |
|---------|--------|-----------------|-------------|
| **Stable** | `main` | v2.0.17 | Production-ready, recommended for most users |
| **Alpha** | `alpha` | v2.1.0-alpha.x | Pre-release with new features, for early adopters |
| **Testing** | `testing` | v4.1.0-testing.x | ⚠️ **Highly unstable!** Experimental features, may break |

### Which version should I use?

- **Most users**: Use **Stable** (`main` branch) - thoroughly tested
- **Early adopters**: Use **Alpha** (`alpha` branch) - new features, occasional bugs
- **Developers/Testers**: Use **Testing** (`testing` branch) - bleeding edge, expect breakage

---

## 🎉 What's New

<details>
<summary><strong>📦 Stable Features (v2.0.17)</strong> - Click to expand</summary>

| Feature | Description |
|---------|-------------|
| **🏷️ Automatic Room Assignment** | Entities are automatically assigned to rooms in Google Home and Alexa based on HA area assignments using the FixedLabel cluster. Apple Home does not support automatic room assignment — rooms must be assigned manually during pairing. ([#77](https://github.com/RiDDiX/home-assistant-matter-hub/discussions/77)) |
| **🏷️ Device-Level Label Filter** | Label filter now also matches device-level labels, not just entity labels |
| **🌡️ Thermostat Overhaul** | Major thermostat improvements: negative temperature support, proper Auto mode, hvac_action-based running state, Alexa-compatible feature variants, localTemperature setpoint fallback, NaN guards, per-property error handling ([#52](https://github.com/RiDDiX/home-assistant-matter-hub/issues/52), [#136](https://github.com/RiDDiX/home-assistant-matter-hub/issues/136), [#137](https://github.com/RiDDiX/home-assistant-matter-hub/issues/137), [#143](https://github.com/RiDDiX/home-assistant-matter-hub/issues/143), [#146](https://github.com/RiDDiX/home-assistant-matter-hub/issues/146)) |
| **🔒 Lock Unlatch/Unbolt** | Locks with HA OPEN support now expose the Matter Unbolting feature — Apple Home shows an Unlatch button ([#153](https://github.com/RiDDiX/home-assistant-matter-hub/issues/153)) |
| **🔒 Lock User Feature** | DoorLock now includes User feature for Apple Home commissioning compatibility |
| **🔘 Binary Sensor Fix** | Binary sensors with device_class running/plug/power now map to OnOffSensor (On/Off) instead of ContactSensor (Open/Closed) ([#154](https://github.com/RiDDiX/home-assistant-matter-hub/issues/154)) |
| **🌡️ Auto Pressure Mapping** | Pressure sensors on the same device as temperature sensors are automatically combined into a single endpoint with PressureMeasurement cluster (e.g. Aqara WSDCGQ11LM) |
| **🚿 Water Heater Limits** | Pass min/max limits at endpoint level to prevent 50°C cap regression ([#145](https://github.com/RiDDiX/home-assistant-matter-hub/issues/145)) |
| **🤖 Vacuum Fixes** | Remove OnOff from bridged vacuum to fix Apple Home "Updating" status, GoHome command, OperationCompletion event, state deduplication & debouncing ([#103](https://github.com/RiDDiX/home-assistant-matter-hub/issues/103)) |
| **🚪 Cover Fix** | Fix coverSwapOpenClose not affecting position display ([#148](https://github.com/RiDDiX/home-assistant-matter-hub/issues/148)) |
| **🌬️ Fan Oscillation Fix** | Move rockSupport/windSupport to .set() defaults so controllers properly enable oscillation and wind modes ([#108](https://github.com/RiDDiX/home-assistant-matter-hub/discussions/108)) |
| **🔌 Dead Session Recovery** | Detect and force-close dead sessions to recover from Alexa subscription loss ([#105](https://github.com/RiDDiX/home-assistant-matter-hub/issues/105)) |
| **🎬 Scene/Automation Reset** | Ensure onOff true→false transition for momentary scene/automation reset so controllers receive state change ([#124](https://github.com/RiDDiX/home-assistant-matter-hub/issues/124)) |
| **🌡️ TVOC Sensor** | Add TVOC sensor as entity mapping option ([#134](https://github.com/RiDDiX/home-assistant-matter-hub/issues/134)) |
| **💧 Humidity Auto-Mapping Fix** | Don't skip humidity entities auto-assigned to temperature sensors ([#133](https://github.com/RiDDiX/home-assistant-matter-hub/issues/133)) |
| **🔋 Battery Search Fix** | Search full HA registry for battery/humidity entities, not just filtered bridge entities ([#112](https://github.com/RiDDiX/home-assistant-matter-hub/issues/112)) |
| **🔊 Speaker Volume Fix** | Prevent base LevelControlServer from overwriting volume ([#79](https://github.com/RiDDiX/home-assistant-matter-hub/issues/79)) |
| **💡 Alexa Brightness** | Make Alexa brightness-reset workaround always active, no longer behind feature flag ([#142](https://github.com/RiDDiX/home-assistant-matter-hub/issues/142)) |
| **🧠 Memory Limit** | Limit Node.js heap to 512MB to prevent OOM kills on low-resource devices ([#141](https://github.com/RiDDiX/home-assistant-matter-hub/issues/141)) |
| **🛡️ Crash Resilience** | Improved crash resilience across bridge lifecycle, per-property error handling in applyPatchState |
| **🗺️ Network Map** | New Network Map page with React Flow visualization in the frontend UI |
| **📱 Mobile UI** | Responsive mobile navigation with hamburger menu drawer, wrapped action buttons ([#144](https://github.com/RiDDiX/home-assistant-matter-hub/issues/144)) |
| **📋 Page Size Selector** | Configurable page size selector on All Devices page |
| **📖 Labels & Areas Page** | New Labels & Areas reference page in the frontend UI |
| **🐛 Behavior Error Logging** | Enhanced diagnostic logging for "Behaviors have errors" — extracts per-behavior error details |

</details>

<details>
<summary><strong>🧪 Alpha Features (v2.1.0-alpha.x)</strong> - Click to expand</summary>

> [!NOTE]
> Alpha and Stable are currently in sync. No additional alpha-only features at this time.

</details>

<details>
<summary><strong>⚠️ Testing Features (v4.1.0-testing)</strong> - Click to expand</summary>

> [!CAUTION]
> Testing versions are **highly unstable** and intended for developers only!

**🏗️ Vision 1: Callback-based Architecture**

| Old (Legacy) | New (Vision 1) |
|--------------|----------------|
| Behaviors update themselves | Endpoint updates behaviors via `setStateOf()` |
| Behaviors call HA actions directly | Behaviors notify via `notifyEndpoint()` |

**New Callback-Behaviors:** OnOff, LevelControl, Lock, Cover, Fan, ColorControl, VacuumRunMode, VacuumOperationalState

**Updated Endpoints:** Switch, Lock, Cover, Vacuum, Button, Valve, Scene, Humidifier, Light, Fan

</details>

<details>
<summary><strong>📜 Previous Stable Versions</strong> - Click to expand</summary>

### v2.0.16
Force Sync, Lock PIN, Cover/Blinds improvements, Roborock Rooms, Auto Entity Grouping, Water Heater, Vacuum Server Mode, OOM fix

### v1.10.4
Climate/Thermostat fixes, Cover position fix, Vacuum battery, Humidifier improvements, Entity Mapping, Alexa brightness preserve

### v1.9.0
Custom bridge icons, Basic Video Player (TV), Alexa deduplication, Auto-only thermostat, Health Check API, WebSocket, Full backup/restore

### v1.8.x
Graceful crash handler, PM2.5/PM10 sensors, Water Valve, Smoke/CO Detector, Pressure/Flow sensors, Air Purifier, Pump device

### v1.7.x
Dark Mode toggle, Device list sorting

### v1.5.x
Matter Bridge, Multi-Fabric support, Health Monitoring, Bridge Wizard, AirQuality sensors, Fan control, Media playback

</details>

---

## Supported Device Types

| Home Assistant Domain | Matter Device Type | Feature Flags |
|-----------------------|-------------------|---------------|
| `light` | On/Off, Dimmable, Color Temp, Extended Color | |
| `switch`, `input_boolean` | On/Off Plug-in Unit | |
| `lock` | Door Lock | PIN Credentials, Unlatch/Unbolt |
| `cover` | Window Covering | `coverSwapOpenClose` |
| `climate` | Thermostat | Battery via `batteryEntity` |
| `fan` | Fan, Air Purifier | Oscillation, Wind Modes |
| `binary_sensor` | Contact, OnOff, Occupancy, Smoke/CO, Water Leak | |
| `sensor` | Temperature, Humidity, Pressure, Flow, Light, AirQuality | `batteryEntity`, `humidityEntity`, `pressureEntity` |
| `button`, `input_button` | Generic Switch | |
| `media_player` | Speaker, Basic Video Player (TV) | |
| `valve` | Water Valve, Pump | |
| `vacuum` | Robot Vacuum Cleaner | `serverMode`, `roomEntities`, `batteryEntity` |
| `humidifier` | Humidifier/Dehumidifier | |
| `water_heater` | Thermostat (Heating) | |
| `automation`, `script`, `scene` | On/Off Switch | |

> 📖 See [Supported Device Types Documentation](https://riddix.github.io/home-assistant-matter-hub/Supported%20Device%20Types/) for details

---

## 🤖 Robot Vacuum Server Mode

<details>
<summary><strong>⚠️ Important: Apple Home & Alexa require Server Mode for Robot Vacuums</strong> (click to expand)</summary>

### The Problem

Apple Home and Alexa **do not properly support bridged robot vacuums**. When your vacuum is exposed through a standard Matter bridge, you may experience:

- **Apple Home**: "Updating" status, Siri commands don't work, room selection fails
- **Alexa**: Vacuum is not discovered at all

This is because these platforms expect robot vacuums to be **standalone Matter devices**, not bridged devices.

### The Solution: Server Mode

**Server Mode** exposes your vacuum as a standalone Matter device without the bridge wrapper. This makes it fully compatible with Apple Home and Alexa.

### Setup Instructions

1. **Create a new bridge** in the Matter Hub web interface
2. **Enable "Server Mode"** checkbox in the bridge creation wizard
3. Add **only your vacuum** to this bridge
4. **Pair the new Server Mode bridge** with Apple Home or Alexa
5. Your other devices stay on your regular bridge(s)

### Important Notes

- Server Mode bridges support **exactly one device**
- Your vacuum needs its own dedicated Server Mode bridge
- Other device types (lights, switches, sensors) work fine on regular bridges
- After switching to Server Mode, Siri commands like "Hey Siri, start the vacuum" will work

### Documentation

For more details, see the [Robot Vacuum Documentation](https://riddix.github.io/home-assistant-matter-hub/Devices/Robot%20Vacuum/).

</details>

---

## Installation

### Home Assistant Add-on (Recommended)

Add this repository to your Add-on Store:

```
https://github.com/RiDDiX/home-assistant-addons
```

Two add-ons are available:
- **Home-Assistant-Matter-Hub** - Stable release
- **Home-Assistant-Matter-Hub (Alpha)** - Pre-release for testing

### Docker

```bash
docker run -d \
  --name home-assistant-matter-hub \
  --network host \
  -v /path/to/data:/data \
  -e HAMH_HOME_ASSISTANT_URL=http://192.168.178.123:8123 \
  -e HAMH_HOME_ASSISTANT_ACCESS_TOKEN=your_long_lived_access_token \
  ghcr.io/riddix/home-assistant-matter-hub:latest
```

> **Note:** All environment variables require the `HAMH_` prefix.
> See the [Installation Guide](docs/Getting%20Started/Installation.md) for all available options.

For alpha versions, use tag `alpha` instead of `latest`.

---

## Documentation

Please see the [documentation](https://riddix.github.io/home-assistant-matter-hub) for detailed installation instructions,
configuration options, known issues, limitations and guides.

---

## 🔧 Network Troubleshooting

<details>
<summary><strong>⚠️ "No Response" / Connection Drops — Common Network Causes</strong> (click to expand)</summary>

### The Problem

Your Matter devices suddenly show **"No Response"** (Apple Home), **"Unavailable"** (Google Home), or become **unresponsive** after some time — even though the bridge is still running and other controllers (e.g., Alexa) continue to work fine.

### Root Cause: Network Equipment Blocking mDNS/Multicast

Matter relies heavily on **mDNS (multicast DNS)** for device discovery and reachability. Many routers, access points, and managed switches have features that **filter, throttle, or block multicast traffic** — which breaks Matter communication silently.

> **💡 This was confirmed and documented thanks to the excellent systematic testing by [@omerfaruk-aran](https://github.com/omerfaruk-aran) in [#129](https://github.com/RiDDiX/home-assistant-matter-hub/issues/129).** The issue was traced to a TP-Link Archer AX50 (in AP mode) sitting between the Apple TV and the network — its default settings were blocking/limiting mDNS/Bonjour traffic over time.

### What to Check on Your Network Equipment

1. **IGMP Snooping** — Disable or configure it to allow mDNS (`224.0.0.251` / `ff02::fb`)
2. **Multicast Optimization / Multicast Enhancement** — Disable (often called "Airtime Fairness" or "Multicast to Unicast")
3. **AP Isolation / Client Isolation** — Must be **disabled** so devices on the same network can communicate
4. **mDNS / Bonjour Forwarding** — Enable if available (some enterprise APs have this)
5. **DHCP Server on secondary devices** — Disable DHCP on access points / switches that are NOT your main router (multiple DHCP servers cause IP conflicts)
6. **Firmware Updates** — Update your router/AP firmware, as multicast handling is frequently improved

### Affected Equipment (Known Cases)

| Device | Issue | Fix |
|--------|-------|-----|
| **TP-Link Archer AX50** (AP mode) | mDNS traffic blocked/limited over time | Firmware update + disable DHCP on the AP |
| **Ubiquiti UniFi APs** | IGMP Snooping can filter mDNS | Disable IGMP Snooping or enable mDNS Reflector |
| **Managed Switches** (various) | Multicast filtering enabled by default | Allow mDNS multicast groups |

### Quick Diagnostic Steps

1. **Does Alexa still work when Apple Home shows "No Response"?**
   - **Yes** → Bridge is online, the issue is network path / mDNS related
   - **No** → Bridge may actually be down, check HAMH logs

2. **Does removing a Home Hub (HomePod/Apple TV) fix it?**
   - **Yes** → The hub's network path is affected (AP/switch between hub and bridge)
   - **No** → May be a different issue

3. **Try binding mDNS to a specific interface:**
   ```
   --mdns-network-interface eth0
   ```
   (or `end0`, `enp0s18`, etc. — check your system)

### Network Topology Tips

- **Keep the path simple**: Avoid placing access points or managed switches between your Matter bridge (Home Assistant) and your Home Hub (HomePod/Apple TV)
- **Use wired connections** where possible for Home Hubs and the Home Assistant host
- **Same subnet**: All Matter devices, controllers, and the bridge must be on the same Layer 2 network / subnet
- **IPv6**: Matter uses IPv6 link-local addresses — make sure IPv6 is not disabled on your network

</details>

---

## Migration from t0bst4r

Migrating from the original `t0bst4r/home-assistant-matter-hub` is straightforward. **Your Matter fabric connections and paired devices will be preserved!**

### Home Assistant Add-on

1. **Backup your data:**
   ```bash
   # SSH into Home Assistant and find your add-on folder
   ls /addon_configs/
   # Look for folder ending with _hamh (e.g., a0c_hamh)
   
   cp -r /addon_configs/*_hamh /config/hamh-backup
   ```

2. **Uninstall the old add-on** (Settings → Add-ons → Uninstall)

3. **Add the new repository:**
   ```
   https://github.com/RiDDiX/home-assistant-addons
   ```

4. **Install and start the new add-on**, then check the new _hamh folder:
   ```bash
   ls /addon_configs/
   ```

5. **Stop the add-on** and restore your backup:
   ```bash
   cp -r /config/hamh-backup/* /addon_configs/*_hamh/
   ```

6. **Start the add-on again** - your devices should reconnect automatically

### Docker / Docker Compose

Simply change the image from:
```
ghcr.io/t0bst4r/home-assistant-matter-hub:latest
```
to:
```
ghcr.io/riddix/home-assistant-matter-hub:latest
```

Your volume mounts stay the same - no data migration needed.

> For detailed instructions, see the [full Migration Guide](https://riddix.github.io/home-assistant-matter-hub/migration-from-t0bst4r/).

---

## 🙏 Contributors & Acknowledgments

This project thrives thanks to the amazing community! Special thanks to everyone who contributes by reporting bugs, suggesting features, and helping others.

### 🏆 Top Contributors

| Contributor | Contributions |
|-------------|---------------|
| [@codyc1515](https://github.com/codyc1515) | 🥇 **Top Reporter** - Climate/thermostat bugs (#52, #24, #21, #20), extensive testing feedback |
| [@Hatton920](https://github.com/Hatton920) | 🤖 **Vacuum Expert** - Intensive testing of Robot Vacuum Server Mode, Apple Home & Siri validation |
| [@Chrulf](https://github.com/Chrulf) | 🔍 Google Home brightness debugging (#41), detailed logs & testing |
| [@SH1FT-W](https://github.com/SH1FT-W) | 💎 **Sponsor** + Vacuum room selection feature request (#49) |
| [@depahk](https://github.com/depahk) | 📝 Migration documentation fix ([#32](https://github.com/RiDDiX/home-assistant-matter-hub/pull/32)) |
| [@Fettkeewl](https://github.com/Fettkeewl) | 🐛 Script import bug (#26), Alias feature request (#25) |
| [@razzietheman](https://github.com/razzietheman) | 🥈 **Active Tester** - Bridge icons (#101), sorting (#80), feature requests (#31, #30), extensive UI/UX feedback |
| [@markgaze](https://github.com/markgaze) | 🤖 **Code Contributor** - Ecovacs Deebot room support ([#118](https://github.com/RiDDiX/home-assistant-matter-hub/pull/118)) |
| [@omerfaruk-aran](https://github.com/omerfaruk-aran) | 🔧 **Network Debugging Expert** - Systematic mDNS/multicast root cause analysis for "No Response" issues ([#129](https://github.com/RiDDiX/home-assistant-matter-hub/issues/129)) |

<details>
<summary><strong>📋 Issue Tracker - All Contributors</strong> (click to expand)</summary>

Thank you to everyone who helps improve this project by reporting issues!

| User | Issues |
|------|--------|
| [@omerfaruk-aran](https://github.com/omerfaruk-aran) | #129 |
| [@markgaze](https://github.com/markgaze) | #118 |
| [@BlairC1](https://github.com/BlairC1) | #117 |
| [@Giamp96](https://github.com/Giamp96) | #116 |
| [@NdR91](https://github.com/NdR91) | #115 #106 |
| [@Fry7](https://github.com/Fry7) | #114 |
| [@siobhanellis](https://github.com/siobhanellis) | #112 |
| [@Hatton920](https://github.com/Hatton920) | #110 |
| [@gette](https://github.com/gette) | #95 |
| [@400HPMustang](https://github.com/400HPMustang) | #103 |
| [@vandir](https://github.com/vandir) | #102 |
| [@razzietheman](https://github.com/razzietheman) | #101 #100 #80 #31 #30 |
| [@semonR](https://github.com/semonR) | #99 #58 |
| [@italoc](https://github.com/italoc) | #78 |
| [@marksev1](https://github.com/marksev1) | #62 |
| [@smacpi](https://github.com/smacpi) | #60 |
| [@mrbluebrett](https://github.com/mrbluebrett) | #53 |
| [@anpak](https://github.com/anpak) | #45 |
| [@alondin](https://github.com/alondin) | #43 |
| [@Chrulf](https://github.com/Chrulf) | #41 |
| [@Weske90](https://github.com/Weske90) | #40 |
| [@didiht](https://github.com/didiht) | #37 |
| [@Dixiland20](https://github.com/Dixiland20) | #34 |
| [@chromaxx7](https://github.com/chromaxx7) | #29 |
| [@Tomyk9991](https://github.com/Tomyk9991) | #28 |
| [@datvista](https://github.com/datvista) | #27 |
| [@bwynants](https://github.com/bwynants) | #23 |
| [@Pozzi831](https://github.com/Pozzi831) | #22 |
| [@codyc1515](https://github.com/codyc1515) | #52 #24 #21 #20 |

</details>

### 💖 Sponsors

> **Donations are completely voluntary!** I'm incredibly grateful to everyone who has supported this project - it wasn't necessary, but it truly means a lot. This project exists because of passion for open source, not money. ❤️

| Sponsor | |
|---------|---|
| [@thorsten-gehrig](https://github.com/thorsten-gehrig) | 🥇 **First Sponsor!** Thank you for believing in this project! |
| [@SH1FT-W](https://github.com/SH1FT-W) | 💎 Thank you for your generous support! |
| [@ilGaspa](https://github.com/ilGaspa) | 💎 Thank you for your generous support! |
| [@linux4life798](https://github.com/linux4life798) | 💎 Thank you for your generous support! |
| [@torandreroland](https://github.com/torandreroland) | 💎 Thank you for your generous support! |
| [@ralondo](https://github.com/ralondo) | 💎 Thank you for your generous support! |
| [@bexxter85-ux](https://github.com/bexxter85-ux) | 💎 Thank you for your generous support! |
| [@dinariox](https://github.com/dinariox) | 💎 Thank you for your generous support! |
| StefanS | 💎 Thank you for your generous support! |
| Manny B. | 💎 Thank you for your generous support! |
| *Anonymous supporters* | 🙏 Thank you to those who prefer not to be named - your support is equally appreciated! |

### 🌟 Original Author

- **[@t0bst4r](https://github.com/t0bst4r)** - Creator of the original Home-Assistant-Matter-Hub project

---

## ☕ Support the Project

> [!NOTE]
> **Completely optional!** This project will continue regardless of donations.
> I maintain this in my free time because I believe in open source.

If you find this project useful, consider supporting its development:

[![PayPal](https://img.shields.io/badge/PayPal-Donate-blue?logo=paypal&style=for-the-badge)](https://www.paypal.me/RiDDiX93)

Your support helps cover hosting costs and motivates continued development. Thank you! ❤️

---

## 📊 Project Stats

<div align="center">

![GitHub commit activity](https://img.shields.io/github/commit-activity/m/RiDDiX/home-assistant-matter-hub)
![GitHub last commit](https://img.shields.io/github/last-commit/RiDDiX/home-assistant-matter-hub)
![GitHub issues](https://img.shields.io/github/issues/RiDDiX/home-assistant-matter-hub)
![GitHub closed issues](https://img.shields.io/github/issues-closed/RiDDiX/home-assistant-matter-hub)
![GitHub pull requests](https://img.shields.io/github/issues-pr/RiDDiX/home-assistant-matter-hub)

</div>

---
