export const AHPRA_UNREADABLE_MESSAGE = "We couldn't read your AHPRA registration. Please check your number is correct and press Re-check.";
export const AHPRA_REVIEW_MESSAGE = "Your AHPRA registration needs a quick review by our team before you can apply for public shifts. We'll let you know when it's done. If something looks wrong, check your name and registration number, or contact us.";

export interface AhpraSummary {
  state: 'ok' | 'pending' | 'suspended' | 'not_found' | 'unreadable' | 'rejected' | 'type_not_accepted' | 'review';
  frozen: boolean;
  attempts: number;
  contact_support: boolean;
  registration_status: string | null;
  registration_type: string | null;
  expiry_date: string | null;
  note: string;
  checked_at: string | null;
  recheck_available_at: string | null;
}

export type AhpraErrorCode = 'ahpra_suspended' | 'ahpra_not_found' | 'ahpra_rejected' | 'ahpra_review' | 'ahpra_type_not_accepted' | 'ahpra_unreadable' | 'ahpra_recheck_cooldown';
export interface AhpraError { code: AhpraErrorCode; detail?: string; retry_after?: number; frozen?: boolean }
const listeners = new Set<(error: AhpraError) => void>();
export function subscribeAhpraErrors(listener: (error: AhpraError) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Used by both fetch and Axios so a refusal is visible even when a page catches it. */
export function reportAhpraError(payload: unknown): AhpraError | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as AhpraError;
  if (!['ahpra_suspended', 'ahpra_not_found', 'ahpra_rejected', 'ahpra_review', 'ahpra_type_not_accepted', 'ahpra_unreadable', 'ahpra_recheck_cooldown'].includes(value.code)) return null;
  for (const listener of listeners) listener(value);
  return value;
}

export function ahpraCooldownSeconds(availableAt: string | null | undefined, now = Date.now()) {
  const remaining = availableAt ? Math.ceil((Date.parse(availableAt) - now) / 1000) : 0;
  return Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
}

export function ahpraStatusMessage(summary: AhpraSummary) {
  if (summary.state === 'review') return AHPRA_REVIEW_MESSAGE;
  if (summary.state === 'unreadable') return AHPRA_UNREADABLE_MESSAGE;
  return summary.note || (summary.state === 'suspended'
    ? (summary.frozen ? 'Your AHPRA registration is suspended. Your account is paused. Re-check once your registration is restored.' : 'Your AHPRA registration is suspended. You cannot work public shifts as a pharmacist. Re-check once your registration is restored.')
    : summary.state === 'not_found'
      ? 'Your AHPRA registration was not found. Check your number, submit it, then re-check.'
      : '');
}
