// The worker's booked shifts (Shift Centre Confirmed and History), in the owner Shift Centre style: one card per shift
// with the pharmacy, role, rate and dates, and the actions that fit the moment (pharmacy details before the shift;
// invoice and rating after it). The pharmacy details dialog is shared by both.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Pagination, Rating, Skeleton, Stack, Typography } from "@mui/material";
import { Building2, CalendarCheck, Clock, FileText, History, MapPin, Receipt, Star, Store } from "lucide-react";
import {
  bookedShiftRateLabel,
  fetchRatingsPageService,
  fetchRatingsSummaryService,
  type Shift,
  type ShiftRatingComment,
  type ShiftRatingSummary,
} from "@chemisttasker/shared-core";
import IconTile from "../../../components/ui/IconTile";
import { Pill } from "../../../components/ui/Pill";
import DashboardContentState from "../../../components/dashboard/DashboardContentState";
import { humanizeEnum } from "../../../utils/labels";

type Pharmacy = NonNullable<Shift["pharmacyDetail"]>;

export const pharmacyAddress = (pharmacy?: Shift["pharmacyDetail"] | null) =>
  [pharmacy?.streetAddress, pharmacy?.suburb, pharmacy?.state, pharmacy?.postcode].filter(Boolean).join(", ");

const mapUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const dateBits = (raw?: string | null) => {
  const parsed = raw ? new Date(`${raw}T00:00:00`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { day: "", date: raw || "Date to confirm" };
  return { day: parsed.toLocaleDateString("en-AU", { weekday: "short" }), date: parsed.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) };
};
const clock = (raw?: string | null) => (raw ? String(raw).slice(0, 5) : "--");

/** The pay the worker sees: pharmacist rate type, or the award with any owner bonus. */

