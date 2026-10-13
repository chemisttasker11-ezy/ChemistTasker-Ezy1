'use client';

// Verification badges for Vite and Next. States come from the backend; labels and explanations from shared-core.
// Each badge is drawn in the skill-symbol family (SkillGlyph: navy linework over two brand tints) with a small status
// medallion: green tick verified, calm blue clock pending, soft slate "!" not verified. Colour is never the only cue.
import { useState, type ReactElement, type ReactNode } from 'react';
import { Box, ButtonBase, Popover, Stack, Tooltip, Typography } from '@mui/material';
import { Info } from 'lucide-react';
import {
  VERIFICATION_GUIDE,
  evidenceExplainer,
  evidenceStateLabel,
  verificationRows,
  verifiedProfileExplainer,
  type BadgeAudience,
  type EvidenceState,
  type VerificationSummary,
} from '@chemisttasker/shared-core';
import { BADGE_SUBJECTS, SkillGlyph, type BadgeSubject } from './SkillGlyph';

type Mark = 'verified' | 'pending' | 'open';
const markOf = (state: EvidenceState): Mark => (state === 'verified' ? 'verified' : state === 'pending' ? 'pending' : 'open');
/** Medallion fills: brand-family green, the brand blue, and a soft slate so "not verified" informs rather than alarms. */
export const MARK_COLORS: Record<Mark, string> = { verified: '#12A150', pending: '#0B83D9', open: '#7C889E' };

/** The status medallion alone (also used inside certificate-skill chips). */
export function StatusMark({ state, size = 12 }: { state: EvidenceState; size?: number }) {
  const mark = markOf(state);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" style={{ flexShrink: 0, display: 'block' }}>
      <circle cx="8" cy="8" r="7.25" fill={MARK_COLORS[mark]} stroke="var(--ct-surface-bg, #FFFFFF)" strokeWidth="1.5" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {mark === 'verified' && <path d="m4.9 8.2 2.1 2.1 4.1-4.3" />}
        {mark === 'pending' && <path d="M8 4.9V8l2 1.3" />}
        {mark === 'open' && <><path d="M8 4.6v4.1" /><path d="M8 11.3h.01" /></>}
      </g>
    </svg>
  );
}

