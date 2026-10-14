/** "New to pharmacy" (role code EXPLORER): the sign-up question, its labels and the minimum age. */
export const NEWCOMER_MINIMUM_AGE = 15;

export const NEWCOMER_TYPES = [
  { value: 'OVERSEAS', label: 'Overseas-qualified', description: 'You trained or worked in pharmacy outside Australia.' },
  { value: 'JUNIOR', label: 'School student or junior', description: 'Still at school, or looking for your first part-time job.' },
  { value: 'STUDENT', label: 'Looking for an internship or placement', description: 'You are studying and need placement hours or an internship.' },
  { value: 'CAREER_SWITCHER', label: 'New to the field', description: 'Pharmacy interests you and you would like to give it a try.' },
] as const;

export type NewcomerType = (typeof NEWCOMER_TYPES)[number]['value'];

/** UI affordance only; the backend validates who may bypass Australian mobile verification. */
export function canSkipOverseasMobileCheck(user?: {
  role?: string | null;
  newcomer_type?: string | null;
} | null): boolean {
  return String(user?.role || '').toUpperCase() === 'EXPLORER'
    && String(user?.newcomer_type || '').toUpperCase() === 'OVERSEAS';
}

export const newcomerTypeLabel = (value?: string | null) =>
  NEWCOMER_TYPES.find(item => item.value === String(value || '').toUpperCase())?.label ?? null;

/** Whole years between an ISO date of birth (YYYY-MM-DD) and today; null when the date is not valid. */
export function ageFromBirthDate(isoDate: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const birthdayPassed = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  return today.getFullYear() - year - (birthdayPassed ? 0 : 1);
}

/** What upgrading New to pharmacy to a Pharmacist or Pharmacy team account does (backend onboarding/services/upgrade.py).
 * Shown before and in the confirmation, on web and Expo, so the destructive part is never missed. */
export const UPGRADE_COPY = {
  carried: "Your details, photo ID check, work rights answer and references come with you. Your new role's checks then apply: your Australian mobile, and AHPRA registration for pharmacists and interns.",
  postRemoved: 'Your New to pharmacy talent post is removed, with its likes and views. You can post again once your new profile is verified.',
  once: "You can only do this once, and it can't be undone.",
} as const;
