// Pure helpers for the worker Homes and shells (pharmacist, other staff, explorer). The node test loads it with
// managerHomeLogic as its only import.
import { slotStart } from './managerHomeLogic';

export type Workspace = 'internal' | 'platform';

/** Tab 3 follows the workspace switch: internal staff get their roster, platform locums their invoices. */
export const workerTab3 = (workspace: string) => (workspace === 'platform' ? 'invoice' : 'roster');

/** Route names that count as the tab-3 root for a workspace (`invoices` is the older alias of `invoice`). */
const tab3Roots = (workspace: string) => (workspace === 'platform' ? ['invoice', 'invoices'] : ['roster']);

/**
 * Where to land when the workspace flips while the old tab-3 screen is open, or null to stay.
 * Only the tab root moves; an inner screen (a draft invoice) and every other tab keep their place.
 */
export function tab3Landing(persona: string, path: string, from: string, to: string): string | null {
  if (from === to || workerTab3(from) === workerTab3(to)) return null;
  const onOldTab = tab3Roots(from).some((name) => path === `/${persona}/${name}`);
  return onOldTab ? `/${persona}/${workerTab3(to)}` : null;
}

type PharmacyLike = {
  name?: string | null;
  streetAddress?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
};

export type BookedShiftLike = {
  id: number;
  pharmacyName?: string | null;
  pharmacyDetail?: PharmacyLike | null;
  roleNeeded?: string | null;
  slots?: Array<{ id?: number | null; date?: string | null; startTime?: string | null; endTime?: string | null }> | null;
};

export type RosterRowLike = {
  id: number;
  shift?: number | null;
  slotDate?: string | null;
  isUnpublished?: boolean | null;
  slotDetail?: { date?: string | null; startTime?: string | null; endTime?: string | null } | null;
  shiftDetail?: { id?: number | null; pharmacyName?: string | null; roleNeeded?: string | null } | null;
};

type AssignmentOwner = { userId?: unknown; user_id?: unknown; user?: unknown; userDetail?: unknown; user_detail?: unknown };

/** The roster endpoint includes colleagues. Match My roster's ID aliases and reject unknown ownership. */
export function ownRosterAssignments<T extends AssignmentOwner>(rows: T[], userId: number | null | undefined): T[] {
  if (userId == null || !Number.isFinite(userId) || userId <= 0) return [];
  return rows.filter((row) => {
    for (const value of [row.userId, row.user_id, row.user, row.userDetail, row.user_detail]) {
      const id = Number(typeof value === 'object' && value ? (value as { id?: unknown }).id : value);
      if (Number.isFinite(id) && id > 0) return id === userId;
    }
    return false;
  });
}

export type WorkerShift = {
  key: string;
  shiftId: number | null;
  /** `roster` rows are internal rostered shifts (My roster); `booked` rows are confirmed shift bookings. */
  source: 'booked' | 'roster';
  pharmacyName: string;
  /** Street address for Directions; roster rows carry only the pharmacy name. */
  address: string;
  role: string;
  date: string;
  startTime: string;
  endTime: string;
  start: Date;
  end: Date;
};

const DAY_MS = 86_400_000;

function endOf(date: string, start: Date, endTime?: string | null): Date {
  const end = slotStart(date, endTime) ?? start;
  // Overnight shifts end the next day.
  return end <= start ? new Date(end.getTime() + DAY_MS) : end;
}

export const addressOf = (pharmacy?: PharmacyLike | null) =>
  [pharmacy?.streetAddress, pharmacy?.suburb, pharmacy?.state, pharmacy?.postcode].filter(Boolean).join(', ');

