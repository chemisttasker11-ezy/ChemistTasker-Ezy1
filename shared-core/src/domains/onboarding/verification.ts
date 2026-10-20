import type { AhpraSummary } from './ahpra';
/**
 * Profile verification and evidence badges: the one place for their labels and explanations (Vite, Next, Expo).
 * The backend decides the states (onboarding/verification/policy.py); clients only describe them.
 */
export type EvidenceState = 'verified' | 'pending' | 'not_supplied' | 'failed';
export type BadgeCode = 'AHPRA' | 'AHPRA_PROVISIONAL' | 'QUALIFICATION' | 'DISPENSING' | 'ENROLMENT' | 'ID' | 'REFERENCES' | 'ABN';
export type BadgeAudience = 'employer' | 'worker';
export type BadgeTone = 'success' | 'info' | 'warning' | 'neutral';

export type RequirementCode = 'email' | 'mobile' | 'ahpra' | 'gov_id' | 'referees' | 'role';

export interface VerificationSummary {
  ahpra?: AhpraSummary | null;
  verified: boolean;
  /** What the Verified profile still needs; empty once verified. */
  missing: RequirementCode[];
  badges: { code: BadgeCode; state: EvidenceState }[];
  /** Claimed skills that carry a certificate in the registry; other skills never have a badge. */
  skillEvidence: Record<string, EvidenceState>;
  /** Extra requirements a verified profile must add by graceUntil to stay verified (tightening). */
  outstanding: RequirementCode[];
  /** ISO date, or null when nothing is due. */
  graceUntil: string | null;
  /** Told us they are overseas: a grey label, not a trust badge. */
  overseas: boolean;
  /** Verified without an Australian mobile (overseas newcomer route). */
  mobileWaived: boolean;
  /** Right to work in Australia, as the person told us ('' when not answered). */
  workRights: WorkRights | '';
  /** Under 18: first name only on the talent hub; youth employment rules apply. */
  under18: boolean;
}

export type WorkRights = 'CITIZEN_OR_RESIDENT' | 'VISA' | 'NONE';

/** The work-rights question every worker profile asks (labels match the backend choices). */
export const WORK_RIGHTS_OPTIONS: { value: WorkRights; label: string }[] = [
  { value: 'CITIZEN_OR_RESIDENT', label: 'Australian or New Zealand citizen, or permanent resident' },
  { value: 'VISA', label: 'Visa with work rights' },
  { value: 'NONE', label: 'No work rights in Australia yet' },
];

export interface VerificationRow {
  code: BadgeCode;
  label: string;
  state: EvidenceState;
  stateLabel: string;
  tone: BadgeTone;
  explainer: string;
}

const BADGES: Record<BadgeCode, { label: string; evidence: string; checked: string }> = {
  AHPRA: { label: 'AHPRA registration', evidence: 'AHPRA registration', checked: 'Current general registration confirmed on the AHPRA register.' },
  AHPRA_PROVISIONAL: { label: 'AHPRA provisional registration', evidence: 'AHPRA registration', checked: 'Provisional (intern) registration confirmed on the AHPRA register.' },
  QUALIFICATION: { label: 'Qualification', evidence: 'qualification certificate', checked: 'Qualification certificate checked against their name.' },
  DISPENSING: { label: 'Dispensing qualification', evidence: 'dispensing qualification evidence', checked: 'Dispensing competency (SIRCDIS003 or equivalent) confirmed by our team.' },
  ENROLMENT: { label: 'University enrolment', evidence: 'university ID', checked: 'University ID checked against their name.' },
  ID: { label: 'Photo ID', evidence: 'photo ID', checked: 'Photo ID checked against their name.' },
  REFERENCES: { label: 'References', evidence: 'references', checked: 'Two referees confirmed they worked with this person.' },
  ABN: { label: 'ABN', evidence: 'ABN', checked: 'ABN confirmed on the Australian Business Register.' },
};

const STATE_LABELS: Record<EvidenceState, string> = {
  verified: 'Verified',
  pending: 'Check pending',
  not_supplied: 'Not verified',
  failed: 'Not verified',
};

const STATE_TONES: Record<EvidenceState, BadgeTone> = {
  verified: 'success',
  pending: 'info',
  not_supplied: 'neutral',
  failed: 'warning',
};

