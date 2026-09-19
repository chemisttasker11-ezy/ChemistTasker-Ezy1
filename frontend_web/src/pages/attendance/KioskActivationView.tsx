import type { Dispatch, SetStateAction } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SmartphoneIcon from "@mui/icons-material/Smartphone";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";

type PairingMode = "CODE" | "LEGACY";

type Props = {
  pairingMode: PairingMode;
  setPairingMode: Dispatch<SetStateAction<PairingMode>>;
  activationError: string | null;
  setActivationError: Dispatch<SetStateAction<string | null>>;
  requestNotificationSuccess: string | null;
  pairingCode: string;
  setPairingCode: Dispatch<SetStateAction<string>>;
  activationDeviceName: string;
  setActivationDeviceName: Dispatch<SetStateAction<string>>;
  desktopRuntime: boolean;
  dashboardPin: string;
  setDashboardPin: Dispatch<SetStateAction<string>>;
  dashboardPinConfirm: string;
  setDashboardPinConfirm: Dispatch<SetStateAction<string>>;
  isActivating: boolean;
  handlePairWithCode: () => void | Promise<void>;
  showRequestCodeBox: boolean;
  setShowRequestCodeBox: Dispatch<SetStateAction<boolean>>;
  activationPharmacyId: string;
  setActivationPharmacyId: Dispatch<SetStateAction<string>>;
  isRequestingCode: boolean;
  handleRequestPairingNotification: () => void | Promise<void>;
  handleActivate: () => void | Promise<void>;
};

