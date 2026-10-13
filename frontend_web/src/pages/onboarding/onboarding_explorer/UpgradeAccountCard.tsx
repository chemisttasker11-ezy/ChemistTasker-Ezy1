// New to pharmacy -> Pharmacist or Pharmacy team, once. Details, ID check, references and the talent post carry over;
// the new role's checks apply (AHPRA for pharmacists, the Australian mobile for everyone).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, Stack, Typography } from "@mui/material";
import { ArrowUpRight } from "lucide-react";
import { chooseAccountType, getCurrentUser } from "@chemisttasker/shared-core";
import SectionCard from "../../../components/ui/SectionCard";
import { useAuth } from "../../../contexts/AuthContext";

const CHOICES = [
  { value: "PHARMACIST", staffRole: "PHARMACIST", label: "Pharmacist", body: "You hold general AHPRA registration." },
  { value: "INTERN", staffRole: "INTERN", label: "Intern pharmacist", body: "You hold provisional AHPRA registration." },
  { value: "TECHNICIAN", staffRole: "TECHNICIAN", label: "Dispensary technician", body: "You work in the dispensary." },
  { value: "ASSISTANT", staffRole: "ASSISTANT", label: "Pharmacy assistant", body: "You work in a pharmacy." },
  { value: "STUDENT", staffRole: "STUDENT", label: "Pharmacy student", body: "You study pharmacy at university." },
];

export default function UpgradeAccountCard() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = CHOICES.find(item => item.value === choice);

  const upgrade = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    const role = selected.staffRole === "PHARMACIST" ? "PHARMACIST" : "OTHER_STAFF";
    try {
      const response = await chooseAccountType(role, { staff_role: selected.staffRole });
      // The workspace persona belongs to the old account type: start the new role from its default.
      if (user?.id != null) localStorage.removeItem(`ct-active-persona:${user.id}`);
      try {
        setUser((await getCurrentUser()) as Parameters<typeof setUser>[0]);
      } catch {
        setUser(previous => (previous ? { ...previous, role } : previous));
      }
      const path = response?.onboarding_url ? new URL(response.onboarding_url, window.location.origin).pathname
        : role === "PHARMACIST" ? "/dashboard/pharmacist/onboarding" : "/dashboard/otherstaff/onboarding";
      navigate(path, { replace: true });
    } catch (err: any) {
      const data = err?.response?.data ?? err?.data;
      setError(data?.role?.[0] ?? data?.role ?? data?.staff_role?.[0] ?? "We couldn't upgrade your account. Try again.");
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Ready for the next step?" icon={<ArrowUpRight />}
      subtitle="Registered with AHPRA, studying pharmacy or working in a pharmacy now? Move to a Pharmacist or Pharmacy team account.">
      <Typography sx={{ fontSize: 14, color: "var(--ct-text-secondary)", mb: 2, maxWidth: "70ch" }}>
        Your details, photo ID check, references and talent post come with you. Your new role's checks then apply: your
        Australian mobile, and AHPRA registration for pharmacists and interns. You can only do this once.
      </Typography>
      <Button variant="outlined" onClick={() => setOpen(true)}>Upgrade my account</Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="xs" aria-labelledby="upgrade-title">
        <DialogTitle id="upgrade-title" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500 }}>Upgrade my account</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <RadioGroup value={choice} onChange={event => setChoice(event.target.value)} aria-label="New account type">
            {CHOICES.map(item => (
              <FormControlLabel key={item.value} value={item.value} control={<Radio />} sx={{ alignItems: "flex-start", my: 0.5, "& .MuiRadio-root": { mt: -0.5 } }}
                label={<Stack><Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>{item.label}</Typography><Typography sx={{ fontSize: 13, color: "var(--ct-text-secondary)" }}>{item.body}</Typography></Stack>} />
            ))}
          </RadioGroup>
          <Typography sx={{ fontSize: 13, color: "var(--ct-text-secondary)", mt: 1.5 }}>This can't be undone.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={upgrade} disabled={busy || !selected} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {busy ? "Upgrading…" : selected ? `Upgrade to ${selected.label.toLowerCase()}` : "Upgrade"}
          </Button>
        </DialogActions>
      </Dialog>
    </SectionCard>
  );
}
