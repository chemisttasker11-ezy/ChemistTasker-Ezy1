import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { attendance } from "@chemisttasker/shared-core";
import type { PendingKioskReview } from "@chemisttasker/shared-core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface KioskEvidenceReviewProps {
  pharmacyId: number | string;
}

export function formatCorrectedTimestamp(localDateTime: string, timeZone: string): string {
  if (!localDateTime) return "";
  try {
    return dayjs.tz(localDateTime, timeZone).format();
  } catch {
    return localDateTime;
  }
}

export default function KioskEvidenceReview({ pharmacyId }: KioskEvidenceReviewProps) {
  const [items, setItems] = useState<PendingKioskReview[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const [approvingItem, setApprovingItem] = useState<PendingKioskReview | null>(null);
  const [approveReason, setApproveReason] = useState<string>("");
  const [approveTime, setApproveTime] = useState<string>("");

  const [rejectingItem, setRejectingItem] = useState<PendingKioskReview | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");

  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadReviews = useCallback(async () => {
    if (!pharmacyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await attendance.getManagerPendingKioskReviews(pharmacyId);
      setItems(rows || []);
    } catch (err: any) {
      setLoadError(err?.message || "Evidence queue unavailable. Could not load flagged kiosk evidence.");
    } finally {
      setLoading(false);
    }
  }, [pharmacyId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const openApprove = (item: PendingKioskReview) => {
    if (!item.can_approve) return;
    setApprovingItem(item);
    setApproveReason("");
    setApproveTime(
      item.trusted_time_estimate
        ? dayjs(item.trusted_time_estimate).tz(item.pharmacy_timezone).format("YYYY-MM-DDTHH:mm")
        : ""
    );
  };

  const openReject = (item: PendingKioskReview) => {
    setRejectingItem(item);
    setRejectReason("");
  };

  const handleApproveSubmit = async () => {
    if (!approvingItem || !approveReason.trim() || !approveTime.trim() || submitting) return;
    setSubmitting(true);
    try {
      const timestamp = formatCorrectedTimestamp(approveTime.trim(), approvingItem.pharmacy_timezone);
      await attendance.decideKioskReview({
        event_id: approvingItem.event_id,
        decision: "APPROVED",
        reason: approveReason.trim(),
        corrected_timestamp: timestamp,
      });
      setApprovingItem(null);
      setApproveReason("");
      setApproveTime("");
      await loadReviews();
    } catch (err: any) {
      if (err?.status === 409 || err?.payload?.code === "REVIEW_ALREADY_DECIDED" || err?.code === "REVIEW_ALREADY_DECIDED") {
        setConflictError("Another manager already decided this evidence (conflict).");
      } else {
        setConflictError(err?.message || "Failed to submit decision.");
      }
      setApprovingItem(null);
      await loadReviews();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectingItem || !rejectReason.trim() || submitting) return;
    setSubmitting(true);
    try {
      await attendance.decideKioskReview({
        event_id: rejectingItem.event_id,
        decision: "REJECTED",
        reason: rejectReason.trim(),
      });
      setRejectingItem(null);
      setRejectReason("");
      await loadReviews();
    } catch (err: any) {
      if (err?.status === 409 || err?.payload?.code === "REVIEW_ALREADY_DECIDED" || err?.code === "REVIEW_ALREADY_DECIDED") {
        setConflictError("Another manager already decided this evidence (conflict).");
      } else {
        setConflictError(err?.message || "Failed to submit decision.");
      }
      setRejectingItem(null);
      await loadReviews();
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitApprove = Boolean(approveReason.trim() && approveTime.trim() && !submitting);
  const canSubmitReject = Boolean(rejectReason.trim() && !submitting);

  return (
    <Box sx={{ mt: 3, mb: 3 }}>
      <Typography component="h2" sx={{ fontWeight: 600, fontSize: 20, mb: 1.5, color: "var(--ct-text-primary)" }}>
        Flagged Kiosk Evidence
      </Typography>

      {conflictError && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setConflictError(null)}>
          {conflictError}
        </Alert>
      )}

      {loading && items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <CircularProgress size={24} sx={{ mb: 1 }} />
          <Typography color="text.secondary">Loading flagged kiosk evidence...</Typography>
        </Paper>
      ) : loadError && items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            {loadError}
          </Alert>
          <Button variant="outlined" onClick={() => void loadReviews()}>
            Retry
          </Button>
        </Paper>
      ) : items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 2.5, textAlign: "center", color: "text.secondary" }}>
          <Typography variant="body2">No flagged kiosk evidence pending review.</Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {items.map((item) => (
            <Paper
              key={item.event_id}
              variant="outlined"
              sx={{
                p: 2,
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                justifyContent: "space-between",
                alignItems: { md: "center" },
                gap: 1.5,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography component="h3" sx={{ fontWeight: 600, fontSize: 16 }}>
                  {item.worker_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Terminal: {item.device_name} Â· Timezone: {item.pharmacy_timezone}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  Event: {item.event_type} Â· Flags: {item.integrity_flags.join(", ")}
                </Typography>
                {!item.can_approve && item.approval_block_reason && (
                  <Typography variant="body2" color="error" sx={{ mt: 0.5, fontWeight: 500 }}>
                    {item.approval_block_reason}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disabled={!item.can_approve}
                  onClick={() => openApprove(item)}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={false}
                  onClick={() => openReject(item)}
                >
                  Reject
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Approve Dialog */}
      <Dialog open={Boolean(approvingItem)} onClose={submitting ? undefined : () => setApprovingItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Approve Kiosk Evidence</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Approve evidence for {approvingItem?.worker_name} ({approvingItem?.device_name}).
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Reason"
              value={approveReason}
              onChange={(e) => setApproveReason(e.target.value)}
              fullWidth
              required
              multiline
              rows={2}
            />
            <TextField
              label="Corrected time"
              value={approveTime}
              onChange={(e) => setApproveTime(e.target.value)}
              fullWidth
              required
              helperText={`Use local time in ${approvingItem?.pharmacy_timezone || "pharmacy timezone"}`}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setApprovingItem(null)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={!canSubmitApprove}
            onClick={handleApproveSubmit}
          >
            Approve
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={Boolean(rejectingItem)} onClose={submitting ? undefined : () => setRejectingItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Kiosk Evidence</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Reject evidence for {rejectingItem?.worker_name}. Audit records will be retained.
          </Typography>
          <TextField
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            fullWidth
            required
            multiline
            rows={2}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setRejectingItem(null)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={!canSubmitReject}
            onClick={handleRejectSubmit}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
