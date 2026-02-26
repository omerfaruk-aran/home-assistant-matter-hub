import type {
  BridgeDataWithMetadata,
  EndpointData,
  FailedEntity,
} from "@home-assistant-matter-hub/common";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import WarningIcon from "@mui/icons-material/Warning";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { updateBridge } from "../../api/bridges.ts";
import { Breadcrumbs } from "../../components/breadcrumbs/Breadcrumbs.tsx";
import { BridgeDetails } from "../../components/bridge/BridgeDetails.tsx";
import { BridgeStatusHint } from "../../components/bridge/BridgeStatusHint.tsx";
import { BridgeStatusIcon } from "../../components/bridge/BridgeStatusIcon.tsx";
import { DiagnosticsCard } from "../../components/bridge/DiagnosticsCard.tsx";
import { EndpointList } from "../../components/endpoints/EndpointList.tsx";
import { EntityMappingSection } from "../../components/entity-mapping/EntityMappingSection.js";
import { useNotifications } from "../../components/notifications/use-notifications.ts";
import { useBridge } from "../../hooks/data/bridges.ts";
import { useDevices } from "../../hooks/data/devices.ts";
import { useTimer } from "../../hooks/timer.ts";
import { navigation } from "../../routes.tsx";
import { loadDevices } from "../../state/devices/device-actions.ts";
import { useAppDispatch } from "../../state/hooks.ts";
import { BridgeMoreMenu } from "./BridgeMoreMenu.tsx";

const MemoizedBridgeDetails = memo(BridgeDetails);