/** A badge's subject in the skill-symbol style, with its status medallion on the lower right. */
export function BadgeGlyph({ subject, state, size = 22 }: { subject: BadgeSubject; state?: EvidenceState; size?: number }) {
  const look = BADGE_SUBJECTS[subject];
  return (
    <Box component="span" aria-hidden sx={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <SkillGlyph name={look.icon} title="" decorative size={size} tone={look.tone} accentTone={look.accent} />
      {state && (
        <Box component="span" sx={{ position: 'absolute', right: -size * 0.22, bottom: -size * 0.18, lineHeight: 0 }}>
          <StatusMark state={state} size={Math.round(size * 0.58)} />
        </Box>
      )}
    </Box>
  );
}

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

const STATE_TEXT: Partial<Record<Mark, string>> = { pending: 'var(--ct-tone-blue-fg, #0063A8)', open: 'var(--ct-text-secondary, #445474)' };

function BadgePill({ glyph, label, note, mark, accessibleName }: { glyph: ReactNode; label: string; note?: string; mark?: Mark; accessibleName: string }) {
  return (
    <Box
      component="span"
      tabIndex={0}
      role="img"
      aria-label={accessibleName}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.9, minHeight: 32, pl: 0.6, pr: 1.25, borderRadius: '999px',
        fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', cursor: 'help',
        color: 'var(--ct-text-primary, #06214A)', bgcolor: 'var(--ct-surface-bg, #FFFFFF)',
        border: '1px solid var(--ct-border-color, #DCE3EE)',
        transition: 'border-color 140ms ease, box-shadow 140ms ease',
        '&:hover': { borderColor: 'var(--ct-text-muted, #8A97AD)' },
        '&:focus-visible': { outline: '2px solid var(--ct-accent-strong, #3C18A8)', outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box component="span" sx={{ display: 'inline-flex', p: '3px', mr: 0.25 }}>{glyph}</Box>
      {label}
      {note && <Box component="span" sx={{ fontWeight: 500, color: (mark && STATE_TEXT[mark]) || 'var(--ct-text-secondary, #445474)' }}>· {note}</Box>}
    </Box>
  );
}

const subjectOf = (code: string): BadgeSubject => (code in BADGE_SUBJECTS ? code as BadgeSubject : 'ID');

export function EvidencePill({ label, state, explainer, code, showState = true }: { label: string; state: EvidenceState; explainer: string; code?: string; showState?: boolean }) {
  const stateLabel = evidenceStateLabel(state);
  const mark = markOf(state);
  return (
    <Explained title={`${label}: ${stateLabel}`} body={explainer}>
      <BadgePill glyph={<BadgeGlyph subject={subjectOf(code ?? label)} state={state} />} label={label} mark={mark}
        note={showState && state !== 'verified' ? stateLabel : undefined} accessibleName={`${label}: ${stateLabel}. ${explainer}`} />
    </Explained>
  );
}

export function VerifiedProfilePill({ verified, role }: { verified: boolean; role?: string | null }) {
  const body = verified ? verifiedProfileExplainer(role) : 'Email or mobile not confirmed yet, so this profile cannot apply for public shifts.';
  const title = verified ? 'Verified profile' : 'Profile not verified';
  return (
    <Explained title={title} body={body}>
      <BadgePill glyph={<BadgeGlyph subject="PROFILE" state={verified ? 'verified' : 'not_supplied'} />} label={title}
        accessibleName={`${title}. ${body}`} />
    </Explained>
  );
}

/** Labels say what the person told us (Overseas) or their date of birth implies (Under 18); they are not checks. */
export function InfoLabel({ term }: { term: 'Overseas' | 'Under 18' }) {
  const body = VERIFICATION_GUIDE.items.find(item => item.term === term)?.text || '';
  return (
    <Explained title={term} body={body}>
      <BadgePill glyph={<BadgeGlyph subject={term === 'Overseas' ? 'OVERSEAS' : 'UNDER_18'} />} label={term} accessibleName={`${term}. ${body}`} />
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
      {(compact ? verified : rows).map(row => <EvidencePill key={row.code} code={row.code} label={row.label} state={row.state} explainer={row.explainer} />)}
      {compact && open.length > 0 && (
        <Explained title={`${open.length} not verified`} body={`${open.map(row => row.label).join(', ')}. Open the profile to see why, or check these yourself after you match.`}>
          <BadgePill glyph={<StatusMark state="not_supplied" size={16} />} label={`${open.length} not verified`}
            accessibleName={`${open.length} not verified: ${open.map(row => row.label).join(', ')}`} />
        </Explained>
      )}
      {summary.overseas && <InfoLabel term="Overseas" />}
      {summary.under18 && <InfoLabel term="Under 18" />}
    </Stack>
  );
}

/** Small state mark inside a certificate skill's chip (skills without a certificate show none). */
export function SkillEvidenceMark({ state, skill, audience = 'employer', iconOnly = false }: { state: EvidenceState | null; skill: string; audience?: BadgeAudience; iconOnly?: boolean }) {
  if (!state) return null;
  const mark = markOf(state);
  const stateLabel = evidenceStateLabel(state);
  const explainer = evidenceExplainer(state, audience);
  return (
    <Explained title={`${skill}: ${stateLabel}`} body={explainer}>
      <Box component="span" tabIndex={0} role="img" aria-label={`${stateLabel}. ${explainer}`}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 600, cursor: 'help',
          color: mark === 'verified' ? 'var(--ct-status-green-fg, #17663A)' : STATE_TEXT[mark],
          '&:focus-visible': { outline: '2px solid var(--ct-accent-strong, #3C18A8)', outlineOffset: 2, borderRadius: 1 } }}>
        <StatusMark state={state} size={14} />{iconOnly ? null : stateLabel}
      </Box>
    </Explained>
  );
}

// Guide sample per term: the same artwork people meet on the cards.
const GUIDE_SAMPLE: Record<string, { subject?: BadgeSubject; state?: EvidenceState }> = {
  'Verified profile': { subject: 'PROFILE', state: 'verified' },
  Verified: { subject: 'ID', state: 'verified' },
  'Check pending': { subject: 'ID', state: 'pending' },
  'Not verified': { subject: 'ID', state: 'not_supplied' },
  Overseas: { subject: 'OVERSEAS' },
  'Under 18': { subject: 'UNDER_18' },
};

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
        slotProps={{ paper: { role: 'dialog', 'aria-label': VERIFICATION_GUIDE.title, sx: { p: 2.5, maxWidth: 400, width: 'calc(100vw - 32px)', borderRadius: '18px' } } }}
      >
        <Typography component="h2" sx={{ fontFamily: 'var(--ct-font-display, Outfit, sans-serif)', fontWeight: 500, fontSize: 18, color: 'var(--ct-text-primary, #06214A)', mb: 0.5 }}>
          {VERIFICATION_GUIDE.title}
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: 'var(--ct-text-secondary, #445474)', lineHeight: 1.5, mb: 2 }}>{VERIFICATION_GUIDE.intro}</Typography>
        <Stack component="dl" spacing={1.75} sx={{ m: 0 }}>
          {VERIFICATION_GUIDE.items.map(item => {
            const sample = GUIDE_SAMPLE[item.term] || {};
            return (
              <Stack key={item.term} direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={{ pt: 0.25 }}>{sample.subject ? <BadgeGlyph subject={sample.subject} state={sample.state} size={26} /> : null}</Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="dt" sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ct-text-primary, #06214A)' }}>{item.term}</Typography>
                  <Typography component="dd" sx={{ m: 0, mt: 0.25, fontSize: 13, color: 'var(--ct-text-secondary, #445474)', lineHeight: 1.5 }}>{item.text}</Typography>
                </Box>
              </Stack>
            );
          })}
        </Stack>
        <Typography sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary, #445474)', mt: 2 }}>{VERIFICATION_GUIDE.footnote}</Typography>
      </Popover>
    </>
  );
}
