// Pure helpers for the manager Homes (owner, organization, admin). No runtime imports, so the node test can load it.

/** Activity actions use the same shift and Hub rights as Home and More. */
export function canOpenManagerActivity(route: string, can: { roster: boolean; comms: boolean }) {
  const path = route.split(/[?#]/)[0];
  if (/^\/(admin|organization)\/shifts(?:\/|$)/.test(path)) return can.roster;
  if (/^\/(admin|organization)\/hub(?:\/|$)/.test(path)) return can.comms;
  return true;
}

export type SlotLike = {
  id?: number | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  awaitingPayment?: boolean | null;
};

export type ShiftLike = {
  id: number;
  pharmacy?: number | null;
  pharmacyId?: number | null;
  pharmacyName?: string | null;
  pharmacyDetail?: { id?: number | null; name?: string | null } | null;
  roleNeeded?: string | null;
  roleLabel?: string | null;
  slots?: SlotLike[] | null;
  slotAssignments?: Array<{
    slotId?: number | null;
    user?: { name?: string | null; firstName?: string | null; lastName?: string | null; profilePhotoUrl?: string | null; profilePhoto?: string | null } | null;
  }> | null;
};

export type Occurrence = {
  shiftId: number;
  pharmacyId: number | null;
  pharmacyName: string;
  role: string;
  date: string;
  startTime: string;
  endTime: string;
  start: Date;
};

export type Cover = Occurrence & { name: string; photoUrl?: string | null };

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// shortcut: slot times are read in the phone's timezone, not the pharmacy's; fine while both are the same state.
export function slotStart(date?: string | null, time?: string | null): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!d) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
}

function slotEnd(slot: SlotLike, start: Date): Date {
  const end = slotStart(slot.date, slot.endTime) ?? start;
  // Overnight slots end the next day.
  return end <= start ? new Date(end.getTime() + DAY_MS) : end;
}

export function pharmacyOf(shift: ShiftLike): { id: number | null; name: string } {
  const id = shift.pharmacyId ?? shift.pharmacy ?? shift.pharmacyDetail?.id ?? null;
  return { id: id == null ? null : Number(id), name: shift.pharmacyName || shift.pharmacyDetail?.name || 'Pharmacy' };
}

function occurrence(shift: ShiftLike, slot: SlotLike, start: Date): Occurrence {
  const pharmacy = pharmacyOf(shift);
  return {
    shiftId: shift.id,
    pharmacyId: pharmacy.id,
    pharmacyName: pharmacy.name,
    role: shift.roleLabel || shift.roleNeeded || '',
    date: String(slot.date),
    startTime: slot.startTime ?? '',
    endTime: slot.endTime ?? '',
    start,
  };
}

const byStart = (a: Occurrence, b: Occurrence) => a.start.getTime() - b.start.getTime();

/** Future slots nobody is booked for and no payment is pending on, soonest first. */
export function openSlots(shifts: ShiftLike[], now: Date, pharmacyId?: number | null): Occurrence[] {
  const rows: Occurrence[] = [];
  for (const shift of shifts) {
    if (pharmacyId != null && pharmacyOf(shift).id !== pharmacyId) continue;
    // shortcut: assignments carry slot_id only, so a recurring slot booked on one date reads as filled; upgrade when the API sends slot_date.
    const booked = new Set((shift.slotAssignments ?? []).map((row) => row.slotId));
    for (const slot of shift.slots ?? []) {
      const start = slotStart(slot.date, slot.startTime);
      if (!start || slotEnd(slot, start) <= now || booked.has(slot.id) || slot.awaitingPayment) continue;
      rows.push(occurrence(shift, slot, start));
    }
  }
  return rows.sort(byStart);
}

export function personName(user?: { name?: string | null; firstName?: string | null; lastName?: string | null } | null): string {
  const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return full || user?.name?.trim() || 'Booked';
}

/** Who is booked from now until `days` ahead: one row per person per slot, soonest first. */
export function weekCover(shifts: ShiftLike[], now: Date, days = 7, pharmacyId?: number | null): Cover[] {
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const rows: Cover[] = [];
  for (const shift of shifts) {
    if (pharmacyId != null && pharmacyOf(shift).id !== pharmacyId) continue;
    const slots = new Map((shift.slots ?? []).map((slot) => [slot.id, slot]));
    for (const assignment of shift.slotAssignments ?? []) {
      const slot = slots.get(assignment.slotId);
      const start = slot ? slotStart(slot.date, slot.startTime) : null;
      if (!slot || !start || slotEnd(slot, start) <= now || start >= until) continue;
      rows.push({ ...occurrence(shift, slot, start), name: personName(assignment.user), photoUrl: assignment.user?.profilePhotoUrl ?? assignment.user?.profilePhoto });
    }
  }
  return rows.sort(byStart);
}

