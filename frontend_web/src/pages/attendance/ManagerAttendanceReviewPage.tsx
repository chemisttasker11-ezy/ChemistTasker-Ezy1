import { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  Alert,
  Box,
  Button,
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
import { Check, ClipboardCheck, History, PencilLine, RefreshCw, X } from "lucide-react";
import { attendance, fetchPharmaciesService } from "@chemisttasker/shared-core";
import PageHeader from "../../components/ui/PageHeader";
import DashboardContentState from "../../components/dashboard/DashboardContentState";
import { InitialsAvatar } from "../../components/ui/InitialsAvatar";
import { Pill } from "../../components/ui/Pill";
import { type StatusTone } from "../../components/ui/tone";
import { humanizeEnum } from "../../utils/labels";
import { correctionTimestamp } from "./correctionTimestamp";

dayjs.extend(utc);
dayjs.extend(timezone);

const COVER_TYPES: Record<string, { label: string; tone: StatusTone; hint: string }> = {
  UNROSTERED_LOCAL: { label: "Not on the roster", tone: "blue", hint: "Worked at this pharmacy without a rostered shift." },
  CROSS_SITE_CHAIN: { label: "Cover from a sister store", tone: "violet", hint: "Usually works at another pharmacy in your chain." },
  CROSS_SITE_ORG: { label: "Cover from your organisation", tone: "amber", hint: "Usually works at another pharmacy in your organisation." },
};

const EVENT_TONES: Record<string, StatusTone> = { CLOCK_IN: "green", CLOCK_OUT: "navy" };
const timeOf = (iso: string, timeZone?: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone });

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
  pharmacy_timezone: string;
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
  const pharmacyTimezone = timelineData?.pharmacy_timezone;
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelineFailed, setTimelineFailed] = useState(false);
  const [pharmaciesLoading, setPharmaciesLoading] = useState(true);
  const [pharmaciesFailed, setPharmaciesFailed] = useState(false);
  const [reviewsFailed, setReviewsFailed] = useState(false);

  // Manual Correction sub-state
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [correctedTimestamp, setCorrectedTimestamp] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Fetch pharmacies managed by this user
  const loadPharmacies = useCallback(async () => {
    setPharmaciesLoading(true);
    setPharmaciesFailed(false);
    try {
      const list = await fetchPharmaciesService({}) as Array<{ id: number; name: string }>;
      setPharmacies(list);
      if (list.length > 0) {
        setSelectedPharmacyId(list[0].id);
      }
    } catch (err) {
      setPharmaciesFailed(true);
    } finally {
      setPharmaciesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPharmacies();
  }, [loadPharmacies]);

  // Fetch pending provisional attendances for the selected pharmacy
  const fetchPending = useCallback(async (clearAlert = true) => {
    if (!selectedPharmacyId) return;
    try {
      setLoadingReviews(true);
      if (clearAlert) {
        setAlertMsg(null);
      }
      const rows = await attendance.getManagerPending(Number(selectedPharmacyId));
      setPendingReviews(rows as PendingReview[]);
      setReviewsFailed(false);
    } catch (err: any) {
      setReviewsFailed(true);
      setAlertMsg({
        type: "error",
        text: err?.message || "Failed to load pending attendance reviews.",
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
      await attendance.approve(
        approvingItem.provisional_id,
        approvalReason.trim() || "Approved cover shift by pharmacy manager."
      );
      setAlertMsg({
        type: "success",
        text: `Successfully approved shift for ${approvingItem.worker_name}. Retroactive shift backfilled.`,
      });
      setApprovingItem(null);
      setApprovalReason("");
      void fetchPending(false);
    } catch (err: any) {
      setAlertMsg({
        type: "error",
        text: err?.message || "Failed to approve attendance.",
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
      await attendance.reject(rejectingItem.provisional_id, rejectionReason.trim());
      setAlertMsg({
        type: "success",
        text: `Rejected attendance for ${rejectingItem.worker_name}. Raw audit records retained.`,
      });
      setRejectingItem(null);
      setRejectionReason("");
      void fetchPending(false);
    } catch (err: any) {
      setAlertMsg({
        type: "error",
        text: err?.message || "Failed to reject attendance.",
      });
    } finally {
      setIsRejecting(false);
    }
  };

  // Open Timeline
  const openTimeline = async (sessionId: number) => {
    setTimelineSessionId(sessionId);
    setLoadingTimeline(true);
    setTimelineFailed(false);
    setTimelineData(null);
    try {
      const data = await attendance.getManagerTimeline(sessionId);
      setTimelineData(data as SessionTimelineData);
    } catch (err: any) {
      setTimelineFailed(true);
    } finally {
      setLoadingTimeline(false);
    }
  };

  // Submit Manual Event Correction
  const handleSubmitCorrection = async () => {
    if (!editingEventId || !correctedTimestamp || !correctionReason.trim()) return;
    const original = timelineData?.timeline.find((event) => event.event_id === editingEventId)?.effective_timestamp;
    if (!original || !pharmacyTimezone) return;
    setSubmittingCorrection(true);
    try {
      await attendance.correct(
        editingEventId,
        correctionTimestamp(correctedTimestamp, original, pharmacyTimezone),
        correctionReason.trim()
      );
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
        text: err?.message || "Failed to save correction.",
      });
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const pharmacyPicker = pharmacies.length > 1 ? (
    <FormControl sx={{ minWidth: 240 }} size="small">
      <InputLabel>Pharmacy</InputLabel>
      <Select value={selectedPharmacyId} label="Pharmacy" onChange={(e) => setSelectedPharmacyId(Number(e.target.value))}>
        {pharmacies.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  ) : undefined;

  const actionsFor = (row: PendingReview) => (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      <Button size="small" variant="outlined" startIcon={<History size={16} />} onClick={() => openTimeline(row.session_id)} sx={{ minHeight: 40 }}>
        Clock times
      </Button>
      <Button size="small" variant="contained" color="success" startIcon={<Check size={16} />} onClick={() => setApprovingItem(row)} sx={{ minHeight: 40 }}>
        Approve
      </Button>
      <Button size="small" variant="outlined" color="error" startIcon={<X size={16} />} onClick={() => setRejectingItem(row)} sx={{ minHeight: 40 }}>
        Reject
      </Button>
    </Stack>
  );

  let body;
  if (pharmaciesLoading || (loadingReviews && pendingReviews.length === 0)) {
    body = <DashboardContentState kind="loading" title="Loading attendance to approve…" />;
  } else if (pharmaciesFailed) {
    body = (
      <DashboardContentState
        kind="error"
        title="We couldn't load your pharmacies"
        description="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void loadPharmacies()}
      />
    );
  } else if (!selectedPharmacyId) {
    body = (
      <DashboardContentState
        kind="empty"
        icon={<ClipboardCheck size={26} />}
        title="No pharmacies to review"
        description="Attendance approvals appear here for pharmacies you manage."
      />
    );
  } else if (reviewsFailed && pendingReviews.length === 0) {
    body = (
      <DashboardContentState
        kind="error"
        title="We couldn't load attendance to approve"
        description="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void fetchPending()}
      />
    );
  } else if (pendingReviews.length === 0) {
    body = (
      <DashboardContentState
        kind="empty"
        icon={<ClipboardCheck size={26} />}
        title="Nothing to approve"
        description="Hours worked off the roster or by cover from another site appear here for you to approve."
      />
    );
  } else {
    body = (
      <Stack spacing={1.25} aria-busy={loadingReviews}>
        {pendingReviews.map((row) => {
          const startTime = new Date(row.started_at);
          const endTime = row.ended_at ? new Date(row.ended_at) : null;
          const hours = endTime ? (endTime.getTime() - startTime.getTime()) / (1000 * 3600) : null;
          const cover = COVER_TYPES[row.cover_type] ?? { label: humanizeEnum(row.cover_type), tone: "neutral" as StatusTone, hint: "" };
          const time = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

          return (
            <Paper
              key={row.provisional_id}
              variant="outlined"
              sx={{ p: { xs: 1.75, md: 2 }, borderRadius: "var(--ct-card-radius)", borderColor: "var(--ct-border-color)", display: "flex", alignItems: { md: "center" }, flexDirection: { xs: "column", md: "row" }, justifyContent: "space-between", gap: 1.5 }}
            >
              <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
                <InitialsAvatar name={row.worker_name} size={40} />
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography component="h3" sx={{ fontWeight: 600, fontSize: 16, color: "var(--ct-text-primary)", overflowWrap: "anywhere" }}>
                      {row.worker_name}
                    </Typography>
                    <Pill tone={cover.tone} label={cover.label} title={cover.hint || undefined} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                    {row.worker_email}
                    {row.source_pharmacy_name ? ` · usually at ${row.source_pharmacy_name}` : ""}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, color: "var(--ct-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {startTime.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · {time(startTime)} – {endTime ? time(endTime) : "still clocked in"}
                    {" · "}
                    <strong>{hours === null ? "In progress" : `${hours.toFixed(1)} h`}</strong>
                  </Typography>
                </Box>
              </Stack>
              {actionsFor(row)}
            </Paper>
          );
        })}
      </Stack>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Attendance approvals"
        subtitle="Approve hours worked off the roster or by cover from another site, and correct clock times."
        actions={pharmacyPicker}
      />

      {/* Feedback Alerts */}
      {alertMsg && !(reviewsFailed && pendingReviews.length === 0) && (
        <Alert severity={alertMsg.type} sx={{ mb: 2 }} onClose={() => setAlertMsg(null)}>
          {alertMsg.text}
        </Alert>
      )}

      {selectedPharmacyId && !pharmaciesLoading && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" sx={{ mb: 1.5, gap: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography component="h2" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 22, color: "var(--ct-text-primary)" }}>
              Waiting for approval
            </Typography>
            {pendingReviews.length > 0 && <Pill tone="amber" label={`${pendingReviews.length} to review`} />}
          </Stack>
          <Button
            size="small"
            variant="outlined"
            onClick={() => void fetchPending()}
            disabled={loadingReviews}
            startIcon={loadingReviews ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={16} />}
            sx={{ minHeight: 40 }}
          >
            Refresh
          </Button>
        </Stack>
      )}

      {body}

      {/* Approval Confirmation Dialog */}
      <Dialog open={!!approvingItem} onClose={isApproving ? undefined : () => setApprovingItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Approve {approvingItem?.worker_name}'s hours?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This adds the shift to the roster as completed. Cover from another site does
            <strong> not</strong> become a member of this pharmacy.
          </Typography>
          <TextField
            label="Note (optional)"
            placeholder="e.g. Confirmed cover by phone with the area manager."
            value={approvalReason}
            onChange={(e) => setApprovalReason(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setApprovingItem(null)} disabled={isApproving}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmApproval}
            disabled={isApproving}
            startIcon={isApproving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Approve hours
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rejection Confirmation Dialog */}
      <Dialog open={!!rejectingItem} onClose={isRejecting ? undefined : () => setRejectingItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject {rejectingItem?.worker_name}'s hours?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The hours won't be added to the roster. The original clock records are kept for audit and disputes.
          </Typography>
          <TextField
            label="Reason"
            placeholder="e.g. Not authorised by the store manager."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            helperText="Required."
            fullWidth
            required
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setRejectingItem(null)} disabled={isRejecting}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmRejection}
            disabled={isRejecting || !rejectionReason.trim()}
            startIcon={isRejecting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Reject hours
          </Button>
        </DialogActions>
      </Dialog>

      {/* Timeline and Corrections Modal */}
      <Dialog open={!!timelineSessionId} onClose={() => setTimelineSessionId(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <span>Clock times</span>
          {timelineData && (
            <Pill
              tone={timelineData.is_provisional ? "amber" : "green"}
              label={timelineData.is_provisional ? "Off the roster" : "Rostered"}
            />
          )}
        </DialogTitle>
        <DialogContent dividers>
          {loadingTimeline ? (
            <DashboardContentState compact kind="loading" title="Loading clock times…" />
          ) : timelineFailed || !timelineData ? (
            <DashboardContentState
              compact
              kind="error"
              title="We couldn't load the clock times"
              description="Try again in a moment."
              actionLabel="Try again"
              onAction={() => timelineSessionId && void openTimeline(timelineSessionId)}
            />
          ) : (
            <Stack spacing={2.5}>
              <Typography variant="body2" color="text.secondary">
                <strong>{timelineData.worker_name}</strong> at <strong>{timelineData.pharmacy_name}</strong>. Corrections are added
                on top of the original records, which are never changed.
              </Typography>

              <TableContainer sx={{ border: "1px solid var(--ct-border-color)", borderRadius: "14px" }}>
                <Table size="small" sx={{ "& .MuiTableCell-root": { px: { xs: 1, sm: 2 } } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Event</TableCell>
                      <TableCell>Recorded</TableCell>
                      <TableCell>Counts as</TableCell>
                      <TableCell align="right"><Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Correct</Box></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {timelineData.timeline.map((ev) => (
                      <TableRow key={ev.event_id}>
                        <TableCell>
                          <Pill tone={EVENT_TONES[ev.event_type] ?? "amber"} label={humanizeEnum(ev.event_type)} />
                        </TableCell>
                        <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{timeOf(ev.original_timestamp, pharmacyTimezone)}</TableCell>
                        <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {ev.is_corrected ? (
                            <Stack spacing={0.5} alignItems="flex-start">
                              <Box component="span" sx={{ fontWeight: 600, color: "var(--ct-accent-strong)" }}>{timeOf(ev.effective_timestamp, pharmacyTimezone)}</Box>
                              <Pill tone="violet" label="Corrected" title={ev.correction_reason || undefined} />
                            </Stack>
                          ) : (
                            <Typography variant="body2" color="text.secondary">Same</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Correct this time">
                            <IconButton
                              aria-label={`Correct ${humanizeEnum(ev.event_type).toLowerCase()} time`}
                              onClick={() => {
                                setEditingEventId(ev.event_id);
                                // Both directions use pharmacy wall time even when the manager's browser is elsewhere.
                                setCorrectedTimestamp(dayjs(ev.effective_timestamp).tz(pharmacyTimezone).format("YYYY-MM-DDTHH:mm"));
                                setCorrectionReason("");
                              }}
                              sx={{ width: 40, height: 40 }}
                            >
                              <PencilLine size={18} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Sub-form for editing an event timestamp */}
              {editingEventId && (
                <Paper variant="outlined" sx={{ p: 2.5, bgcolor: "var(--ct-tone-violet-bg)", borderColor: "var(--ct-border-color)", borderRadius: "14px" }}>
                  <Typography sx={{ fontWeight: 600, color: "var(--ct-text-primary)", mb: 1.5 }}>
                    Correct the {humanizeEnum(timelineData.timeline.find((ev) => ev.event_id === editingEventId)?.event_type).toLowerCase() || "event"} time
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Correct date and time"
                        type="datetime-local"
                        value={correctedTimestamp}
                        onChange={(e) => setCorrectedTimestamp(e.target.value)}
                        fullWidth
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        helperText="Unchanged times keep their recorded offset. Edited repeated times use the earlier occurrence."
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Reason"
                        placeholder="e.g. CCTV shows arrival at 8:55 AM"
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        fullWidth
                        size="small"
                        required
                      />
                    </Grid>
                  </Grid>
                  <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
                    <Button size="small" onClick={() => setEditingEventId(null)} disabled={submittingCorrection}>
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleSubmitCorrection}
                      disabled={submittingCorrection || !correctionReason.trim()}
                      startIcon={submittingCorrection ? <CircularProgress size={14} color="inherit" /> : undefined}
                    >
                      Save correction
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
