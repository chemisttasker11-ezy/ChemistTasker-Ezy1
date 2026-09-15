import React, { useEffect, useState } from "react";
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
  Grid,
  LinearProgress,
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
import StorefrontIcon from "@mui/icons-material/Storefront";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import apiClient from "../../utils/apiClient";

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

  // Fetch current session status
  const fetchStatus = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await apiClient.get("/client-profile/attendance/worker/status/");
      setStatusInfo(res.data);
    } catch (err: any) {
      setErrorMsg("Failed to retrieve current attendance state.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
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
      await apiClient.post("/client-profile/attendance/worker/break-start/");
      setSuccessMsg("Break started.");
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || "Failed to start break.");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Break End
  const handleEndBreak = async () => {
    try {
      setSubmittingAction(true);
      setErrorMsg(null);
      await apiClient.post("/client-profile/attendance/worker/break-end/");
      setSuccessMsg("Break ended. Resumed shift.");
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || "Failed to end break.");
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
        const res = await apiClient.post("/client-profile/attendance/worker/clock-in/", {
          qr_token: qrInputToken.trim(),
        });
        setSuccessMsg(
          res.data.is_provisional
            ? `Clocked in provisionally at ${res.data.pharmacy_name}. Pending manager review.`
            : `Clocked in successfully at ${res.data.pharmacy_name}.`
        );
      } else {
        const res = await apiClient.post("/client-profile/attendance/worker/clock-out/", {
          qr_token: qrInputToken.trim(),
        });
        setSuccessMsg(`Clocked out successfully from ${res.data.pharmacy_name}.`);
      }
      setScanModalOpen(false);
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || "QR verification or clock transition failed.");
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
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, md: 4 } }}>
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
    </Box>
  );
}