export function WorkerBookedShiftBoard({ mode, shifts, loading, ratings = {}, actions }: {
  mode: "confirmed" | "history";
  shifts: Shift[];
  loading: boolean;
  /** Pharmacy rating summaries by pharmacy id (History shows them). */
  ratings?: Record<number, ShiftRatingSummary>;
  actions: (shift: Shift) => ReactNode;
}) {
  const perPage = 6;
  const [page, setPage] = useState(1);
  const visible = useMemo(() => shifts.slice((page - 1) * perPage, page * perPage), [page, shifts]);

  if (loading) {
    return (
      <Stack spacing={2.5} role="status" aria-label="Loading shifts">
        {[0, 1, 2].map(index => <Skeleton key={index} variant="rounded" height={176} sx={{ borderRadius: "var(--ct-card-radius)" }} />)}
      </Stack>
    );
  }
  if (!shifts.length) {
    return mode === "history"
      ? <DashboardContentState kind="empty" icon={<History />} title="No past shifts yet" description="Shifts you have worked appear here, ready for an invoice and a rating." />
      : <DashboardContentState kind="empty" icon={<CalendarCheck />} title="No confirmed shifts yet" description="When a pharmacy confirms you for a shift it appears here, with the address and their documents." />;
  }

  return (
    <Stack spacing={2.5}>
      {visible.map(shift => {
        const pharmacy = shift.pharmacyDetail;
        const address = pharmacyAddress(pharmacy);
        const rating = pharmacy?.id ? ratings[pharmacy.id] : undefined;
        const slots = shift.slots ?? [];
        return (
          <Box key={shift.id} component="article" aria-label={pharmacy?.name || "Shift"}
            sx={{ borderRadius: "var(--ct-card-radius)", border: "1px solid var(--ct-border-color)", bgcolor: "var(--ct-surface-bg)", overflow: "hidden" }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 2, md: 3 }} sx={{ p: { xs: 2, md: 3 } }} justifyContent="space-between">
              <Stack direction="row" spacing={2} sx={{ minWidth: 0 }}>
                <IconTile icon={<Building2 />} tone={mode === "history" ? "magenta" : "violet"} size={48} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="h3" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: { xs: 18, sm: 20 }, color: "var(--ct-text-primary)", lineHeight: 1.25, overflowWrap: "anywhere" }}>
                    {pharmacy?.name || "Pharmacy"}
                  </Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    {shift.roleNeeded && <Pill tone="navy" label={humanizeEnum(shift.roleLabel ?? shift.roleNeeded)} />}
                    {shift.employmentType && <Pill outlined label={humanizeEnum(shift.employmentType)} />}
                    <Pill tone={shift.ownerAdjustedRate && shift.roleNeeded !== "PHARMACIST" ? "green" : "neutral"} label={bookedShiftRateLabel(shift)} />
                  </Stack>
                  {address && (
                    <Box component="a" href={mapUrl(address)} target="_blank" rel="noopener noreferrer"
                      sx={{ mt: 1.25, display: "inline-flex", gap: 0.75, alignItems: "center", fontSize: 13.5, color: "var(--ct-text-secondary)", textDecoration: "none", "& svg": { width: 15, height: 15, flexShrink: 0 }, "&:hover": { color: "var(--ct-accent-strong)", textDecoration: "underline" } }}>
                      <MapPin aria-hidden />{address}
                    </Box>
                  )}
                  {(shift.workloadTags ?? []).length > 0 && (
                    <Typography sx={{ mt: 0.75, fontSize: 13, color: "var(--ct-text-secondary)" }}>Workload: {(shift.workloadTags ?? []).map(humanizeEnum).join(", ")}</Typography>
                  )}
                </Box>
              </Stack>
              {rating && rating.count > 0 && (
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }} aria-label={`Pharmacy rating ${rating.average.toFixed(1)} from ${rating.count}`}>
                  <Rating value={rating.average} precision={0.5} readOnly size="small" />
                  <Typography sx={{ fontSize: 13, color: "var(--ct-text-secondary)" }}>{rating.average.toFixed(1)} ({rating.count})</Typography>
                </Stack>
              )}
            </Stack>

            {slots.length > 0 && (
              <Box sx={{ px: { xs: 2, md: 3 }, pb: 2, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 1 }}>
                {slots.map(slot => {
                  const bits = dateBits(slot.date);
                  return (
                    <Stack key={slot.id} direction="row" spacing={1.25} alignItems="center" sx={{ p: 1.25, borderRadius: "12px", border: "1px solid var(--ct-border-color)" }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: "var(--ct-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{bits.day}</Typography>
                        <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: "var(--ct-text-primary)" }}>{bits.date}</Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "var(--ct-text-secondary)", "& svg": { width: 13, height: 13 } }}>
                          <Clock aria-hidden /><Typography sx={{ fontSize: 12.5, color: "inherit", fontVariantNumeric: "tabular-nums" }}>{clock(slot.startTime)} – {clock(slot.endTime)}</Typography>
                        </Stack>
                      </Box>
                    </Stack>
                  );
                })}
              </Box>
            )}

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" justifyContent="space-between"
              sx={{ px: { xs: 2, md: 3 }, py: 1.25, borderTop: "1px solid var(--ct-border-color)", bgcolor: "var(--ct-subtle-bg)" }}>
              <Pill tone={mode === "history" ? "neutral" : "green"} icon={mode === "history" ? <History /> : <CalendarCheck />}
                label={`${mode === "history" ? "Worked" : "Confirmed"} · ${slots.length} ${slots.length === 1 ? "date" : "dates"}`} />
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">{actions(shift)}</Stack>
            </Stack>
          </Box>
        );
      })}
      {shifts.length > perPage && (
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Pagination count={Math.ceil(shifts.length / perPage)} page={page} onChange={(_, value) => { setPage(value); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        </Box>
      )}
    </Stack>
  );
}

const DOCUMENTS: [keyof Pharmacy, string][] = [
  ["sops", "Standard operating procedures"],
  ["inductionGuides", "Induction guide"],
  ["methadoneS8Protocols", "Methadone and S8 protocols"],
  ["qldSumpDocs", "QLD SUMP documents"],
];

