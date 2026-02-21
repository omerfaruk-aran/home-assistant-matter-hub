# Robot Vacuum

Robot vacuums are exposed as Matter **Robotic Vacuum Cleaner** devices with the following capabilities:

- **On/Off** - Start and stop cleaning
- **RVC Operational State** - Current state (idle, running, docked, error)
- **RVC Run Mode** - Cleaning modes including room-specific cleaning
- **Service Area** - Room selection for Apple Home (Matter 1.4)
- **RVC Clean Mode** - Cleaning type selection (Sweeping, Mopping, etc.)
- **Power Source** - Battery level (if available)

## Cleaning Modes

The RVC Clean Mode cluster allows selecting the cleaning type. This is auto-enabled for Dreame and Ecovacs vacuums, and can be manually configured for other brands.

### Supported Cleaning Modes

| Mode | Matter Tag | Description |
|------|-----------|-------------|
| Vacuum | Vacuum | Dry vacuum only |
| Mop | Mop | Wet mop only |
| Vacuum & Mop | Vacuum + Mop | Vacuum and mop simultaneously |
| Vacuum Then Mop | DeepClean + Vacuum + Mop | Vacuum first, then mop |

### Auto-Detection (Dreame)

For Dreame vacuums, the cleaning mode entity is automatically derived from the vacuum entity ID:
- `vacuum.r2d2` → `select.r2d2_cleaning_mode`

No manual configuration is needed unless the entity naming differs (e.g., special characters in the vacuum name).

### Manual Configuration (Ecovacs, Others)

For vacuums where the cleaning mode entity can't be auto-detected (Ecovacs, or Dreame with non-standard naming), you need to configure it manually:

1. Go to your **bridge settings** → **Entity Mappings**
2. **Edit your vacuum entity** (e.g., `vacuum.t20_omni`)
3. Set **Cleaning Mode Entity** to the select entity that controls the cleaning mode (e.g., `select.t20_omni_betriebsmodus`)
4. **Restart the bridge**

After configuration, your controller (Apple Home, Alexa) should show the available cleaning mode options.

:::{tip}
To find the correct select entity, look in Home Assistant for a `select.*` entity belonging to your vacuum device that has options like "Vacuum", "Mop", "Vacuum and mop", etc. The naming varies by brand and language.
:::

## Suction Level (Apple Home Extra Features)

When your vacuum has fan speed options (e.g., Silent, Standard, Turbo), HAMH adds extra intensity modes that Apple Home shows in its **extra features panel**.

### Auto-Detection

Fan speed support is **automatically detected** from the vacuum's `fan_speed_list` attribute. No manual configuration is needed — if your vacuum reports fan speed options, the extra features panel will be available in Apple Home.

### How it Works

When fan speed is available, HAMH exposes 7 cleaning modes (4 cleaning types + 3 intensity levels):

| Mode | Matter Tags | Description |
|------|-----------|-------------|
| Quiet | Vacuum + Quiet | Lower suction for quiet operation |
| Standard | Vacuum | Normal suction level |
| Strong | Vacuum + Max | Maximum suction power |

Apple Home groups the intensity modes as toggleable "extra features" under the Vacuum cleaning type.

Changing the intensity in Apple Home calls `vacuum.set_fan_speed` in Home Assistant.

### Manual Override (suctionLevelEntity)

If your vacuum uses a separate `select.*` entity for suction control instead of the built-in fan speed, you can configure `suctionLevelEntity` in the Entity Mapping to override the auto-detected fan speed.

## Mop Intensity (Apple Home Extra Features)

When your vacuum has mop intensity / water level options (e.g., Low, Medium, High), HAMH adds mop intensity modes that Apple Home shows in its **extra features panel** under the Mop cleaning type.

### Auto-Detection

Mop intensity entities are **automatically detected** for Dreame and Ecovacs vacuums based on naming conventions. No manual configuration is needed.

### Manual Configuration (mopIntensityEntity)

If your vacuum uses a separate `select.*` entity for mop intensity / water level, configure `mopIntensityEntity` in the Entity Mapping:

1. Go to your **bridge settings** → **Entity Mappings**
2. **Edit your vacuum entity**
3. Set **Mop Intensity Entity** to the select entity (e.g., `select.r2_d2_mop_pad_humidity`)
4. The mop intensity modes will appear in Apple Home's extra features panel

---

## Server Mode (Recommended for Apple Home & Alexa)

:::{important}
**Apple Home and Alexa do not properly support bridged robot vacuums.** They require the vacuum to appear as a **standalone Matter device**, not as part of a bridge.

If your vacuum shows "Updating" in Apple Home, doesn't respond to Siri commands, or isn't discovered by Alexa, you need to use **Server Mode**.
:::

### What is Server Mode?

Server Mode exposes a single device as a **standalone Matter device** instead of a bridged device. This is required because:

- Apple Home doesn't support Siri voice commands for bridged RVCs
- Alexa doesn't discover bridged RVCs at all
- The vacuum shows "Updating" or "Not Responding" in Apple Home

### How to Enable Server Mode

1. **Create a new bridge** in the Matter Hub web interface
2. **Enable "Server Mode"** checkbox in the bridge creation wizard
3. Add **only your vacuum** to this bridge (Server Mode supports exactly 1 device)
4. **Pair the new bridge** with Apple Home or Alexa
5. Your other devices stay on your regular bridge(s)