export type PharmacyGap = { id: number; name: string; open: number; next: Occurrence | null };

/** One row per pharmacy, the most open slots first, then by name. */
export function pharmacyGaps(pharmacies: Array<{ id: number; name: string }>, open: Occurrence[]): PharmacyGap[] {
  return pharmacies
    .map((pharmacy) => {
      const mine = open.filter((row) => row.pharmacyId === pharmacy.id);
      return { id: pharmacy.id, name: pharmacy.name, open: mine.length, next: mine[0] ?? null };
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

/** Timesheets a manager acts on: checks to resolve, or hours sent for approval. */
export const needsManager = (status?: string | null) => ['NEEDS_REVIEW', 'SUBMITTED'].includes(String(status ?? '').toUpperCase());

/** Applications still waiting on the poster: every interest plus counter-offers nobody has answered. */
export const applicantCount = (interests: unknown[], counterOffers: Array<{ status?: string | null }>) =>
  interests.length + counterOffers.filter((offer) => !offer.status || String(offer.status).toUpperCase() === 'PENDING').length;

/** The next-step card: the first candidate that applies wins. */
export function firstStep<T>(...candidates: Array<T | null | undefined | false>): T | null {
  return (candidates.find(Boolean) as T | undefined) ?? null;
}

export type StepKey =
  | 'setup' | 'invitations' | 'payment' | 'applicants' | 'gap' | 'attendance' | 'timesheets' | 'post'
  | 'pharmacies' | 'invite' | 'hub' | 'chat' | 'profile';

const pick = (rows: Array<[StepKey, unknown]>, fallback: StepKey): StepKey => rows.find(([, on]) => Boolean(on))?.[0] ?? fallback;

/** Owner Home: setup, then money and people waiting on the owner, then cover; always ends on Post a shift. */
export const ownerStep = (t: {
  setup: boolean; invitations: boolean; payment: boolean; applicants: boolean; urgentGap: boolean; attendance: boolean; timesheets: boolean;
}): StepKey =>
  pick([['setup', t.setup], ['invitations', t.invitations], ['payment', t.payment], ['applicants', t.applicants],
    ['gap', t.urgentGap], ['attendance', t.attendance], ['timesheets', t.timesheets]], 'post');

/** Organization Home: every step behind the web capability that opens its screen; a member without roster rights still gets one. */
export const organizationStep = (t: {
  invitations: boolean; applicants: boolean; gap: boolean; attendance: boolean; timesheets: boolean;
  can: { roster: boolean; attendance: boolean; pharmacies: boolean; invite: boolean; comms: boolean };
}): StepKey =>
  pick([['invitations', t.invitations], ['applicants', t.can.roster && t.applicants], ['gap', t.can.roster && t.gap],
    ['attendance', t.can.attendance && t.attendance], ['timesheets', t.can.roster && t.timesheets], ['post', t.can.roster],
    ['pharmacies', t.can.pharmacies], ['invite', t.can.invite], ['chat', t.can.comms]], 'profile');

/** Admin Home, for the active pharmacy's capabilities: attendance first while the day is fresh, then cover. */
export const adminStep = (t: {
  invitations: boolean; attendance: boolean; gap: boolean; timesheets: boolean;
  can: { roster: boolean; attendance: boolean; comms: boolean };
}): StepKey =>
  pick([['invitations', t.invitations], ['attendance', t.can.attendance && t.attendance], ['gap', t.can.roster && t.gap],
    ['timesheets', t.can.roster && t.timesheets], ['post', t.can.roster], ['hub', t.can.comms]], 'chat');

export function formatDay(date: Date, now: Date): string {
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      DAY_MS,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "09:00:00" -> "9am", "13:30" -> "1:30pm". */
export function formatTime(time?: string | null): string {
  const t = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!t) return '';
  const hour = Number(t[1]);
  const h12 = hour % 12 || 12;
  return `${h12}${t[2] === '00' ? '' : `:${t[2]}`}${hour < 12 ? 'am' : 'pm'}`;
}

export const timeRange = (start?: string | null, end?: string | null) =>
  [formatTime(start), formatTime(end)].filter(Boolean).join('-');

export const hoursUntil = (start: Date, now: Date) => (start.getTime() - now.getTime()) / 3_600_000;

/** "PHARMACY_ASSISTANT" -> "Pharmacy assistant". */
export const roleWord = (role?: string | null) => {
  const words = String(role ?? '').replace(/_/g, ' ').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
};

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
