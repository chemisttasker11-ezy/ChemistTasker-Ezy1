import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { attendance } from "@chemisttasker/shared-core";

export interface KioskPairingDialogProps {
  open: boolean;
  onClose: () => void;
  pharmacyId?: number | string;
}

interface PharmacyOption {
  id: number;
  name: string;
  timezone: string;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function KioskPairingDialog({
  open,
  onClose,
  pharmacyId,
}: KioskPairingDialogProps) {
  const [manageablePharmacies, setManageablePharmacies] = useState<PharmacyOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [deviceName, setDeviceName] = useState("Front counter");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isGeneratingRef = useRef(false);
  const activePharmacyRef = useRef<number | undefined>(
    pharmacyId !== undefined ? Number(pharmacyId) : undefined
  );
  const expiresAtRef = useRef<number>(0);
  const requestGenRef = useRef<number>(0);

  useEffect(() => {
    const nextId = pharmacyId !== undefined ? Number(pharmacyId) : undefined;
    activePharmacyRef.current = nextId;
    requestGenRef.current += 1;
    isGeneratingRef.current = false;
    setIsGenerating(false);
    setPairingCode(null);
    setRemainingSeconds(0);
    setGenerationError(null);
  }, [pharmacyId]);

  useEffect(() => {
    if (!open) {
      requestGenRef.current += 1;
      isGeneratingRef.current = false;
      setIsGenerating(false);
      setPairingCode(null);
      setRemainingSeconds(0);
      setGenerationError(null);
      return;
    }

    let active = true;
    setLoadingOptions(true);
    setOptionsError(null);

    attendance
      .getKioskPairingOptions("web")
      .then((res) => {
        if (!active) return;
        setManageablePharmacies(res?.pharmacies || []);
        setLoadingOptions(false);
      })
      .catch((err: any) => {
        if (!active) return;
        setManageablePharmacies([]);
        setLoadingOptions(false);
        setOptionsError(err?.message || "Failed to load manageable pharmacies");
      });

    return () => {
      active = false;
    };
  }, [open]);

  const targetPharmacyId =
    pharmacyId !== undefined ? Number(pharmacyId) : manageablePharmacies[0]?.id;

  const currentPharmacy = manageablePharmacies.find((p) => p.id === targetPharmacyId);
  const isManageable = Boolean(currentPharmacy);
  const isExpired = Boolean(pairingCode && remainingSeconds <= 0);

  useEffect(() => {
    if (!pairingCode || remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [pairingCode, remainingSeconds > 0]);

  const handleGenerate = async () => {
    if (isGeneratingRef.current || !isManageable || !targetPharmacyId) {
      return;
    }

    const issuingPharmacyId = targetPharmacyId;
    const currentGen = ++requestGenRef.current;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const res = await attendance.createKioskPairingCode(
        issuingPharmacyId,
        deviceName.trim() || "Front counter",
        "web"
      );

      if (
        requestGenRef.current !== currentGen ||
        activePharmacyRef.current !== issuingPharmacyId
      ) {
        return;
      }

      setPairingCode(String(res.pairing_code));
      const ttl = Number(res.expires_in_seconds) || 0;
      expiresAtRef.current = Date.now() + ttl * 1000;
      setRemainingSeconds(ttl);
    } catch (err: any) {
      if (
        requestGenRef.current !== currentGen ||
        activePharmacyRef.current !== issuingPharmacyId
      ) {
        return;
      }
      const msg = err?.message || err?.error || "Failed to create pairing code";
      setGenerationError(String(msg));
      setPairingCode(null);
    } finally {
      if (requestGenRef.current === currentGen) {
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    }
  };

  const handleCopy = async () => {
    if (!pairingCode || isExpired) return;
    try {
      if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(pairingCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // ignore
    }
  };

  const isGenerateDisabled = loadingOptions || isGenerating || !isManageable;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Pair New Kiosk Terminal</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {optionsError && <Alert severity="error">{optionsError}</Alert>}

          {!loadingOptions && manageablePharmacies.length === 0 && (
            <Alert severity="warning">
              You are not authorized to pair kiosks. No manageable pharmacies found.
            </Alert>
          )}

          {!loadingOptions && manageablePharmacies.length > 0 && !isManageable && (
            <Alert severity="warning">
              You are not authorized to pair a terminal for this pharmacy.
            </Alert>
          )}

          {currentPharmacy && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Pharmacy
              </Typography>
              <Typography variant="subtitle1" fontWeight={600}>
                {currentPharmacy.name}
              </Typography>
            </Box>
          )}

          <TextField
            label="Terminal name"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. Front counter"
            fullWidth
            disabled={isGenerating}
          />

          {generationError && <Alert severity="error">{generationError}</Alert>}

          {pairingCode && (
            <Box
              sx={{
                p: 2.5,
                bgcolor: "background.default",
                borderRadius: 2,
                border: "1px solid",
                borderColor: isExpired ? "error.light" : "divider",
                textAlign: "center",
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Pairing Code
              </Typography>
              <Typography
                variant="h3"
                component="div"
                sx={{
                  fontWeight: 700,
                  letterSpacing: 6,
                  fontFamily: "monospace",
                  color: isExpired ? "text.disabled" : "primary.main",
                }}
              >
                {pairingCode}
              </Typography>
              <Typography
                variant="body2"
                color={isExpired ? "error.main" : "text.secondary"}
                sx={{ mt: 1, fontWeight: 500 }}
              >
                {isExpired ? "Code expired" : `Expires in ${formatCountdown(remainingSeconds)}`}
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={handleCopy}
                  disabled={!pairingCode || isExpired}
                >
                  {copied ? "Copied" : "Copy code"}
                </Button>
              </Box>
            </Box>
          )}

          <Box sx={{ pt: 1 }}>
            <Button
              variant="contained"
              fullWidth
              onClick={handleGenerate}
              disabled={isGenerateDisabled}
              sx={{ minHeight: 44 }}
            >
              {isGenerating ? "Generating code..." : "Generate code"}
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
