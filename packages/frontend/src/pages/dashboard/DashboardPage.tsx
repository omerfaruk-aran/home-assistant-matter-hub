import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AddIcon from "@mui/icons-material/Add";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DevicesIcon from "@mui/icons-material/Devices";
import ErrorIcon from "@mui/icons-material/Error";
import HomeIcon from "@mui/icons-material/Home";
import HubIcon from "@mui/icons-material/Hub";
import LabelIcon from "@mui/icons-material/Label";
import LinkIcon from "@mui/icons-material/Link";
import LockIcon from "@mui/icons-material/Lock";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import SettingsIcon from "@mui/icons-material/Settings";
import StopIcon from "@mui/icons-material/Stop";
import WarningIcon from "@mui/icons-material/Warning";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  checkBridgeIconExists,
  getBridgeIconUrl,
} from "../../api/bridge-icons.ts";
import {
  restartAllBridges,
  startAllBridges,
  stopAllBridges,
} from "../../api/bridges.ts";
import { BridgeWizard } from "../../components/bridge/BridgeWizard.tsx";
import {
  getBridgeIcon,
  getBridgeIconColor,
} from "../../components/bridge/bridgeIconUtils.ts";
import { useBridges } from "../../hooks/data/bridges.ts";
import { navigation } from "../../routes.tsx";
import { loadBridges } from "../../state/bridges/bridge-actions.ts";
import { useAppDispatch } from "../../state/hooks.ts";

interface HealthSummary {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  services: {
    homeAssistant: { connected: boolean };
    bridges: {
      total: number;
      running: number;
      stopped: number;
      failed: number;
    };
  };
  bridgeDetails: Array<{
    id: string;
    name: string;
    status: string;
    deviceCount: number;
    fabricCount: number;
    failedEntityCount: number;
  }>;
}

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

function StatCard({
  title,
  value,
  icon,
  color,
  subtitle,
  onClick,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  const content = (
    <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
      <Box
        display="flex"
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          alignItems: "center",
          gap: { xs: 1, sm: 2 },
          textAlign: { xs: "center", sm: "left" },
        }}
      >
        <Avatar
          sx={{
            bgcolor: `${color}20`,
            color,
            width: { xs: 40, sm: 48 },
            height: { xs: 40, sm: 48 },
            flexShrink: 0,
          }}
        >
          {icon}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            fontWeight={700}
            lineHeight={1.1}
            noWrap
            sx={{ fontSize: { xs: "1.5rem", sm: "2.125rem" } }}
          >
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
    </CardContent>
  );

  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      {onClick ? (
        <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  );
}

