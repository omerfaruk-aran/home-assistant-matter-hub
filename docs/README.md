# Home-Assistant-Matter-Hub

!["Home-Assistant-Matter-Hub"](./assets/hamh-logo-small.png)

---

> **Community Fork** - This is a fork of the original [t0bst4r/home-assistant-matter-hub](https://github.com/t0bst4r/home-assistant-matter-hub), which was discontinued in January 2026. We continue active development with bug fixes, new features, and community support.
>
> We actively work on fixing old issues from the original project and welcome new feature requests. This is a living project maintained by the community!

---

This project simulates bridges to publish your entities from Home Assistant to any Matter-compatible controller like
Alexa, Apple Home or Google Home. Using Matter, those can be connected easily using local communication without the need
of port forwarding etc.

---

## Known issues and limitations

### Device Type Support

This project does not yet support all available device types in the matter specification.
In addition, controllers like Alexa or Google Home do not support all device types, too.

To check which types are supported, please review the
[list of supported device types](./Supported%20Device%20Types.md).

### Alexa

- Alexa cannot pair with a bridge which has too many devices attached. It seems to have a limit of
  about 80-100 devices
- Alexa needs at least one Amazon device which supports Matter to pair with a Matter device.
  If you only have a third party smart speaker which supports Alexa, this isn't enough.

### Google Home

- Google Home needs an actual Google Hub to connect a Matter device. Just using the GH app isn't enough.
- Google Home can deny the Matter device under certain conditions because it is not a certified Matter
  device. You need to follow
  [this guide](https://github.com/project-chip/matter.js/blob/main/docs/ECOSYSTEMS.md#google-home-ecosystem)
  to register your hub.

### Network setup

The Matter protocol is designed to work best with UDP and IPv6 within your local network. At the moment some
manufacturers built their controllers to be compatible with IPv4, too, but this can break at any time with any update.

Many users report connection issues when using VLANs or firewalls, where HAMH and the assistant devices (Alexa, Google
Home, ...) are not placed in the same network segment. Please make sure to review the
[common connectivity issues](./Guides/Connectivity%20Issues.md).

## What's New

<details>
<summary><strong>📦 Stable (v2.0.31) - Current</strong></summary>

**New in v2.0.31:**

| Feature | Description |
|---------|-------------|
| **🎮 Controller Profiles & Area Setup** | New bridge wizard with controller-specific profiles (Apple Home, Google Home, Alexa) and area-based bridge setup |
| **🌀 Fan Speed/Preset Fix** | Fix fan speed and preset control not working from Matter controllers ([#233](https://github.com/RiDDiX/home-assistant-matter-hub/issues/233)) |
| **💡 Optimistic State Fix** | Prevent stale HA state from reverting optimistic brightness/color updates ([#230](https://github.com/RiDDiX/home-assistant-matter-hub/issues/230)) |
| **🪟 Cover Target Fix** | Route boundary cover targets to open/close regardless of direction ([#240](https://github.com/RiDDiX/home-assistant-matter-hub/issues/240)) |
| **�️ Humidity Auto-Mapping Default** | Make autoHumidityMapping default-enabled like autoPressureMapping |

**Previously in v2.0.30:**

| Feature | Description |
|---------|-------------|
| **🔗 Mapped Entity Propagation Fix** | Propagate mapped entity changes (battery, humidity, etc.) to Matter endpoints — fixes stale sensor readings |
| **🖥️ API Error Surfacing** | Surface API errors instead of silently swallowing them ([#232](https://github.com/RiDDiX/home-assistant-matter-hub/issues/232)) |

</details>

<details>
<summary><strong>🧪 Alpha (v2.1.0-alpha.x)</strong></summary>

**Alpha is currently in sync with Stable (v2.0.31).** All alpha features have been promoted to stable. New alpha features will appear here as development continues. See the [Alpha Features Guide](./Guides/Alpha%20Features.md) for installation instructions.

</details>

<details>
<summary><strong>📋 Previous Versions</strong></summary>

### v2.0.30
Mapped Entity Propagation Fix, API Error Surfacing

### v2.0.29
Light currentLevel Fix, Bridge Config Save Fix, Fan Device Feature Fix, Humidity Auto-Mapping Fix

### v2.0.28
Device Image Support, Custom Fan Speed Mapping, TV Source Selection, Reverse Proxy Base Path, On/Off-Only Fans, Light Brightness Fix, Fan Speed Fixes, Composed Air Purifier Fix, Dreame Multi-Floor Fix, Optimistic State Updates, Frontend Improvements

### v2.0.27
Valetudo support, Custom Service Areas, ServiceArea Maps, Vacuum Identify/Locate/Charging, Alarm Control Panel, Composed Air Purifier, Dashboard Controls, Vendor Brand Icons, Thermostat fixes

### v2.0.26
Authentication UI, Select Entity Support, Webhook Event Bridge, Cluster Diagnostics, Matter.js 0.16.10, Docker Node 22

### v2.0.25
Vacuum mop intensity, vacuum auto-detection, Roborock room auto-detect, live entity mapping, dynamic heap sizing

### v2.0.17–v2.0.23
Thermostat overhaul, Lock Unlatch, Vacuum Server Mode, Bridge Templates, Live Filter Preview, Entity Diagnostics, Multi-Bridge Bulk Operations, Power & Energy Measurement, Event domain, Network Map, Mobile UI

### v2.0.16
Force Sync, Lock PIN, Cover/Blinds improvements, Roborock Rooms, Auto Entity Grouping, Water Heater, Vacuum Server Mode, OOM fix

### v1.9.0
Custom bridge icons, Basic Video Player, Alexa deduplication, Health Check API, WebSocket, Full backup/restore

### v1.8.x
Graceful crash handler, PM2.5/PM10 sensors, Water Valve, Smoke/CO Detector, Pressure/Flow sensors

### v1.5.x
Health Monitoring, Bridge Wizard, AirQuality sensors, Fan control, Media playback

</details>

## Getting started

To get things up and running, please follow the [installation guide](./Getting%20Started/Installation.md).

## Additional Resources

If you need more assistance on the topic, please have a look at the following external resources:

### Videos

#### YouTube-Video on "HA Matter HUB/BRIDGE 😲 👉 Das ändert alles für ALEXA und GOOGLE Nutzer" (🇩🇪)

[![HA Matter HUB/BRIDGE 😲 👉 Das ändert alles für ALEXA und GOOGLE Nutzer](https://img.youtube.com/vi/yOkPzEzuVhM/mqdefault.jpg)](https://www.youtube.com/watch?v=yOkPzEzuVhM)

#### YouTube-Video on "Alexa et Google Home dans Home Assistant GRATUITEMENT grâce à Matter" (🇫🇷)

[![Alexa et Google Home dans Home Assistant GRATUITEMENT grâce à Matter](https://img.youtube.com/vi/-TMzuHFo_-g/mqdefault.jpg)](https://www.youtube.com/watch?v=-TMzuHFo_-g)

## Support the Project

> **This is completely optional!** The project will continue regardless of donations.
> I maintain this in my free time because I believe in open source and helping the community.

If you find this project useful and want to support its development, consider buying me a coffee! ☕

[![PayPal](https://img.shields.io/badge/PayPal-Donate-blue?logo=paypal)](https://www.paypal.me/RiDDiX93)

Maintaining this project takes time and effort - from fixing bugs, adding new features, to helping users in issues.
Your support is appreciated but never expected. Thank you for using Home-Assistant-Matter-Hub! ❤️