:::{note}
Server Mode bridges can only contain **one device**. This is a Matter protocol requirement for standalone devices.
:::

### After Enabling Server Mode

- Your vacuum will appear as a native Matter device (not bridged)
- Siri voice commands like "Hey Siri, start the vacuum" will work
- Alexa will discover and control the vacuum
- Room selection via Service Area will work in Apple Home

## Room Selection

Room selection is supported through two mechanisms:

### 1. RVC Run Mode (Google Home, Alexa, etc.)

Custom cleaning modes are created for each room, e.g., "Clean Kitchen", "Clean Living Room". These appear as selectable modes in compatible controllers.

### 2. Service Area Cluster (Apple Home)

Apple Home uses the Matter 1.4 **Service Area** cluster for room selection. This is automatically enabled when your vacuum exposes room data.

## Room Data Requirements

For room selection to work, your vacuum integration must expose room data as entity attributes. Supported formats:

```yaml
# Format 1: Direct array
rooms:
  - id: 1
    name: Kitchen
  - id: 2
    name: Living Room

# Format 2: Segments array
segments:
  - id: 1
    name: Kitchen
  - id: 2
    name: Living Room

# Format 3: Dreame nested format
rooms:
  "My Home":
    - id: 1
      name: Kitchen
    - id: 2
      name: Living Room
```

## Apple Home & Alexa Limitations

Apple Home and Alexa have specific limitations with robot vacuums over Matter:

### Why Bridged Vacuums Don't Work

Both Apple Home and Alexa expect robot vacuums to be **standalone Matter devices**. When exposed through a bridge (with `BridgedDeviceBasicInformation` cluster), they:

- **Apple Home**: Shows "Updating", Siri commands fail, room selection doesn't work
- **Alexa**: Doesn't discover the vacuum at all

### Solution: Use Server Mode

**Server Mode** is the recommended solution. See [Server Mode](#server-mode-recommended-for-apple-home--alexa) above for setup instructions.

:::{tip}
Server Mode was added specifically to fix these issues. It exposes the vacuum as a native Matter device without the bridge wrapper, making it fully compatible with Apple Home and Alexa.
:::

## Supported Integrations

Room selection works with any integration that exposes room data as attributes:

| Integration | Room Attribute | Cleaning Modes | Notes |
|-------------|---------------|----------------|-------|
| Roborock (Official) | Auto-detected via `roborock.get_maps` | — | Automatic since v2.1.0 (fallback: button entities) |
| Roborock (Xiaomi Miot) | `rooms` or `segments` | — | Native support |
| Dreame | `rooms` | Auto-detected | Nested format with map name |
| Xiaomi | `rooms` | — | May require custom integration |
| Ecovacs | `rooms` | Via `cleaningModeEntity` | Set cleaning mode entity in Entity Mapping |

### Roborock (Official Integration)

Since v2.1.0, HAMH **automatically detects Roborock rooms** via the `roborock.get_maps` service call. No manual button entity mapping is needed — rooms are resolved directly from the Roborock cloud and appear in Apple Home's room selection.

The startup log will show: `Resolved X rooms via roborock.get_maps`

#### Fallback: Manual Button Entity Mapping

If auto-detection doesn't work (e.g., older Roborock firmware or custom integration), you can still use button entities:

**Example button entities:**
- `button.roborock_clean_kitchen`
- `button.roborock_clean_living_room`
- `button.roborock_clean_bedroom`

1. **Open the Entity Mapping page** in the Matter Hub web UI
2. **Edit your Roborock vacuum entity** (e.g., `vacuum.roborock_qrevo`)
3. In the **"Room Button Entities"** field, select the button entities for each room
   - The UI will auto-discover button entities belonging to the same device
   - You can also manually enter entity IDs
4. **Save** the mapping
5. Changes take effect automatically within ~30 seconds

#### How button entity mapping works

When you select a room in Apple Home and start cleaning:
1. HAMH identifies which room was selected
2. Presses the corresponding button entity in Home Assistant
3. The Roborock integration triggers the room cleaning via the Roborock cloud

:::{tip}
You can also create **multi-room scenes** in the Roborock app (e.g., "Kitchen + Living Room") and map those button entities for combined room cleaning.
:::

### Dreame Integration Note

The Dreame integration exposes room data in a nested format. As of version 1.x-alpha.150+, this format is fully supported.

If your vacuum uses separate `select` entities for room selection instead of attributes, you may need to use the `cleaningModeEntity` mapping instead.

## Troubleshooting

### Rooms not appearing in Apple Home

1. **Re-pair the vacuum**: Remove it from Apple Home and add it again after updating
2. **Check room attributes**: Verify your vacuum has `rooms`, `segments`, or `room_list` in its attributes
3. **Separate bridge**: Try putting the vacuum in its own bridge (see above)

### Room selection not working

1. Check the logs for errors when selecting a room
2. Verify the vacuum integration supports the `vacuum.send_command` service with `app_segment_clean`

### Vacuum not showing in Apple Home

This is likely the bridge limitation issue. Create a separate bridge with only the vacuum.
