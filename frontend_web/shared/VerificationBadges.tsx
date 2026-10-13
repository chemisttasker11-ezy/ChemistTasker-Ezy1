'use client';

// Verification badges for Vite and Next. States come from the backend; labels and explanations from shared-core.
import { useState, type ReactElement, type ReactNode } from 'react';
import { Box, ButtonBase, Popover, Stack, Tooltip, Typography } from '@mui/material';
import { BadgeCheck, CircleAlert, CircleDashed, Clock3, Globe, Info } from 'lucide-react';
import {
  VERIFICATION_GUIDE,
  evidenceExplainer,
  evidenceStateLabel,
  verificationRows,
  verifiedProfileExplainer,
  type BadgeAudience,
  type BadgeTone,
  type EvidenceState,
  type VerificationSummary,
} from '@chemisttasker/shared-core';

// Theme variables in the dashboard; brand light values as fallbacks on the public site.
const TONES: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  success: { bg: 'var(--ct-status-green-bg, #E4F5EA)', fg: 'var(--ct-status-green-fg, #17663A)', border: 'transparent' },
  info: { bg: 'var(--ct-tone-blue-bg, #E6F1FC)', fg: 'var(--ct-tone-blue-fg, #0063A8)', border: 'transparent' },
  warning: { bg: 'var(--ct-status-amber-bg, #FDF0D9)', fg: 'var(--ct-status-amber-fg, #8A4B00)', border: 'transparent' },
  neutral: { bg: 'transparent', fg: 'var(--ct-text-secondary, #445474)', border: 'var(--ct-border-color, #D5DCE8)' },
};
const STATE_TONE: Record<EvidenceState, BadgeTone> = { verified: 'success', pending: 'info', failed: 'warning', not_supplied: 'neutral' };
const STATE_ICON: Record<EvidenceState, typeof BadgeCheck> = { verified: BadgeCheck, pending: Clock3, failed: CircleAlert, not_supplied: CircleDashed };

/** Hover, keyboard focus or a tap shows why; the accessible name carries the same sentence. */
function Explained({ title, body, children }: { title: string; body: string; children: ReactElement }) {
  return (
    <Tooltip
      arrow
      enterDelay={150}
      enterTouchDelay={0}
      leaveTouchDelay={6000}
      title={
        <Box sx={{ p: 0.25, maxWidth: 280 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'inherit', lineHeight: 1.35 }}>{title}</Typography>
          <Typography sx={{ fontSize: 12, color: 'inherit', opacity: 0.88, lineHeight: 1.45, mt: 0.35 }}>{body}</Typography>
        </Box>
      }
    >
      {children}
    </Tooltip>
  );
}

function BadgePill({ tone, icon, children, label }: { tone: BadgeTone; icon: ReactNode; children: ReactNode; label: string }) {
  const { bg, fg, border } = TONES[tone];
  return (
    <Box
      component="span"
      tabIndex={0}
      role="img"
      aria-label={label}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 26, px: 1, borderRadius: '999px',
        fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', color: fg, bgcolor: bg,
        border: `1px solid ${border}`, cursor: 'help',
        '& svg': { width: 14, height: 14, flexShrink: 0, strokeWidth: 2 },
        '&:focus-visible': { outline: '2px solid var(--ct-accent-strong, #3C18A8)', outlineOffset: 2 },
      }}
    >
      {icon}
      {children}
    </Box>
  );
}

export function EvidencePill({ label, state, explainer, showState = true }: { label: string; state: EvidenceState; explainer: string; showState?: boolean }) {
  const Icon = STATE_ICON[state];
  const stateLabel = evidenceStateLabel(state);
  return (
    <Explained title={`${label}: ${stateLabel}`} body={explainer}>
      <BadgePill tone={STATE_TONE[state]} icon={<Icon aria-hidden />} label={`${label}: ${stateLabel}. ${explainer}`}>
        {label}{showState && state !== 'verified' ? ` · ${stateLabel}` : ''}
      </BadgePill>
    </Explained>
  );
}

export function VerifiedProfilePill({ verified, role }: { verified: boolean; role?: string | null }) {
  const body = verified ? verifiedProfileExplainer(role) : 'Email or mobile not confirmed yet, so this profile cannot apply for public shifts.';
  const title = verified ? 'Verified profile' : 'Profile not verified';
  return (
    <Explained title={title} body={body}>
      <BadgePill tone={verified ? 'success' : 'neutral'} icon={verified ? <BadgeCheck aria-hidden /> : <CircleDashed aria-hidden />} label={`${title}. ${body}`}>
        {title}
      </BadgePill>
    </Explained>
  );
}

export function OverseasLabel() {
  const body = VERIFICATION_GUIDE.items.find(item => item.term === 'Overseas')?.text || '';
  return (
    <Explained title="Overseas" body={body}>
      <BadgePill tone="neutral" icon={<Globe aria-hidden />} label={`Overseas. ${body}`}>Overseas</BadgePill>
    </Explained>
  );
}

