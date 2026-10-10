import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import { CalendarCheck, Clock, Coffee, KeyRound, LogOut, Pause, Play, QrCode } from "lucide-react";
import moment from "moment";
import { attendance, rosterV2 } from "@chemisttasker/shared-core";
import PageHeader from "../../components/ui/PageHeader";
import IconTile from "../../components/ui/IconTile";
import DashboardContentState from "../../components/dashboard/DashboardContentState";
import { Hint, Pill } from "../dashboard/shiftCenter/ShiftCentreParts";
import { humanizeEnum } from "../dashboard/sidebar/ActiveShiftsPage/utils/audience";

const cardSx = { borderRadius: "var(--ct-card-radius)", border: "1px solid var(--ct-border-color)", boxShadow: "none", bgcolor: "var(--ct-surface-bg)", overflow: "hidden" };
const cardTitleSx = { fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 19, lineHeight: 1.25, color: "var(--ct-text-primary)" };
const PAGE_SUBTITLE = "Clock in at the pharmacy counter, manage your kiosk PIN and acknowledge your published shifts.";


export interface WorkerRosterShift {
  assignment_id: number;
  period_id: number | null;
  pharmacy_id: number;
  pharmacy_name: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  role: string;
  is_acknowledged: boolean;
}

export default function WorkerAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [statusInfo, setStatusInfo] = useState<{
    has_active_session: boolean;
    session_id?: number | null;
    pharmacy_id?: number | null;
    pharmacy_name?: string | null;
    started_at?: string | null;
    is_provisional?: boolean;
    is_on_break?: boolean;
  } | null>(null);

  const [elapsedDuration, setElapsedDuration] = useState<string>("00:00:00");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Scan QR Modal state
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanAction, setScanAction] = useState<"CLOCK_IN" | "CLOCK_OUT">("CLOCK_IN");
  const [qrInputToken, setQrInputToken] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  // Kiosk PIN self-service state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [submittingPin, setSubmittingPin] = useState(false);
  const [pinUpdateError, setPinUpdateError] = useState<string | null>(null);
  const [pinPharmacies, setPinPharmacies] = useState<Array<{ id: number; name: string }>>([]);
  const [pinPharmacyId, setPinPharmacyId] = useState('');
  useEffect(() => {
    if (!pinModalOpen) return;
    let active = true;
    setPinPharmacies([]); setPinPharmacyId(''); setPinUpdateError(null);
    attendance.getPinPharmacies().then((data: any) => {
      if (!active) return;
      const pharmacies = Array.isArray(data?.pharmacies) ? data.pharmacies : [];
      setPinPharmacies(pharmacies);
      if (pharmacies.length === 1) setPinPharmacyId(String(pharmacies[0].id));
    }).catch(() => { if (active) setPinUpdateError('Unable to load your pharmacies. Close this dialog and try again.'); });
    return () => { active = false; };
  }, [pinModalOpen]);

  // Published Roster Shifts state
  const [rosterShifts, setRosterShifts] = useState<WorkerRosterShift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [shiftsFailed, setShiftsFailed] = useState(false);
  const [statusFailed, setStatusFailed] = useState(false);
  const [acknowledgingPeriodId, setAcknowledgingPeriodId] = useState<number | null>(null);

  const handleUpdatePin = async () => {
    if (!pinPharmacyId) { setPinUpdateError('Select a pharmacy.'); return; }
    if (newPin.length < 4 || newPin.length > 6) {
      setPinUpdateError("PIN must be between 4 and 6 numeric digits.");
      return;
    }
    if (newPin !== confirmNewPin) {
      setPinUpdateError("PINs do not match. Please re-enter.");
      return;
    }

    setSubmittingPin(true);
    setPinUpdateError(null);
    try {
      await attendance.updatePin(Number(pinPharmacyId), newPin);
      setSuccessMsg("Attendance PIN updated for the selected pharmacy. Connect its terminal to the internet when first using the new PIN.");
      setPinModalOpen(false);
      setNewPin("");
      setConfirmNewPin("");
    } catch (err: any) {
      setPinUpdateError(err?.message || "Failed to update PIN.");
    } finally {
      setSubmittingPin(false);
    }
  };

  // Fetch current session status
  const fetchStatus = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await attendance.getWorkerStatus();
      setStatusInfo(data as typeof statusInfo);
      setStatusFailed(false);
    } catch (err: any) {
      setErrorMsg("Failed to retrieve current attendance state.");
      setStatusFailed(true);
    } finally {
      setLoading(false);
    }
  };

  // Fetch published roster shifts for the worker
  const fetchRosterShifts = async () => {
    try {
      setLoadingShifts(true);
      const data = await rosterV2.getWorkerRoster({});
      setRosterShifts((data as any)?.shifts || []);
      setShiftsFailed(false);
    } catch (err: any) {
      console.error("Failed to load worker published roster", err);
      setShiftsFailed(true);
    } finally {
      setLoadingShifts(false);
    }
  };

  // Acknowledge a published roster period
  const handleAcknowledgePeriod = async (periodId: number) => {
    try {
      setAcknowledgingPeriodId(periodId);
      await rosterV2.acknowledge({
        period_id: periodId,
        notes: "Acknowledged via Worker Attendance Dashboard",
      });
      setSuccessMsg("Roster shifts acknowledged successfully!");
      await fetchRosterShifts();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to acknowledge shifts.");
    } finally {
      setAcknowledgingPeriodId(null);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchRosterShifts();
  }, []);

  // Live stopwatch timer
  useEffect(() => {
    if (!statusInfo?.has_active_session || !statusInfo?.started_at) {
      setElapsedDuration("00:00:00");
      return;
    }

    const updateTimer = () => {
      const startMs = new Date(statusInfo.started_at!).getTime();
      const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const hours = Math.floor(diffSec / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;
      setElapsedDuration(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [statusInfo]);

  // Handle Break Start
  const handleStartBreak = async () => {
    try {
      setSubmittingAction(true);
      setErrorMsg(null);
      await attendance.breakStart();
      setSuccessMsg("Break started.");
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to start break.");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Break End
  const handleEndBreak = async () => {
    try {
      setSubmittingAction(true);
      setErrorMsg(null);
      await attendance.breakEnd();
      setSuccessMsg("Break ended. Resumed shift.");
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to end break.");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Modal for QR Scan (Clock in or Clock out)
  const openQrModal = (action: "CLOCK_IN" | "CLOCK_OUT") => {
    setScanAction(action);
    setQrInputToken("");
    setErrorMsg(null);
    setScanModalOpen(true);
  };

  // Submit Clock In / Out
  const handleQrSubmit = async () => {
    if (!qrInputToken.trim()) {
      setErrorMsg("Please scan or paste the kiosk QR code token.");
      return;
    }

    setSubmittingAction(true);
    setErrorMsg(null);

    try {
      if (scanAction === "CLOCK_IN") {
        const data = await attendance.clockIn(qrInputToken.trim()) as any;
        setSuccessMsg(
          data.is_provisional
            ? `Clocked in provisionally at ${data.pharmacy_name}. Pending manager review.`
            : `Clocked in successfully at ${data.pharmacy_name}.`
        );
      } else {
        const data = await attendance.clockOut(qrInputToken.trim()) as any;
        setSuccessMsg(`Clocked out successfully from ${data.pharmacy_name}.`);
      }
      setScanModalOpen(false);
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err?.message || "QR verification or clock transition failed.");
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading && !statusInfo) {
    return (
      <Box>
        <PageHeader title="My attendance" subtitle={PAGE_SUBTITLE} />
        <DashboardContentState kind="loading" title="Loading your attendance…" />
      </Box>
    );
  }

  const isClockedIn = statusInfo?.has_active_session;
  const isOnBreak = statusInfo?.is_on_break;
  const toAcknowledge = rosterShifts.filter((shift) => !shift.is_acknowledged).length;
  // One acknowledgement covers the whole published week, so offer it once per week.
  const firstShiftOfPeriod = new Set(
    rosterShifts
      .filter((shift, index) => shift.period_id && rosterShifts.findIndex((s) => s.period_id === shift.period_id) === index)
      .map((shift) => shift.assignment_id),
  );
  const statusPill = isClockedIn
    ? isOnBreak
      ? <Pill tone="amber" label="On break" />
      : <Pill tone="green" label="Clocked in" />
    : <Pill tone="neutral" label="Not clocked in" />;

  return (
    <Box>
      <PageHeader title="My attendance" subtitle={PAGE_SUBTITLE} />

      {/* Notifications */}
      {errorMsg && !scanModalOpen && !statusFailed && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}
      {successMsg && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.6fr) minmax(0, 1fr)" }, alignItems: "start" }}>
        {/* Clock-in status */}
        {statusFailed ? (
          <DashboardContentState
            kind="error"
            title="We couldn't check whether you're clocked in"
            description="Try again before clocking in or out."
            actionLabel="Try again"
            onAction={() => void fetchStatus()}
          />
        ) : (
        <Paper sx={{ ...cardSx, ...(isClockedIn ? { borderColor: isOnBreak ? "var(--ct-status-amber-fg)" : "var(--ct-status-green-fg)" } : {}) }}>
            <>
              <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ p: { xs: 2, md: 2.5 }, borderBottom: "1px solid var(--ct-border-color)", gap: 1.5 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                  <IconTile icon={isOnBreak ? <Coffee size={22} /> : <Clock size={22} />} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography component="h2" sx={cardTitleSx}>Clock-in status</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                      {isClockedIn ? `At ${statusInfo?.pharmacy_name || "your pharmacy"}` : "No shift open"}
                    </Typography>
                  </Box>
                </Stack>
                {statusPill}
              </Stack>

              <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
                {isClockedIn ? (
                  <Stack spacing={3} alignItems="center" textAlign="center">
                    {statusInfo?.is_provisional && (
                      <Alert severity="warning" sx={{ width: "100%", textAlign: "left" }}>
                        <strong>Provisional attendance.</strong> This shift wasn't on the roster (or is cover at another
                        site). Your hours are still recorded and sent to the pharmacy manager to review.
                      </Alert>
                    )}

                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {isOnBreak ? "On break · shift time so far" : "Shift time so far"}
                      </Typography>
                      <Typography
                        aria-live="off"
                        sx={{
                          fontFamily: "var(--ct-font-display)",
                          fontWeight: 500,
                          fontSize: { xs: 44, md: 56 },
                          lineHeight: 1.1,
                          fontVariantNumeric: "tabular-nums",
                          color: isOnBreak ? "var(--ct-status-amber-fg)" : "var(--ct-text-primary)",
                          my: 0.5,
                        }}
                      >
                        {elapsedDuration}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Started at{" "}
                        {new Date(statusInfo?.started_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Typography>
                    </Box>

                    <Divider sx={{ width: "100%" }} />

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ width: "100%", maxWidth: 460 }}>
                      {isOnBreak ? (
                        <Button
                          fullWidth
                          variant="contained"
                          color="warning"
                          startIcon={submittingAction ? <CircularProgress size={16} color="inherit" /> : <Play size={18} />}
                          onClick={handleEndBreak}
                          disabled={submittingAction}
                          sx={{ minHeight: 48 }}
                        >
                          End break
                        </Button>
                      ) : (
                        <Button
                          fullWidth
                          variant="outlined"
                          color="warning"
                          startIcon={submittingAction ? <CircularProgress size={16} color="inherit" /> : <Pause size={18} />}
                          onClick={handleStartBreak}
                          disabled={submittingAction}
                          sx={{ minHeight: 48 }}
                        >
                          Start break
                        </Button>
                      )}
                      <Button
                        fullWidth
                        variant="contained"
                        color="error"
                        startIcon={<LogOut size={18} />}
                        onClick={() => openQrModal("CLOCK_OUT")}
                        disabled={submittingAction}
                        sx={{ minHeight: 48 }}
                      >
                        Clock out
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <Stack spacing={2.5} alignItems="center" textAlign="center" sx={{ py: { xs: 1, md: 2 } }}>
                    <IconTile icon={<QrCode size={28} />} size={60} />
                    <Box>
                      <Typography component="h3" sx={{ ...cardTitleSx, fontSize: 22 }}>Ready to start?</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, mx: "auto", mt: 0.75, textWrap: "balance" }}>
                        Scan the QR code on the pharmacy's counter screen to clock in.
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      startIcon={<QrCode size={18} />}
                      onClick={() => openQrModal("CLOCK_IN")}
                      sx={{ minHeight: 48, px: 4 }}
                    >
                      Scan pharmacy QR
                    </Button>
                  </Stack>
                )}
              </Box>
            </>
        </Paper>
        )}

        {/* Kiosk PIN */}
        <Paper sx={{ ...cardSx, p: { xs: 2, md: 2.5 } }}>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <IconTile icon={<KeyRound size={22} />} tone="magenta" />
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h2" sx={cardTitleSx}>Kiosk PIN</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Your 4–6 digit PIN for clocking in or out on a pharmacy's counter screen.
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            startIcon={<KeyRound size={18} />}
            onClick={() => {
              setNewPin("");
              setConfirmNewPin("");
              setPinUpdateError(null);
              setPinModalOpen(true);
            }}
            sx={{ mt: 2, minHeight: 44 }}
          >
            Change PIN
          </Button>
        </Paper>
      </Box>

      {/* Published shifts & acknowledgements */}
      <Box component="section" aria-labelledby="published-shifts-heading" sx={{ mt: 3 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          sx={{ mb: 1.5, gap: 1.5 }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
            <IconTile icon={<CalendarCheck size={22} />} tone="blue" />
            <Box sx={{ minWidth: 0 }}>
              <Typography id="published-shifts-heading" component="h2" sx={cardTitleSx}>Published shifts</Typography>
              <Typography variant="body2" color="text.secondary">
                Acknowledge each published week so your manager knows you've seen it.
              </Typography>
            </Box>
          </Stack>
          {toAcknowledge > 0 && <Pill tone="amber" label={`${toAcknowledge} to acknowledge`} />}
        </Stack>

        <Box>
          {loadingShifts && rosterShifts.length === 0 ? (
            <DashboardContentState compact kind="loading" title="Loading your published shifts…" />
          ) : shiftsFailed ? (
            <DashboardContentState
              compact
              kind="error"
              title="We couldn't load your published shifts"
              description="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => void fetchRosterShifts()}
            />
          ) : rosterShifts.length === 0 ? (
            <DashboardContentState
              compact
              kind="empty"
              icon={<CalendarCheck size={26} />}
              title="No published shifts yet"
              description="Your shifts appear here once your pharmacy manager publishes the roster."
            />
          ) : (
            <Stack spacing={1.25} aria-busy={loadingShifts}>
              {rosterShifts.map((shift) => {
                const timeBand = `${shift.start_time.slice(0, 5)} – ${shift.end_time.slice(0, 5)}`;
                const isAck = shift.is_acknowledged;
                const acknowledging = acknowledgingPeriodId === shift.period_id;

                return (
                  <Paper
                    key={shift.assignment_id}
                    variant="outlined"
                    sx={{ p: 1.75, borderRadius: "14px", borderColor: "var(--ct-border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5 }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                      <Box sx={{ px: 1.25, py: 0.75, borderRadius: "12px", bgcolor: "var(--ct-subtle-bg)", textAlign: "center", minWidth: 64, flexShrink: 0 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "var(--ct-text-secondary)", textTransform: "uppercase" }}>
                          {moment(shift.slot_date).format("ddd")}
                        </Typography>
                        <Typography sx={{ fontSize: 15, fontWeight: 600, color: "var(--ct-text-primary)" }}>
                          {moment(shift.slot_date).format("D MMM")}
                        </Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography component="h3" sx={{ fontWeight: 600, fontSize: 16, color: "var(--ct-text-primary)", overflowWrap: "anywhere" }}>
                            {shift.pharmacy_name}
                          </Typography>
                          <Pill tone="navy" label={humanizeEnum(shift.role)} />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontVariantNumeric: "tabular-nums" }}>
                          {moment(shift.slot_date).format("ddd D MMM YYYY")} · {timeBand}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center">
                      {isAck ? (
                        <Pill tone="green" label="Acknowledged" />
                      ) : (
                        <>
                          <Pill tone="amber" label="Not acknowledged" />
                          {shift.period_id && firstShiftOfPeriod.has(shift.assignment_id) && (
                            <Hint title="Tells your manager you've seen this week's roster.">
                              <span>
                                <Button
                                  variant="contained"
                                  size="small"
                                  onClick={() => handleAcknowledgePeriod(shift.period_id!)}
                                  disabled={acknowledging}
                                  startIcon={acknowledging ? <CircularProgress size={14} color="inherit" /> : undefined}
                                  sx={{ minHeight: 40 }}
                                >
                                  Acknowledge week
                                </Button>
                              </span>
                            </Hint>
                          )}
                        </>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Box>
      </Box>

      {/* QR Code Input / Scanner Modal */}
      <Dialog open={scanModalOpen} onClose={submittingAction ? undefined : () => setScanModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {scanAction === "CLOCK_IN" ? "Clock in with the pharmacy QR" : "Clock out with the pharmacy QR"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Point your camera at the QR code on the pharmacy's counter screen, or paste the code you scanned.
          </Typography>
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          <TextField
            label="QR code"
            placeholder="Paste the scanned code"
            value={qrInputToken}
            onChange={(e) => setQrInputToken(e.target.value)}
            fullWidth
            multiline
            rows={3}
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setScanModalOpen(false)} disabled={submittingAction}>Cancel</Button>
          <Button
            variant="contained"
            color={scanAction === "CLOCK_IN" ? "primary" : "error"}
            onClick={handleQrSubmit}
            disabled={submittingAction || !qrInputToken.trim()}
            startIcon={submittingAction ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {scanAction === "CLOCK_IN" ? "Clock in" : "Clock out"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Kiosk PIN Modal */}
      <Dialog open={pinModalOpen} onClose={submittingPin ? undefined : () => setPinModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change kiosk PIN</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose a 4–6 digit PIN for clocking in on this pharmacy's counter screen.
          </Typography>
          {pinUpdateError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {pinUpdateError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Pharmacy" value={pinPharmacyId} onChange={e => setPinPharmacyId(e.target.value)} disabled={submittingPin} fullWidth>
              {pinPharmacies.map(pharmacy => <MenuItem key={pharmacy.id} value={String(pharmacy.id)}>{pharmacy.name}</MenuItem>)}
            </TextField>
            <TextField
              label="New PIN (4–6 digits)"
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              fullWidth
              autoFocus
              inputProps={{ maxLength: 6, inputMode: "numeric" }}
            />
            <TextField
              label="Confirm new PIN"
              type="password"
              value={confirmNewPin}
              onChange={(e) => setConfirmNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              error={confirmNewPin.length > 0 && confirmNewPin !== newPin}
              helperText={confirmNewPin.length > 0 && confirmNewPin !== newPin ? "PINs don't match yet" : " "}
              fullWidth
              inputProps={{ maxLength: 6, inputMode: "numeric" }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPinModalOpen(false)} disabled={submittingPin}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUpdatePin}
            disabled={submittingPin || !pinPharmacyId || newPin.length < 4 || newPin !== confirmNewPin}
            startIcon={submittingPin ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Save PIN
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
