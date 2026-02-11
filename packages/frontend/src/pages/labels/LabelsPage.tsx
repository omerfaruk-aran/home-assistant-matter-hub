import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LabelIcon from "@mui/icons-material/Label";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";
import {
  fetchAreas,
  fetchLabels,
  type HomeAssistantArea,
  type HomeAssistantLabel,
} from "../../api/labels.ts";

export const LabelsPage = () => {
  const [labels, setLabels] = useState<HomeAssistantLabel[]>([]);
  const [areas, setAreas] = useState<HomeAssistantArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [labelsData, areasData] = await Promise.all([
        fetchLabels(),
        fetchAreas(),
      ]);
      setLabels(labelsData);
      setAreas(areasData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h1" sx={{ mb: 3 }}>
        <LabelIcon sx={{ mr: 1, verticalAlign: "middle" }} />
        Labels & Areas
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Use these IDs when configuring bridge filters. Click the copy button to
        copy the ID to your clipboard.
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        <LabelIcon sx={{ mr: 0.5, fontSize: 20, verticalAlign: "middle" }} />
        Labels ({labels.length})
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Use the <b>label_id</b> value in your bridge filter with type
        &quot;label&quot;.
      </Typography>
      <Card sx={{ mb: 4 }}>
        {labels.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
              No labels found in Home Assistant. Create labels under Settings
              &gt; Labels.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    Display Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    label_id (use this in filter)
                  </TableCell>
                  <TableCell width={48} />
                </TableRow>
              </TableHead>
              <TableBody>
                {labels.map((label) => (
                  <TableRow key={label.label_id} hover>
                    <TableCell>
                      {label.color && (
                        <Box
                          component="span"
                          sx={{
                            display: "inline-block",
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor: label.color,
                            mr: 1,
                            verticalAlign: "middle",
                          }}
                        />
                      )}
                      {label.name}
                    </TableCell>
                    <TableCell>
                      <code>{label.label_id}</code>
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={
                          copiedId === label.label_id ? "Copied!" : "Copy ID"
                        }
                      >
                        <IconButton
                          size="small"
                          onClick={() => copyToClipboard(label.label_id)}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Typography variant="h6" sx={{ mb: 1 }}>
        <MeetingRoomIcon
          sx={{ mr: 0.5, fontSize: 20, verticalAlign: "middle" }}
        />
        Areas ({areas.length})
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Use the <b>area_id</b> value in your bridge filter with type
        &quot;area&quot;. Areas are also used for automatic room assignment in
        Matter controllers.
      </Typography>
      <Card>
        {areas.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
              No areas found in Home Assistant. Create areas under Settings &gt;
              Areas.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    Display Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    area_id (use this in filter)
                  </TableCell>
                  <TableCell width={48} />
                </TableRow>
              </TableHead>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.area_id} hover>
                    <TableCell>{area.name}</TableCell>
                    <TableCell>
                      <code>{area.area_id}</code>
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={
                          copiedId === area.area_id ? "Copied!" : "Copy ID"
                        }
                      >
                        <IconButton
                          size="small"
                          onClick={() => copyToClipboard(area.area_id)}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </Box>
  );
};
