// One frame for every worker profile (pharmacist, Pharmacy team, New to pharmacy): the Post shift stepper, what the
// Verified profile still needs, the badges earned so far, the step itself, and Back / Next.
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, ButtonBase, LinearProgress, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { ArrowRight, BadgeCheck, CircleDashed } from "lucide-react";
import {
  REQUIREMENT_TEXT,
  getOnboardingDetail,
  normalizeVerification,
  outstandingText,
  type RequirementCode,
  type VerificationSummary,
} from "@chemisttasker/shared-core";
import { StepProgress, type PostShiftWizardStep } from "@chemisttasker/shared-ui/postShift/PostShiftWizardShell";
import { BadgeGuideLink, VerificationBadges } from "@chemisttasker/shared-ui/VerificationBadges";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import AccountDeletionSection from "../../components/AccountDeletionSection";
import { UnsavedChangesBoundary } from "../../hooks/useUnsavedChangesGuard";

export type OnboardingStep = PostShiftWizardStep & {
  /** Full name for the step heading; `label` stays short for the stepper. */
  title?: string;
  /** One line under the step title: why this step matters. */
  purpose: string;
  render: () => React.ReactNode;
};

type RoleKey = "pharmacist" | "otherstaff" | "explorer";

const SAVED_EVENT = "ct:onboarding-saved";

/** Tabs call this with the save response (the full onboarding detail) so the verification panel updates at once. */
export function announceOnboardingSaved(detail: unknown) {
  window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail }));
}

/** Where each requirement is completed: a step of this onboarding, or the mobile check page. */
type RequirementTarget = { step?: string; path?: string };

function VerificationPanel({ summary, role, progress, targets, onOpen }: {
  summary: VerificationSummary | null;
  role?: string | null;
  progress: number | null;
  targets: Partial<Record<RequirementCode, RequirementTarget>>;
  onOpen: (target: RequirementTarget) => void;
}) {
  const verified = Boolean(summary?.verified);
  // Verified profiles list only what a tightening asks for by its grace date ("References needed by ...").
  const due = (verified ? summary?.outstanding : summary?.missing) ?? [];
  return (
    <SectionCard
      title={verified ? "Your profile is verified" : "To get verified"}
      icon={verified ? <BadgeCheck /> : <CircleDashed />}
      subtitle={verified
        ? outstandingText(summary) ?? "You can apply for public shifts and publish on the talent hub."
        : "Only these are required. Everything else earns badges and can be added any time."}
    >
      {!summary ? (
        <Stack spacing={1} aria-busy="true">
          <Box sx={{ height: 18, borderRadius: 1, bgcolor: "var(--ct-subtle-bg)" }} />
          <Box sx={{ height: 18, width: "70%", borderRadius: 1, bgcolor: "var(--ct-subtle-bg)" }} />
        </Stack>
      ) : (
        <Stack spacing={2}>
          {due.length > 0 && (
            <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {due.map(code => {
                const text = REQUIREMENT_TEXT[code];
                const target = targets[code];
                return (
                  <Box component="li" key={code}>
                    <ButtonBase
                      disabled={!target}
                      onClick={() => target && onOpen(target)}
                      sx={{
                        width: "100%", textAlign: "left", justifyContent: "space-between", alignItems: "flex-start", gap: 1.5,
                        p: 1.25, borderRadius: "12px", border: "1px solid var(--ct-border-color)",
                        "&:hover": { bgcolor: "var(--ct-hover-bg)" },
                        "&:focus-visible": { outline: "2px solid var(--ct-accent-strong)", outlineOffset: 2 },
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "var(--ct-text-primary)" }}>{text?.title ?? code}</Typography>
                        <Typography sx={{ fontSize: 13, color: "var(--ct-text-secondary)", lineHeight: 1.45, mt: 0.25 }}>{text?.body}</Typography>
                      </Box>
                      {target && <Box component="span" aria-hidden sx={{ color: "var(--ct-accent-strong)", mt: 0.25, "& svg": { width: 16, height: 16 } }}><ArrowRight /></Box>}
                    </ButtonBase>
                  </Box>
                );
              })}
            </Stack>
          )}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 0.75 }}>
              <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600, color: "var(--ct-text-primary)" }}>Your badges</Typography>
              <BadgeGuideLink label="What pharmacies see" />
            </Stack>
            <VerificationBadges summary={summary} role={role} audience="worker" />
          </Box>
          {progress != null && (
            <Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography sx={{ fontSize: 12.5, color: "var(--ct-text-secondary)" }}>Profile details</Typography>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "var(--ct-text-primary)", fontVariantNumeric: "tabular-nums" }}>{progress}% complete</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progress} aria-label={`Profile details ${progress}% complete`} sx={{ height: 6, borderRadius: 999 }} />
            </Box>
          )}
        </Stack>
      )}
    </SectionCard>
  );
}

