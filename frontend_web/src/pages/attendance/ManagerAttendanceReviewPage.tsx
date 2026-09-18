import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HistoryIcon from "@mui/icons-material/History";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import apiClient from "../../utils/apiClient";
import { BRAND_COLORS, BRAND_FONTS, BRAND_SHADOWS } from "../../constants/brandTheme";

type PendingReview = {
  provisional_id: number;
  session_id: number;
  worker_id: number;
  worker_name: string;
  worker_email: string;
  started_at: string;
  ended_at: string | null;
  cover_type: "UNROSTERED_LOCAL" | "CROSS_SITE_CHAIN" | "CROSS_SITE_ORG";
  source_pharmacy_name: string | null;
  status: string;
  decision_reason: string | null;
  created_at: string;
};

type TimelineEvent = {
  event_id: number;
  event_type: string;
  original_timestamp: string;
  effective_timestamp: string;
  is_corrected: boolean;
  correction_id: number | null;
  correction_reason: string | null;
};

type SessionTimelineData = {
  session_id: number;
  pharmacy_id: number;
  pharmacy_name: string;
  worker_id: number;
  worker_name: string;
  is_provisional: boolean;
  timeline: TimelineEvent[];
};

export default function ManagerAttendanceReviewPage() {

  const [pharmacies, setPharmacies] = useState<{ id: number; name: string }[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<number | "">("");

  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Approval Dialog
  const [approvingItem, setApprovingItem] = useState<PendingReview | null>(null);
  const [approvalReason, setApprovalReason] = useState("");
  const [isApproving, setIsApproving] = useState(false);

  // Rejection Dialog
  const [rejectingItem, setRejectingItem] = useState<PendingReview | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // Timeline / Correction Modal
  const [timelineSessionId, setTimelineSessionId] = useState<number | null>(null);
  const [timelineData, setTimelineData] = useState<SessionTimelineData | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Manual Correction sub-state
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [correctedTimestamp, setCorrectedTimestamp] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Fetch pharmacies managed by this user
  useEffect(() => {
    const loadPharmacies = async () => {
      try {
        const res = await apiClient.get("/client-profile/pharmacies/");
        const list = Array.isArray(res.data) ? res.data : res.data.results || [];
        setPharmacies(list);
        if (list.length > 0) {
          setSelectedPharmacyId(list[0].id);
        }
      } catch (err) {
        // Fallback: try user memberships/onboarding if direct list fails
      }
    };
    loadPharmacies();
  }, []);

  // Fetch pending provisional attendances for the selected pharmacy
  const fetchPending = useCallback(async () => {
    if (!selectedPharmacyId) return;
    try {
      setLoadingReviews(true);
      setAlertMsg(null);
      const res = await apiClient.get(
        `/client-profile/attendance/manager/pending/?pharmacy_id=${selectedPharmacyId}`
      );
      setPendingReviews(res.data);
    } catch (err: any) {
      setAlertMsg({
        type: "error",
        text: err.response?.data?.error || "Failed to load pending attendance reviews.",
      });
    } finally {
      setLoadingReviews(false);
    }
  }, [selectedPharmacyId]);

  useEffect(() => {
    if (selectedPharmacyId) {
      fetchPending();
    }
  }, [selectedPharmacyId, fetchPending]);

  // Handle Approval
  const handleConfirmApproval = async () => {
    if (!approvingItem) return;
    setIsApproving(true);
    try {
      await apiClient.post("/client-profile/attendance/manager/approve/", {
        provisional_id: approvingItem.provisional_id,
        reason: approvalReason.trim() || "Approved cover shift by pharmacy manager.",
      });
      setAlertMsg({
        type: "success",
        text: `Successfully approved shift for ${approvingItem.worker_name}. Retroactive shift backfilled.`,
      });
      setApprovingItem(null);
      setApprovalReason("");
      fetchPending();
    } catch (err: any) {
      setAlertMsg({
        type: "error",
        text: err.response?.data?.error || "Failed to approve attendance.",
      });
    } finally {
      setIsApproving(false);
    }
  };

  // Handle Rejection
  const handleConfirmRejection = async () => {
    if (!rejectingItem || !rejectionReason.trim()) return;
    setIsRejecting(true);
    try {
      await apiClient.post("/client-profile/attendance/manager/reject/", {
        provisional_id: rejectingItem.provisional_id,
        reason: rejectionReason.trim(),
      });
      setAlertMsg({
        type: "success",
        text: `Rejected attendance for ${rejectingItem.worker_name}. Raw audit records retained.`,
      });
      setRejectingItem(null);
      setRejectionReason("");
      fetchPending();
    } catch (err: any) {
      setAlertMsg({
        type: "error",
        text: err.response?.data?.error || "Failed to reject attendance.",
      });
    } finally {
      setIsRejecting(false);
    }
  };

  // Open Timeline
  const openTimeline = async (sessionId: number) => {
    setTimelineSessionId(sessionId);
    setLoadingTimeline(true);
    try {
      const res = await apiClient.get(
        `/client-profile/attendance/manager/timeline/${sessionId}/`
      );
      setTimelineData(res.data);
    } catch (err: any) {
      setAlertMsg({
        type: "error",
        text: err.response?.data?.error || "Failed to load session timeline.",
      });
    } finally {
      setLoadingTimeline(false);
    }
  };

  // Submit Manual Event Correction
  const handleSubmitCorrection = async () => {
    if (!editingEventId || !correctedTimestamp || !correctionReason.trim()) return;
    setSubmittingCorrection(true);
    try {
      await apiClient.post("/client-profile/attendance/manager/correct/", {
        event_id: editingEventId,
        corrected_timestamp: new Date(correctedTimestamp).toISOString(),
        reason: correctionReason.trim(),
      });
      setAlertMsg({
        type: "success",
        text: "Manual correction appended to audit history.",
      });
      setEditingEventId(null);
      setCorrectedTimestamp("");
      setCorrectionReason("");
      // Refresh timeline
      if (timelineSessionId) {
        openTimeline(timelineSessionId);
      }
    } catch (err: any) {
      setAlertMsg({
        type: "error",
        text: err.response?.data?.error || "Failed to save correction.",
      });
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const getTierLabel = (tier: string) => {
    switch (tier) {
      case "UNROSTERED_LOCAL":
        return <Chip label="Local Unscheduled" color="info" size="small" />;
      case "CROSS_SITE_CHAIN":
        return <Chip label="Cross-Site (Sister Store)" color="secondary" size="small" />;
      case "CROSS_SITE_ORG":
        return <Chip label="Cross-Site (Organization)" color="warning" size="small" />;
      default:
        return <Chip label={tier} size="small" />;
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontFamily: BRAND_FONTS.heading,
              fontWeight: 700,
              color: BRAND_COLORS.navy,
              fontSize: { xs: 26, md: 32 },
              letterSpacing: "-0.02em",
            }}
          >
            Attendance Review & Corrections
          </Typography>
          <Typography variant="body2" sx={{ color: BRAND_COLORS.body, mt: 0.5, fontFamily: BRAND_FONTS.body }}>
            Review unrostered or cross-site shifts, backfill completed rosters, and adjust audit corrections.
          </Typography>
        </Box>

        {/* Pharmacy Dropdown */}
        {pharmacies.length > 1 && (
          <FormControl sx={{ minWidth: 240, mt: { xs: 2, sm: 0 } }} size="small">
            <InputLabel>Destination Pharmacy</InputLabel>
            <Select
              value={selectedPharmacyId}
              label="Destination Pharmacy"
              onChange={(e) => setSelectedPharmacyId(Number(e.target.value))}
            >
              {pharmacies.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Stack>

      {/* Feedback Alerts */}
      {alertMsg && (
        <Alert severity={alertMsg.type} sx={{ mb: 3 }} onClose={() => setAlertMsg(null)}>
          {alertMsg.text}
        </Alert>
      )}

      {/* Pending Reviews Table */}
      <Card
        sx={{
          borderRadius: 3,
          boxShadow: BRAND_SHADOWS.card,
          border: `1px solid ${BRAND_COLORS.border}`,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            p: 2.5,
            bgcolor: BRAND_COLORS.mist,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${BRAND_COLORS.border}`,
          }}
        >
          <Typography variant="h6" sx={{ fontFamily: BRAND_FONTS.heading, fontWeight: 700, color: BRAND_COLORS.navy }}>
            Pending Provisional Shifts ({pendingReviews.length})
          </Typography>
          <Button
            size="small"
            onClick={fetchPending}
            disabled={loadingReviews}
            sx={{
              color: BRAND_COLORS.purple,
              fontWeight: 600,
              "&:hover": { bgcolor: BRAND_COLORS.purpleLight },
            }}
          >
            Refresh
          </Button>
        </Box>

        {loadingReviews ? (
          <Box sx={{ p: 5, textAlign: "center" }}>
            <CircularProgress size={32} />
          </Box>
        ) : pendingReviews.length === 0 ? (
          <Box sx={{ p: 5, textAlign: "center" }}>
            <Typography variant="body1" color="text.secondary">
              No pending provisional shifts to review for this pharmacy.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead sx={{ bgcolor: "#f8fafc" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Worker</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Cover Type</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Home Pharmacy</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Clock In / Out</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Recorded Time</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingReviews.map((row) => {
                  const startTime = new Date(row.started_at);
                  const endTime = row.ended_at ? new Date(row.ended_at) : null;
                  const durationHours = endTime
                    ? ((endTime.getTime() - startTime.getTime()) / (1000 * 3600)).toFixed(1)
                    : "In Progress";

                  return (
                    <TableRow key={row.provisional_id} hover>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight={700}>
                          {row.worker_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.worker_email}
                        </Typography>
                      </TableCell>
                      <TableCell>{getTierLabel(row.cover_type)}</TableCell>
                      <TableCell>{row.source_pharmacy_name || "—"}</TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {startTime.toLocaleDateString([], { month: "short", day: "numeric" })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {" — "}
                          {endTime
                            ? endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "Ongoing"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {durationHours} {typeof durationHours === "string" && durationHours !== "In Progress" ? "hrs" : ""}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Tooltip title="View Timeline / Corrections">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => openTimeline(row.session_id)}
                            >
                              <HistoryIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<CheckCircleIcon />}
                            onClick={() => setApprovingItem(row)}
                            sx={{ fontWeight: 700 }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<CancelIcon />}
                            onClick={() => setRejectingItem(row)}
                          >
                            Reject
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Approval Confirmation Dialog */}
      <Dialog open={!!approvingItem} onClose={() => setApprovingItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Approve Provisional Shift</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            You are approving the provisional shift worked by <strong>{approvingItem?.worker_name}</strong>.
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            This action will backfill a completed Shift and Slot Assignment. Cross-site workers will <strong>not</strong> be granted permanent membership at this store.
          </Alert>
          <TextField
            label="Manager Approval Note (Optional)"
            placeholder="e.g. Confirmed cover by phone with area manager."
            value={approvalReason}
            onChange={(e) => setApprovalReason(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setApprovingItem(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmApproval}
            disabled={isApproving}
          >
            {isApproving ? <CircularProgress size={24} color="inherit" /> : "Approve & Backfill"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rejection Confirmation Dialog */}
      <Dialog open={!!rejectingItem} onClose={() => setRejectingItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: "error.main" }}>Reject Provisional Attendance</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Reject provisional attendance for <strong>{rejectingItem?.worker_name}</strong>. The raw scan events will be retained for audit and dispute evidence.
          </Typography>
          <TextField
            label="Rejection Reason (Required)"
            placeholder="e.g. Unscheduled attendance not authorized by store manager."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            fullWidth
            required
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setRejectingItem(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmRejection}
            disabled={isRejecting || !rejectionReason.trim()}
          >
            {isRejecting ? <CircularProgress size={24} color="inherit" /> : "Confirm Rejection"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Timeline and Corrections Modal */}
      <Dialog open={!!timelineSessionId} onClose={() => setTimelineSessionId(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Session Chronology & Manual Corrections</span>
          {timelineData && (
            <Chip
              label={timelineData.is_provisional ? "Provisional Session" : "Rostered Session"}
              color={timelineData.is_provisional ? "warning" : "success"}
              size="small"
            />
          )}
        </DialogTitle>
        <DialogContent dividers>
          {loadingTimeline ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <CircularProgress size={32} />
            </Box>
          ) : !timelineData ? (
            <Typography>No timeline data available.</Typography>
          ) : (
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Worker: <strong>{timelineData.worker_name}</strong> | Pharmacy: <strong>{timelineData.pharmacy_name}</strong>
                </Typography>
              </Box>

              <Table size="small">
                <TableHead sx={{ bgcolor: "#f8fafc" }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Event</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Original Timestamp</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Effective Timestamp</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Correct</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {timelineData.timeline.map((ev) => (
                    <TableRow key={ev.event_id}>
                      <TableCell>
                        <Chip
                          label={ev.event_type}
                          size="small"
                          color={
                            ev.event_type === "CLOCK_IN"
                              ? "success"
                              : ev.event_type === "CLOCK_OUT"
                              ? "error"
                              : "warning"
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(ev.original_timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontWeight={ev.is_corrected ? 700 : 400}
                          sx={{ color: ev.is_corrected ? "#7c3aed" : "inherit" }}
                        >
                          {new Date(ev.effective_timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {ev.is_corrected ? (
                          <Tooltip title={ev.correction_reason || ""}>
                            <Chip label="Corrected" size="small" color="secondary" />
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Original
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setEditingEventId(ev.event_id);
                            setCorrectedTimestamp(
                              new Date(ev.effective_timestamp).toISOString().slice(0, 16)
                            );
                            setCorrectionReason("");
                          }}
                        >
                          <EditCalendarIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Sub-form for editing an event timestamp */}
              {editingEventId && (
                <Paper sx={{ p: 2.5, bgcolor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#6d28d9", mb: 1.5 }}>
                    Append Manual Correction to Event #{editingEventId}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Corrected Date & Time"
                        type="datetime-local"
                        value={correctedTimestamp}
                        onChange={(e) => setCorrectedTimestamp(e.target.value)}
                        fullWidth
                        size="small"
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Reason for Adjustment"
                        placeholder="e.g. CCTV verified arrival at 8:55 AM"
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        fullWidth
                        size="small"
                        required
                      />
                    </Grid>
                  </Grid>
                  <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
                    <Button size="small" onClick={() => setEditingEventId(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="secondary"
                      onClick={handleSubmitCorrection}
                      disabled={submittingCorrection || !correctionReason.trim()}
                      sx={{ bgcolor: "#7c3aed" }}
                    >
                      {submittingCorrection ? <CircularProgress size={20} color="inherit" /> : "Save Correction"}
                    </Button>
                  </Stack>
                </Paper>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setTimelineSessionId(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
