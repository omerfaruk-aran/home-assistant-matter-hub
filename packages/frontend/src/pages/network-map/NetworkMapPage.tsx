import type {
  BridgeDataWithMetadata,
  EndpointData,
} from "@home-assistant-matter-hub/common";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import RefreshIcon from "@mui/icons-material/Refresh";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getEndpointName } from "../../components/endpoints/EndpointName.tsx";
import { BridgeNode } from "../../components/network-map/nodes/BridgeNode.tsx";
import { DeviceNode } from "../../components/network-map/nodes/DeviceNode.tsx";
import { FabricNode } from "../../components/network-map/nodes/FabricNode.tsx";
import { FailedNode } from "../../components/network-map/nodes/FailedNode.tsx";
import { HubNode } from "../../components/network-map/nodes/HubNode.tsx";
import { useBridges } from "../../hooks/data/bridges.ts";
import { loadBridges } from "../../state/bridges/bridge-actions.ts";
import { loadDevices } from "../../state/devices/device-actions.ts";
import { useAppDispatch, useAppSelector } from "../../state/hooks.ts";

const nodeTypes = {
  hub: HubNode,
  bridge: BridgeNode,
  device: DeviceNode,
  fabric: FabricNode,
  failed: FailedNode,
};

function collectLeafEndpoints(endpoint: EndpointData): EndpointData[] {
  if (!endpoint.parts || endpoint.parts.length === 0) {
    if (endpoint.endpoint !== 0) {
      return [endpoint];
    }
    return [];
  }
  return endpoint.parts.flatMap(collectLeafEndpoints);
}

interface LayoutConfig {
  hubX: number;
  hubY: number;
  bridgeSpacingY: number;
  deviceSpacingY: number;
  fabricOffsetX: number;
  bridgeOffsetX: number;
  deviceOffsetX: number;
}

