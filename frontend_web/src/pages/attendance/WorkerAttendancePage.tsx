import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import moment from "moment";
import { attendance, rosterV2 } from "@chemisttasker/shared-core";
import { BRAND_COLORS, BRAND_FONTS, BRAND_SHADOWS } from "../../constants/brandTheme";

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
    } catch (err: any) {
      setErrorMsg("Failed to retrieve current attendance state.");
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
    } catch (err: any) {
      console.error("Failed to load worker published roster", err);
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

  if (loading) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  const isClockedIn = statusInfo?.has_active_session;
  const isOnBreak = statusInfo?.is_on_break;

  return (
    <Box sx={{ maxWidth: 860, mx: "auto", p: { xs: 2, md: 4 } }}>
      {/* Page Title & Subtitle */}
      <Box sx={{ mb: 3 }}>
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
          My Attendance & Rosters
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND_COLORS.body, mt: 0.5, fontFamily: BRAND_FONTS.body }}>
          Clock in at your counter terminal, manage your personal PIN, and review your confirmed rostered shifts.
        </Typography>
      </Box>

      {/* Notifications */}
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}
      {successMsg && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {/* Main Shift Attendance Card */}
      <Card
        sx={{
          borderRadius: 3,
          boxShadow: 3,
          border: isClockedIn ? "2px solid #38bdf8" : "1px solid rgba(0,0,0,0.1)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            p: 3,
            bgcolor: isClockedIn ? (isOnBreak ? "#fef3c7" : "#f0fdf4") : "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <AccessTimeIcon
              sx={{
                fontSize: 32,
                color: isClockedIn ? (isOnBreak ? "#d97706" : "#16a34a") : "#64748b",
              }}
            />
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {isClockedIn ? (isOnBreak ? "On Break" : "Currently Clocked In") : "Not Clocked In"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isClockedIn
                  ? `Shift at ${statusInfo?.pharmacy_name || "Pharmacy"}`
                  : "No active shift open"}
              </Typography>
            </Box>
          </Stack>

          <Chip
            label={isClockedIn ? (isOnBreak ? "ON BREAK" : "ACTIVE") : "OFF SHIFT"}
            color={isClockedIn ? (isOnBreak ? "warning" : "success") : "default"}
            sx={{ fontWeight: 700 }}
          />
        </Box>

        <CardContent sx={{ p: 4 }}>
          {isClockedIn ? (
            <Stack spacing={4} alignItems="center" textAlign="center">
              {/* Provisional Warning Notice */}
              {statusInfo?.is_provisional && (
                <Alert
                  severity="warning"
                  icon={<WarningAmberIcon />}
                  sx={{ width: "100%", textAlign: "left", borderRadius: 2 }}
                >
                  <strong>Provisional Attendance</strong>: This is an unscheduled or cross-site cover shift.
                  Your worked hours are tracked and submitted to the pharmacy manager for review.
                </Alert>
              )}

              {/* Stopwatch Display */}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase" }}>
                  Active Shift Duration
                </Typography>
                <Typography
                  variant="h2"
                  fontWeight={800}
                  sx={{
                    fontFamily: "monospace",
                    color: isOnBreak ? "#d97706" : "#0f172a",
                    letterSpacing: 2,
                    my: 1,
                  }}
                >
                  {elapsedDuration}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Started at:{" "}
                  {new Date(statusInfo?.started_at!).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Typography>
              </Box>

              <Divider sx={{ width: "100%" }} />

              {/* Action Buttons: Breaks and Clock Out */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ width: "100%", maxWidth: 450 }}>
                {isOnBreak ? (
                  <Button
                    fullWidth
                    variant="contained"
                    color="warning"
                    size="large"
                    startIcon={<PlayArrowIcon />}
                    onClick={handleEndBreak}
                    disabled={submittingAction}
                    sx={{ height: 50, fontWeight: 700 }}
                  >
                    End Break
                  </Button>
                ) : (
                  <Button
                    fullWidth
                    variant="outlined"
                    color="warning"
                    size="large"
                    startIcon={<PauseIcon />}
                    onClick={handleStartBreak}
                    disabled={submittingAction}
                    sx={{ height: 50, fontWeight: 700 }}
                  >
                    Start Break
                  </Button>
                )}

                <Button
                  fullWidth
                  variant="contained"
                  color="error"
                  size="large"
                  startIcon={<StopIcon />}
                  onClick={() => openQrModal("CLOCK_OUT")}
                  disabled={submittingAction}
                  sx={{ height: 50, fontWeight: 700 }}
                >
                  Clock Out
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={3} alignItems="center" textAlign="center" sx={{ py: 3 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  bgcolor: "#f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <QrCodeScannerIcon sx={{ fontSize: 44, color: "#64748b" }} />
              </Box>

              <Box>
                <Typography variant="h5" fontWeight={700}>
                  Ready to Start Your Shift?
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, mx: "auto", mt: 1 }}>
                  Scan the rotating QR code displayed on the pharmacy counter terminal to clock in.
                </Typography>
              </Box>

              <Button
                variant="contained"
                size="large"
                startIcon={<QrCodeScannerIcon />}
                onClick={() => openQrModal("CLOCK_IN")}
                sx={{ height: 52, px: 5, fontSize: 16, fontWeight: 700, borderRadius: 2 }}
              >
                Scan Pharmacy QR
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Counter Kiosk PIN Management Card */}
      <Card sx={{ mt: 3, borderRadius: 3, boxShadow: 2, border: "1px solid rgba(0,0,0,0.08)" }}>
        <CardContent sx={{ p: 3, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                bgcolor: "rgba(168, 85, 247, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <VpnKeyIcon sx={{ color: "#a855f7" }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Counter Kiosk Attendance PIN
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your 4–6 digit personal PIN used to clock in or out directly on pharmacy counter terminals.
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<VpnKeyIcon />}
            onClick={() => {
              setNewPin("");
              setConfirmNewPin("");
              setPinUpdateError(null);
              setPinModalOpen(true);
            }}
            sx={{ fontWeight: 600, textTransform: "none", borderRadius: 2 }}
          >
            Change Kiosk PIN
          </Button>
        </CardContent>
      </Card>

      {/* Published Shifts & Acknowledgement Section */}
      <Card
        sx={{
          mt: 3,
          borderRadius: 3,
          boxShadow: BRAND_SHADOWS.card,
          border: `1px solid ${BRAND_COLORS.border}`,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            p: 2.5,
            px: 3,
            bgcolor: BRAND_COLORS.mist,
            borderBottom: `1px solid ${BRAND_COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1.5,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CalendarMonthIcon sx={{ color: BRAND_COLORS.purple }} />
            <Box>
              <Typography
                variant="h6"
                sx={{
                  fontFamily: BRAND_FONTS.heading,
                  fontWeight: 700,
                  color: BRAND_COLORS.navy,
                  fontSize: 18,
                }}
              >
                My Published Shifts & Acknowledgements
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND_COLORS.body }}>
                Officially published roster assignments. Acknowledge your shifts to confirm your attendance.
              </Typography>
            </Box>
          </Stack>
          <Chip
            size="small"
            label={`${rosterShifts.length} Rostered ${rosterShifts.length === 1 ? "Shift" : "Shifts"}`}
            sx={{
              fontWeight: 600,
              bgcolor: BRAND_COLORS.purpleLight,
              color: BRAND_COLORS.purple,
            }}
          />
        </Box>

        <CardContent sx={{ p: 3 }}>
          {loadingShifts ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} sx={{ color: BRAND_COLORS.purple }} />
            </Box>
          ) : rosterShifts.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <EventAvailableIcon sx={{ fontSize: 44, color: BRAND_COLORS.border, mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} sx={{ color: BRAND_COLORS.navy }}>
                No Published Shifts Yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mx: "auto", mt: 0.5 }}>
                Your confirmed shifts will appear here as soon as your pharmacy manager publishes the roster for the upcoming week.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {rosterShifts.map((shift) => {
                const shiftDateStr = moment(shift.slot_date).format("ddd, D MMM YYYY");
                const timeBand = `${shift.start_time.slice(0, 5)} – ${shift.end_time.slice(0, 5)}`;
                const isAck = shift.is_acknowledged;

                return (
                  <Paper
                    key={shift.assignment_id}
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      borderColor: BRAND_COLORS.border,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 2,
                      transition: "border-color 0.2s, box-shadow 0.2s",
                      "&:hover": {
                        borderColor: BRAND_COLORS.blue,
                        boxShadow: "0 4px 12px rgba(6, 33, 74, 0.06)",
                      },
                    }}
                  >
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box
                        sx={{
                          px: 1.5,
                          py: 0.8,
                          borderRadius: 2,
                          bgcolor: BRAND_COLORS.mist,
                          border: `1px solid ${BRAND_COLORS.border}`,
                          textAlign: "center",
                          minWidth: 90,
                        }}
                      >
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          sx={{ color: BRAND_COLORS.navy, display: "block" }}
                        >
                          {moment(shift.slot_date).format("ddd").toUpperCase()}
                        </Typography>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          sx={{ color: BRAND_COLORS.purple, fontSize: 13 }}
                        >
                          {moment(shift.slot_date).format("D MMM")}
                        </Typography>
                      </Box>

                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="subtitle2" fontWeight={700} sx={{ color: BRAND_COLORS.navy }}>
                            {shift.pharmacy_name}
                          </Typography>
                          <Chip
                            label={shift.role}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 11,
                              fontWeight: 700,
                              bgcolor: BRAND_COLORS.blueLight,
                              color: BRAND_COLORS.blue,
                            }}
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {shiftDateStr} • <strong>{timeBand}</strong>
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1.5} alignItems="center">
                      {isAck ? (
                        <Chip
                          icon={<CheckCircleOutlineIcon fontSize="small" />}
                          label="ACKNOWLEDGED"
                          size="small"
                          color="success"
                          sx={{ fontWeight: 700, px: 1 }}
                        />
                      ) : (
                        <>
                          <Chip
                            label="PENDING"
                            size="small"
                            sx={{
                              fontWeight: 700,
                              bgcolor: "#fef3c7",
                              color: "#d97706",
                              height: 24,
                            }}
                          />
                          {shift.period_id && (
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<HowToRegIcon />}
                              onClick={() => handleAcknowledgePeriod(shift.period_id!)}
                              disabled={acknowledgingPeriodId === shift.period_id}
                              sx={{
                                bgcolor: BRAND_COLORS.purple,
                                "&:hover": { bgcolor: BRAND_COLORS.purpleHover },
                                fontWeight: 700,
                                textTransform: "none",
                                borderRadius: 1.5,
                                fontSize: 13,
                              }}
                            >
                              {acknowledgingPeriodId === shift.period_id ? (
                                <CircularProgress size={16} color="inherit" />
                              ) : (
                                "Acknowledge Shifts"
                              )}
                            </Button>
                          )}
                        </>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* QR Code Input / Scanner Modal */}
      <Dialog open={scanModalOpen} onClose={() => setScanModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {scanAction === "CLOCK_IN" ? "Clock In via Pharmacy QR" : "Clock Out via Pharmacy QR"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Point your mobile camera at the rotating QR code on the pharmacy terminal or paste the scanned token.
          </Typography>

          <TextField
            label="QR Code Token"
            placeholder="Paste or enter scanned QR token..."
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
          <Button onClick={() => setScanModalOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={scanAction === "CLOCK_IN" ? "primary" : "error"}
            onClick={handleQrSubmit}
            disabled={submittingAction || !qrInputToken.trim()}
          >
            {submittingAction ? (
              <CircularProgress size={24} color="inherit" />
            ) : scanAction === "CLOCK_IN" ? (
              "Confirm Clock In"
            ) : (
              "Confirm Clock Out"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Kiosk PIN Modal */}
      <Dialog open={pinModalOpen} onClose={() => setPinModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
          <VpnKeyIcon sx={{ color: "#a855f7" }} />
          Change Counter Kiosk PIN
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Set a new 4 to 6-digit numeric PIN for clocking in on physical counter terminals.
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
              label="New PIN (4-6 digits)"
              type="password"
              placeholder="e.g. 5678"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              fullWidth
              autoFocus
              inputProps={{ maxLength: 6 }}
            />
            <TextField
              label="Confirm New PIN"
              type="password"
              placeholder="Re-enter PIN"
              value={confirmNewPin}
              onChange={(e) => setConfirmNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              fullWidth
              inputProps={{ maxLength: 6 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPinModalOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleUpdatePin}
            disabled={submittingPin || !pinPharmacyId || newPin.length < 4 || newPin !== confirmNewPin}
            sx={{ bgcolor: "#a855f7", "&:hover": { bgcolor: "#9333ea" }, fontWeight: 700 }}
          >
            {submittingPin ? <CircularProgress size={24} color="inherit" /> : "Save PIN"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
