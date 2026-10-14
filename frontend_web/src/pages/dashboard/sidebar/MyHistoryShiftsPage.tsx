// The worker's Shift Centre: History. Shifts the worker has done, with an invoice and a pharmacy rating for each.
import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Rating, Skeleton, Snackbar, Stack, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import {
  createRatingService,
  fetchMyHistoryShifts,
  fetchMyRatingForTargetService,
  fetchRatingsSummaryService,
  type Shift,
  type ShiftRatingSummary,
} from "@chemisttasker/shared-core";
import PageHeader from "../../../components/ui/PageHeader";
import { STAFF_SECTION_COPY, StaffShiftCentreTabs } from "../shiftCenter/StaffShiftCentreTabs";
import { ACTION_ICONS, PharmacyDetailsDialog, WorkerBookedShiftBoard } from "../shiftCenter/WorkerBookedShifts";
import { RowAction } from "../shiftCenter/ShiftCentreParts";

const STAR_WORDS = ["", "Poor", "Below expectations", "Good", "Very good", "Excellent"];

export default function MyHistoryShiftsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const base = user?.role === "OTHER_STAFF" ? "/dashboard/otherstaff" : "/dashboard/pharmacist";
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [ratings, setRatings] = useState<Record<number, ShiftRatingSummary>>({});
  const [pharmacy, setPharmacy] = useState<Shift["pharmacyDetail"] | null>(null);
  const [rateTarget, setRateTarget] = useState<{ id: number; name: string } | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRating = (id: number) =>
    fetchRatingsSummaryService({ targetType: "pharmacy", targetId: id })
      .then(summary => setRatings(prev => ({ ...prev, [id]: summary })))
      .catch(() => undefined);

  useEffect(() => {
    fetchMyHistoryShifts()
      .then(data => {
        setShifts(data);
        new Set(data.map((shift: Shift) => shift.pharmacyDetail?.id).filter((id): id is number => typeof id === "number"))
          .forEach(id => void loadRating(id));
      })
      .catch(() => setMessage("We could not load your past shifts. Try again in a moment."))
      .finally(() => setLoading(false));
  }, []);

  const openRating = async (id: number, name: string) => {
    setRateTarget({ id, name });
    setLoadingExisting(true);
    try {
      const existing = await fetchMyRatingForTargetService({ targetType: "pharmacy", targetId: id });
      setStars(existing?.stars || 0);
      setComment(existing?.comment || "");
    } catch {
      setStars(0);
      setComment("");
    } finally {
      setLoadingExisting(false);
    }
  };

  const saveRating = async () => {
    if (!rateTarget) return;
    setSaving(true);
    try {
      await createRatingService({ direction: "WORKER_TO_PHARMACY", ratee_pharmacy: rateTarget.id, stars, comment });
      await loadRating(rateTarget.id);
      setMessage("Thanks. Your rating is saved.");
      setRateTarget(null);
    } catch {
      setMessage("Your rating could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader title="Shift Centre" subtitle={STAFF_SECTION_COPY.history}>
        <StaffShiftCentreTabs value="history" />
      </PageHeader>
      <WorkerBookedShiftBoard mode="history" shifts={shifts} loading={loading} ratings={ratings}
        actions={shift => {
          const p = shift.pharmacyDetail;
          return (
            <>
              <RowAction kind="primary" startIcon={ACTION_ICONS.invoice}
                onClick={() => navigate(`${base}/invoice/new?shiftId=${shift.id}&pharmacyId=${p?.id ?? ""}`)}>
                Create invoice
              </RowAction>
              <RowAction startIcon={ACTION_ICONS.rate} disabled={!p?.id} onClick={() => p?.id && void openRating(p.id, p.name ?? "Pharmacy")}>
                Rate pharmacy
              </RowAction>
              <RowAction startIcon={ACTION_ICONS.details} disabled={!p} onClick={() => setPharmacy(p)}>Details</RowAction>
            </>
          );
        }} />

      <PharmacyDetailsDialog pharmacy={pharmacy ?? null} onClose={() => setPharmacy(null)} />

      <Dialog open={Boolean(rateTarget)} onClose={() => !saving && setRateTarget(null)} fullWidth maxWidth="xs" aria-labelledby="rate-pharmacy-title">
        <DialogTitle id="rate-pharmacy-title" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500 }}>Rate {rateTarget?.name}</DialogTitle>
        <DialogContent>
          {loadingExisting ? <Skeleton variant="rounded" height={120} /> : (
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <Typography sx={{ fontSize: 13.5, color: "var(--ct-text-secondary)" }}>
                Your rating helps other workers choose where to work.
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Rating name="pharmacy-rating" value={stars} size="large" onChange={(_, value) => setStars(value || 0)} />
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: "var(--ct-text-primary)" }} aria-live="polite">{STAR_WORDS[stars]}</Typography>
              </Stack>
              <TextField label="Comment (optional)" multiline minRows={3} value={comment} onChange={event => setComment(event.target.value)} fullWidth />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRateTarget(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={saveRating} disabled={saving || stars === 0}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? "Saving…" : "Save rating"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage("")} message={message} />
    </Box>
  );
}
