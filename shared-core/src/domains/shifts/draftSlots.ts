export interface ShiftDraftSlot {
  date: string; startTime: string; endTime: string; isRecurring: boolean;
  recurringDays: number[]; recurringEndDate?: string | null;
}
export interface ShiftDraftOccurrence { date: string; startTime: string; endTime: string; sourceIndex: number }
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

/** Local calendar dates stay dates in every client; do not serialize through UTC. */
export function expandShiftDraftSlots(slots: readonly ShiftDraftSlot[]): ShiftDraftOccurrence[] {
  const result: ShiftDraftOccurrence[] = [];
  slots.forEach((slot, sourceIndex) => {
    const base = new Date(`${slot.date}T12:00:00`);
    if (Number.isNaN(base.getTime())) return;
    const end = slot.isRecurring && slot.recurringEndDate && slot.recurringDays.length ? new Date(`${slot.recurringEndDate}T12:00:00`) : base;
    if (Number.isNaN(end.getTime())) return;
    for (let cursor = base; cursor <= end; cursor = new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1,12)) {
      if (!slot.isRecurring || !slot.recurringDays.length || slot.recurringDays.includes(cursor.getDay())) result.push({ date:iso(cursor),startTime:slot.startTime.slice(0,5),endTime:slot.endTime.slice(0,5),sourceIndex });
    }
  });
  return result.sort((a,b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
}

const normalizedRate = (value?: string | number | null) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value).toFixed(2);

/** Preserve uniform recurrences; materialize dates when rates differ so submitted/returned cards agree. */
export function buildShiftDraftSlotPayload(slots: readonly ShiftDraftSlot[], occurrences: readonly ShiftDraftOccurrence[], rates: readonly { rate?: string | number | null }[]) {
  return slots.flatMap((slot, sourceIndex) => {
    const rows = occurrences.flatMap((occurrence,index) => occurrence.sourceIndex === sourceIndex ? [{...occurrence,rate:normalizedRate(rates[index]?.rate)}] : []);
    const varied = new Set(rows.map(row => row.rate)).size > 1;
    if (slot.isRecurring && varied) return rows.map(row => ({date:row.date,start_time:row.startTime,end_time:row.endTime,rate:row.rate,is_recurring:false,recurring_days:[] as number[],recurring_end_date:null}));
    return [{date:slot.date,start_time:slot.startTime,end_time:slot.endTime,rate:rows[0]?.rate ?? null,is_recurring:slot.isRecurring,recurring_days:slot.isRecurring ? slot.recurringDays : [],recurring_end_date:slot.isRecurring ? slot.recurringEndDate || null : null}];
  });
}

/** Rate rows follow occurrence identity, not an array index that moves when a date is added/removed. */
export function reconcileShiftDraftRateRows<T extends { rate: string }>(previous: readonly ShiftDraftOccurrence[], next: readonly ShiftDraftOccurrence[], rows: readonly T[], empty: () => T): T[] {
  const key = (slot: ShiftDraftOccurrence) => `${slot.date}:${slot.startTime}:${slot.endTime}`;
  const byDate = new Map(previous.map((slot,index) => [key(slot),rows[index]]));
  return next.map(slot => byDate.get(key(slot)) ?? empty());
}