function BridgeMiniCard({
  bridge,
  onClick,
}: {
  bridge: HealthSummary["bridgeDetails"][0];
  onClick: () => void;
}) {
  const { content: bridges } = useBridges();
  const bridgeData = bridges?.find((b) => b.id === bridge.id);
  const [hasCustomIcon, setHasCustomIcon] = useState(false);

  useEffect(() => {
    checkBridgeIconExists(bridge.id).then(setHasCustomIcon);
  }, [bridge.id]);

  const statusColor =
    bridge.status === "running"
      ? "success"
      : bridge.status === "failed"
        ? "error"
        : "default";

  return (
    <Card variant="outlined">
      <CardActionArea onClick={onClick}>
        <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            {hasCustomIcon ? (
              <Box
                component="img"
                src={getBridgeIconUrl(bridge.id)}
                alt={bridge.name}
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            ) : (
              bridgeData && (
                <Avatar
                  sx={{
                    bgcolor: getBridgeIconColor(bridgeData),
                    width: 36,
                    height: 36,
                  }}
                >
                  {(() => {
                    const Icon = getBridgeIcon(bridgeData);
                    return <Icon sx={{ fontSize: 20 }} />;
                  })()}
                </Avatar>
              )
            )}
            <Box flex={1} minWidth={0}>
              <Typography variant="subtitle2" noWrap>
                {bridge.name}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Chip
                  label={bridge.status}
                  size="small"
                  color={statusColor}
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
                <Typography variant="caption" color="text.secondary">
                  {bridge.deviceCount} devices
                </Typography>
                {bridge.fabricCount > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    · {bridge.fabricCount} fabrics
                  </Typography>
                )}
              </Stack>
            </Box>
            {bridge.failedEntityCount > 0 && (
              <Chip
                icon={<WarningIcon sx={{ fontSize: 14 }} />}
                label={bridge.failedEntityCount}
                size="small"
                color="warning"
                variant="outlined"
                sx={{ height: 22 }}
              />
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function NavCard({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Card variant="outlined">
      <CardActionArea onClick={onClick}>
        <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <Avatar
              sx={{
                bgcolor: "action.selected",
                color: "text.secondary",
                width: 36,
                height: 36,
              }}
            >
              {icon}
            </Avatar>
            <Typography variant="subtitle2">{title}</Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export const DashboardPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState(false);
  const bulkGuard = useRef(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("api/health/detailed");
      if (res.ok) {
        setHealth(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const totalDevices = useMemo(
    () => health?.bridgeDetails.reduce((sum, b) => sum + b.deviceCount, 0) ?? 0,
    [health],
  );

  const totalFabrics = useMemo(() => {
    if (!health?.bridgeDetails) return 0;
    return health.bridgeDetails.reduce((sum, b) => sum + b.fabricCount, 0);
  }, [health]);

  const totalFailed = useMemo(
    () =>
      health?.bridgeDetails.reduce((sum, b) => sum + b.failedEntityCount, 0) ??
      0,
    [health],
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={8}>
        <CircularProgress />
      </Box>
    );
  }

  const bridges = health?.services.bridges;
  const haConnected = health?.services.homeAssistant.connected ?? false;

  return (
    <Box sx={{ p: 2 }}>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <HomeIcon color="primary" fontSize="large" />
        <Typography variant="h5" fontWeight={600}>
          Dashboard
        </Typography>
      </Box>

      {/* Status cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Bridges"
            value={bridges?.total ?? 0}
            icon={<HubIcon />}
            color="#4caf50"
            subtitle={
              bridges
                ? `${bridges.running} running${bridges.failed > 0 ? ` · ${bridges.failed} failed` : ""}`
                : undefined
            }
            onClick={() => navigate(navigation.bridges)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Devices"
            value={totalDevices}
            icon={<DevicesIcon />}
            color="#2196f3"
            subtitle={totalFailed > 0 ? `${totalFailed} failed` : undefined}
            onClick={() => navigate(navigation.devices)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Fabrics"
            value={totalFabrics}
            icon={<LinkIcon />}
            color="#9c27b0"
            onClick={() => navigate(navigation.networkMap)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="HA Connection"
            value={haConnected ? "Online" : "Offline"}
            icon={haConnected ? <CheckCircleIcon /> : <ErrorIcon />}
            color={haConnected ? "#4caf50" : "#f44336"}
            subtitle={
              health?.uptime != null
                ? `Uptime ${formatUptime(health.uptime)}`
                : undefined
            }
          />
        </Grid>
      </Grid>

      <Divider sx={{ mb: 3 }} />

      {/* Bridge overview */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        mb={2}
        flexWrap="wrap"
        gap={1}
      >
        <Typography variant="h6">Bridges</Typography>
      </Box>

      <Stack
        direction="row"
        spacing={1.5}
        sx={{ mb: 2 }}
        flexWrap="wrap"
        useFlexGap
      >
        <Button
          variant="contained"
          startIcon={<AutoFixHighIcon />}
          onClick={() => setWizardOpen(true)}
          size="large"
        >
          Bridge Wizard
        </Button>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => navigate(navigation.createBridge)}
          size="large"
        >
          Create Bridge
        </Button>
        <Divider orientation="vertical" flexItem />
        <Button
          variant="outlined"
          color="success"
          startIcon={<PlayArrowIcon />}
          disabled={bulkAction}
          onClick={async () => {
            if (bulkGuard.current) return;
            bulkGuard.current = true;
            setBulkAction(true);
            try {
              await startAllBridges();
              await fetchHealth();
            } finally {
              setBulkAction(false);
              bulkGuard.current = false;
            }
          }}
        >
          Start All
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<StopIcon />}
          disabled={bulkAction}
          onClick={async () => {
            if (bulkGuard.current) return;
            bulkGuard.current = true;
            setBulkAction(true);
            try {
              await stopAllBridges();
              await fetchHealth();
            } finally {
              setBulkAction(false);
              bulkGuard.current = false;
            }
          }}
        >
          Stop All
        </Button>
        <Button
          variant="outlined"
          color="warning"
          startIcon={<RestartAltIcon />}
          disabled={bulkAction}
          onClick={async () => {
            if (bulkGuard.current) return;
            bulkGuard.current = true;
            setBulkAction(true);
            try {
              await restartAllBridges();
              await fetchHealth();
            } finally {
              setBulkAction(false);
              bulkGuard.current = false;
            }
          }}
        >
          Restart All
        </Button>
      </Stack>

      {health?.bridgeDetails && health.bridgeDetails.length > 0 ? (
        <Grid container spacing={1.5}>
          {[...health.bridgeDetails]
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
            )
            .map((bridge) => (
              <Grid key={bridge.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <BridgeMiniCard
                  bridge={bridge}
                  onClick={() => navigate(navigation.bridge(bridge.id))}
                />
              </Grid>
            ))}
        </Grid>
      ) : (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <Typography color="text.secondary">
              No bridges configured yet. Use the Bridge Wizard or create one
              manually.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Quick navigation */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Quick Navigation
      </Typography>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <NavCard
            title="Bridges"
            icon={<HubIcon sx={{ fontSize: 20 }} />}
            onClick={() => navigate(navigation.bridges)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <NavCard
            title="All Devices"
            icon={<DevicesIcon sx={{ fontSize: 20 }} />}
            onClick={() => navigate(navigation.devices)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <NavCard
            title="Network Map"
            icon={<AccountTreeIcon sx={{ fontSize: 20 }} />}
            onClick={() => navigate(navigation.networkMap)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <NavCard
            title="Health Dashboard"
            icon={<MonitorHeartIcon sx={{ fontSize: 20 }} />}
            onClick={() => navigate(navigation.health)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <NavCard
            title="Startup Order"
            icon={<RocketLaunchIcon sx={{ fontSize: 20 }} />}
            onClick={() => navigate(navigation.startup)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <NavCard
            title="Lock Credentials"
            icon={<LockIcon sx={{ fontSize: 20 }} />}
            onClick={() => navigate(navigation.lockCredentials)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <NavCard
            title="Filter Reference"
            icon={<LabelIcon sx={{ fontSize: 20 }} />}
            onClick={() => navigate(navigation.labels)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <NavCard
            title="Settings"
            icon={<SettingsIcon sx={{ fontSize: 20 }} />}
            onClick={() => navigate(navigation.settings)}
          />
        </Grid>
      </Grid>

      <BridgeWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={() => {
          dispatch(loadBridges());
          fetchHealth();
        }}
      />
    </Box>
  );
};