export default function OnboardingShell({ roleKey, title, subtitle, steps, targets, role, onDetail, footer }: {
  roleKey: RoleKey;
  title: string;
  subtitle: string;
  steps: OnboardingStep[];
  targets: Partial<Record<RequirementCode, RequirementTarget>>;
  /** Skill role for the verified-profile wording (PHARMACIST, INTERN, ...). */
  role?: string | null;
  onDetail?: (detail: any) => void;
  /** Extra section under the steps (e.g. the newcomer's account upgrade). */
  footer?: React.ReactNode;
}) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("step");
  const index = Math.max(0, steps.findIndex(item => item.key === requested));
  const step = steps[index];
  const [summary, setSummary] = React.useState<VerificationSummary | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);

  // A saved step can complete a requirement or earn a badge: take the save response as the new state.
  React.useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent).detail as any;
      if (!detail?.verification) return;
      setSummary(normalizeVerification(detail.verification, detail.ahpra));
      if (Number.isFinite(detail.progress_percent)) setProgress(detail.progress_percent);
      onDetail?.(detail);
    };
    window.addEventListener(SAVED_EVENT, onSaved);
    return () => window.removeEventListener(SAVED_EVENT, onSaved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-read on every step change as well (and on first load).
  React.useEffect(() => {
    let live = true;
    getOnboardingDetail(roleKey)
      .then((detail: any) => {
        if (!live) return;
        setSummary(normalizeVerification(detail?.verification, detail?.ahpra));
        setProgress(Number.isFinite(detail?.progress_percent) ? detail.progress_percent : null);
        onDetail?.(detail);
      })
      .catch(() => { if (live) setSummary(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleKey, step.key]);

  return (
    <UnsavedChangesBoundary>
      {({ confirmIfNeeded }) => {
        const go = async (next: number) => {
          const target = steps[Math.min(Math.max(next, 0), steps.length - 1)];
          if (target.key === step.key || await confirmIfNeeded()) {
            const params = new URLSearchParams(searchParams);
            params.set("step", target.key);
            setSearchParams(params, { replace: true });
          }
        };
        const open = (target: RequirementTarget) => {
          if (target.path) navigate(target.path);
          else if (target.step) void go(steps.findIndex(item => item.key === target.step));
        };
        const panel = <VerificationPanel summary={summary} role={role} progress={progress} targets={targets} onOpen={open} />;

        return (
          <Box data-ct-tokens="">
            <PageHeader title={title} subtitle={subtitle} />
            <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 340px" }, alignItems: "start" }}>
              {/* Phones: what is still required comes first; once verified, the step comes first. */}
              {compact && !summary?.verified && panel}
              <Box component="section" aria-labelledby="onboarding-step-title" sx={{ minWidth: 0, p: { xs: 2, md: 3 }, borderRadius: "var(--ct-card-radius, 20px)", border: "1px solid var(--ct-border-color)", bgcolor: "var(--ct-surface-bg)" }}>
                <StepProgress steps={steps} activeStep={index} compact={compact} onSelect={i => void go(i)} canSelect={() => true} label="Profile steps" wrapLabels />
                {!compact && (
                  <Typography id="onboarding-step-title" component="h2" sx={{ fontFamily: "var(--ct-font-display)", fontWeight: 500, fontSize: 22, color: "var(--ct-text-primary)" }}>
                    {step.title ?? step.label}
                  </Typography>
                )}
                {compact && <Box component="span" id="onboarding-step-title" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{step.title ?? step.label}</Box>}
                <Typography sx={{ fontSize: 14, color: "var(--ct-text-secondary)", mt: 0.5, mb: 2.5, maxWidth: "70ch" }}>{step.purpose}</Typography>
                {step.render()}
                <Stack direction={{ xs: "column-reverse", sm: "row" }} spacing={{ xs: 1.5, sm: 3 }} justifyContent="space-between"
                  sx={{ mt: 4, pt: 2.5, borderTop: "1px solid var(--ct-border-color)" }}>
                  <Button variant="text" onClick={() => void go(index - 1)} disabled={index === 0} sx={{ minWidth: 120 }}>Back</Button>
                  {index < steps.length - 1 && (
                    <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => void go(index + 1)} fullWidth={compact} sx={{ minWidth: 160 }}>
                      Next: {steps[index + 1].title ?? steps[index + 1].label}
                    </Button>
                  )}
                </Stack>
              </Box>
              {(!compact || summary?.verified) && panel}
            </Box>
            {footer && <Box sx={{ mt: 3 }}>{footer}</Box>}
            <Box sx={{ mt: { xs: 8, md: 10 } }}>
              <AccountDeletionSection />
            </Box>
          </Box>
        );
      }}
    </UnsavedChangesBoundary>
  );
}

