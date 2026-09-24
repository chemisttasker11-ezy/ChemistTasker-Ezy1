import { useEffect, useState, useRef, useCallback } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import BackspaceIcon from "@mui/icons-material/Backspace";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import EmailIcon from "@mui/icons-material/Email";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import CoffeeIcon from "@mui/icons-material/Coffee";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import KioskSetup from "../../kiosk/KioskSetup";
import { API_BASE_URL } from "../../constants/api";
import { clearTokens } from "../../utils/tokenService";
import {
  getDesktopKioskStatus,
  getDesktopOnlineQr,
  getDesktopPendingCount,
  verifyDesktopDashboardPin,
  disconnectDesktopKiosk,
  syncDesktopNow,
  isDesktopKiosk,
  pairDesktopKiosk,
  captureDesktopPinAttendance,
  prepareDesktopCaptureRequest,
  confirmDesktopCaptureReceipt,
} from "../../kiosk/desktopBridge";
import {
  kioskClient,
  KIOSK_TOKEN_KEY,
  KIOSK_PHARMACY_NAME_KEY,
  KIOSK_PHARMACY_ID_KEY,
} from "./KioskPage.runtime";
import KioskActivationView from "./KioskActivationView";
import KioskBreakDialog from "./KioskBreakDialog";

export default function KioskPage() {
  const desktopRuntime = isDesktopKiosk();
  // Device state
  const [deviceToken, setDeviceToken] = useState<string | null>(
    localStorage.getItem(KIOSK_TOKEN_KEY)
  );
  const [pharmacyName, setPharmacyName] = useState<string>(
    localStorage.getItem(KIOSK_PHARMACY_NAME_KEY) || "Pharmacy Counter"
  );

  // Activation modal state
  const [activationPharmacyId, setActivationPharmacyId] = useState("");
  const [activationDeviceName, setActivationDeviceName] = useState("Front Counter Tablet");
  const [dashboardPin, setDashboardPin] = useState("");
  const [dashboardPinConfirm, setDashboardPinConfirm] = useState("");
  const [activationError, setActivationError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showSettingsUnlock, setShowSettingsUnlock] = useState(false);
  const [settingsPin, setSettingsPin] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [pendingDisconnectCount, setPendingDisconnectCount] = useState(0);

  // 6-digit Mobile Pairing Code state
  const [pairingCode, setPairingCode] = useState("");
  const [pairingMode, setPairingMode] = useState<"CODE" | "LEGACY">("CODE");
  const [requestNotificationSuccess, setRequestNotificationSuccess] = useState<string | null>(null);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [showRequestCodeBox, setShowRequestCodeBox] = useState(false);

  // QR state
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(30);
  const [, setQrLoading] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string | null>(null);

  // PIN mode state
  const [, setPinMode] = useState<boolean>(false);
  const [identifier, setIdentifier] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [pinSubmitting, setPinSubmitting] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLocked, setPinLocked] = useState<boolean>(false);
  const [requestedPinAction, setRequestedPinAction] = useState<
    "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END"
  >("CLOCK_IN");

  // First-time PIN setup state
  const [setupStep, setSetupStep] = useState<"IDLE" | "SETUP_REQUIRED">("IDLE");
  const [setupWorkerName, setSetupWorkerName] = useState<string>("");
  const [setupMaskedEmail, setSetupMaskedEmail] = useState<string>("");
  const [setupOtp, setSetupOtp] = useState<string>("");
  const [setupNewPin, setSetupNewPin] = useState<string>("");
  const [setupConfirmPin, setSetupConfirmPin] = useState<string>("");
  const [activeSetupField, setActiveSetupField] = useState<"OTP" | "PIN" | "CONFIRM">("OTP");
  const [setupLoading, setSetupLoading] = useState<boolean>(false);

  // Break Station State
  const [breakDialogOpen, setBreakDialogOpen] = useState<boolean>(false);
  const [breakActionType, setBreakActionType] = useState<"LUNCH_30" | "TEA_10" | "END">("LUNCH_30");
  const [activeStaffList, setActiveStaffList] = useState<Array<{
    worker_id: number;
    worker_name: string;
    email: string;
    role: string;
    session_id: number;
    started_at: string;
    is_on_break: boolean;
    break_started_at: string | null;
    break_elapsed_seconds: number;
    has_pin: boolean;
  }>>([]);
  const [loadingActiveStaff, setLoadingActiveStaff] = useState<boolean>(false);
  const [selectedStaffForBreak, setSelectedStaffForBreak] = useState<{
    worker_id: number;
    worker_name: string;
    is_on_break: boolean;
    has_pin: boolean;
  } | null>(null);
  const [breakConfirmPin, setBreakConfirmPin] = useState<string>("");
  const [breakSubmitting, setBreakSubmitting] = useState<boolean>(false);
  const [breakError, setBreakError] = useState<string | null>(null);

  // Success Feedback state
  const [actionSuccess, setActionSuccess] = useState<{
    action: "CLOCKED_IN" | "CLOCKED_OUT" | "BREAK_START" | "BREAK_END";
    workerName: string;
    time: string;
    isProvisional?: boolean;
    customMessage?: string;
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

  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!desktopRuntime) return;
    void getDesktopKioskStatus()
      .then((status) => {
        if (!status.paired) return;
        setDeviceToken("tauri-secure-device");
        setPharmacyName(status.pharmacy_name || "Pharmacy Counter");
      })
      .catch((error) => setActivationError(String(error)));
  }, [desktopRuntime]);

  // Fetch rotating QR from server (30s TTL)
  const fetchQR = useCallback(async () => {
    if (!deviceToken || isFetchingRef.current) return;
    try {
      isFetchingRef.current = true;
      setQrLoading(true);
      setQrError(null);

      const data = desktopRuntime
        ? await getDesktopOnlineQr()
        : (await kioskClient.post(
            "/client-profile/attendance/kiosk/qr/",
            {},
            { headers: { "X-Device-Token": deviceToken } }
          )).data;

      setQrToken(data.qr_token);
      setExpiresAt(data.expires_at);
      if (data.pharmacy_name) {
        setPharmacyName(data.pharmacy_name);
        if (!desktopRuntime) {
          localStorage.setItem(KIOSK_PHARMACY_NAME_KEY, data.pharmacy_name);
        }
      }
      const expiry = new Date(data.expires_at).getTime();
      const refreshWindow = Math.max(1, Number(data.refresh_interval_seconds) || 30);
      const remaining = Math.max(0, Math.min(refreshWindow, Math.round((expiry - Date.now()) / 1000)));
      setCountdownSeconds(remaining || refreshWindow);
    } catch (err: any) {
      setQrToken(null);
      setExpiresAt(null);
      setCountdownSeconds(0);
      const rawDesktopError = desktopRuntime ? String(err) : "";
      const revoked = rawDesktopError.includes("KIOSK_REVOKED");
      const msg = desktopRuntime
        ? rawDesktopError.replace(/^KIOSK_REVOKED:\s*/, "")
        : err.response?.data?.error || "Device inactive or network error.";
      setQrError(
        desktopRuntime
          ? revoked
            ? `${msg} Manager re-pairing is required before this terminal can record attendance.`
            : `${msg} Use your attendance PIN while QR is unavailable.`
          : msg
      );
      if (!desktopRuntime && err.response?.status === 401) {
        // Browser kiosk device revoked.
        setDeviceToken(null);
        localStorage.removeItem(KIOSK_TOKEN_KEY);
      }
    } finally {
      setQrLoading(false);
      isFetchingRef.current = false;
    }
  }, [desktopRuntime, deviceToken]);

  // Initial fetch and rotation loop
  useEffect(() => {
    if (!deviceToken) return;
    fetchQR();
  }, [deviceToken, fetchQR]);

  // Countdown timer for rotating QR (every 30 seconds)
  useEffect(() => {
    if (!expiresAt || !deviceToken) return;
    const interval = setInterval(() => {
      const expiry = new Date(expiresAt).getTime();
      const diff = Math.max(0, Math.round((expiry - Date.now()) / 1000));
      setCountdownSeconds(diff);
      if (diff <= 1) {
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
      const res = await kioskClient.post("/client-profile/attendance/kiosk/activate/", {
        pharmacy_id: parseInt(activationPharmacyId),
        device_name: activationDeviceName,
      });
      const token = res.data.device_token;
      const name = res.data.pharmacy_name;
      setDeviceToken(token);
      setPharmacyName(name);
      localStorage.setItem(KIOSK_TOKEN_KEY, token);
      localStorage.setItem(KIOSK_PHARMACY_NAME_KEY, name);
      localStorage.setItem(KIOSK_PHARMACY_ID_KEY, activationPharmacyId);

      // Security rule: Clear activating manager's browser credentials immediately
      clearTokens();
      try {
        await kioskClient.post("/users/logout/", {});
      } catch {
        // Ignore logout errors if session was already stateless
      }
    } catch (err: any) {
      setActivationError(
        err.response?.data?.error || "Failed to activate kiosk. Ensure you are an authorized owner/manager."
      );
    } finally {
      setIsActivating(false);
    }
  };

  // Handle 6-Digit Mobile Pairing Code Redemption
  const handlePairWithCode = async () => {
    const cleanedCode = pairingCode.replace(/[\s-]/g, "");
    if (!cleanedCode || cleanedCode.length !== 6) {
      setActivationError("Please enter your 6-digit pairing code.");
      return;
    }
    setIsActivating(true);
    setActivationError(null);
    try {
      if (desktopRuntime) {
        if (dashboardPin.length < 6 || dashboardPin !== dashboardPinConfirm) {
          setActivationError("Create and confirm a matching 6-digit Dashboard Access PIN.");
          return;
        }
        const status = await pairDesktopKiosk({
          pairingCode: cleanedCode,
          deviceName: activationDeviceName,
          apiBaseUrl: API_BASE_URL,
          appVersion: "0.1.0",
          dashboardPin,
        });
        setDeviceToken("tauri-secure-device");
        setPharmacyName(status.pharmacy_name || "Pharmacy Counter");
        return;
      }
      const res = await kioskClient.post("/client-profile/attendance/kiosk/pairing/pair/", {
        pairing_code: cleanedCode,
        device_name: activationDeviceName,
      });
      const token = res.data.device_token;
      const name = res.data.pharmacy_name;
      const pid = String(res.data.pharmacy_id);
      setDeviceToken(token);
      setPharmacyName(name);
      localStorage.setItem(KIOSK_TOKEN_KEY, token);
      localStorage.setItem(KIOSK_PHARMACY_NAME_KEY, name);
      localStorage.setItem(KIOSK_PHARMACY_ID_KEY, pid);
    } catch (err: any) {
      setActivationError(
        err.response?.data?.error || "Invalid or expired pairing code. Please request a new code from the mobile app."
      );
    } finally {
      setIsActivating(false);
    }
  };

  // Dispatch Pairing Code to Mobile App via Push Notification
  const handleRequestPairingNotification = async () => {
    if (!activationPharmacyId) {
      setActivationError("Please enter your Pharmacy ID to dispatch the code to the owner's mobile app.");
      return;
    }
    setIsRequestingCode(true);
    setActivationError(null);
    setRequestNotificationSuccess(null);
    try {
      const res = await kioskClient.post("/client-profile/attendance/kiosk/pairing/request/", {
        pharmacy_id: parseInt(activationPharmacyId),
        device_name: activationDeviceName,
      });
      setRequestNotificationSuccess(
        res.data.message || "Pairing code notification sent to owner's mobile device!"
      );
      if (res.data.pairing_code) {
        setPairingCode(res.data.pairing_code);
      }
    } catch (err: any) {
      setActivationError(
        err.response?.data?.error || "Could not request code. Ensure you are an authorized owner/manager."
      );
    } finally {
      setIsRequestingCode(false);
    }
  };

  const clearBrowserKiosk = () => {
    localStorage.removeItem(KIOSK_TOKEN_KEY);
    localStorage.removeItem(KIOSK_PHARMACY_NAME_KEY);
    localStorage.removeItem(KIOSK_PHARMACY_ID_KEY);
    setDeviceToken(null);
    setQrToken(null);
    setExpiresAt(null);
    setShowDeactivateDialog(false);
  };

  const openKioskSettings = async () => {
    setSettingsError(null);
    setSettingsMessage(null);
    if (!desktopRuntime) {
      setShowDeactivateDialog(true);
      return;
    }
    setSettingsPin("");
    setShowSettingsUnlock(true);
  };

  const unlockKioskSettings = async () => {
    if (!/^\d{6}$/.test(settingsPin)) {
      setSettingsError("Enter the six-digit dashboard PIN.");
      return;
    }
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const valid = await verifyDesktopDashboardPin(settingsPin);
      if (!valid) {
        setSettingsError("Dashboard PIN is incorrect.");
        return;
      }
      setPendingDisconnectCount(await getDesktopPendingCount());
      setShowSettingsUnlock(false);
      setShowDeactivateDialog(true);
    } catch (error) {
      setSettingsError(String(error));
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleSyncNow = async () => {
    if (!desktopRuntime) return;
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsMessage(null);
    try {
      await syncDesktopNow();
      const remaining = await getDesktopPendingCount();
      setPendingDisconnectCount(remaining);
      setSettingsMessage(
        remaining === 0
          ? "Sync complete. Attendance on this kiosk is up to date with ChemistTasker."
          : `Sync finished with ${remaining} event${remaining === 1 ? "" : "s"} still waiting to upload.`
      );
    } catch (error) {
      setSettingsError(String(error));
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleDeactivate = async () => {
    if (!desktopRuntime) {
      clearBrowserKiosk();
      return;
    }
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const status = await disconnectDesktopKiosk(settingsPin);
      setDeviceToken(null);
      setQrToken(null);
      setExpiresAt(null);
      setPharmacyName(status.pharmacy_name || "Pharmacy Counter");
      setShowDeactivateDialog(false);
      setSettingsPin("");
      setPendingDisconnectCount(0);
    } catch (error) {
      setSettingsError(String(error));
    } finally {
      setSettingsBusy(false);
    }
  };

  // PIN Pad helpers
  const handlePinDigit = (digit: string) => {
    if (setupStep === "SETUP_REQUIRED") {
      if (activeSetupField === "OTP" && setupOtp.length < 6) {
        setSetupOtp((prev) => prev + digit);
      } else if (activeSetupField === "PIN" && setupNewPin.length < 6) {
        setSetupNewPin((prev) => prev + digit);
      } else if (activeSetupField === "CONFIRM" && setupConfirmPin.length < 6) {
        setSetupConfirmPin((prev) => prev + digit);
      }
    } else {
      if (pin.length < 6) {
        setPin((prev) => prev + digit);
      }
    }
  };

  const handlePinBackspace = () => {
    if (setupStep === "SETUP_REQUIRED") {
      if (activeSetupField === "OTP") {
        setSetupOtp((prev) => prev.slice(0, -1));
      } else if (activeSetupField === "PIN") {
        setSetupNewPin((prev) => prev.slice(0, -1));
      } else if (activeSetupField === "CONFIRM") {
        setSetupConfirmPin((prev) => prev.slice(0, -1));
      }
    } else {
      setPin((prev) => prev.slice(0, -1));
    }
  };

  const handlePinClear = () => {
    if (setupStep === "SETUP_REQUIRED") {
      if (activeSetupField === "OTP") setSetupOtp("");
      else if (activeSetupField === "PIN") setSetupNewPin("");
      else if (activeSetupField === "CONFIRM") setSetupConfirmPin("");
    } else {
      setPin("");
    }
    setPinError(null);
  };

  const [codeAlreadySent, setCodeAlreadySent] = useState<boolean>(false);

  // Check if worker needs PIN setup or dispatch OTP to email
  const handleCheckOrTriggerSetup = async (forceReset: boolean = false, forceResend: boolean = false) => {
    if (!identifier.trim()) {
      setPinError("Please enter your staff email or numeric ID.");
      return;
    }

    if (desktopRuntime) {
      setPinError("Set up or reset your attendance PIN in the ChemistTasker mobile app, then return to this kiosk.");
      return;
    }

    setSetupLoading(true);
    setPinError(null);
    try {
      const res = await kioskClient.post(
        "/client-profile/attendance/kiosk/worker-pin/status/",
        {
          identifier: identifier.trim(),
          reset: forceReset,
          resend: forceResend,
        },
        { headers: { "X-Device-Token": deviceToken } }
      );

      if (res.data.status === "NEEDS_SETUP") {
        setSetupStep("SETUP_REQUIRED");
        setSetupWorkerName(res.data.worker_name || "Staff Member");
        setSetupMaskedEmail(res.data.masked_email || "your registered email");
        setCodeAlreadySent(Boolean(res.data.code_already_sent));
        if (forceResend) {
          setSetupOtp("");
        }
        setActiveSetupField("OTP");
      } else {
        // Worker already has a PIN
        setPinError("You already have an active PIN. Enter it on the keypad or type with your keyboard, or tap 'Reset PIN' to receive a code via email.");
      }
    } catch (err: any) {
      setPinError(err.response?.data?.error || "Staff member not found. Please verify your email or ID with management.");
    } finally {
      setSetupLoading(false);
    }
  };

  // Submit OTP + New PIN to set PIN and immediately clock in
  const handleCompletePinSetup = async () => {
    if (desktopRuntime) {
      setPinError("PIN setup is unavailable inside the desktop kiosk. Use the ChemistTasker mobile app.");
      return;
    }
    if (!setupOtp.trim() || setupOtp.trim().length !== 6) {
      setPinError("Please enter the 6-digit verification code sent to your email.");
      return;
    }
    if (setupNewPin.length < 4 || setupNewPin.length > 6) {
      setPinError("PIN must be between 4 and 6 numeric digits.");
      return;
    }
    if (setupNewPin !== setupConfirmPin) {
      setPinError("PINs do not match. Please re-enter.");
      return;
    }

    setSetupLoading(true);
    setPinError(null);
    try {
      const res = await kioskClient.post(
        "/client-profile/attendance/kiosk/worker-pin/setup/",
        {
          identifier: identifier.trim(),
          verification_code: setupOtp.trim(),
          new_pin: setupNewPin.trim(),
        },
        { headers: { "X-Device-Token": deviceToken } }
      );

      setActionSuccess({
        action: "CLOCKED_IN",
        workerName: res.data.worker_name || setupWorkerName,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isProvisional: res.data.is_provisional || false,
      });

      // Reset setup state
      setSetupStep("IDLE");
      setSetupOtp("");
      setSetupNewPin("");
      setSetupConfirmPin("");
      setIdentifier("");
      setPin("");
    } catch (err: any) {
      setPinError(err.response?.data?.error || "Failed to setup PIN. Please check your verification code.");
    } finally {
      setSetupLoading(false);
    }
  };

  const handleCancelSetup = () => {
    setSetupStep("IDLE");
    setSetupOtp("");
    setSetupNewPin("");
    setSetupConfirmPin("");
    setPinError(null);
  };

  const handlePinSubmit = async () => {
    if (!identifier.trim()) {
      setPinError("Please enter your email or staff ID.");
      return;
    }
    if (!pin) {
      // If user typed identifier and pressed Enter without PIN, check if they need setup
      await handleCheckOrTriggerSetup();
      return;
    }
    if (pin.length < 4) {
      setPinError("Please enter your full 4-6 digit PIN.");
      return;
    }

    setPinSubmitting(true);
    setPinError(null);

    try {
      if (desktopRuntime) {
        const requestId = await prepareDesktopCaptureRequest(
          identifier.trim(),
          requestedPinAction,
        );
        const local = await captureDesktopPinAttendance(
          identifier.trim(),
          pin,
          requestedPinAction,
          requestId,
        );
        setActionSuccess({
          action: local.action,
          workerName: local.worker_name,
          time: new Date(local.event.captured_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          customMessage: local.recovered
            ? "Recovered the original local attendance record."
            : "Recorded locally and queued for secure synchronization.",
        });
        // Confirmation is delivery bookkeeping. Attendance is already committed
        // and must not be shown as failed if this response is interrupted.
        void confirmDesktopCaptureReceipt(requestId, local.event.event_id).catch(() => undefined);
        setPin("");
        setIdentifier("");
        setPinMode(false);
        return;
      }

      const res = await kioskClient.post(
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
      const msg = desktopRuntime
        ? String(err)
        : err.response?.data?.error || "Invalid PIN or staff member not found.";
      setPinError(msg);
      setPinLocked(isLock);
    } finally {
      setPinSubmitting(false);
    }
  };

  // Fetch active clocked in staff for this kiosk
  const fetchActiveStaff = useCallback(async () => {
    if (!deviceToken) return;
    setLoadingActiveStaff(true);
    setBreakError(null);
    try {
      const res = await kioskClient.post(
        "/client-profile/attendance/kiosk/active-staff/",
        {},
        { headers: { "X-Device-Token": deviceToken } }
      );
      setActiveStaffList(res.data.staff || []);
    } catch (err: any) {
      setBreakError(err.response?.data?.error || "Failed to load active staff.");
    } finally {
      setLoadingActiveStaff(false);
    }
  }, [deviceToken]);

  // Open break modal with selected break type
  const handleOpenBreakDialog = (type: "LUNCH_30" | "TEA_10" | "END") => {
    setBreakActionType(type);
    setSelectedStaffForBreak(null);
    setBreakConfirmPin("");
    setBreakError(null);
    setBreakDialogOpen(true);
    fetchActiveStaff();
  };

  // Staff selected from list
  const handleSelectStaffForBreak = (staff: {
    worker_id: number;
    worker_name: string;
    is_on_break: boolean;
    has_pin: boolean;
  }) => {
    setSelectedStaffForBreak(staff);
    setBreakConfirmPin("");
    setBreakError(null);
  };

  // Submit break action (START or END)
  const handleConfirmBreakAction = async () => {
    if (!selectedStaffForBreak) return;
    if (selectedStaffForBreak.has_pin && !breakConfirmPin) {
      setBreakError("Please enter your PIN to confirm.");
      return;
    }

    setBreakSubmitting(true);
    setBreakError(null);
    try {
      const action = breakActionType === "END" ? "END" : "START";
      const res = await kioskClient.post(
        "/client-profile/attendance/kiosk/break/",
        {
          worker_id: selectedStaffForBreak.worker_id,
          action: action,
          break_type: breakActionType,
          pin: breakConfirmPin,
        },
        { headers: { "X-Device-Token": deviceToken } }
      );

      setActionSuccess({
        action: action === "START" ? "BREAK_START" : "BREAK_END",
        workerName: res.data.worker_name,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        customMessage: res.data.message,
      });

      setSelectedStaffForBreak(null);
      setBreakConfirmPin("");
      setBreakDialogOpen(false);
      fetchActiveStaff();
    } catch (err: any) {
      setBreakError(err.response?.data?.error || "Failed to record break action.");
    } finally {
      setBreakSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // View 1: Device Activation Form (Pairing via Mobile Code or Direct)
  // ---------------------------------------------------------------------------
  if (!deviceToken && desktopRuntime) {
    return <KioskSetup initialError={activationError} onPaired={status => {
      setDeviceToken('tauri-secure-device');
      setPharmacyName(status.pharmacy_name || 'Pharmacy Counter');
    }} />;
  }

  if (!deviceToken) {
    return (
      <KioskActivationView
        pairingMode={pairingMode}
        setPairingMode={setPairingMode}
        activationError={activationError}
        setActivationError={setActivationError}
        requestNotificationSuccess={requestNotificationSuccess}
        pairingCode={pairingCode}
        setPairingCode={setPairingCode}
        activationDeviceName={activationDeviceName}
        setActivationDeviceName={setActivationDeviceName}
        desktopRuntime={desktopRuntime}
        dashboardPin={dashboardPin}
        setDashboardPin={setDashboardPin}
        dashboardPinConfirm={dashboardPinConfirm}
        setDashboardPinConfirm={setDashboardPinConfirm}
        isActivating={isActivating}
        handlePairWithCode={handlePairWithCode}
        showRequestCodeBox={showRequestCodeBox}
        setShowRequestCodeBox={setShowRequestCodeBox}
        activationPharmacyId={activationPharmacyId}
        setActivationPharmacyId={setActivationPharmacyId}
        isRequestingCode={isRequestingCode}
        handleRequestPairingNotification={handleRequestPairingNotification}
        handleActivate={handleActivate}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // View 2: Active Kiosk Terminal View
  // ---------------------------------------------------------------------------
  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 50% -15%, #132b57 0%, #06214A 45%, #020d20 100%)",
        color: "white",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflowX: "hidden",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Subtle decorative background ambient glow */}
      <Box
        sx={{
          position: "absolute",
          top: "-15%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "700px",
          height: "450px",
          background: "radial-gradient(circle, rgba(0, 189, 210, 0.09) 0%, rgba(82, 34, 184, 0.05) 50%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Kiosk Header */}
      <Box
        sx={{
          px: { xs: 2.5, md: 4 },
          py: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          bgcolor: "rgba(6, 33, 74, 0.85)",
          backdropFilter: "blur(20px)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 46,
              height: 46,
              borderRadius: "14px",
              bgcolor: "rgba(0, 189, 210, 0.12)",
              border: "1px solid rgba(0, 189, 210, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 16px rgba(0, 189, 210, 0.2)",
            }}
          >
            <StorefrontIcon sx={{ color: "#00bdd2", fontSize: 26 }} />
          </Box>
          <Box>
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{
                color: "white",
                fontFamily: "'Outfit', sans-serif",
                fontSize: { xs: "1.1rem", sm: "1.25rem" },
                letterSpacing: "-0.01em",
              }}
            >
              {pharmacyName}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "#00bdd2",
                  boxShadow: "0 0 10px #00bdd2",
                  animation: "pulse 2s infinite ease-in-out",
                  "@keyframes pulse": {
                    "0%, 100%": { opacity: 1, transform: "scale(1)" },
                    "50%": { opacity: 0.5, transform: "scale(0.85)" },
                  },
                }}
              />
              <Typography variant="caption" sx={{ color: "#cbd5e1", fontWeight: 500, letterSpacing: "0.02em" }}>
                Attendance Terminal Online
              </Typography>
            </Stack>
          </Box>
        </Stack>

        <Stack direction="row" spacing={3} alignItems="center">
          <Box textAlign="right">
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{
                color: "white",
                fontFamily: "'Outfit', sans-serif",
                fontSize: { xs: "1.3rem", sm: "1.65rem" },
                letterSpacing: "0.03em",
              }}
            >
              {currentTime}
            </Typography>
            <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 500 }}>
              {currentDate}
            </Typography>
          </Box>
          <IconButton
            onClick={() => void openKioskSettings()}
            sx={{
              color: "#94a3b8",
              bgcolor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              p: 1.2,
              "&:hover": { color: "white", bgcolor: "rgba(255, 255, 255, 0.12)" },
            }}
          >
            <SettingsIcon fontSize="small" />
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
          p: { xs: 2, md: 4 },
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Success Alert Banner */}
        {actionSuccess && (
          <Paper
            elevation={12}
            sx={{
              position: "fixed",
              top: 100,
              zIndex: 1000,
              bgcolor:
                actionSuccess.action === "BREAK_START"
                  ? "#78350f"
                  : actionSuccess.action === "CLOCKED_IN" || actionSuccess.action === "BREAK_END"
                  ? "#064e3b"
                  : "#1e293b",
              color: "white",
              p: 3.5,
              borderRadius: 4,
              border: "2px solid #10b981",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
              maxWidth: 500,
              textAlign: "center",
              animation: "fadeIn 0.3s ease-out",
              "@keyframes fadeIn": {
                from: { opacity: 0, transform: "scale(0.95)" },
                to: { opacity: 1, transform: "scale(1)" },
              },
            }}
          >
            <CheckCircleOutlineIcon sx={{ color: "#10b981", fontSize: 48, mb: 1 }} />
            <Typography variant="h5" fontWeight={700} sx={{ fontFamily: "'Outfit', sans-serif" }}>
              {actionSuccess.customMessage
                ? actionSuccess.customMessage
                : actionSuccess.action === "CLOCKED_IN"
                ? "Clocked In Successfully!"
                : "Clocked Out Successfully!"}
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>
              Staff: <strong>{actionSuccess.workerName}</strong>
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

        <Grid container spacing={3} sx={{ maxWidth: 1040, alignItems: "center" }}>
          {/* Quick Staff Break Bar */}
          {!desktopRuntime && (
          <Grid size={{ xs: 12 }}>
            <Paper
              elevation={4}
              sx={{
                p: 2.5,
                px: { xs: 2.5, md: 3.5 },
                bgcolor: "rgba(10, 26, 56, 0.75)",
                backdropFilter: "blur(20px)",
                borderRadius: 4,
                border: "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: "0 12px 32px rgba(2, 8, 20, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 2,
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: "12px",
                    bgcolor: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AccessTimeIcon sx={{ color: "#f59e0b", fontSize: 24 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: "white", fontFamily: "'Outfit', sans-serif" }}>
                    Staff Break Station
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#cbd5e1", fontSize: 13 }}>
                    Tap an option below to record or end your scheduled break
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1.5} flexWrap="wrap">
                <Button
                  variant="contained"
                  startIcon={<RestaurantIcon />}
                  onClick={() => handleOpenBreakDialog("LUNCH_30")}
                  sx={{
                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    color: "#0f172a",
                    fontWeight: 700,
                    textTransform: "none",
                    borderRadius: "12px",
                    px: 2.5,
                    height: 46,
                    fontSize: 14,
                    boxShadow: "0 4px 14px rgba(245, 158, 11, 0.35)",
                    "&:hover": { background: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)" },
                  }}
                >
                  Lunch Break (30 mins)
                </Button>

                <Button
                  variant="contained"
                  startIcon={<CoffeeIcon />}
                  onClick={() => handleOpenBreakDialog("TEA_10")}
                  sx={{
                    background: "linear-gradient(135deg, #00bdd2 0%, #0891b2 100%)",
                    color: "#041c26",
                    fontWeight: 700,
                    textTransform: "none",
                    borderRadius: "12px",
                    px: 2.5,
                    height: 46,
                    fontSize: 14,
                    boxShadow: "0 4px 14px rgba(0, 189, 210, 0.35)",
                    "&:hover": { background: "linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)" },
                  }}
                >
                  Tea Break (10 mins)
                </Button>

                <Button
                  variant="contained"
                  startIcon={<PlayCircleOutlineIcon />}
                  onClick={() => handleOpenBreakDialog("END")}
                  sx={{
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: "white",
                    fontWeight: 700,
                    textTransform: "none",
                    borderRadius: "12px",
                    px: 2.5,
                    height: 46,
                    fontSize: 14,
                    boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                    "&:hover": { background: "linear-gradient(135deg, #34d399 0%, #059669 100%)" },
                  }}
                >
                  End Break
                </Button>
              </Stack>
            </Paper>
          </Grid>
          )}

          {/* Online QR and offline-capable PIN share the same kiosk. QR is server-issued for both web and native. */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              elevation={8}
              sx={{
                p: { xs: 3, md: 4 },
                bgcolor: "rgba(10, 26, 56, 0.75)",
                backdropFilter: "blur(20px)",
                borderRadius: 4,
                border: "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: "0 20px 48px rgba(2, 8, 20, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minHeight: 560,
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ width: "100%" }}>
                <Stack direction="row" spacing={1.2} alignItems="center" justifyContent="center" sx={{ mb: 1 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "10px",
                      bgcolor: "rgba(0, 189, 210, 0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <QrCode2Icon sx={{ color: "#00bdd2", fontSize: 22 }} />
                  </Box>
                  <Typography variant="h6" fontWeight={700} sx={{ color: "white", fontFamily: "'Outfit', sans-serif" }}>
                    Scan to Clock In / Out
                  </Typography>
                </Stack>

                <Typography variant="body2" sx={{ color: "#cbd5e1", mb: 3, fontSize: 14 }}>
                  Open ChemistTasker mobile app and point your camera at this code.
                </Typography>

                {/* QR Code Container */}
                <Box
                  sx={{
                    p: 2.8,
                    bgcolor: "white",
                    borderRadius: 3.5,
                    boxShadow: "0 16px 36px rgba(0,0,0,0.5)",
                    border: "3px solid rgba(0, 189, 210, 0.25)",
                    display: "inline-block",
                    position: "relative",
                  }}
                >
                  {qrToken ? (
                    <QRCodeSVG value={qrToken} size={230} level="H" />
                  ) : (
                    <Box
                      sx={{
                        width: 230,
                        height: 230,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <CircularProgress size={40} sx={{ color: "#00bdd2" }} />
                    </Box>
                  )}
                </Box>

                {/* Rotating timer bar */}
                <Box sx={{ width: "100%", maxWidth: 280, mx: "auto", mt: 3 }}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.8 }}>
                    <Typography variant="caption" sx={{ color: "#cbd5e1", fontWeight: 500 }}>
                      Code refreshes in
                    </Typography>
                    <Typography variant="caption" fontWeight={700} sx={{ color: "#00bdd2", fontSize: 13 }}>
                      {countdownSeconds}s
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={(countdownSeconds / 30) * 100}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: "rgba(255,255,255,0.12)",
                      "& .MuiLinearProgress-bar": {
                        background: "linear-gradient(90deg, #00bdd2 0%, #38bdf8 100%)",
                        borderRadius: 3,
                      },
                    }}
                  />
                </Box>
              </Box>

              {qrError && (
                <Alert severity={desktopRuntime ? "warning" : "error"} sx={{ mt: 2, width: "100%", borderRadius: 2 }}>
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
                p: { xs: 3, md: 4 },
                bgcolor: "rgba(10, 26, 56, 0.75)",
                backdropFilter: "blur(20px)",
                borderRadius: 4,
                border: "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: "0 20px 48px rgba(2, 8, 20, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
                minHeight: 560,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              {setupStep === "SETUP_REQUIRED" ? (
                /* First-time PIN setup mode */
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <VpnKeyIcon sx={{ color: "#38bdf8" }} />
                    <Typography variant="h6" fontWeight={700} sx={{ color: "white" }}>
                      Set Your Counter PIN
                    </Typography>
                  </Stack>

                  <Alert
                    severity="info"
                    icon={<EmailIcon sx={{ color: "#38bdf8", fontSize: 22 }} />}
                    sx={{
                      bgcolor: "rgba(14, 165, 233, 0.15)",
                      color: "#ffffff",
                      border: "1.5px solid rgba(56, 189, 248, 0.45)",
                      borderRadius: 2.5,
                      fontSize: 13.5,
                      py: 1,
                      "& .MuiAlert-message": { width: "100%" },
                    }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                      <Box>
                        Welcome, <strong>{setupWorkerName}</strong>!<br />
                        {codeAlreadySent ? (
                          <span style={{ color: "#e0f2fe" }}>
                            A verification code was sent to <strong>{setupMaskedEmail}</strong> in the last 10 minutes.
                          </span>
                        ) : (
                          <span style={{ color: "#e0f2fe" }}>
                            We sent a 6-digit verification code to <strong>{setupMaskedEmail}</strong>.
                          </span>
                        )}
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleCheckOrTriggerSetup(false, true)}
                        disabled={setupLoading}
                        sx={{
                          color: "#38bdf8",
                          borderColor: "#38bdf8",
                          fontSize: 12,
                          fontWeight: 700,
                          textTransform: "none",
                          py: 0.4,
                          px: 1.2,
                          bgcolor: "rgba(56, 189, 248, 0.1)",
                          "&:hover": { bgcolor: "rgba(56, 189, 248, 0.25)", borderColor: "#7dd3fc" },
                        }}
                      >
                        {setupLoading ? <CircularProgress size={14} sx={{ color: "#38bdf8" }} /> : "Resend Code"}
                      </Button>
                    </Box>
                  </Alert>

                  {pinError && (
                    <Alert
                      severity="error"
                      icon={<WarningAmberIcon />}
                      sx={{
                        borderRadius: 2,
                        bgcolor: "rgba(239, 68, 68, 0.2)",
                        color: "#fee2e2",
                        border: "1px solid rgba(239, 68, 68, 0.5)",
                      }}
                    >
                      {pinError}
                    </Alert>
                  )}

                  <TextField
                    label="6-Digit Verification Code"
                    placeholder="Enter 6-digit code from email"
                    value={setupOtp}
                    onClick={() => setActiveSetupField("OTP")}
                    onFocus={() => setActiveSetupField("OTP")}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                      setSetupOtp(val);
                      if (val.length === 6) setActiveSetupField("PIN");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                        e.preventDefault();
                        setActiveSetupField("PIN");
                      }
                    }}
                    fullWidth
                    size="small"
                    focused={activeSetupField === "OTP"}
                    InputLabelProps={{
                      shrink: true,
                      sx: {
                        color: activeSetupField === "OTP" ? "#38bdf8 !important" : "#e2e8f0 !important",
                        fontWeight: 700,
                        fontSize: 14,
                      },
                    }}
                    inputProps={{
                      style: {
                        textAlign: "center",
                        letterSpacing: 8,
                        fontSize: 24,
                        fontWeight: 800,
                        color: "#38bdf8",
                        padding: "10px 14px",
                      },
                      maxLength: 6,
                      inputMode: "numeric",
                    }}
                    sx={{
                      bgcolor: activeSetupField === "OTP" ? "rgba(56, 189, 248, 0.18)" : "rgba(255,255,255,0.08)",
                      borderRadius: 2,
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: activeSetupField === "OTP" ? "#38bdf8" : "rgba(255,255,255,0.35)",
                        borderWidth: activeSetupField === "OTP" ? "2px" : "1.5px",
                      },
                      "&:hover .MuiOutlinedInput-notchedOutline": {
                        borderColor: "#38bdf8",
                      },
                      "& input::placeholder": {
                        color: "#94a3b8 !important",
                        opacity: "1 !important",
                        WebkitTextFillColor: "#94a3b8 !important",
                        letterSpacing: 2,
                        fontSize: 14,
                        fontWeight: 600,
                      },
                    }}
                  />

                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        label="New PIN (4-6 digits)"
                        placeholder="Type PIN"
                        type="password"
                        value={setupNewPin}
                        onClick={() => setActiveSetupField("PIN")}
                        onFocus={() => setActiveSetupField("PIN")}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                          setSetupNewPin(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                            e.preventDefault();
                            setActiveSetupField("CONFIRM");
                          }
                        }}
                        fullWidth
                        size="small"
                        focused={activeSetupField === "PIN"}
                        InputLabelProps={{
                          shrink: true,
                          sx: {
                            color: activeSetupField === "PIN" ? "#c084fc !important" : "#e2e8f0 !important",
                            fontWeight: 700,
                            fontSize: 13.5,
                          },
                        }}
                        inputProps={{
                          style: {
                            textAlign: "center",
                            letterSpacing: 8,
                            fontSize: 22,
                            fontWeight: 800,
                            color: "#ffffff",
                            padding: "10px 12px",
                          },
                          maxLength: 6,
                          inputMode: "numeric",
                        }}
                        sx={{
                          bgcolor: activeSetupField === "PIN" ? "rgba(192, 132, 252, 0.20)" : "rgba(255,255,255,0.08)",
                          borderRadius: 2,
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: activeSetupField === "PIN" ? "#c084fc" : "rgba(255,255,255,0.35)",
                            borderWidth: activeSetupField === "PIN" ? "2px" : "1.5px",
                          },
                          "&:hover .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#c084fc",
                          },
                          "& input::placeholder": {
                            color: "#cbd5e1 !important",
                            opacity: "1 !important",
                            WebkitTextFillColor: "#cbd5e1 !important",
                            letterSpacing: 2,
                            fontSize: 14,
                            fontWeight: 600,
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        label="Confirm PIN"
                        placeholder="Re-enter PIN"
                        type="password"
                        value={setupConfirmPin}
                        onClick={() => setActiveSetupField("CONFIRM")}
                        onFocus={() => setActiveSetupField("CONFIRM")}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                          setSetupConfirmPin(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCompletePinSetup();
                          }
                        }}
                        fullWidth
                        size="small"
                        focused={activeSetupField === "CONFIRM"}
                        InputLabelProps={{
                          shrink: true,
                          sx: {
                            color: activeSetupField === "CONFIRM" ? "#c084fc !important" : "#e2e8f0 !important",
                            fontWeight: 700,
                            fontSize: 13.5,
                          },
                        }}
                        inputProps={{
                          style: {
                            textAlign: "center",
                            letterSpacing: 8,
                            fontSize: 22,
                            fontWeight: 800,
                            color: "#ffffff",
                            padding: "10px 12px",
                          },
                          maxLength: 6,
                          inputMode: "numeric",
                        }}
                        sx={{
                          bgcolor: activeSetupField === "CONFIRM" ? "rgba(192, 132, 252, 0.20)" : "rgba(255,255,255,0.08)",
                          borderRadius: 2,
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: activeSetupField === "CONFIRM" ? "#c084fc" : "rgba(255,255,255,0.35)",
                            borderWidth: activeSetupField === "CONFIRM" ? "2px" : "1.5px",
                          },
                          "&:hover .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#c084fc",
                          },
                          "& input::placeholder": {
                            color: "#cbd5e1 !important",
                            opacity: "1 !important",
                            WebkitTextFillColor: "#cbd5e1 !important",
                            letterSpacing: 2,
                            fontSize: 14,
                            fontWeight: 600,
                          },
                        }}
                      />
                    </Grid>
                  </Grid>

                  <Typography variant="caption" sx={{ color: "#cbd5e1", textAlign: "center", fontSize: 12.5, fontWeight: 500 }}>
                    Active Field:{" "}
                    <strong style={{ color: activeSetupField === "OTP" ? "#38bdf8" : "#c084fc", fontWeight: 700 }}>
                      {activeSetupField === "OTP"
                        ? "Verification Code"
                        : activeSetupField === "PIN"
                        ? "New PIN"
                        : "Confirm PIN"}
                    </strong>{" "}
                    (type with keyboard or tap pad below)
                  </Typography>

                  {/* High-Contrast Tactile Keypad */}
                  <Grid container spacing={1.2} sx={{ mt: 0.5 }}>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <Grid size={{ xs: 4 }} key={digit}>
                        <Button
                          fullWidth
                          variant="outlined"
                          onClick={() => handlePinDigit(digit)}
                          disabled={setupLoading}
                          sx={{
                            height: 50,
                            fontSize: 20,
                            fontWeight: 800,
                            color: "#ffffff",
                            bgcolor: "rgba(255, 255, 255, 0.10)",
                            borderColor: "rgba(255, 255, 255, 0.30)",
                            borderRadius: 2,
                            fontFamily: "'Outfit', sans-serif",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                            "&:hover": {
                              bgcolor: "rgba(56, 189, 248, 0.30)",
                              borderColor: "#38bdf8",
                              color: "#ffffff",
                            },
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
                        onClick={handlePinClear}
                        disabled={setupLoading}
                        sx={{
                          height: 50,
                          fontWeight: 800,
                          fontSize: 14,
                          color: "#fef08a",
                          borderColor: "#f59e0b",
                          bgcolor: "rgba(245, 158, 11, 0.22)",
                          borderRadius: 2,
                          fontFamily: "'Outfit', sans-serif",
                          "&:hover": {
                            bgcolor: "rgba(245, 158, 11, 0.35)",
                            borderColor: "#fbbf24",
                            color: "#ffffff",
                          },
                        }}
                      >
                        CLEAR
                      </Button>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => handlePinDigit("0")}
                        disabled={setupLoading}
                        sx={{
                          height: 50,
                          fontSize: 20,
                          fontWeight: 800,
                          color: "#ffffff",
                          bgcolor: "rgba(255, 255, 255, 0.10)",
                          borderColor: "rgba(255, 255, 255, 0.30)",
                          borderRadius: 2,
                          fontFamily: "'Outfit', sans-serif",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                          "&:hover": {
                            bgcolor: "rgba(56, 189, 248, 0.30)",
                            borderColor: "#38bdf8",
                            color: "#ffffff",
                          },
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
                        disabled={setupLoading}
                        sx={{
                          height: 50,
                          color: "#fca5a5",
                          borderColor: "rgba(239, 68, 68, 0.55)",
                          bgcolor: "rgba(239, 68, 68, 0.20)",
                          borderRadius: 2,
                          "&:hover": {
                            bgcolor: "rgba(239, 68, 68, 0.35)",
                            borderColor: "#f87171",
                            color: "#ffffff",
                          },
                        }}
                      >
                        <BackspaceIcon fontSize="small" />
                      </Button>
                    </Grid>
                  </Grid>

                  <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={handleCancelSetup}
                      disabled={setupLoading}
                      startIcon={<ArrowBackIcon />}
                      sx={{
                        color: "#e2e8f0",
                        borderColor: "rgba(255,255,255,0.3)",
                        bgcolor: "rgba(255,255,255,0.06)",
                        textTransform: "none",
                        fontWeight: 600,
                        "&:hover": { bgcolor: "rgba(255,255,255,0.15)", borderColor: "#ffffff" },
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={handleCompletePinSetup}
                      disabled={
                        setupLoading ||
                        setupOtp.length !== 6 ||
                        setupNewPin.length < 4 ||
                        setupNewPin !== setupConfirmPin
                      }
                      sx={{
                        height: 50,
                        fontWeight: 800,
                        bgcolor: "#10b981",
                        "&:hover": { bgcolor: "#059669" },
                        textTransform: "none",
                        fontSize: 15,
                        boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
                      }}
                    >
                      {setupLoading ? <CircularProgress size={24} color="inherit" /> : "Save PIN & Clock In"}
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                /* Standard PIN entry mode */
                <Stack spacing={2} sx={{ width: "100%" }}>
                  <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 0.5 }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: "10px",
                        bgcolor: "rgba(82, 34, 184, 0.15)",
                        border: "1px solid rgba(82, 34, 184, 0.35)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <DialpadIcon sx={{ color: "#a855f7", fontSize: 22 }} />
                    </Box>
                    <Typography variant="h6" fontWeight={700} sx={{ color: "white", fontFamily: "'Outfit', sans-serif" }}>
                      Staff PIN Entry
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ color: "#cbd5e1", mb: 0.5, fontSize: 14 }}>
                    No phone with you? Enter your email or ID and your 4-6 digit personal code.
                  </Typography>

                  {pinError && (
                    <Alert
                      severity="error"
                      icon={pinLocked ? <LockOutlinedIcon /> : <WarningAmberIcon />}
                      sx={{ mb: 1, borderRadius: 2 }}
                    >
                      {pinError}
                    </Alert>
                  )}

                  <TextField
                    placeholder="Staff Email or ID"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    fullWidth
                    size="small"
                    disabled={pinLocked || pinSubmitting}
                    sx={{
                      bgcolor: "rgba(255,255,255,0.06)",
                      borderRadius: "12px",
                      "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.22)" },
                      "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.4)" },
                      "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#00bdd2" },
                      input: {
                        color: "#ffffff",
                        fontSize: 15,
                        fontWeight: 500,
                        py: 1.4,
                        "&::placeholder": {
                          color: "#cbd5e1",
                          opacity: 0.85,
                        },
                      },
                    }}
                  />

                  {desktopRuntime && (
                    <Grid container spacing={1.2}>
                      <Grid size={{ xs: 6 }}>
                      <Button
                        fullWidth
                        variant={requestedPinAction === "CLOCK_IN" ? "contained" : "outlined"}
                        onClick={() => setRequestedPinAction("CLOCK_IN")}
                        disabled={pinSubmitting}
                        color="success"
                      >
                        Clock In
                      </Button>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                      <Button
                        fullWidth
                        variant={requestedPinAction === "CLOCK_OUT" ? "contained" : "outlined"}
                        onClick={() => setRequestedPinAction("CLOCK_OUT")}
                        disabled={pinSubmitting}
                        color="warning"
                      >
                        Clock Out
                      </Button>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Button
                          fullWidth
                          variant={requestedPinAction === "BREAK_START" ? "contained" : "outlined"}
                          onClick={() => setRequestedPinAction("BREAK_START")}
                          disabled={pinSubmitting}
                        >
                          Start Break
                        </Button>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Button
                          fullWidth
                          variant={requestedPinAction === "BREAK_END" ? "contained" : "outlined"}
                          onClick={() => setRequestedPinAction("BREAK_END")}
                          disabled={pinSubmitting}
                        >
                          End Break
                        </Button>
                      </Grid>
                    </Grid>
                  )}

                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 0.5 }}>
                    <Typography variant="body2" sx={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500 }}>
                      First time or forgot PIN?
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        onClick={() => handleCheckOrTriggerSetup(false)}
                        disabled={setupLoading}
                        sx={{
                          color: "#00bdd2",
                          fontWeight: 700,
                          textTransform: "none",
                          fontSize: 13,
                          p: 0,
                          minWidth: 0,
                          "&:hover": { color: "#38bdf8", textDecoration: "underline" },
                        }}
                      >
                        {setupLoading ? <CircularProgress size={14} sx={{ color: "#00bdd2" }} /> : "Set up PIN"}
                      </Button>
                      <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 700 }}>•</Typography>
                      <Button
                        size="small"
                        onClick={() => handleCheckOrTriggerSetup(true)}
                        disabled={setupLoading}
                        sx={{
                          color: "#c084fc",
                          fontWeight: 700,
                          textTransform: "none",
                          fontSize: 13,
                          p: 0,
                          minWidth: 0,
                          "&:hover": { color: "#e9d5ff", textDecoration: "underline" },
                        }}
                      >
                        Reset PIN
                      </Button>
                    </Stack>
                  </Stack>

                  <TextField
                    placeholder="P  I  N"
                    value={pin ? "•".repeat(pin.length) : ""}
                    fullWidth
                    size="small"
                    disabled
                    sx={{
                      bgcolor: "rgba(3, 14, 34, 0.65)",
                      borderRadius: "14px",
                      "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2)" },
                      "& .MuiInputBase-input.Mui-disabled": {
                        WebkitTextFillColor: "#ffffff !important",
                        color: "#ffffff !important",
                        textAlign: "center",
                        letterSpacing: 12,
                        fontSize: 28,
                        fontWeight: 700,
                        py: 1.2,
                      },
                      "& input::placeholder": {
                        WebkitTextFillColor: "#cbd5e1 !important",
                        color: "#cbd5e1 !important",
                        opacity: 0.85,
                        textAlign: "center",
                        letterSpacing: 8,
                        fontSize: 20,
                        fontWeight: 600,
                      },
                    }}
                  />

                  {/* Touch Keypad */}
                  <Grid container spacing={1.2} sx={{ mt: 0.5 }}>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <Grid size={{ xs: 4 }} key={digit}>
                        <Button
                          fullWidth
                          variant="outlined"
                          onClick={() => handlePinDigit(digit)}
                          disabled={pinLocked || pinSubmitting}
                          sx={{
                            height: 52,
                            fontSize: 21,
                            fontWeight: 700,
                            color: "#ffffff",
                            bgcolor: "rgba(255,255,255,0.05)",
                            borderColor: "rgba(255,255,255,0.18)",
                            borderRadius: "12px",
                            fontFamily: "'Outfit', sans-serif",
                            "&:hover": { bgcolor: "rgba(255,255,255,0.14)", borderColor: "#ffffff" },
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
                        onClick={handlePinClear}
                        disabled={pinLocked || pinSubmitting}
                        sx={{
                          height: 52,
                          fontWeight: 700,
                          fontSize: 15,
                          color: "#fbbf24",
                          borderColor: "#f59e0b",
                          bgcolor: "rgba(245, 158, 11, 0.12)",
                          borderRadius: "12px",
                          fontFamily: "'Outfit', sans-serif",
                          "&:hover": { bgcolor: "rgba(245, 158, 11, 0.22)", borderColor: "#fbbf24" },
                        }}
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
                          fontSize: 21,
                          fontWeight: 700,
                          color: "#ffffff",
                          bgcolor: "rgba(255,255,255,0.05)",
                          borderColor: "rgba(255,255,255,0.18)",
                          borderRadius: "12px",
                          fontFamily: "'Outfit', sans-serif",
                          "&:hover": { bgcolor: "rgba(255,255,255,0.14)", borderColor: "#ffffff" },
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
                        sx={{
                          height: 52,
                          color: "#ffffff",
                          bgcolor: "rgba(255,255,255,0.05)",
                          borderColor: "rgba(255,255,255,0.18)",
                          borderRadius: "12px",
                          "&:hover": { bgcolor: "rgba(255,255,255,0.14)", borderColor: "#ffffff" },
                        }}
                      >
                        <BackspaceIcon fontSize="small" sx={{ color: "#ffffff" }} />
                      </Button>
                    </Grid>
                  </Grid>

                  <Button
                    variant="contained"
                    size="large"
                    onClick={handlePinSubmit}
                    disabled={pinLocked || pinSubmitting || !identifier.trim() || pin.length < 4}
                    sx={{
                      height: 54,
                      fontWeight: 700,
                      fontSize: 15,
                      background: "linear-gradient(135deg, #632cd6 0%, #5222b8 100%)",
                      color: "#ffffff",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      borderRadius: "14px",
                      fontFamily: "'Outfit', sans-serif",
                      boxShadow: "0 8px 24px rgba(82, 34, 184, 0.45)",
                      "&:hover": { background: "linear-gradient(135deg, #743eed 0%, #5d27d1 100%)" },
                      "&.Mui-disabled": {
                        background: "rgba(82, 34, 184, 0.2)",
                        color: "rgba(255, 255, 255, 0.6) !important",
                        WebkitTextFillColor: "rgba(255, 255, 255, 0.6) !important",
                        border: "1px solid rgba(82, 34, 184, 0.35)",
                      },
                    }}
                  >
                    {pinSubmitting
                      ? <CircularProgress size={24} sx={{ color: "#ffffff" }} />
                      : desktopRuntime
                        ? `Confirm ${requestedPinAction === "CLOCK_IN"
                          ? "Clock In"
                          : requestedPinAction === "CLOCK_OUT"
                            ? "Clock Out"
                            : requestedPinAction === "BREAK_START"
                              ? "Start Break"
                              : "End Break"}`
                        : "Confirm Clock In / Out"}
                  </Button>
                </Stack>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Box>

      <KioskBreakDialog
        breakDialogOpen={breakDialogOpen}
        setBreakDialogOpen={setBreakDialogOpen}
        breakActionType={breakActionType}
        setBreakActionType={setBreakActionType}
        setBreakError={setBreakError}
        breakError={breakError}
        loadingActiveStaff={loadingActiveStaff}
        activeStaffList={activeStaffList}
        selectedStaffForBreak={selectedStaffForBreak}
        setSelectedStaffForBreak={setSelectedStaffForBreak}
        handleSelectStaffForBreak={handleSelectStaffForBreak}
        breakConfirmPin={breakConfirmPin}
        setBreakConfirmPin={setBreakConfirmPin}
        breakSubmitting={breakSubmitting}
        handleConfirmBreakAction={handleConfirmBreakAction}
      />

      <Dialog open={showSettingsUnlock} onClose={() => !settingsBusy && setShowSettingsUnlock(false)}>
        <DialogTitle>Manager Access</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the six-digit dashboard PIN to open kiosk settings.
          </Typography>
          {settingsError && <Alert severity="error" sx={{ mb: 2 }}>{settingsError}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label="Dashboard PIN"
            type="password"
            value={settingsPin}
            onChange={(event) => setSettingsPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputProps={{ inputMode: "numeric", maxLength: 6 }}
            disabled={settingsBusy}
            onKeyDown={(event) => {
              if (event.key === "Enter" && /^\d{6}$/.test(settingsPin)) void unlockKioskSettings();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={settingsBusy} onClick={() => setShowSettingsUnlock(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={settingsBusy || !/^\d{6}$/.test(settingsPin)}
            onClick={() => void unlockKioskSettings()}
          >
            {settingsBusy ? <CircularProgress size={20} color="inherit" /> : "Unlock Settings"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Protected kiosk settings / disconnect */}
      <Dialog
        open={showDeactivateDialog}
        onClose={() => {
          if (!settingsBusy) {
            setShowDeactivateDialog(false);
            setSettingsError(null);
            if (desktopRuntime) setSettingsPin("");
          }
        }}
      >
        <DialogTitle>Kiosk Terminal Settings</DialogTitle>
        <DialogContent>
          {settingsError && <Alert severity="error" sx={{ mb: 2 }}>{settingsError}</Alert>}
          {settingsMessage && <Alert severity="success" sx={{ mb: 2 }}>{settingsMessage}</Alert>}
          {desktopRuntime && (
            <Alert severity={pendingDisconnectCount > 0 ? "warning" : "info"} sx={{ mb: 2 }}>
              {pendingDisconnectCount > 0
                ? `${pendingDisconnectCount} attendance event${pendingDisconnectCount === 1 ? "" : "s"} waiting to sync.`
                : "No attendance events are waiting to sync."}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            Disconnect this terminal from <strong>{pharmacyName}</strong>. The device will be revoked
            on ChemistTasker and must be paired again before it can record attendance.
          </Typography>
          {desktopRuntime && pendingDisconnectCount > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {pendingDisconnectCount} attendance event{pendingDisconnectCount === 1 ? "" : "s"} still
              {pendingDisconnectCount === 1 ? " is" : " are"} waiting to sync. This terminal cannot be
              disconnected until that evidence reaches ChemistTasker.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={settingsBusy}
            onClick={() => {
              setShowDeactivateDialog(false);
              setSettingsError(null);
              if (desktopRuntime) setSettingsPin("");
            }}
          >
            Cancel
          </Button>
          {desktopRuntime && (
            <Button
              startIcon={<RefreshIcon />}
              disabled={settingsBusy}
              onClick={() => void handleSyncNow()}
            >
              Sync Now
            </Button>
          )}
          <Button
            color="error"
            variant="contained"
            disabled={settingsBusy || (desktopRuntime && pendingDisconnectCount > 0)}
            onClick={() => void handleDeactivate()}
          >
            {settingsBusy ? <CircularProgress size={20} color="inherit" /> : "Disconnect Device"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