/**
 * The person's badges. Cards use `compact`: verified badges by name, the rest folded into "N not verified".
 * Detail views list every badge with its state.
 */
export function VerificationBadges({ summary, role, audience = 'employer', compact = false }: {
  summary: VerificationSummary | null;
  role?: string | null;
  audience?: BadgeAudience;
  compact?: boolean;
}) {
  if (!summary) return null;
  const rows = verificationRows(summary, audience);
  const verified = rows.filter(row => row.state === 'verified');
  const open = rows.filter(row => row.state !== 'verified');
  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" aria-label="Verification badges" role="group">
      <VerifiedProfilePill verified={summary.verified} role={role} />
      {(compact ? verified : rows).map(row => <EvidencePill key={row.code} label={row.label} state={row.state} explainer={row.explainer} />)}
      {compact && open.length > 0 && (
        <Explained title={`${open.length} not verified`} body={`${open.map(row => row.label).join(', ')}. Open the profile to see why, or check these yourself after you match.`}>
          <BadgePill tone="neutral" icon={<CircleDashed aria-hidden />} label={`${open.length} not verified: ${open.map(row => row.label).join(', ')}`}>
            {open.length} not verified
          </BadgePill>
        </Explained>
      )}
      {summary.overseas && <OverseasLabel />}
    </Stack>
  );
}

/** Small state mark inside a certificate skill's chip (skills without a certificate show none). */
export function SkillEvidenceMark({ state, skill, audience = 'employer', iconOnly = false }: { state: EvidenceState | null; skill: string; audience?: BadgeAudience; iconOnly?: boolean }) {
  if (!state) return null;
  const Icon = STATE_ICON[state];
  const stateLabel = evidenceStateLabel(state);
  const explainer = evidenceExplainer(state, audience);
  return (
    <Explained title={`${skill}: ${stateLabel}`} body={explainer}>
      <Box component="span" tabIndex={0} role="img" aria-label={`${stateLabel}. ${explainer}`}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35, color: TONES[STATE_TONE[state]].fg, fontWeight: 600, cursor: 'help',
          '& svg': { width: 13, height: 13, strokeWidth: 2.25 }, '&:focus-visible': { outline: '2px solid var(--ct-accent-strong, #3C18A8)', outlineOffset: 2, borderRadius: 1 } }}>
        <Icon aria-hidden />{iconOnly ? null : stateLabel}
      </Box>
    </Explained>
  );
}

/** "What do badges mean?": one explanation on every employer screen that shows badges. */
export function BadgeGuideLink({ label = VERIFICATION_GUIDE.title }: { label?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = 'ct-badge-guide';
  return (
    <>
      <ButtonBase
        onClick={event => setAnchor(event.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? id : undefined}
        sx={{ gap: 0.5, minHeight: 32, px: 0.5, borderRadius: 1, fontSize: 13, fontWeight: 600, color: 'var(--ct-accent-strong, #3C18A8)',
          '& svg': { width: 15, height: 15 }, '&:hover': { textDecoration: 'underline' }, '&:focus-visible': { outline: '2px solid var(--ct-accent-strong, #3C18A8)', outlineOffset: 2 } }}
      >
        <Info aria-hidden />{label}
      </ButtonBase>
      <Popover
        id={id}
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': VERIFICATION_GUIDE.title, sx: { p: 2.25, maxWidth: 380, width: 'calc(100vw - 32px)', borderRadius: '16px' } } }}
      >
        <Typography component="h2" sx={{ fontFamily: 'var(--ct-font-display, Outfit, sans-serif)', fontWeight: 500, fontSize: 18, color: 'var(--ct-text-primary, #06214A)', mb: 0.5 }}>
          {VERIFICATION_GUIDE.title}
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: 'var(--ct-text-secondary, #445474)', lineHeight: 1.5, mb: 1.75 }}>{VERIFICATION_GUIDE.intro}</Typography>
        <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
          {VERIFICATION_GUIDE.items.map(item => {
            const look = TONES[item.tone];
            return (
              <Box key={item.term}>
                <Box component="dt" sx={{ display: 'inline-flex', px: 1, minHeight: 24, alignItems: 'center', borderRadius: '999px', fontSize: 12.5, fontWeight: 600,
                  color: look.fg, bgcolor: look.bg, border: `1px solid ${look.border}` }}>{item.term}</Box>
                <Typography component="dd" sx={{ m: 0, mt: 0.5, fontSize: 13.5, color: 'var(--ct-text-primary, #06214A)', lineHeight: 1.5 }}>{item.text}</Typography>
              </Box>
            );
          })}
        </Stack>
        <Typography sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary, #445474)', mt: 1.75 }}>{VERIFICATION_GUIDE.footnote}</Typography>
      </Popover>
    </>
  );
}
