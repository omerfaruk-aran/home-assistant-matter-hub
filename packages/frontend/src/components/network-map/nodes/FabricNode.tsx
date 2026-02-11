import CastConnectedIcon from "@mui/icons-material/CastConnected";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Handle, type NodeProps, Position } from "@xyflow/react";

export interface FabricNodeData {
  label: string;
  vendorId: number;
  [key: string]: unknown;
}

const vendorNames: Record<number, string> = {
  24582: "Apple Home",
  65521: "Apple Home",
  4996: "Google Home",
  4937: "Amazon Alexa",
  4362: "Samsung SmartThings",
};

export const FabricNode = ({ data }: NodeProps) => {
  const { label, vendorId } = data as unknown as FabricNodeData;
  const vendorName = vendorNames[vendorId] ?? (label || `Vendor ${vendorId}`);

  return (
    <Box
      sx={{
        background: "linear-gradient(135deg, #7b1fa2, #9c27b0)",
        borderRadius: 2,
        px: 1.5,
        py: 1,
        minWidth: 140,
        color: "#fff",
        boxShadow: "0 2px 12px rgba(123,31,162,0.3)",
      }}
    >
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0 }}
        id="bottom"
      />

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <CastConnectedIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption" fontWeight={700}>
          {vendorName}
        </Typography>
      </Box>

      {label && label !== vendorName && (
        <Typography
          variant="caption"
          display="block"
          sx={{ opacity: 0.8, fontSize: "0.6rem" }}
        >
          {label}
        </Typography>
      )}
    </Box>
  );
};
