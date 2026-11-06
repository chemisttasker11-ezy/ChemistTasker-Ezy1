import type { UserAvailability, UserAvailabilityPayload } from '@chemisttasker/shared-core';

export type AvailabilityEntry = UserAvailability & { notifyNewShifts?: boolean };
export type AvailabilityDraft = Omit<AvailabilityEntry, 'id'>;
export type AvailabilityPayload = UserAvailabilityPayload & {
  notify_new_shifts?: boolean;
  startTime?: string;
  endTime?: string;
  isAllDay?: boolean;
  isRecurring?: boolean;
  recurringDays?: number[];
  recurringEndDate?: string | null;
  notifyNewShifts?: boolean;
};

export const createEmptyEntry = (): AvailabilityDraft => ({
  date: '', startTime: '09:00', endTime: '17:00', isAllDay: false, isRecurring: false,
  recurringDays: [], recurringEndDate: '', notifyNewShifts: false, notes: '',
});

export const weekDays = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
];

export const radiusOptions = [5, 10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 300, 500, 1000];
export const stateOptions = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

export const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const GOOGLE_LIBRARIES: Array<'places'> = ['places'];

export const DNA = {
  ink: '#06123A', muted: '#5E6B8D', line: '#E5ECF7', blue: '#063BDA',
  violet: '#6D28D9', magenta: '#EA0A8E', cyan: '#08BEEA', mint: '#00A878',
};

export type LocationFormState = {
  streetAddress: string; suburb: string; state: string; postcode: string;
  openToTravel: boolean; travelStates: string[]; latitude: number | null;
  longitude: number | null; googlePlaceId: string; coverageRadiusKm: number;
};

export function normalizeOnboardingRole(role?: string | null): 'pharmacist' | 'other_staff' | 'explorer' | null {
  if (!role) return null;
  const upper = String(role).toUpperCase();
  if (upper === 'PHARMACIST') return 'pharmacist';
  if (upper === 'OTHER_STAFF' || upper === 'OTHERSTAFF') return 'other_staff';
  if (upper === 'EXPLORER') return 'explorer';
  return null;
}

export function toSafeOnboardingRole(role?: string | null): string {
  const norm = normalizeOnboardingRole(role);
  return norm === 'other_staff' ? 'otherstaff' : (norm || String(role || ''));
}

export function isValidIsoDate(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate();
}

