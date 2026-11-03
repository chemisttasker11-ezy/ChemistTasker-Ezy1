import type { StatusTone } from '@/components/ui/tone';

// First match wins, so "Leave: rejected" and "Evidence pending" pick the tone that needs action.
// Web's claim map is the source for ACCEPTED -> success; whole words only, so "Inactive" and "Unpublished" stay neutral.
const statusTones: Array<[StatusTone, RegExp]> = [
  ['red', /\b(reject\w*|declin\w*|revok\w*|cancell?ed|overdue|error|fail\w*|action (needed|required))\b/i],
  ['amber', /\b(pending|waiting|draft|warning|partially paid)\b/i],
  ['green', /\b(approved|confirmed|accepted|active|paid|ready|acknowledged|admitted)\b/i],
  ['violet', /\b(published|open|selected)\b/i],
];

/** Pill tone for a status word shown in a row. */
export const statusToneFor = (status: string): StatusTone =>
  statusTones.find(([, words]) => words.test(status))?.[0] ?? 'neutral';