const FailedEntitiesAlert = ({
  failedEntities,
}: {
  failedEntities: FailedEntity[];
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!failedEntities || failedEntities.length === 0) {
    return null;
  }

  return (
    <Alert
      severity="warning"
      sx={{ cursor: "pointer" }}
      onClick={() => setExpanded(!expanded)}
    >
      <Typography variant="body2">
        <strong>
          {failedEntities.length} entity/entities could not be loaded.
        </strong>{" "}
        Click to {expanded ? "hide" : "show"} details.
      </Typography>
      <Collapse in={expanded}>
        <List dense sx={{ mt: 1 }}>
          {failedEntities.map((entity) => (
            <ListItem key={entity.entityId} sx={{ py: 0 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <WarningIcon color="warning" fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={entity.entityId}
                secondary={entity.reason}
                primaryTypographyProps={{
                  variant: "body2",
                  fontWeight: "bold",
                }}
                secondaryTypographyProps={{ variant: "caption" }}
              />
            </ListItem>
          ))}
        </List>
      </Collapse>
    </Alert>
  );
};

export const BridgeDetailsPage = () => {
  const notifications = useNotifications();
  const dispatch = useAppDispatch();

  const { bridgeId } = useParams() as { bridgeId: string };
  const [mappingRefreshKey, setMappingRefreshKey] = useState(0);

  const handleMappingSaved = useCallback(() => {
    setMappingRefreshKey((prev) => prev + 1);
  }, []);

  const timerCallback = useCallback(() => {
    dispatch(loadDevices(bridgeId));
  }, [dispatch, bridgeId]);
  const timer = useTimer(10, timerCallback);

  const {
    content: bridge,
    isLoading: bridgeLoading,
    error: bridgeError,
  } = useBridge(bridgeId);
  const { content: devices, error: devicesError } = useDevices(bridgeId);

  useEffect(() => {
    if (bridgeError) {
      notifications.show({
        message: bridgeError.message ?? "Failed to load Bridge details",
        severity: "error",
      });
    }
  }, [bridgeError, notifications]);

  useEffect(() => {
    if (devicesError?.message) {
      notifications.show({ message: devicesError.message, severity: "error" });
    }
  }, [devicesError, notifications]);

  if (!bridge && bridgeLoading) {
    return "Loading";
  }

  if (!bridge) {
    return "Not found";
  }

  return (
    <Stack spacing={4}>
      <Breadcrumbs
        items={[
          { name: "Bridges", to: navigation.bridges },
          { name: bridge.name, to: navigation.bridge(bridgeId) },
        ]}
      />

      <Box display="flex" justifyContent="space-between">
        <Typography variant="h4">
          {bridge.name} <BridgeStatusIcon status={bridge.status} />
        </Typography>
        <BridgeMoreMenu bridge={bridgeId} />
      </Box>

      <BridgeStatusHint status={bridge.status} reason={bridge.statusReason} />

      {bridge.failedEntities && bridge.failedEntities.length > 0 && (
        <FailedEntitiesAlert failedEntities={bridge.failedEntities} />
      )}

      <ServerModeRecommendation bridge={bridge} devices={devices} />

      <MemoizedBridgeDetails bridge={bridge} />

      {devices && <DiagnosticsCard devices={devices} />}

      <EntityMappingSection bridgeId={bridgeId} key={mappingRefreshKey} />

      {devices && (
        <Stack spacing={2}>
          <Box display="flex" justifyContent="flex-end" alignItems="center">
            {timer != null && (
              <Tooltip title="New devices and changes on labels are discovered every 30 seconds.">
                <Typography variant="body2" color="textSecondary">
                  Refreshing states in {timer - 1} seconds...
                </Typography>
              </Tooltip>
            )}
          </Box>

          <EndpointList
            endpoint={devices}
            bridgeId={bridgeId}
            onMappingSaved={handleMappingSaved}
          />
        </Stack>
      )}
    </Stack>
  );
};

function hasVacuumEndpoint(endpoint: EndpointData): boolean {
  if (endpoint.type.name === "RoboticVacuumCleaner") {
    return true;
  }
  return endpoint.parts.some(hasVacuumEndpoint);
}

function countDeviceEndpoints(endpoint: EndpointData): number {
  if (endpoint.type.name === "Aggregator") {
    return endpoint.parts.length;
  }
  let count = 0;
  for (const part of endpoint.parts) {
    count += countDeviceEndpoints(part);
  }
  return count;
}

const ServerModeRecommendation = ({
  bridge,
  devices,
}: {
  bridge: BridgeDataWithMetadata;
  devices: EndpointData | undefined;
}) => {
  const notifications = useNotifications();
  const [enabling, setEnabling] = useState(false);

  const shouldShow = useMemo(() => {
    if (!devices) return false;
    if (bridge.featureFlags?.serverMode) return false;
    if (!hasVacuumEndpoint(devices)) return false;
    const fabrics = bridge.commissioning?.fabrics ?? [];
    if (fabrics.length === 0) return true;
    const appleAlexaVendors = new Set([4937, 4631, 4448]);
    return fabrics.some((f) => appleAlexaVendors.has(f.rootVendorId));
  }, [devices, bridge.featureFlags?.serverMode, bridge.commissioning?.fabrics]);

  const isSingleDevice = useMemo(() => {
    if (!devices) return false;
    return countDeviceEndpoints(devices) === 1;
  }, [devices]);

  const handleEnableServerMode = async () => {
    setEnabling(true);
    try {
      await updateBridge({
        id: bridge.id,
        name: bridge.name,
        port: bridge.port,
        filter: bridge.filter,
        featureFlags: {
          ...bridge.featureFlags,
          serverMode: true,
        },
        icon: bridge.icon,
        priority: bridge.priority,
      });
      notifications.show({
        message:
          "Server Mode enabled. The bridge will restart with your vacuum as a standalone device.",
        severity: "success",
      });
    } catch (e) {
      notifications.show({
        message: `Failed to enable Server Mode: ${e instanceof Error ? e.message : String(e)}`,
        severity: "error",
      });
    } finally {
      setEnabling(false);
    }
  };

  if (!shouldShow) return null;

  return (
    <Alert
      severity="warning"
      icon={<RocketLaunchIcon />}
      action={
        isSingleDevice ? (
          <Button
            color="warning"
            size="small"
            variant="outlined"
            onClick={handleEnableServerMode}
            disabled={enabling}
            startIcon={enabling ? <CircularProgress size={16} /> : undefined}
            sx={{ whiteSpace: "nowrap" }}
          >
            {enabling ? "Enabling..." : "Enable Server Mode"}
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>Server Mode Recommended for Robot Vacuums</AlertTitle>
      <Typography variant="body2">
        This bridge contains a robot vacuum in <strong>bridged mode</strong>.
        Apple Home and Alexa will show the bridge as an additional device,
        resulting in duplicate entries. Enable <strong>Server Mode</strong> to
        expose the vacuum as a standalone Matter device for full Siri/Alexa
        voice command support and no duplicates.
      </Typography>
      {!isSingleDevice && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          <strong>Note:</strong> Server Mode requires the vacuum to be the only
          device on this bridge. Please remove other entities from this bridge
          first, then enable Server Mode in the bridge settings.
        </Typography>
      )}
    </Alert>
  );
};
