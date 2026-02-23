import Box from "@mui/material/Box";
import { useState } from "react";
import { HealthDashboard } from "../../components/health/HealthDashboard.tsx";
import { SystemInfo } from "../../components/system/SystemInfo.tsx";
import { LiveEventLog } from "../diagnostics/DiagnosticsPage.tsx";

export const HealthPage = () => {
  const [sortField, setSortField] = useState<"name" | "created">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <HealthDashboard
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={setSortField}
        onSortDirectionChange={setSortDirection}
      />
      <Box sx={{ px: 2 }}>
        <LiveEventLog sortField={sortField} sortDirection={sortDirection} />
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        <SystemInfo />
      </Box>
    </Box>
  );
};