export const evidenceStateLabel = (state: EvidenceState) => STATE_LABELS[state];
export const evidenceStateTone = (state: EvidenceState) => STATE_TONES[state];
export const badgeLabel = (code: BadgeCode) => BADGES[code]?.label ?? code;

/** Accepts the API shape (snake_case) or an already camel-cased one; null when the response carries no summary. */
export function normalizeVerification(value: unknown, ahpra?: unknown): VerificationSummary | null {
  if ((!value || typeof value !== 'object') && !ahpra) return null;
  const raw = (value || {}) as Record<string, any>;
  const check = (ahpra ?? raw.ahpra) as Record<string, any> | null | undefined;
  return {
    ahpra: check ? {
      frozen: check.state !== 'review' && Boolean(check.frozen),
      attempts: check.attempts ?? 0,
      contact_support: Boolean(check.contact_support ?? check.contactSupport),
      state: check.state, registration_status: check.registration_status ?? check.registrationStatus ?? null,
      registration_type: check.registration_type ?? check.registrationType ?? null,
      expiry_date: check.expiry_date ?? check.expiryDate ?? null, note: check.note || '',
      checked_at: check.checked_at ?? check.checkedAt ?? null,
      recheck_available_at: check.recheck_available_at ?? check.recheckAvailableAt ?? null,
    } : null,
    verified: Boolean(raw.verified),
    missing: Array.isArray(raw.missing) ? raw.missing : [],
    badges: Array.isArray(raw.badges) ? raw.badges : [],
    skillEvidence: raw.skillEvidence ?? raw.skill_evidence ?? {},
    outstanding: Array.isArray(raw.outstanding) ? raw.outstanding : [],
    graceUntil: raw.graceUntil ?? raw.grace_until ?? null,
    overseas: Boolean(raw.overseas),
    mobileWaived: Boolean(raw.mobileWaived ?? raw.mobile_waived),
    workRights: raw.workRights ?? raw.work_rights ?? '',
    under18: Boolean(raw.under18 ?? raw.under_18),
  };
}

/**
 * Why a badge or certificate skill is in its state, for the person reading it.
 * `evidence` names the thing checked ("certificate" for a skill); `note` is the check's own failure reason.
 */
export function evidenceExplainer(state: EvidenceState, audience: BadgeAudience, evidence = 'certificate', options: { checked?: string; note?: string | null; references?: boolean } = {}): string {
  if (evidence === 'AHPRA registration' && state !== 'verified') {
    return options.note || (state === 'pending' ? 'AHPRA register check pending.' : 'AHPRA registration has not been verified. Check the number on your AHPRA step.');
  }
  if (options.references) {
    if (state === 'verified') return audience === 'worker' ? 'Both of your referees confirmed. Pharmacies see this badge.' : BADGES.REFERENCES.checked;
    if (state === 'pending') return audience === 'worker' ? 'Your referees have been asked. The badge appears when both confirm.' : 'Referees have been asked and have not all confirmed yet.';
    if (state === 'failed') return audience === 'worker' ? 'A referee declined. Add another referee to earn this badge.' : 'A referee declined. References are optional; ask for your own if you need them.';
    return audience === 'worker' ? 'Optional. Add two referees to earn this badge.' : 'No references provided. References are optional on ChemistTasker.';
  }
  if (audience === 'worker') {
    if (state === 'verified') return 'Checked. Pharmacies see this badge on your profile.';
    if (state === 'pending') return `We received your ${evidence} and are checking it. The badge appears once it passes.`;
    if (state === 'failed') return `${options.note || 'The check did not pass.'} Upload a clear copy that shows your full name.`;
    return `You can still apply without it. Upload your ${evidence} to earn the Verified badge; otherwise a pharmacy may check it or ask you to complete verification when you match.`;
  }
  if (state === 'verified') return options.checked || `We checked the ${evidence} against their name.`;
  if (state === 'pending') return `A ${evidence} was supplied and our check is in progress.`;
  if (state === 'failed') return `The ${evidence} supplied did not pass our check. Check it yourself, or ask them to upload a clearer copy.`;
  return `Not verified: no ${evidence} was supplied. Check it yourself, or ask them to complete verification after you match.`;
}

