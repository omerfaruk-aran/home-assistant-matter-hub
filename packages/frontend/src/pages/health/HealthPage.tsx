import Box from "@mui/material/Box";
import { HealthDashboard } from "../../components/health/HealthDashboard.tsx";
import { SystemInfo } from "../../components/system/SystemInfo.tsx";
import { LiveEventLog } from "../diagnostics/DiagnosticsPage.tsx";

export const HealthPage = () => {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <HealthDashboard />
      <Box sx={{ px: 2 }}>
        <LiveEventLog />
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        <SystemInfo />
      </Box>
    </Box>
  );
};
