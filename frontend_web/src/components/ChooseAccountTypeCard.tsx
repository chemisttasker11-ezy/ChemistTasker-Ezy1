import { useState } from "react";
import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { chooseAccountType } from "@chemisttasker/shared-core";

// A pharmacy-manager account is a valid permanent admin-only identity. These
// options are only for a person deliberately converting this pharmacy mailbox/account
// into their own personal worker profile at the current pharmacy.
const ACCOUNT_TYPES = [
  { role: "PHARMACIST", staffRole: "PHARMACIST", label: "Pharmacist" },
  { role: "OTHER_STAFF", staffRole: "INTERN", label: "Intern pharmacist" },
  { role: "OTHER_STAFF", staffRole: "TECHNICIAN", label: "Dispensary technician" },
  { role: "OTHER_STAFF", staffRole: "ASSISTANT", label: "Pharmacy assistant" },
  { role: "OTHER_STAFF", staffRole: "STUDENT", label: "Pharmacy student" },
] as const;

export default function ChooseAccountTypeCard({ pharmacyId }: { pharmacyId: number }) {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (String(user?.role || "").toUpperCase() !== "PHARMACY_MANAGER") return null;

  const choose = async (item: (typeof ACCOUNT_TYPES)[number]) => {
    const savingKey = `${item.role}:${item.staffRole}`;
    setSaving(savingKey);
    setError(null);
    try {
      const response = await chooseAccountType(item.role, {
        pharmacy_id: pharmacyId,
        staff_role: item.staffRole,
      });
      const onboardingUrl: string = response?.onboarding_url ?? "";
      const fallbackPath = item.role === "PHARMACIST"
        ? "/dashboard/pharmacist/onboarding"
        : "/dashboard/otherstaff/onboarding";
      setUser((previous) => (previous ? { ...previous, role: item.role } : previous));
      navigate(onboardingUrl ? new URL(onboardingUrl, window.location.origin).pathname : fallbackPath);
    } catch (err: any) {
      const data = err?.response?.data;
      setError(
        data?.role?.[0]
        ?? data?.staff_role?.[0]
        ?? data?.pharmacy_id?.[0]
        ?? "Unable to save your account type.",
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card variant="outlined" sx={{ mb: 3, borderRadius: 3 }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          Personal profile is optional
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This account can stay permanently as a pharmacy-admin account with full delegated management access. No action
          is required. Only choose a worker type below if this email belongs to you personally and you want this
          pharmacy's CONTACT membership converted into your own workforce membership.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          {ACCOUNT_TYPES.map((item) => (
            <Button
              key={`${item.role}:${item.staffRole}`}
              variant="outlined"
              disabled={saving != null}
              onClick={() => choose(item)}
            >
              {saving === `${item.role}:${item.staffRole}` ? "Saving…" : item.label}
            </Button>
          ))}
        </Stack>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </CardContent>
    </Card>
  );
}
