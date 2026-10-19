export interface AhpraSummary {
  state: 'ok' | 'pending' | 'suspended' | 'not_found';
  frozen: boolean;
  registration_status: string | null;
  registration_type: string | null;
  expiry_date: string | null;
  note: string;
  checked_at: string | null;
  recheck_available_at: string | null;
}

export type AhpraErrorCode = 'ahpra_suspended' | 'ahpra_not_found' | 'ahpra_recheck_cooldown';
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
  if (!['ahpra_suspended', 'ahpra_not_found', 'ahpra_recheck_cooldown'].includes(value.code)) return null;
  for (const listener of listeners) listener(value);
  return value;
}

export function ahpraCooldownSeconds(availableAt: string | null | undefined, now = Date.now()) {
  const remaining = availableAt ? Math.ceil((Date.parse(availableAt) - now) / 1000) : 0;
  return Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
}

export function ahpraStatusMessage(summary: AhpraSummary) {
  return summary.note || (summary.state === 'suspended'
    ? 'Your AHPRA registration is suspended. Your account is paused. Re-check once your registration is restored.'
    : summary.state === 'not_found'
      ? 'Your AHPRA registration was not found. Check your number, submit it, then re-check.'
      : '');
}
