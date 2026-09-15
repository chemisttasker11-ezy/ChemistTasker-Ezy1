import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  Alert,
  Chip,
} from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import StorefrontIcon from "@mui/icons-material/Storefront";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import DialpadIcon from "@mui/icons-material/Dialpad";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SettingsIcon from "@mui/icons-material/Settings";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import BackspaceIcon from "@mui/icons-material/Backspace";
import apiClient from "../../utils/apiClient";

const KIOSK_TOKEN_KEY = "ctk_kiosk_device_token";
const KIOSK_PHARMACY_NAME_KEY = "ctk_kiosk_pharmacy_name";
const KIOSK_PHARMACY_ID_KEY = "ctk_kiosk_pharmacy_id";

export default function KioskPage() {
  // Device state
  const [deviceToken, setDeviceToken] = useState<string | null>(
    localStorage.getItem(KIOSK_TOKEN_KEY)
  );
  const [pharmacyName, setPharmacyName] = useState<string>(
    localStorage.getItem(KIOSK_PHARMACY_NAME_KEY) || "Pharmacy Counter"
  );
  const [pharmacyId, setPharmacyId] = useState<string>(
    localStorage.getItem(KIOSK_PHARMACY_ID_KEY) || ""
  );

  // Activation modal state
  const [activationPharmacyId, setActivationPharmacyId] = useState("");
  const [activationDeviceName, setActivationDeviceName] = useState("Front Counter Tablet");
  const [activationError, setActivationError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);

  // QR state
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(30);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string | null>(null);

  // PIN mode state
  const [pinMode, setPinMode] = useState<boolean>(false);
  const [identifier, setIdentifier] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [pinSubmitting, setPinSubmitting] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLocked, setPinLocked] = useState<boolean>(false);

  // Success Feedback state
  const [actionSuccess, setActionSuccess] = useState<{
    action: "CLOCKED_IN" | "CLOCKED_OUT";
    workerName: string;
    time: string;
    isProvisional: boolean;
  } | null>(null);

  // Clock state
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
      setCurrentDate(
        now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch rotating QR from server
  const fetchQR = useCallback(async () => {
    if (!deviceToken) return;
    try {
      setQrLoading(true);
      setQrError(null);
      const res = await apiClient.post(
        "/client-profile/attendance/kiosk/qr/",
        {},
        { headers: { "X-Device-Token": deviceToken } }
      );
      setQrToken(res.data.qr_token);
      setExpiresAt(res.data.expires_at);
      if (res.data.pharmacy_name) {
        setPharmacyName(res.data.pharmacy_name);
        localStorage.setItem(KIOSK_PHARMACY_NAME_KEY, res.data.pharmacy_name);
      }
      setCountdownSeconds(30);
    } catch (err: any) {
      const msg = err.response?.data?.error || "Device inactive or network error.";
      setQrError(msg);
      if (err.response?.status === 401) {
        // Device revoked
        setDeviceToken(null);
        localStorage.removeItem(KIOSK_TOKEN_KEY);
      }
    } finally {
      setQrLoading(false);
    }
  }, [deviceToken]);

  // Initial fetch and rotation loop
  useEffect(() => {
    if (!deviceToken) return;
    fetchQR();
  }, [deviceToken, fetchQR]);

  // Countdown timer for rotating QR
  useEffect(() => {
    if (!expiresAt || !deviceToken) return;
    const interval = setInterval(() => {
      const expiry = new Date(expiresAt).getTime();
      const diff = Math.max(0, Math.round((expiry - Date.now()) / 1000));
      setCountdownSeconds(diff);
      if (diff <= 3) {
        fetchQR();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, deviceToken, fetchQR]);

  // Auto-dismiss success toast after 6 seconds
  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess]);

  // Handle Kiosk Activation
  const handleActivate = async () => {
    if (!activationPharmacyId) {
      setActivationError("Please enter your Pharmacy ID.");
      return;
    }
    setIsActivating(true);
    setActivationError(null);
    try {
      const res = await apiClient.post("/client-profile/attendance/kiosk/activate/", {
        pharmacy_id: parseInt(activationPharmacyId),
        device_name: activationDeviceName,
      });
      const token = res.data.device_token;
      const name = res.data.pharmacy_name;
      setDeviceToken(token);
      setPharmacyName(name);
      setPharmacyId(activationPharmacyId);
      localStorage.setItem(KIOSK_TOKEN_KEY, token);
      localStorage.setItem(KIOSK_PHARMACY_NAME_KEY, name);
      localStorage.setItem(KIOSK_PHARMACY_ID_KEY, activationPharmacyId);
    } catch (err: any) {
      setActivationError(
        err.response?.data?.error || "Failed to activate kiosk. Ensure you are an authorized owner/manager."
      );
    } finally {
      setIsActivating(false);
    }
  };

  const handleDeactivate = () => {
    localStorage.removeItem(KIOSK_TOKEN_KEY);
    localStorage.removeItem(KIOSK_PHARMACY_NAME_KEY);
    localStorage.removeItem(KIOSK_PHARMACY_ID_KEY);
    setDeviceToken(null);
    setQrToken(null);
    setShowDeactivateDialog(false);
  };

  // PIN Pad helpers
  const handlePinDigit = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
    }
  };

  const handlePinBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handlePinClear = () => {
    setPin("");
    setPinError(null);
  };

  const handlePinSubmit = async () => {
    if (!identifier.trim()) {
      setPinError("Please enter your email or staff ID.");
      return;
    }
    if (pin.length < 4) {
      setPinError("Please enter your full 4-6 digit PIN.");
      return;
    }

    setPinSubmitting(true);
    setPinError(null);

    try {
      const res = await apiClient.post(
        "/client-profile/attendance/kiosk/pin-clock/",
        {
          identifier: identifier.trim(),
          pin: pin,
        },
        { headers: { "X-Device-Token": deviceToken } }
      );

      setActionSuccess({
        action: res.data.action,
        workerName: res.data.worker_name,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isProvisional: res.data.is_provisional,
      });

      // Clear input
      setPin("");
      setIdentifier("");
      setPinMode(false);
    } catch (err: any) {
      const isLock = err.response?.data?.locked || false;
      const msg = err.response?.data?.error || "Invalid PIN or staff member not found.";
      setPinError(msg);
      setPinLocked(isLock);
    } finally {
      setPinSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // View 1: Device Activation Form (if not yet activated)
  // ---------------------------------------------------------------------------
  if (!deviceToken) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#0f172a",
          p: 3,
        }}
      >
        <Card sx={{ maxWidth: 480, width: "100%", borderRadius: 3, boxShadow: 6, p: 2 }}>
          <CardContent>
            <Stack spacing={3} alignItems="center" textAlign="center">
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  bgcolor: "primary.light",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <StorefrontIcon color="primary" sx={{ fontSize: 36 }} />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={700}>
                  Activate Pharmacy Kiosk
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Set up this device as a dedicated attendance terminal.
                </Typography>
              </Box>

              {activationError && (
                <Alert severity="error" sx={{ width: "100%" }}>
                  {activationError}
                </Alert>
              )}

              <Stack spacing={2} sx={{ width: "100%" }}>
                <TextField
                  label="Pharmacy ID"
                  placeholder="e.g. 12"
                  value={activationPharmacyId}
                  onChange={(e) => setActivationPharmacyId(e.target.value)}
                  fullWidth
                  type="number"
                  required
                />
                <TextField
                  label="Device Identifier / Name"
                  placeholder="e.g. Front Counter iPad"
                  value={activationDeviceName}
                  onChange={(e) => setActivationDeviceName(e.target.value)}
                  fullWidth
                  required
                />
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleActivate}
                  disabled={isActivating}
                  sx={{ height: 48, fontWeight: 700 }}
                >
                  {isActivating ? <CircularProgress size={24} color="inherit" /> : "Activate Terminal"}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // View 2: Active Kiosk Terminal View
  // ---------------------------------------------------------------------------
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#0b1120",
        color: "white",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Kiosk Header */}
      <Box
        sx={{
          px: 4,
          py: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          bgcolor: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(12px)",
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <StorefrontIcon sx={{ color: "#38bdf8", fontSize: 32 }} />
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ color: "white" }}>
              {pharmacyName}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "#22c55e",
                  boxShadow: "0 0 8px #22c55e",
                }}
              />
              <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                Attendance Terminal Online
              </Typography>
            </Stack>
          </Box>
        </Stack>

        <Stack direction="row" spacing={3} alignItems="center">
          <Box textAlign="right">
            <Typography variant="h5" fontWeight={700} sx={{ color: "white", letterSpacing: 1 }}>
              {currentTime}
            </Typography>
            <Typography variant="caption" sx={{ color: "#94a3b8" }}>
              {currentDate}
            </Typography>
          </Box>
          <IconButton
            onClick={() => setShowDeactivateDialog(true)}
            sx={{ color: "#64748b", "&:hover": { color: "white" } }}
          >
            <SettingsIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Main Kiosk Content */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 4,
        }}
      >
        {/* Success Alert Banner */}
        {actionSuccess && (
          <Paper
            elevation={10}
            sx={{
              position: "fixed",
              top: 100,
              zIndex: 1000,
              bgcolor: actionSuccess.action === "CLOCKED_IN" ? "#064e3b" : "#1e293b",
              color: "white",
              p: 3,
              borderRadius: 3,
              border: "2px solid #10b981",
              maxWidth: 500,
              textAlign: "center",
            }}
          >
            <CheckCircleOutlineIcon sx={{ color: "#10b981", fontSize: 48, mb: 1 }} />
            <Typography variant="h5" fontWeight={700}>
              {actionSuccess.action === "CLOCKED_IN" ? "Clocked In Successfully!" : "Clocked Out Successfully!"}
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>
              Goodbye / Welcome, <strong>{actionSuccess.workerName}</strong>
            </Typography>
            <Typography variant="caption" sx={{ color: "#cbd5e1", display: "block", mt: 0.5 }}>
              Timestamp: {actionSuccess.time}
            </Typography>
            {actionSuccess.isProvisional && (
              <Chip
                label="Provisional Cover (Pending Manager Review)"
                color="warning"
                size="small"
                sx={{ mt: 1.5, fontWeight: 600 }}
              />
            )}
          </Paper>
        )}

        <Grid container spacing={4} sx={{ maxWidth: 1000, alignItems: "center" }}>
          {/* Left: Dynamic QR Terminal */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={8}
              sx={{
                p: 4,
                bgcolor: "#1e293b",
                borderRadius: 4,
                border: "1px solid rgba(255,255,255,0.1)",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <QrCode2Icon sx={{ color: "#38bdf8" }} />
                <Typography variant="h6" fontWeight={700} sx={{ color: "white" }}>
                  Scan to Clock In / Out
                </Typography>
              </Stack>

              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 3 }}>
                Open ChemistTasker mobile app and point your camera at this code.
              </Typography>

              {/* QR Code Container */}
              <Box
                sx={{
                  p: 3,
                  bgcolor: "white",
                  borderRadius: 3,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                  display: "inline-block",
                  position: "relative",
                }}
              >
                {qrToken ? (
                  <QRCodeSVG value={qrToken} size={240} level="H" />
                ) : (
                  <Box
                    sx={{
                      width: 240,
                      height: 240,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CircularProgress size={40} />
                  </Box>
                )}
              </Box>

              {/* Rotating timer bar */}
              <Box sx={{ width: "100%", maxWidth: 280, mt: 3 }}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                    Refreshing in
                  </Typography>
                  <Typography variant="caption" fontWeight={700} sx={{ color: "#38bdf8" }}>
                    {countdownSeconds}s
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={(countdownSeconds / 30) * 100}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: "rgba(255,255,255,0.1)",
                    "& .MuiLinearProgress-bar": { bgcolor: "#38bdf8" },
                  }}
                />
              </Box>

              {qrError && (
                <Alert severity="error" sx={{ mt: 2, width: "100%" }}>
                  {qrError}
                </Alert>
              )}
            </Paper>
          </Grid>

          {/* Right: Personal PIN Pad */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={8}
              sx={{
                p: 4,
                bgcolor: "#1e293b",
                borderRadius: 4,
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <DialpadIcon sx={{ color: "#a855f7" }} />
                <Typography variant="h6" fontWeight={700} sx={{ color: "white" }}>
                  Staff PIN Entry
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 2 }}>
                No phone with you? Enter your email or ID and your 4-6 digit personal code.
              </Typography>

              {pinError && (
                <Alert
                  severity="error"
                  icon={pinLocked ? <LockOutlinedIcon /> : <WarningAmberIcon />}
                  sx={{ mb: 2 }}
                >
                  {pinError}
                </Alert>
              )}

              <Stack spacing={2}>
                <TextField
                  placeholder="Staff Email or ID"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  fullWidth
                  size="small"
                  disabled={pinLocked || pinSubmitting}
                  sx={{
                    bgcolor: "rgba(255,255,255,0.05)",
                    input: { color: "white" },
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2)" },
                  }}
                />

                <TextField
                  placeholder="PIN"
                  value={pin ? "•".repeat(pin.length) : ""}
                  fullWidth
                  size="small"
                  disabled
                  inputProps={{ style: { textAlign: "center", letterSpacing: 8, fontSize: 24, color: "white" } }}
                  sx={{
                    bgcolor: "rgba(255,255,255,0.05)",
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2)" },
                  }}
                />

                {/* Touch Keypad */}
                <Grid container spacing={1} sx={{ mt: 1 }}>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                    <Grid size={{ xs: 4 }} key={digit}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => handlePinDigit(digit)}
                        disabled={pinLocked || pinSubmitting}
                        sx={{
                          height: 52,
                          fontSize: 20,
                          fontWeight: 700,
                          color: "white",
                          borderColor: "rgba(255,255,255,0.15)",
                          "&:hover": { bgcolor: "rgba(255,255,255,0.1)", borderColor: "white" },
                        }}
                      >
                        {digit}
                      </Button>
                    </Grid>
                  ))}
                  <Grid size={{ xs: 4 }}>
                    <Button
                      fullWidth
                      variant="outlined"
                      color="warning"
                      onClick={handlePinClear}
                      disabled={pinLocked || pinSubmitting}
                      sx={{ height: 52, fontWeight: 700 }}
                    >
                      Clear
                    </Button>
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => handlePinDigit("0")}
                      disabled={pinLocked || pinSubmitting}
                      sx={{
                        height: 52,
                        fontSize: 20,
                        fontWeight: 700,
                        color: "white",
                        borderColor: "rgba(255,255,255,0.15)",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
                      }}
                    >
                      0
                    </Button>
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={handlePinBackspace}
                      disabled={pinLocked || pinSubmitting}
                      sx={{ height: 52, color: "white", borderColor: "rgba(255,255,255,0.15)" }}
                    >
                      <BackspaceIcon fontSize="small" />
                    </Button>
                  </Grid>
                </Grid>

                <Button
                  variant="contained"
                  color="secondary"
                  size="large"
                  onClick={handlePinSubmit}
                  disabled={pinLocked || pinSubmitting || pin.length < 4 || !identifier.trim()}
                  sx={{
                    height: 48,
                    fontWeight: 700,
                    bgcolor: "#a855f7",
                    "&:hover": { bgcolor: "#9333ea" },
                  }}
                >
                  {pinSubmitting ? <CircularProgress size={24} color="inherit" /> : "Confirm Clock In / Out"}
                </Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* Deactivate Dialog */}
      <Dialog open={showDeactivateDialog} onClose={() => setShowDeactivateDialog(false)}>
        <DialogTitle>Kiosk Terminal Settings</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to disconnect this terminal from <strong>{pharmacyName}</strong>?
            You will need manager credentials to re-activate it.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeactivateDialog(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeactivate}>
            Disconnect Device
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