/** Booked slots (fetchMyConfirmedShifts lists only the caller's own slots) that have not ended, soonest first. */
export function bookedShifts(shifts: BookedShiftLike[], now: Date): WorkerShift[] {
  const rows: WorkerShift[] = [];
  for (const shift of shifts) {
    for (const slot of shift.slots ?? []) {
      const start = slotStart(slot.date, slot.startTime);
      if (!start) continue;
      const end = endOf(String(slot.date), start, slot.endTime);
      if (end <= now) continue;
      rows.push({
        key: `booked-${shift.id}-${slot.id ?? slot.date}`,
        shiftId: shift.id,
        source: 'booked',
        pharmacyName: shift.pharmacyDetail?.name || shift.pharmacyName || 'Pharmacy',
        address: addressOf(shift.pharmacyDetail),
        role: shift.roleNeeded ?? '',
        date: String(slot.date),
        startTime: slot.startTime ?? '',
        endTime: slot.endTime ?? '',
        start,
        end,
      });
    }
  }
  return rows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Rostered shifts that have not ended, soonest first; unpublished drafts are not the worker's yet. */
export function rosterShifts(rows: RosterRowLike[], now: Date): WorkerShift[] {
  const list: WorkerShift[] = [];
  for (const row of rows) {
    if (row.isUnpublished) continue;
    const date = row.slotDate ?? row.slotDetail?.date ?? null;
    const start = slotStart(date, row.slotDetail?.startTime);
    if (!date || !start) continue;
    const end = endOf(date, start, row.slotDetail?.endTime);
    if (end <= now) continue;
    list.push({
      key: `roster-${row.id}`,
      shiftId: row.shiftDetail?.id ?? row.shift ?? null,
      source: 'roster',
      pharmacyName: row.shiftDetail?.pharmacyName || 'Pharmacy',
      address: '',
      role: row.shiftDetail?.roleNeeded ?? '',
      date,
      startTime: row.slotDetail?.startTime ?? '',
      endTime: row.slotDetail?.endTime ?? '',
      start,
      end,
    });
  }
  return list.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** How long before the start the Now card offers Clock in (and how it reads "soon"). */
export const CLOCK_IN_LEAD_HOURS = 2;
/** A shift starting within this many hours, or already running, takes the Now card. */
export const NOW_CARD_HOURS = 12;

export const isRunning = (shift: WorkerShift, now: Date) => shift.start <= now && now < shift.end;
export const canClockIn = (shift: WorkerShift, now: Date) =>
  now < shift.end && shift.start.getTime() - now.getTime() <= CLOCK_IN_LEAD_HOURS * 3_600_000;
export const isSoon = (shift: WorkerShift, now: Date) =>
  now < shift.end && shift.start.getTime() - now.getTime() <= NOW_CARD_HOURS * 3_600_000;

/** "Starts in 45 min", "Starts in 3 h", "On now, until 5pm" is built by the caller from `isRunning`. */
export function startsIn(start: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60_000));
  if (minutes < 1) return 'Starts now';
  if (minutes < 60) return `Starts in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `Starts in ${hours} h`;
}

export type WorkerStepKey = 'retry' | 'clockedIn' | 'soon' | 'payment' | 'profile' | 'upcoming' | 'availability' | 'publish';

const pick = <K extends string>(rows: Array<[K, unknown]>, fallback: K): K => rows.find(([, on]) => Boolean(on))?.[0] ?? fallback;

/**
 * Worker Home next step, first match wins: the shift they are on or about to start, then money waiting on a
 * pharmacy, then profile gaps that block applying, then the next shift further out. Otherwise platform locums
 * publish availability to pharmacies, internal staff set the hours their manager rosters.
 * A failed source takes precedence over any lower-priority step that depends on ruling that source out.
 */
export const workerStep = (t: {
  clockedIn: boolean; soon: boolean; payment: boolean; profile: boolean; upcoming: boolean; platform: boolean;
  clockFailed: boolean; shiftsFailed: boolean; awaitingFailed: boolean; progressFailed: boolean;
}): WorkerStepKey =>
  pick<WorkerStepKey>([['retry', t.clockFailed], ['clockedIn', t.clockedIn], ['retry', t.shiftsFailed],
    ['soon', t.soon], ['retry', t.awaitingFailed], ['payment', t.payment], ['retry', t.progressFailed], ['profile', t.profile],
    ['upcoming', t.upcoming]], t.platform ? 'publish' : 'availability');

export type ExplorerStepKey = 'retry' | 'profile' | 'interests' | 'talent' | 'shifts';

/** Explorer Home: profile, interests, then Talent Board or shifts; retry unknown higher-priority sources first. */
export const explorerStep = (t: {
  profile: boolean; interests: boolean; noPost: boolean; onboardingFailed: boolean; postsFailed: boolean;
}): ExplorerStepKey =>
  pick<ExplorerStepKey>([['retry', t.onboardingFailed], ['profile', t.profile], ['interests', t.interests],
    ['retry', t.postsFailed], ['talent', t.noPost]], 'shifts');

export type ShiftRequestLike = {
  id: number;
  requestedBy?: number | null;
  pharmacyName?: string | null;
  slotDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  status?: string | null;
  createdAt?: string | null;
};
export type LeaveLike = {
  id: number;
  user?: number | null;
  leaveType?: string | null;
  status?: string | null;
  dateApplied?: string | null;
  startAt?: string | null;
  slotDate?: string | null;
  pharmacyName?: string | null;
};

export type RequestRow = {
  key: string;
  kind: 'shift' | 'leave';
  title: string;
  date: string | null;
  dateLabel: string;
  startTime: string;
  endTime: string;
  status: string;
  pharmacyName: string;
  at: string;
};

const STATUS_WORDS: Record<string, string> = {
  PENDING: 'Waiting',
  APPROVED: 'Approved',
  REJECTED: 'Declined',
  AUTO_PUBLISHED: 'Shared with the team',
};
export const requestStatus = (status?: string | null) => STATUS_WORDS[String(status ?? '').toUpperCase()] ?? 'Sent';

/**
 * The worker's own shift and leave requests, newest first. The backend already limits worker-shift-requests to the
 * worker, but /leave-requests/ also lists leave at pharmacies the caller manages, so leave is kept only when it
 * belongs to `userId`; unknown ownership is dropped, never shown.
 */
export function myRequests(shiftRequests: ShiftRequestLike[], leave: LeaveLike[], userId: number | null | undefined): RequestRow[] {
  if (userId == null) return [];
  const rows: RequestRow[] = [
    ...shiftRequests
      .filter((row) => row.requestedBy == null || row.requestedBy === userId)
      .map((row) => ({
        key: `shift-${row.id}`,
        kind: 'shift' as const,
        title: 'Shift request',
        date: row.slotDate ?? null,
        dateLabel: '',
        startTime: row.startTime ?? '',
        endTime: row.endTime ?? '',
        status: requestStatus(row.status),
        pharmacyName: row.pharmacyName ?? '',
        at: row.createdAt ?? row.slotDate ?? '',
      })),
    ...leave
      .filter((row) => row.user === userId)
      .map((row) => ({
        key: `leave-${row.id}`,
        kind: 'leave' as const,
        title: `${leaveWord(row.leaveType)} leave`,
        date: row.startAt ?? row.slotDate ?? row.dateApplied ?? null,
        dateLabel: row.startAt || row.slotDate ? '' : 'Applied ',
        startTime: '',
        endTime: '',
        status: requestStatus(row.status),
        pharmacyName: row.pharmacyName ?? '',
        at: row.dateApplied ?? '',
      })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** "PERSONAL_CARERS" -> "Personal carers". */
function leaveWord(type?: string | null) {
  const words = String(type ?? '').replace(/_/g, ' ').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Your';
}

/** "2026-11-04" for the roster query, in the phone's calendar. */
export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