/** Everything a booked worker needs about the pharmacy: where it is, its documents, and what other workers say. */
export function PharmacyDetailsDialog({ pharmacy, onClose }: { pharmacy: Pharmacy | null; onClose: () => void }) {
  const [summary, setSummary] = useState<ShiftRatingSummary | null>(null);
  const [comments, setComments] = useState<ShiftRatingComment[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = async (id: number, nextPage: number) => {
    setLoading(true);
    try {
      if (nextPage === 1) setSummary(await fetchRatingsSummaryService({ targetType: "pharmacy", targetId: id }));
      const data = await fetchRatingsPageService({ targetType: "pharmacy", targetId: id, page: nextPage });
      setComments(data.results);
      setPages(Math.max(1, Math.ceil(data.count / (data.results.length || 1))));
      setPage(nextPage);
    } catch {
      setSummary(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setSummary(null);
    setComments([]);
    if (pharmacy?.id) void load(pharmacy.id, 1);
  }, [pharmacy?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const address = pharmacyAddress(pharmacy);
  const documents = pharmacy ? DOCUMENTS.filter(([key]) => Boolean(pharmacy[key])) : [];
  return (
    <Dialog open={Boolean(pharmacy)} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="pharmacy-details-title">
      <DialogTitle id="pharmacy-details-title" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500 }}>{pharmacy?.name || "Pharmacy"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {address && (
            <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ "& svg": { width: 16, height: 16, mt: "2px", color: "var(--ct-text-muted)", flexShrink: 0 } }}>
              <MapPin aria-hidden />
              <Box>
                <Typography sx={{ fontSize: 14, color: "var(--ct-text-primary)" }}>{address}</Typography>
                <Box component="a" href={mapUrl(address)} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13, color: "var(--ct-accent-strong)" }}>Open in Maps</Box>
              </Box>
            </Stack>
          )}
          <Box component="section" aria-labelledby="pharmacy-documents">
            <Typography id="pharmacy-documents" component="h4" sx={{ fontSize: 13, fontWeight: 600, mb: 1, color: "var(--ct-text-primary)" }}>Documents for your shift</Typography>
            {documents.length ? (
              <Stack spacing={0.75}>
                {documents.map(([key, label]) => (
                  <Stack key={key} direction="row" spacing={1.25} alignItems="center" justifyContent="space-between" sx={{ p: 1.25, borderRadius: "12px", border: "1px solid var(--ct-border-color)" }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, "& svg": { width: 16, height: 16, color: "var(--ct-text-muted)" } }}>
                      <FileText aria-hidden /><Typography sx={{ fontSize: 14 }}>{label}</Typography>
                    </Stack>
                    <Button size="small" href={String(pharmacy?.[key])} target="_blank" rel="noopener noreferrer">Open</Button>
                  </Stack>
                ))}
              </Stack>
            ) : <Typography sx={{ fontSize: 13.5, color: "var(--ct-text-secondary)" }}>This pharmacy has not shared documents yet.</Typography>}
          </Box>
          <Box component="section" aria-labelledby="pharmacy-reviews">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Typography id="pharmacy-reviews" component="h4" sx={{ fontSize: 13, fontWeight: 600, color: "var(--ct-text-primary)" }}>What workers say</Typography>
              {summary && summary.count > 0 && <><Rating value={summary.average} precision={0.5} readOnly size="small" /><Typography sx={{ fontSize: 13, color: "var(--ct-text-secondary)" }}>({summary.count})</Typography></>}
            </Stack>
            {loading && !comments.length ? <Stack spacing={1}><Skeleton height={22} /><Skeleton height={22} width="70%" /></Stack>
              : comments.length ? (
                <Stack spacing={1}>
                  {comments.map(review => (
                    <Box key={review.id} sx={{ p: 1.25, borderRadius: "12px", bgcolor: "var(--ct-subtle-bg)" }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Rating value={review.stars} readOnly size="small" />
                        {review.createdAt && <Typography sx={{ fontSize: 12, color: "var(--ct-text-secondary)" }}>{new Date(review.createdAt).toLocaleDateString("en-AU")}</Typography>}
                      </Stack>
                      {review.comment && <Typography sx={{ fontSize: 13.5, mt: 0.5 }}>{review.comment}</Typography>}
                    </Box>
                  ))}
                  {pages > 1 && pharmacy?.id && <Pagination size="small" count={pages} page={page} onChange={(_, value) => void load(pharmacy.id!, value)} sx={{ alignSelf: "center" }} />}
                </Stack>
              ) : <Typography sx={{ fontSize: 13.5, color: "var(--ct-text-secondary)" }}>No reviews yet.</Typography>}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

export const ACTION_ICONS = { details: <Store size={16} />, invoice: <Receipt size={16} />, rate: <Star size={16} /> };