export default function KioskActivationView({
  pairingMode,
  setPairingMode,
  activationError,
  setActivationError,
  requestNotificationSuccess,
  pairingCode,
  setPairingCode,
  activationDeviceName,
  setActivationDeviceName,
  desktopRuntime,
  dashboardPin,
  setDashboardPin,
  dashboardPinConfirm,
  setDashboardPinConfirm,
  isActivating,
  handlePairWithCode,
  showRequestCodeBox,
  setShowRequestCodeBox,
  activationPharmacyId,
  setActivationPharmacyId,
  isRequestingCode,
  handleRequestPairingNotification,
  handleActivate,
}: Props) {
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
      <Card sx={{ maxWidth: 520, width: "100%", borderRadius: 4, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", bgcolor: "#1e293b", border: "1px solid rgba(255,255,255,0.08)", p: 2 }}>
        <CardContent>
          <Stack spacing={3} alignItems="center" textAlign="center">
            <Box
              sx={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                bgcolor: "rgba(56, 189, 248, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(56, 189, 248, 0.3)",
              }}
            >
              {pairingMode === "CODE" ? (
                <SmartphoneIcon sx={{ fontSize: 36, color: "#38bdf8" }} />
              ) : (
                <StorefrontIcon sx={{ fontSize: 36, color: "#38bdf8" }} />
              )}
            </Box>

            <Box>
              <Typography variant="h5" fontWeight={700} sx={{ color: "white" }}>
                {pairingMode === "CODE" ? "Pair Kiosk Terminal" : "Activate with Pharmacy ID"}
              </Typography>
              <Typography variant="body2" sx={{ color: "#94a3b8", mt: 0.5 }}>
                {pairingMode === "CODE"
                  ? "Enter the 6-digit pairing code sent to your pharmacy owner's mobile app."
                  : "Authorize this device directly using owner credentials and Pharmacy ID."}
              </Typography>
            </Box>

            {activationError && (
              <Alert severity="error" sx={{ width: "100%", borderRadius: 2 }}>
                {activationError}
              </Alert>
            )}

            {requestNotificationSuccess && (
              <Alert severity="success" sx={{ width: "100%", borderRadius: 2 }}>
                {requestNotificationSuccess}
              </Alert>
            )}

            {pairingMode === "CODE" ? (
              <Stack spacing={2.5} sx={{ width: "100%" }}>
                <TextField
                  label="6-Digit Pairing Code"
                  placeholder="e.g. 849201"
                  value={pairingCode}
                  onChange={(event) => {
                    const val = event.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                    setPairingCode(val);
                  }}
                  fullWidth
                  autoFocus
                  inputProps={{
                    style: {
                      textAlign: "center",
                      fontSize: 28,
                      fontWeight: 700,
                      letterSpacing: 10,
                      color: "#38bdf8",
                    },
                    maxLength: 6,
                  }}
                  sx={{
                    bgcolor: "rgba(255,255,255,0.05)",
                    borderRadius: 2,
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(56, 189, 248, 0.4)" },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#38bdf8" },
                  }}
                />

                <TextField
                  label="Terminal Device Label"
                  placeholder="e.g. Front Counter Tablet"
                  value={activationDeviceName}
                  onChange={(event) => setActivationDeviceName(event.target.value)}
                  fullWidth
                  size="small"
                  sx={{
                    bgcolor: "rgba(255,255,255,0.03)",
                    borderRadius: 2,
                    input: { color: "white" },
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.15)" },
                  }}
                />

                {desktopRuntime && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField
                      label="Dashboard Access PIN"
                      type="password"
                      value={dashboardPin}
                      onChange={(event) => setDashboardPin(event.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
                      inputProps={{ inputMode: "numeric" }}
                      fullWidth
                    />
                    <TextField
                      label="Confirm Dashboard PIN"
                      type="password"
                      value={dashboardPinConfirm}
                      onChange={(event) => setDashboardPinConfirm(event.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
                      inputProps={{ inputMode: "numeric" }}
                      fullWidth
                    />
                  </Stack>
                )}

                <Button
                  variant="contained"
                  size="large"
                  onClick={handlePairWithCode}
                  disabled={isActivating || pairingCode.length < 6 || (desktopRuntime && (dashboardPin.length < 6 || dashboardPin !== dashboardPinConfirm))}
                  sx={{
                    height: 50,
                    fontWeight: 700,
                    fontSize: 16,
                    borderRadius: 2,
                    bgcolor: "#0284c7",
                    "&:hover": { bgcolor: "#0369a1" },
                  }}
                >
                  {isActivating ? <CircularProgress size={24} color="inherit" /> : "Pair & Launch Kiosk"}
                </Button>

                <Paper
                  sx={{
                    p: 2,
                    bgcolor: "rgba(15, 23, 42, 0.6)",
                    border: "1px dashed rgba(255, 255, 255, 0.15)",
                    borderRadius: 2,
                    textAlign: "left",
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <NotificationsActiveIcon sx={{ color: "#38bdf8", fontSize: 20, mt: 0.3 }} />
                    <Box>
                      <Typography variant="caption" fontWeight={700} sx={{ color: "white", display: "block" }}>
                        How to receive the pairing code:
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.3 }}>
                        1. Open the <strong>ChemistTasker Mobile App</strong> on the owner's phone.
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#94a3b8", display: "block" }}>
                        2. Tap <strong>Kiosk Terminals</strong> → <strong>Pair New Terminal</strong>.
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#94a3b8", display: "block" }}>
                        3. A push notification with your 6-digit code will appear immediately.
                      </Typography>
                    </Box>
                  </Stack>

                  {!desktopRuntime && (!showRequestCodeBox ? (
                    <Button
                      size="small"
                      onClick={() => setShowRequestCodeBox(true)}
                      sx={{ mt: 1.5, textTransform: "none", fontSize: 12, color: "#38bdf8" }}
                    >
                      Request code from this computer instead →
                    </Button>
                  ) : (
                    <Stack spacing={1.5} sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <TextField
                        label="Pharmacy ID"
                        placeholder="e.g. 14 or 27"
                        value={activationPharmacyId}
                        onChange={(event) => setActivationPharmacyId(event.target.value)}
                        size="small"
                        fullWidth
                        type="number"
                        sx={{
                          bgcolor: "rgba(255,255,255,0.05)",
                          borderRadius: 1,
                          input: { color: "white" },
                        }}
                      />
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={handleRequestPairingNotification}
                        disabled={isRequestingCode || !activationPharmacyId}
                        sx={{
                          color: "#38bdf8",
                          borderColor: "#38bdf8",
                          "&:hover": { borderColor: "#7dd3fc", bgcolor: "rgba(56, 189, 248, 0.08)" },
                        }}
                      >
                        {isRequestingCode ? <CircularProgress size={16} color="inherit" /> : "Send Code Notification to Owner Phone"}
                      </Button>
                    </Stack>
                  ))}
                </Paper>

                {!desktopRuntime && (
                  <Button
                    size="small"
                    onClick={() => {
                      setPairingMode("LEGACY");
                      setActivationError(null);
                    }}
                    sx={{ color: "#64748b", textTransform: "none", fontSize: 13 }}
                  >
                    Advanced: Set up with Pharmacy ID & Login
                  </Button>
                )}
              </Stack>
            ) : (
              <Stack spacing={2} sx={{ width: "100%" }}>
                <TextField
                  label="Pharmacy ID"
                  placeholder="e.g. 12"
                  value={activationPharmacyId}
                  onChange={(event) => setActivationPharmacyId(event.target.value)}
                  fullWidth
                  type="number"
                  required
                  sx={{
                    bgcolor: "rgba(255,255,255,0.05)",
                    borderRadius: 2,
                    input: { color: "white" },
                  }}
                />
                <TextField
                  label="Device Identifier / Name"
                  placeholder="e.g. Front Counter iPad"
                  value={activationDeviceName}
                  onChange={(event) => setActivationDeviceName(event.target.value)}
                  fullWidth
                  required
                  sx={{
                    bgcolor: "rgba(255,255,255,0.05)",
                    borderRadius: 2,
                    input: { color: "white" },
                  }}
                />
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleActivate}
                  disabled={isActivating}
                  sx={{ height: 48, fontWeight: 700, borderRadius: 2 }}
                >
                  {isActivating ? <CircularProgress size={24} color="inherit" /> : "Activate Terminal"}
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setPairingMode("CODE");
                    setActivationError(null);
                  }}
                  sx={{ color: "#38bdf8", textTransform: "none" }}
                >
                  ← Switch back to 6-Digit Mobile Pairing Code
                </Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
