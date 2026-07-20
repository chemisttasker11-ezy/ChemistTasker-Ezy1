// src/pages/onboardingV2/PharmacistOnboardingV2Layout.tsx
import * as React from "react";
import {
  Box,
  Button,
  Container,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { getOnboardingDetail } from "@chemisttasker/shared-core";
import { UnsavedChangesBoundary } from "../../../hooks/useUnsavedChangesGuard";
import AccountDeletionSection from "../../../components/AccountDeletionSection";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { useColorMode } from "../../../theme/sleekTheme";

const BRAND = {
  grad: "linear-gradient(90deg, #7c3aed 0%, #2563eb 100%)",
};

const createOnboardingTheme = (mode: "light" | "dark") => createTheme({
  palette: {
    mode,
    primary: { main: "#2563eb" },
    secondary: { main: "#7c3aed" },
    background: {
      default: mode === "dark" ? "#07111f" : "#f8fafc",
      paper: mode === "dark" ? "#101b2f" : "#ffffff",
    },
    text: {
      primary: mode === "dark" ? "#f8fafc" : "#111827",
      secondary: mode === "dark" ? "#cbd5e1" : "#64748b",
    },
    divider: mode === "dark" ? "rgba(148, 163, 184, 0.28)" : "rgba(15, 23, 42, 0.12)",
  },
  typography: { fontFamily: `"Inter", system-ui, Arial, sans-serif` },
  shape: { borderRadius: 12 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.mode === "dark" ? "rgba(15, 23, 42, 0.82)" : theme.palette.background.paper,
          color: theme.palette.text.primary,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.divider,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.primary.main,
          },
        }),
        input: ({ theme }) => ({
          color: theme.palette.text.primary,
          "&::placeholder": {
            color: theme.palette.text.secondary,
            opacity: 0.85,
          },
        }),
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: ({ theme }) => ({ color: theme.palette.text.secondary }),
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: ({ theme }) => ({ color: theme.palette.text.secondary }),
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: ({ theme }) => ({ color: theme.palette.text.secondary }),
      },
    },
  },
});

// your tab pages
import BasicInfoV2 from "./BasicInfoV2";
import SkillsV2 from "./SkillsV2";
import PaymentV2 from "./PaymentV2";
import RefereesV2 from "./RefereesV2";
import ProfileV2 from "./ProfileV2";
import RatesV2 from "./RatesV2";
import IdentityV2 from "./IdentityV2";

type StepKey = "basic" | "identity" | "skills" | "payment" | "rate" | "referees" | "profile";
const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "basic",    label: "Basic Info" },
  { key: "identity", label: "Identity" },
  { key: "skills",   label: "Skills" },
  { key: "payment",  label: "Payment" },
  { key: "referees", label: "Referees" },
  { key: "rate", label: "Rate" },
  { key: "profile",  label: "Profile" },
];

