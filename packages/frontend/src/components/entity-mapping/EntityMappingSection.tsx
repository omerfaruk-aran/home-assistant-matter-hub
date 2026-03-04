import type {
  EntityMappingConfig,
  EntityMappingResponse,
} from "@home-assistant-matter-hub/common";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SettingsIcon from "@mui/icons-material/Settings";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";
import {
  deleteEntityMapping,
  fetchEntityMappings,
  updateEntityMapping,
} from "../../api/entity-mappings.js";
import { EntityMappingDialog } from "./EntityMappingDialog.js";

interface EntityMappingSectionProps {
  bridgeId: string;
}

export function EntityMappingSection({ bridgeId }: EntityMappingSectionProps) {
  const [mappings, setMappings] = useState<EntityMappingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<{
    entityId: string;
    domain: string;
    config?: EntityMappingConfig;
  } | null>(null);

  const loadMappings = useCallback(async () => {
    try {
      const data = await fetchEntityMappings(bridgeId);
      setMappings(data);
      setError(null);
    } catch {
      setError("Failed to load entity mappings");
    } finally {
      setLoading(false);
    }
  }, [bridgeId]);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  const handleAddMapping = useCallback(() => {
    setEditingEntity({ entityId: "", domain: "" });
    setDialogOpen(true);
  }, []);

  const handleEditMapping = useCallback(
    (entityId: string, config: EntityMappingConfig) => {
      const domain = entityId.split(".")[0] || "";
      setEditingEntity({ entityId, domain, config });
      setDialogOpen(true);
    },
    [],
  );

  const handleDeleteMapping = useCallback(
    async (entityId: string) => {
      try {
        await deleteEntityMapping(bridgeId, entityId);
        await loadMappings();
      } catch {
        setError("Failed to delete entity mapping");
      }
    },
    [bridgeId, loadMappings],
  );

  const handleSave = useCallback(
    async (config: Partial<EntityMappingConfig>) => {
      if (!config.entityId) return;
      try {
        await updateEntityMapping(bridgeId, config.entityId, config);
        setDialogOpen(false);
        setEditingEntity(null);
        await loadMappings();
      } catch {
        setError("Failed to save entity mapping");
      }
    },
    [bridgeId, loadMappings],
  );

  const handleClose = useCallback(() => {
    setDialogOpen(false);
    setEditingEntity(null);
  }, []);

  // mappings.mappings is an array of EntityMappingConfig, not an object
  const mappingsList = mappings?.mappings ?? [];

  return (
    <Card>
      <CardContent>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={2}
        >
          <Typography variant="h6">
            <SettingsIcon sx={{ mr: 1, verticalAlign: "middle" }} />
            Entity Mappings
          </Typography>
          <Button variant="outlined" size="small" onClick={handleAddMapping}>
            Add Mapping
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading && <Typography color="text.secondary">Loading...</Typography>}

        {!loading && mappingsList.length === 0 && (
          <Typography color="text.secondary">
            No custom entity mappings configured. Use mappings to override
            Matter device types, set custom names, or disable specific entities.
          </Typography>
        )}

        {!loading && mappingsList.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Entity ID</TableCell>
                  <TableCell>Device Type</TableCell>
                  <TableCell>Custom Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappingsList.map((config) => (
                  <TableRow key={config.entityId}>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {config.entityId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {config.matterDeviceType || (
                        <Typography color="text.secondary" variant="body2">
                          Auto
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {config.customName || (
                        <Typography color="text.secondary" variant="body2">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {config.disabled ? (
                        <Chip label="Disabled" color="error" size="small" />
                      ) : (
                        <Chip label="Enabled" color="success" size="small" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() =>
                          handleEditMapping(config.entityId, config)
                        }
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteMapping(config.entityId)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>

      {editingEntity && (
        <EntityMappingDialog
          open={dialogOpen}
          entityId={editingEntity.entityId}
          domain={editingEntity.domain}
          currentMapping={editingEntity.config}
          onSave={handleSave}
          onClose={handleClose}
        />
      )}
    </Card>
  );
}
