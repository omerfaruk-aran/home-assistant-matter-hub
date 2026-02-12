import type {
  EntityMappingConfig,
  MatterDeviceType,
} from "@home-assistant-matter-hub/common";
import {
  domainToDefaultMatterTypes,
  matterDeviceTypeLabels,
} from "@home-assistant-matter-hub/common";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";

interface RelatedButton {
  entity_id: string;
  friendly_name?: string;
  clean_name: string;
}

interface EntityMappingDialogProps {
  open: boolean;
  entityId: string;
  domain: string;
  currentMapping?: EntityMappingConfig;
  onSave: (config: Partial<EntityMappingConfig>) => void;
  onClose: () => void;
}

export function EntityMappingDialog({
  open,
  entityId,
  domain,
  currentMapping,
  onSave,
  onClose,
}: EntityMappingDialogProps) {
  const [editEntityId, setEditEntityId] = useState(entityId);
  const [matterDeviceType, setMatterDeviceType] = useState<
    MatterDeviceType | ""
  >("");
  const [customName, setCustomName] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [filterLifeEntity, setFilterLifeEntity] = useState("");
  const [cleaningModeEntity, setCleaningModeEntity] = useState("");
  const [humidityEntity, setHumidityEntity] = useState("");
  const [pressureEntity, setPressureEntity] = useState("");
  const [batteryEntity, setBatteryEntity] = useState("");
  const [roomEntities, setRoomEntities] = useState<string[]>([]);
  const [disableLockPin, setDisableLockPin] = useState(false);
  const [availableButtons, setAvailableButtons] = useState<RelatedButton[]>([]);
  const [loadingButtons, setLoadingButtons] = useState(false);

  const isNewMapping = !entityId;

  useEffect(() => {
    if (open) {
      setEditEntityId(entityId);
      setMatterDeviceType(currentMapping?.matterDeviceType || "");
      setCustomName(currentMapping?.customName || "");
      setDisabled(currentMapping?.disabled || false);
      setFilterLifeEntity(currentMapping?.filterLifeEntity || "");
      setCleaningModeEntity(currentMapping?.cleaningModeEntity || "");
      setHumidityEntity(currentMapping?.humidityEntity || "");
      setPressureEntity(currentMapping?.pressureEntity || "");
      setBatteryEntity(currentMapping?.batteryEntity || "");
      setRoomEntities(currentMapping?.roomEntities || []);
      setDisableLockPin(currentMapping?.disableLockPin || false);
      setAvailableButtons([]);
    }
  }, [open, entityId, currentMapping]);

  // Load available button entities for vacuum domain
  useEffect(() => {
    if (!open || !entityId || domain !== "vacuum") {
      return;
    }

    const loadButtons = async () => {
      setLoadingButtons(true);
      try {
        const response = await fetch(
          `api/home-assistant/related-buttons/${encodeURIComponent(entityId)}`,
        );
        if (response.ok) {
          const data = await response.json();
          setAvailableButtons(data.buttons || []);
        }
      } catch (error) {
        console.error("Failed to load related buttons:", error);
      } finally {
        setLoadingButtons(false);
      }
    };

    loadButtons();
  }, [open, entityId, domain]);

  const currentDomain = editEntityId.split(".")[0] || domain;

  const handleSave = useCallback(() => {
    if (!editEntityId.trim()) return;
    onSave({
      entityId: editEntityId.trim(),
      matterDeviceType: matterDeviceType || undefined,
      customName: customName.trim() || undefined,
      disabled,
      filterLifeEntity: filterLifeEntity.trim() || undefined,
      cleaningModeEntity: cleaningModeEntity.trim() || undefined,
      humidityEntity: humidityEntity.trim() || undefined,
      pressureEntity: pressureEntity.trim() || undefined,
      batteryEntity: batteryEntity.trim() || undefined,
      roomEntities: roomEntities.length > 0 ? roomEntities : undefined,
      disableLockPin: disableLockPin || undefined,
    });
  }, [
    editEntityId,
    matterDeviceType,
    customName,
    disabled,
    filterLifeEntity,
    cleaningModeEntity,
    humidityEntity,
    pressureEntity,
    batteryEntity,
    roomEntities,
    disableLockPin,
    onSave,
  ]);

  // Show filter life entity field for air purifiers (fan domain or explicit air_purifier type)
  const showFilterLifeField =
    matterDeviceType === "air_purifier" ||
    (currentDomain === "fan" && !matterDeviceType);

  // Show cleaning mode entity field for vacuums
  const showCleaningModeField = currentDomain === "vacuum";

  // Show room entities field for vacuums (Roborock room selection)
  const showRoomEntitiesField = currentDomain === "vacuum";

  // Show humidity/battery entity fields for temperature sensors
  const showHumidityBatteryFields =
    matterDeviceType === "temperature_sensor" ||
    (currentDomain === "sensor" && !matterDeviceType);

  // Show PIN disable option for locks
  const showLockPinField =
    matterDeviceType === "door_lock" || currentDomain === "lock";

  const availableTypes = Object.entries(matterDeviceTypeLabels) as [
    MatterDeviceType,
    string,
  ][];
  const suggestedTypes =
    domainToDefaultMatterTypes[
      currentDomain as keyof typeof domainToDefaultMatterTypes
    ] || [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isNewMapping ? "Add Entity Mapping" : `Edit: ${entityId}`}
      </DialogTitle>
      <DialogContent>
        {isNewMapping && (
          <TextField
            fullWidth
            margin="normal"
            label="Entity ID"
            placeholder="light.living_room"
            value={editEntityId}
            onChange={(e) => setEditEntityId(e.target.value)}
            helperText="Enter the Home Assistant entity ID (e.g., light.living_room)"
            required
          />
        )}
        <FormControl fullWidth margin="normal">
          <InputLabel id="matter-device-type-label">
            Matter Device Type
          </InputLabel>
          <Select
            labelId="matter-device-type-label"
            value={matterDeviceType}
            label="Matter Device Type"
            onChange={(e) =>
              setMatterDeviceType(e.target.value as MatterDeviceType | "")
            }
          >
            <MenuItem value="">
              <em>Auto-detect (default)</em>
            </MenuItem>
            {suggestedTypes.length > 0 && (
              <MenuItem disabled>— Suggested for {domain} —</MenuItem>
            )}
            {suggestedTypes.map((type: MatterDeviceType) => (
              <MenuItem key={type} value={type}>
                {matterDeviceTypeLabels[type]}
              </MenuItem>
            ))}
            {suggestedTypes.length > 0 && (
              <MenuItem disabled>— All types —</MenuItem>
            )}
            {availableTypes
              .filter(([key]) => !suggestedTypes.includes(key))
              .map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
          </Select>
        </FormControl>

        <TextField
          fullWidth
          margin="normal"
          label="Custom Name"
          placeholder={entityId}
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          helperText="Override the entity name shown in Matter controllers"
        />

        {showFilterLifeField && (
          <TextField
            fullWidth
            margin="normal"
            label="Filter Life Sensor (optional)"
            placeholder="sensor.air_purifier_filter_life"
            value={filterLifeEntity}
            onChange={(e) => setFilterLifeEntity(e.target.value)}
            helperText="Sensor entity that provides filter life percentage (0-100%) for HEPA filter monitoring"
          />
        )}

        {showCleaningModeField && (
          <TextField
            fullWidth
            margin="normal"
            label="Cleaning Mode Entity (optional)"
            placeholder="select.vacuum_cleaning_mode"
            value={cleaningModeEntity}
            onChange={(e) => setCleaningModeEntity(e.target.value)}
            helperText="Select entity that controls the vacuum cleaning mode (e.g., select.r2_d2_cleaning_mode for Dreame vacuums)"
          />
        )}

        {showRoomEntitiesField && (
          <Box sx={{ mt: 2, mb: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Room Button Entities (Roborock)
            </Typography>
            <Autocomplete
              multiple
              options={availableButtons}
              getOptionLabel={(option) =>
                typeof option === "string"
                  ? option
                  : option.friendly_name || option.clean_name
              }
              value={availableButtons.filter((btn) =>
                roomEntities.includes(btn.entity_id),
              )}
              onChange={(_, newValue) => {
                setRoomEntities(
                  newValue.map((v) =>
                    typeof v === "string" ? v : v.entity_id,
                  ),
                );
              }}
              loading={loadingButtons}
              freeSolo
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    label={
                      typeof option === "string"
                        ? option
                        : option.friendly_name || option.clean_name
                    }
                    size="small"
                    {...getTagProps({ index })}
                    key={typeof option === "string" ? option : option.entity_id}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  variant="outlined"
                  placeholder={
                    loadingButtons
                      ? "Loading buttons..."
                      : "Select room buttons or type entity ID"
                  }
                  helperText="Select button entities that trigger room cleaning (e.g., button.roborock_clean_kitchen). These appear as rooms in Apple Home."
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingButtons ? (
                          <CircularProgress color="inherit" size={20} />
                        ) : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            {availableButtons.length === 0 && !loadingButtons && (
              <Typography variant="caption" color="text.secondary">
                No button entities found for this device. You can manually enter
                entity IDs.
              </Typography>
            )}
          </Box>
        )}

        {showHumidityBatteryFields && (
          <>
            <TextField
              fullWidth
              margin="normal"
              label="Humidity Sensor (optional)"
              placeholder="sensor.h_t_bad_humidity"
              value={humidityEntity}
              onChange={(e) => setHumidityEntity(e.target.value)}
              helperText="Combine with a humidity sensor to create a single Temperature+Humidity device"
            />
            <TextField
              fullWidth
              margin="normal"
              label="Pressure Sensor (optional)"
              placeholder="sensor.h_t_bad_pressure"
              value={pressureEntity}
              onChange={(e) => setPressureEntity(e.target.value)}
              helperText="Combine with a pressure sensor to create a single Temperature+Pressure device"
            />
            <TextField
              fullWidth
              margin="normal"
              label="Battery Sensor (optional)"
              placeholder="sensor.h_t_bad_battery"
              value={batteryEntity}
              onChange={(e) => setBatteryEntity(e.target.value)}
              helperText="Include battery level from a separate sensor entity"
            />
          </>
        )}

        {showLockPinField && (
          <FormControlLabel
            control={
              <Switch
                checked={disableLockPin}
                onChange={(e) => setDisableLockPin(e.target.checked)}
              />
            }
            label="Disable PIN requirement for this lock"
            sx={{ mt: 1, display: "block" }}
          />
        )}

        <FormControlLabel
          control={
            <Switch
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
            />
          }
          label="Disable this entity (exclude from bridge)"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!editEntityId.trim()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