export default function PharmacistOnboardingV2Layout() {
  const { mode } = useColorMode();
  const theme = React.useMemo(() => createOnboardingTheme(mode), [mode]);
  const [step, setStep] = React.useState<StepKey>("basic");
  const [progress, setProgress] = React.useState<number>(0);
  const idx = STEPS.findIndex(s => s.key === step);
  // const stepLabel = STEPS[idx]?.label ?? "";

  // Load real progress from backend on mount
  React.useEffect(() => {
    getOnboardingDetail("pharmacist")
      .then((res: any) => {
        const p = res?.progress_percent ?? 0;
        setProgress(Number.isFinite(p) ? p : 0);
      })
      .catch(() => setProgress(0));
  }, []);

return (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <UnsavedChangesBoundary>
      {({ confirmIfNeeded }) => {
        const requestStepChange = async (nextStep: StepKey) => {
          if (nextStep === step || (await confirmIfNeeded())) {
            setStep(nextStep);
          }
        };
        const goNext = () => void requestStepChange(STEPS[Math.min(idx + 1, STEPS.length - 1)].key);
        const goBack = () => void requestStepChange(STEPS[Math.max(idx - 1, 0)].key);

        return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Paper elevation={3} sx={{ p: { xs: 2, md: 3 } }}>
        {/* Header + ONLY progress bar here */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Pharmacist Onboarding
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Progress: {progress}%
            </Typography>
          </Box>
          <LinearProgress
            color="primary"
            variant="determinate"
            value={progress}
            sx={{ height: 8, borderRadius: 999 }}
          />
        </Box>
        {/* Top pills nav */}
        <Box
          sx={{
            display: { xs: "none", md: "grid" }, // <-- hide on small screens
            gridTemplateColumns: { md: "repeat(7, 1fr)" },
            gap: 1,
            mb: 2,
          }}
        >
          {STEPS.map((s) => {
            const active = s.key === step;
            return (
              <Button
                key={s.key}
                onClick={() => void requestStepChange(s.key)}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 3,
                  py: 1,
                  ...(active
                    ? {
                        background: BRAND.grad,
                        color: "#fff",
                        boxShadow: "0 2px 6px rgba(0,0,0,.12)",
                        "&:hover": { opacity: 0.95, background: BRAND.grad },
                      }
                    : {}),
                }}
                variant={active ? "contained" : "outlined"}
                fullWidth
              >
                {STEPS.findIndex(x => x.key === s.key) + 1}. {s.label}
              </Button>
            );
          })}
        </Box>

        {/* Two-column layout */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 2.5,
          }}
        >
          {/* Left: step buttons — light blue border, subtle fade when active */}
          <Box sx={{ display: "none" }}>
            <Stack spacing={1.2}>
              {STEPS.map((s) => {
                const active = s.key === step;
                return (
                  <Button
                    key={s.key}
                    onClick={() => void requestStepChange(s.key)}
                    fullWidth
                    size="large"
                    variant={active ? "contained" : "outlined"}
                    color="primary"
                    sx={(theme) => ({
                      justifyContent: "flex-start",
                      fontWeight: 700,
                      textTransform: "none",
                      borderRadius: 2,
                      borderWidth: active ? 0 : 1,
                      borderColor: active ? "transparent" : theme.palette.divider,
                      ...(active
                        ? {
                            // match the top bar gradient
                            background: BRAND.grad,
                            color: "#fff",
                            boxShadow: "0 2px 6px rgba(0,0,0,.12)",
                            "&:hover": { opacity: 0.95, background: BRAND.grad },
                          }
                        : {
                            backgroundColor: "transparent",
                            "&:hover": {
                              borderColor: theme.palette.primary.main,
                              backgroundColor: alpha(theme.palette.primary.main, 0.08),
                            },
                          }),
                    })}
                  >
                    {STEPS.findIndex((x) => x.key === s.key) + 1}. {s.label}
                  </Button>


                );
              })}
            </Stack>
          </Box>
        {/* Right: page content with header actions */}
        <Box
          sx={{
            minHeight: 320,
            p: { xs: 2, md: 3 },
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 3,
            bgcolor: "background.paper",
          }}
        >
          {/* Header row – hide Next on last step */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", mb: 2 }}>
            <Box sx={{ display: "flex", gap: 1 }}>
              {/* Always show Back button except on the very first page */}
              {idx > 0 && (
                <Button variant="outlined" onClick={goBack}>
                  Back
                </Button>
              )}

              {/* Only show Next button when it's NOT the last step */}
              {idx < STEPS.length - 1 && (
                <Button
                  variant="contained"
                  onClick={goNext}
                  sx={{ background: BRAND.grad }}
                >
                  Next
                </Button>
              )}
            </Box>
          </Box>

          {/* Render the current page */}
          {step === "basic" && <BasicInfoV2 />}
          {step === "identity" && <IdentityV2 />}
          {step === "skills" && <SkillsV2 />}
          {step === "payment" && <PaymentV2 />}
          {step === "referees" && <RefereesV2 />}
          {step === "rate" && <RatesV2 />}
          {step === "profile" && <ProfileV2 />}
        </Box>

        </Box>
      </Paper>
      <Box sx={{ mt: { xs: 8, md: 10 } }}>
        <AccountDeletionSection />
      </Box>
    </Container>
        );
      }}
    </UnsavedChangesBoundary>
  </ThemeProvider>
);
}