export function parseTimeMinutes(timeStr: unknown): number | null {
  if (typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [h, m, s] = [Number(match[1]), Number(match[2]), match[3] !== undefined ? Number(match[3]) : 0];
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;
  return h * 60 + m + s / 60;
}

export function normalizeTime(timeStr: unknown): string {
  if (!timeStr) return '';
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return String(timeStr).slice(0, 5);
  const [h, m, s] = [match[1].padStart(2, '0'), match[2].padStart(2, '0'), match[3]];
  return s && s !== '00' ? `${h}:${m}:${s.padStart(2, '0')}` : `${h}:${m}`;
}

export function validateTimeRange(startTime: string, endTime: string): boolean {
  const [s, e] = [parseTimeMinutes(startTime), parseTimeMinutes(endTime)];
  return s !== null && e !== null && e > s;
}

export function validateAvailabilityDraft(
  draft: AvailabilityDraft,
  selectedDates: readonly string[],
): { valid: boolean; error?: string; datesToAdd: string[] } {
  if (draft.date && !isValidIsoDate(draft.date)) {
    return { valid: false, error: `Invalid date format: ${draft.date}`, datesToAdd: [] };
  }
  const datesToAdd = draft.isRecurring
    ? (draft.date ? [draft.date] : [])
    : (selectedDates.length ? [...selectedDates] : (draft.date ? [draft.date] : []));
  if (!datesToAdd.length) return { valid: false, error: 'Please select a date', datesToAdd: [] };
  for (const d of datesToAdd) {
    if (!isValidIsoDate(d)) return { valid: false, error: `Invalid date format: ${d}`, datesToAdd: [] };
  }
  const [start, end] = [draft.isAllDay ? '00:00' : draft.startTime, draft.isAllDay ? '23:59' : draft.endTime];
  if (!start || !end) return { valid: false, error: 'Please set start and end times', datesToAdd: [] };
  if (parseTimeMinutes(start) === null || parseTimeMinutes(end) === null) {
    return { valid: false, error: 'Invalid time format. Use HH:MM', datesToAdd: [] };
  }
  if (!validateTimeRange(start, end)) return { valid: false, error: 'End must be after start', datesToAdd: [] };
  if (draft.isRecurring) {
    const days = (draft.recurringDays || []).filter((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6);
    if (!days.length) return { valid: false, error: 'Select days for repeat', datesToAdd: [] };
    if (!draft.recurringEndDate) return { valid: false, error: 'Set an end date for repeat', datesToAdd: [] };
    if (!isValidIsoDate(draft.recurringEndDate)) return { valid: false, error: 'Invalid repeat end date', datesToAdd: [] };
    if (draft.recurringEndDate < draft.date) return { valid: false, error: 'Repeat end must be after date', datesToAdd: [] };
  }
  return { valid: true, datesToAdd };
}

export function buildAvailabilityPayloads(
  dates: readonly string[], draft: AvailabilityDraft, notifyNewShifts: boolean,
): AvailabilityPayload[] {
  const isAllDay = Boolean(draft.isAllDay);
  const startTime = isAllDay ? '00:00' : normalizeTime(draft.startTime);
  const endTime = isAllDay ? '23:59' : normalizeTime(draft.endTime);
  const isRecurring = Boolean(draft.isRecurring);
  const recurringDays = isRecurring
    ? (draft.recurringDays || []).filter((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6) : [];
  const recurringEndDate = isRecurring ? draft.recurringEndDate || null : null;
  const notes = draft.notes ?? '';
  return dates.map((date) => ({
    date, start_time: startTime, end_time: endTime, startTime, endTime,
    is_all_day: isAllDay, isAllDay, is_recurring: isRecurring, isRecurring,
    recurring_days: recurringDays, recurringDays, recurring_end_date: recurringEndDate,
    recurringEndDate, notify_new_shifts: notifyNewShifts, notifyNewShifts, notes,
  }));
}

export function availabilitySlotKey(row: Record<string, any>): string {
  const date = String(row.date ?? '').trim();
  const isAllDay = Boolean(row.isAllDay ?? row.is_all_day);
  const start = isAllDay ? '00:00' : normalizeTime(row.startTime ?? row.start_time ?? '');
  const end = isAllDay ? '23:59' : normalizeTime(row.endTime ?? row.end_time ?? '');
  const recurring = Boolean(row.isRecurring ?? row.is_recurring);
  const days = recurring
    ? [...(row.recurringDays ?? row.recurring_days ?? [])].map(Number).filter((d) => !isNaN(d) && d >= 0 && d <= 6).sort((a, b) => a - b).join(',') : '';
  const until = recurring ? String(row.recurringEndDate ?? row.recurring_end_date ?? '').trim() : '';
  const notify = Boolean(row.notifyNewShifts ?? row.notify_new_shifts) ? '1' : '0';
  const notes = String(row.notes ?? '').trim();
  return [date, start, end, isAllDay ? '1' : '0', recurring ? '1' : '0', days, until, notify, notes].join('|');
}

export function unsavedAvailabilityPayloads(
  payloads: readonly AvailabilityPayload[], existing: readonly AvailabilityEntry[],
): AvailabilityPayload[] {
  const persisted = new Set(existing.map((e) => availabilitySlotKey(e)));
  return payloads.filter((p) => !persisted.has(availabilitySlotKey(p)));
}

export function computeMonthAvailabilityDates(
  entries: readonly Record<string, any>[], anchor: Date,
): Set<string> {
  const dates = new Set<string>();
  const [year, month] = [anchor.getFullYear(), anchor.getMonth()];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const [mStart, mEnd] = [`${year}-${String(month + 1).padStart(2, '0')}-01`, `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`];

  entries.forEach((entry) => {
    if (!entry.date) return;
    const isRecurring = Boolean(entry.isRecurring ?? entry.is_recurring);
    const endDate = String(entry.recurringEndDate ?? entry.recurring_end_date ?? '');
    const days = Array.isArray(entry.recurringDays ?? entry.recurring_days) ? (entry.recurringDays ?? entry.recurring_days) : [];
    if (!isRecurring || !endDate || !days.length || !isValidIsoDate(entry.date) || !isValidIsoDate(endDate) || endDate < entry.date) {
      if (isValidIsoDate(entry.date)) dates.add(entry.date);
      return;
    }
    const validDays = new Set(days.filter((d: any) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6));
    if (!validDays.size) {
      if (isValidIsoDate(entry.date)) dates.add(entry.date);
      return;
    }
    const startIso = entry.date > mStart ? entry.date : mStart;
    const endIso = endDate < mEnd ? endDate : mEnd;
    if (startIso <= endIso) {
      for (let day = Number(startIso.split('-')[2]); day <= Number(endIso.split('-')[2]); day += 1) {
        if (validDays.has(new Date(year, month, day).getDay())) {
          dates.add(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        }
      }
    }
  });
  return dates;
}

export function computeMonthRecurringPreviewDates(draft: AvailabilityDraft, anchor: Date): Set<string> {
  const dates = new Set<string>();
  if (!draft.isRecurring || !draft.date || !draft.recurringEndDate || !draft.recurringDays?.length) return dates;
  if (!isValidIsoDate(draft.date) || !isValidIsoDate(draft.recurringEndDate) || draft.recurringEndDate < draft.date) return dates;
  const validDays = new Set(draft.recurringDays.filter((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6));
  if (!validDays.size) return dates;
  const [year, month] = [anchor.getFullYear(), anchor.getMonth()];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const [mStart, mEnd] = [`${year}-${String(month + 1).padStart(2, '0')}-01`, `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`];
  const startIso = draft.date > mStart ? draft.date : mStart;
  const endIso = draft.recurringEndDate < mEnd ? draft.recurringEndDate : mEnd;
  if (startIso <= endIso) {
    for (let day = Number(startIso.split('-')[2]); day <= Number(endIso.split('-')[2]); day += 1) {
      if (validDays.has(new Date(year, month, day).getDay())) {
        dates.add(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
    }
  }
  return dates;
}

export class AvailabilityController {
  private busy = false;
  private generation = 0;
  private accountKey = '';
  private locationDirty = false;

  constructor(initialAccountKey: string = '') { this.accountKey = initialAccountKey; }
  get isBusy(): boolean { return this.busy; }
  get isLocationDirty(): boolean { return this.locationDirty; }
  get currentGeneration(): number { return this.generation; }
  get currentAccountKey(): string { return this.accountKey; }
  markLocationDirty(): void { this.locationDirty = true; }
  clearLocationDirty(): void { this.locationDirty = false; }
  switchAccount(next: string): void { this.generation += 1; this.accountKey = next; this.busy = false; this.locationDirty = false; }
  invalidate(): void { this.generation += 1; this.busy = false; }

  async addSlots(params: {
    draft: AvailabilityDraft; selectedDates: readonly string[]; notifyNewShifts: boolean;
    currentEntries: readonly AvailabilityEntry[];
    createService: (payload: AvailabilityPayload) => Promise<AvailabilityEntry>;
    refreshService: () => Promise<AvailabilityEntry[]>;
    onSuccess: (savedEntries: AvailabilityEntry[], authoritative: AvailabilityEntry[]) => void;
    onPartialRetry: (remainingDates: string[], authoritative: AvailabilityEntry[], savedCount: number, totalCount: number) => void;
    onReconcileFailure: () => void; onAlreadySaved: () => void; onError: (msg: string) => void;
  }): Promise<{ status: string; unresolved?: AvailabilityPayload[] }> {
    if (this.busy) return { status: 'busy' };
    this.busy = true;
    const validation = validateAvailabilityDraft(params.draft, params.selectedDates);
    if (!validation.valid) {
      this.busy = false;
      params.onError(validation.error || 'Invalid availability');
      return { status: 'validation_error' };
    }
    const payloads = buildAvailabilityPayloads(validation.datesToAdd, params.draft, params.notifyNewShifts);
    const remaining = unsavedAvailabilityPayloads(payloads, params.currentEntries);
    if (!remaining.length) {
      this.busy = false;
      params.onAlreadySaved();
      return { status: 'already_saved' };
    }
    const [gen, acct] = [this.generation, this.accountKey];
    try {
      const results = await Promise.allSettled(remaining.map(params.createService));
      if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
      const saved = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      const hadFailure = results.some((r) => r.status === 'rejected');
      let authoritative = [...params.currentEntries, ...saved];
      if (hadFailure) {
        try {
          const refreshed = await params.refreshService();
          if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
          authoritative = refreshed;
          const unresolved = unsavedAvailabilityPayloads(payloads, authoritative);
          if (unresolved.length) {
            const savedCount = payloads.length - unresolved.length;
            params.onPartialRetry(unresolved.map((u) => u.date), authoritative, savedCount, payloads.length);
            return { status: 'partial_success', unresolved };
          }
          params.onSuccess(saved, authoritative);
          return { status: 'success' };
        } catch {
          if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
          params.onReconcileFailure();
          return { status: 'reconcile_failure' };
        }
      }
      params.onSuccess(saved, authoritative);
      return { status: 'success' };
    } catch (err: any) {
      if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
      params.onError(err?.message || 'Failed to save slot');
      return { status: 'error' };
    } finally {
      if (this.generation === gen && this.accountKey === acct) this.busy = false;
    }
  }

  async deleteSlot(params: {
    id: number | string; deleteService: (id: number | string) => Promise<void>;
    onSuccess: () => void; onError: (msg: string) => void;
  }): Promise<{ status: string }> {
    if (this.busy) return { status: 'busy' };
    this.busy = true;
    const [gen, acct] = [this.generation, this.accountKey];
    try {
      await params.deleteService(params.id);
      if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
      params.onSuccess();
      return { status: 'success' };
    } catch (err: any) {
      if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
      params.onError(err?.message || 'Failed to delete slot');
      return { status: 'error' };
    } finally {
      if (this.generation === gen && this.accountKey === acct) this.busy = false;
    }
  }

  async saveLocation(params: {
    form: LocationFormState; onboardingRole: string | null;
    updateService: (role: string, form: any) => Promise<any>;
    onSuccess: () => void; onError: (msg: string) => void;
  }): Promise<{ status: string }> {
    if (this.busy) return { status: 'busy' };
    if (!params.onboardingRole) return { status: 'no_role' };
    this.busy = true;
    const [gen, acct] = [this.generation, this.accountKey];
    const safeRole = toSafeOnboardingRole(params.onboardingRole);
    try {
      const formData = new FormData();
      formData.append('street_address', params.form.streetAddress || '');
      formData.append('suburb', params.form.suburb || '');
      formData.append('state', params.form.state || '');
      formData.append('postcode', params.form.postcode || '');
      formData.append('open_to_travel', params.form.openToTravel ? 'true' : 'false');
      formData.append('travel_states', JSON.stringify(params.form.travelStates || []));
      formData.append('latitude', params.form.latitude == null ? '' : String(params.form.latitude));
      formData.append('longitude', params.form.longitude == null ? '' : String(params.form.longitude));
      formData.append('google_place_id', params.form.googlePlaceId || '');
      formData.append('coverage_radius_km', String(params.form.coverageRadiusKm));
      await params.updateService(safeRole, formData);
      if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
      this.locationDirty = false;
      params.onSuccess();
      return { status: 'success' };
    } catch (err: any) {
      if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
      params.onError(err?.message || 'Failed to update location');
      return { status: 'error' };
    } finally {
      if (this.generation === gen && this.accountKey === acct) this.busy = false;
    }
  }

  async loadInitialLocation(params: {
    onboardingRole: string | null; fetchService: (role: string) => Promise<any>;
    onLoaded: (data: any) => void; onError: () => void;
  }): Promise<{ status: string }> {
    if (!params.onboardingRole) return { status: 'no_role' };
    const [gen, acct] = [this.generation, this.accountKey];
    const safeRole = toSafeOnboardingRole(params.onboardingRole);
    try {
      const data = await params.fetchService(safeRole);
      if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
      if (this.locationDirty) return { status: 'preserved_user_edits' };
      params.onLoaded(data);
      return { status: 'success' };
    } catch {
      if (this.generation !== gen || this.accountKey !== acct) return { status: 'cancelled' };
      params.onError();
      return { status: 'error' };
    }
  }
}
