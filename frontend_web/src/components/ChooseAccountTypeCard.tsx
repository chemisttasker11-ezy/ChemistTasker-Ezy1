import { useState } from "react";
import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import apiClient from "../utils/apiClient";

// A pharmacy-manager account (a pharmacy contact onboarded by an organisation) may add its own profile once.
const ACCOUNT_TYPES = [
  { role: "PHARMACIST", label: "Pharmacist" },
  { role: "OTHER_STAFF", label: "Other staff" },
  { role: "OWNER", label: "Pharmacy owner" },
] as const;

export default function ChooseAccountTypeCard() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (String(user?.role || "").toUpperCase() !== "PHARMACY_MANAGER") return null;

  const choose = async (role: (typeof ACCOUNT_TYPES)[number]["role"]) => {
    setSaving(role);
    setError(null);
    try {
      const response = await apiClient.post("/users/me/account-type/", { role });
      const onboardingUrl: string = response.data?.onboarding_url ?? "";
      setUser((previous) => (previous ? { ...previous, role } : previous));
      navigate(onboardingUrl ? new URL(onboardingUrl, window.location.origin).pathname : "/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.role?.[0] ?? "Unable to save your account type.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card variant="outlined" sx={{ mb: 3, borderRadius: 3 }}>
      <CardContent>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          Complete your profile (optional)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          You manage this pharmacy already. Add your own profile to use ChemistTasker as a pharmacist, staff member or
          pharmacy owner too. You keep your admin access, and this choice can be made only once.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          {ACCOUNT_TYPES.map((item) => (
            <Button
              key={item.role}
              variant="outlined"
              disabled={saving != null}
              onClick={() => choose(item.role)}
            >
              {saving === item.role ? "Saving…" : item.label}
            </Button>
          ))}
        </Stack>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </CardContent>
    </Card>
  );
}