/** Profile badges in display order, each with its label, tone and explanation. */
export function verificationRows(summary: VerificationSummary | null, audience: BadgeAudience): VerificationRow[] {
  return (summary?.badges ?? []).filter(row => BADGES[row.code]).map(({ code, state }) => ({
    code,
    label: BADGES[code].label,
    state,
    stateLabel: STATE_LABELS[state],
    tone: STATE_TONES[state],
    explainer: evidenceExplainer(state, audience, BADGES[code].evidence, { checked: BADGES[code].checked, references: code === 'REFERENCES', note: code === 'AHPRA' || code === 'AHPRA_PROVISIONAL' ? summary?.ahpra?.note : null }),
  }));
}

/** Badge state of one claimed skill; null for skills that never carry a certificate. */
export const skillEvidenceState = (summary: VerificationSummary | null, code: string): EvidenceState | null =>
  summary?.skillEvidence?.[code] ?? null;

/** One line per requirement, for the worker's "To get verified" list. */
export const REQUIREMENT_TEXT: Record<RequirementCode, { title: string; body: string }> = {
  email: { title: 'Confirm your email', body: 'Enter the code we emailed you when you signed up.' },
  mobile: { title: 'Verify your mobile number', body: 'We text you a code. Pharmacies only contact verified numbers.' },
  ahpra: { title: 'AHPRA registration', body: 'Add your AHPRA number. Our team checks it on the public register.' },
  gov_id: { title: 'Photo ID', body: 'Upload photo ID. It is needed because you skipped the Australian mobile check.' },
  referees: { title: 'Two references', body: 'Add two referees and ask them to confirm.' },
  role: { title: 'Choose your role', body: 'Tell us whether you are an assistant, technician, intern or student.' },
};

/** What "Verified profile" means for this person. Overseas newcomers who skipped the Australian mobile check get no
 * claim at all: ChemistTasker does not vouch for overseas profiles (owner decision 2026-10-13). */
export const verifiedProfileExplainer = (role?: string | null, summary?: Pick<VerificationSummary, 'mobileWaived'> | null) =>
  summary?.mobileWaived
    ? 'Overseas profile without an Australian mobile. ChemistTasker does not vouch for overseas profiles: check their identity and work rights yourself.'
    : /PHARMACIST|INTERN/.test(String(role || '').toUpperCase())
      ? 'Email, mobile and AHPRA registration confirmed.'
      : 'Email and mobile confirmed.';

/** "References needed by 1 March 2027 to stay verified", for the worker during a tightening grace period. */
export function outstandingText(summary: VerificationSummary | null): string | null {
  if (!summary?.outstanding.length) return null;
  const items = summary.outstanding.map(code => REQUIREMENT_TEXT[code]?.title ?? code).join(' and ');
  const by = summary.graceUntil ? new Date(`${summary.graceUntil}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  return `${items} needed${by ? ` by ${by}` : ''} to stay verified.`;
}

/** "What do badges mean?": the same guide on every employer screen that shows badges. */
export const VERIFICATION_GUIDE = {
  title: 'What do badges mean?',
  intro: 'Badges show what ChemistTasker has checked. Anything without a badge is the person’s own claim.',
  items: [
    { term: 'Verified profile', tone: 'success' as BadgeTone, text: 'Email and Australian mobile confirmed; pharmacists and interns also have their AHPRA registration checked. One exception: a newcomer based overseas may verify with photo ID instead of a mobile. They carry the Overseas label, and ChemistTasker does not vouch for overseas profiles.' },
    { term: 'Verified', tone: 'success' as BadgeTone, text: 'We checked the evidence: a certificate or ID matched to their name, or registration on the AHPRA register.' },
    { term: 'Check pending', tone: 'info' as BadgeTone, text: 'Evidence was supplied and our check is still in progress.' },
    { term: 'Not verified', tone: 'neutral' as BadgeTone, text: 'Claimed without evidence, or the evidence did not pass. Before relying on it, check it yourself or ask them to complete verification after you match.' },
    { term: 'Overseas', tone: 'neutral' as BadgeTone, text: 'Trained or based overseas, as they told us. A label, not a check: ChemistTasker does not vouch for overseas profiles.' },
    { term: 'No work rights yet', tone: 'neutral' as BadgeTone, text: 'They told us they do not hold the right to work in Australia yet. Check their work rights before you hire.' },
    { term: 'Under 18', tone: 'neutral' as BadgeTone, text: 'From their date of birth. Only their first name is shown; youth employment rules in your state apply.' },
  ],
  footnote: 'Badges come only from ChemistTasker checks, never from employers or reviews.',
};