function buildGraph(
  bridges: BridgeDataWithMetadata[],
  devicesByBridge: Record<string, EndpointData | undefined>,
  layout: LayoutConfig,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const totalDevices = bridges.reduce((sum, b) => sum + b.deviceCount, 0);

  // Hub node (center)
  nodes.push({
    id: "hub",
    type: "hub",
    position: { x: layout.hubX, y: layout.hubY },
    data: {
      label: "HAMH",
      bridgeCount: bridges.length,
      deviceCount: totalDevices,
    },
  });

  // Track unique fabrics across bridges (deduplicate by vendorId)
  const fabricMap = new Map<
    number,
    { vendorId: number; label: string; bridgeIds: string[] }
  >();

  // Layout bridges vertically, centered around the hub
  const totalBridgeHeight = (bridges.length - 1) * layout.bridgeSpacingY;
  const bridgeStartY = layout.hubY - totalBridgeHeight / 2;

  bridges.forEach((bridge, bridgeIndex) => {
    const bridgeId = `bridge-${bridge.id}`;
    const bridgeY = bridgeStartY + bridgeIndex * layout.bridgeSpacingY;
    const bridgeX = layout.hubX + layout.bridgeOffsetX;

    const fabricCount = bridge.commissioning?.fabrics?.length ?? 0;
    const failedCount = bridge.failedEntities?.length ?? 0;

    nodes.push({
      id: bridgeId,
      type: "bridge",
      position: { x: bridgeX, y: bridgeY },
      data: {
        label: bridge.name,
        status: bridge.status,
        port: bridge.port,
        deviceCount: bridge.deviceCount,
        failedCount,
        fabricCount,
      },
    });

    edges.push({
      id: `hub-${bridgeId}`,
      source: "hub",
      target: bridgeId,
      type: "smoothstep",
      animated: bridge.status === "running",
      style: {
        stroke: bridge.status === "running" ? "#4caf50" : "#bdbdbd",
        strokeWidth: 2,
      },
    });

    // Collect fabrics
    if (bridge.commissioning?.fabrics) {
      for (const fabric of bridge.commissioning.fabrics) {
        const existing = fabricMap.get(fabric.rootVendorId);
        if (existing) {
          if (!existing.bridgeIds.includes(bridge.id)) {
            existing.bridgeIds.push(bridge.id);
          }
        } else {
          fabricMap.set(fabric.rootVendorId, {
            vendorId: fabric.rootVendorId,
            label: fabric.label,
            bridgeIds: [bridge.id],
          });
        }
      }
    }

    // Devices for this bridge
    const rootEndpoint = devicesByBridge[bridge.id];
    const devices = rootEndpoint ? collectLeafEndpoints(rootEndpoint) : [];

    const totalDeviceHeight = (devices.length - 1) * layout.deviceSpacingY;
    const deviceStartY = bridgeY - totalDeviceHeight / 2 + 10;
    const deviceX = bridgeX + layout.deviceOffsetX;

    devices.forEach((device, deviceIndex) => {
      const deviceId = `device-${bridge.id}-${device.id.global}`;
      const name = getEndpointName(device.state) ?? device.id.local;

      nodes.push({
        id: deviceId,
        type: "device",
        position: {
          x: deviceX,
          y: deviceStartY + deviceIndex * layout.deviceSpacingY,
        },
        data: {
          label: name,
          deviceType: device.type.name,
          entityId: device.id.local,
        },
      });

      edges.push({
        id: `${bridgeId}-${deviceId}`,
        source: bridgeId,
        target: deviceId,
        type: "smoothstep",
        style: { stroke: "#90caf9", strokeWidth: 1 },
      });
    });

    // Failed entities for this bridge
    if (bridge.failedEntities) {
      bridge.failedEntities.forEach((failed, failedIndex) => {
        const failedId = `failed-${bridge.id}-${failed.entityId}`;

        nodes.push({
          id: failedId,
          type: "failed",
          position: {
            x: deviceX,
            y:
              deviceStartY +
              (devices.length + failedIndex) * layout.deviceSpacingY,
          },
          data: {
            label: failed.entityId,
            reason: failed.reason,
          },
        });

        edges.push({
          id: `${bridgeId}-${failedId}`,
          source: bridgeId,
          target: failedId,
          type: "smoothstep",
          style: {
            stroke: "#f44336",
            strokeWidth: 1,
            strokeDasharray: "5,5",
          },
        });
      });
    }
  });

  // Fabric / controller nodes (left side)
  const fabricEntries = Array.from(fabricMap.values());
  const totalFabricHeight = (fabricEntries.length - 1) * layout.bridgeSpacingY;
  const fabricStartY = layout.hubY - totalFabricHeight / 2;

  fabricEntries.forEach((fabric, fabricIndex) => {
    const fabricId = `fabric-${fabric.vendorId}`;

    nodes.push({
      id: fabricId,
      type: "fabric",
      position: {
        x: layout.hubX + layout.fabricOffsetX,
        y: fabricStartY + fabricIndex * layout.bridgeSpacingY,
      },
      data: {
        label: fabric.label,
        vendorId: fabric.vendorId,
      },
    });

    // Connect fabric to each bridge it's commissioned on
    for (const bridgeIdRaw of fabric.bridgeIds) {
      edges.push({
        id: `${fabricId}-bridge-${bridgeIdRaw}`,
        source: fabricId,
        target: `bridge-${bridgeIdRaw}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#ce93d8", strokeWidth: 1.5 },
      });
    }
  });

  return { nodes, edges };
}

export const NetworkMapPage = () => {
  const dispatch = useAppDispatch();
  const { content: bridges, isLoading: bridgesLoading } = useBridges();
  const allDeviceStates = useAppSelector((state) => state.devices.byBridge);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    dispatch(loadBridges());
  }, [dispatch]);

  useEffect(() => {
    if (bridges) {
      for (const bridge of bridges) {
        dispatch(loadDevices(bridge.id));
      }
    }
  }, [dispatch, bridges]);

  const devicesByBridge = useMemo(() => {
    const result: Record<string, EndpointData | undefined> = {};
    if (bridges) {
      for (const bridge of bridges) {
        result[bridge.id] = allDeviceStates[bridge.id]?.content;
      }
    }
    return result;
  }, [bridges, allDeviceStates]);

  const devicesLoaded = useMemo(() => {
    if (!bridges || bridges.length === 0) return true;
    return bridges.every((b) => allDeviceStates[b.id]?.isInitialized);
  }, [bridges, allDeviceStates]);

  useEffect(() => {
    if (!bridges || !devicesLoaded) return;

    const layout: LayoutConfig = {
      hubX: 400,
      hubY: 300,
      bridgeSpacingY: 200,
      deviceSpacingY: 50,
      fabricOffsetX: -350,
      bridgeOffsetX: 250,
      deviceOffsetX: 280,
    };

    const graph = buildGraph(bridges, devicesByBridge, layout);
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [bridges, devicesByBridge, devicesLoaded, setNodes, setEdges]);

  const handleRefresh = useCallback(() => {
    dispatch(loadBridges());
  }, [dispatch]);

  const isLoading = bridgesLoading || !devicesLoaded;

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Typography
          variant="h4"
          sx={{ display: "flex", alignItems: "center", gap: 2 }}
        >
          <AccountTreeIcon />
          Network Map
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            <IconButton
              onClick={() => setIsFullscreen((f) => !f)}
              color="primary"
            >
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box
          sx={{
            width: "100%",
            height: isFullscreen ? "calc(100vh - 100px)" : 600,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
            transition: "height 0.3s ease",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              zoomable
              pannable
              style={{ borderRadius: 8 }}
            />
          </ReactFlow>
        </Box>
      )}

      {/* Legend */}
      <Box
        sx={{
          display: "flex",
          gap: 3,
          mt: 2,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Legend:
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #7b1fa2, #9c27b0)",
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Controller
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #1976d2, #1565c0)",
            }}
          />
          <Typography variant="caption" color="text.secondary">
            HAMH Hub
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: 0.5,
              background: "#e8f5e9",
              border: "1px solid #4caf50",
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Bridge
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: 0.5,
              background: "#fff",
              border: "1px solid #bdbdbd",
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Device
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: 0.5,
              background: "#ffebee",
              border: "1px dashed #f44336",
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Failed
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};
