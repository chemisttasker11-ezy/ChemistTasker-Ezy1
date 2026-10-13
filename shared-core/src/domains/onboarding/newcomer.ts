/** "New to pharmacy" (role code EXPLORER): the sign-up question, its labels and the minimum age. */
export const NEWCOMER_MINIMUM_AGE = 15;

export const NEWCOMER_TYPES = [
  { value: 'OVERSEAS', label: 'Overseas-qualified', description: 'You trained or worked in pharmacy outside Australia.' },
  { value: 'JUNIOR', label: 'School student or junior', description: 'Still at school, or looking for your first part-time job.' },
  { value: 'STUDENT', label: 'Looking for an internship or placement', description: 'You are studying and need placement hours or an internship.' },
  { value: 'CAREER_SWITCHER', label: 'New to the field', description: 'Pharmacy interests you and you would like to give it a try.' },
] as const;

export type NewcomerType = (typeof NEWCOMER_TYPES)[number]['value'];

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
