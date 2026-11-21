/** Calendar-day parity with the existing web posting form. No instant/timezone conversion for ISO days. */
function isoDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day ? value : null;
}

function dateAsIso(day: Date): string {
  if (!Number.isFinite(day.getTime())) throw new RangeError('Invalid posting date');
  return [String(day.getFullYear()).padStart(4, '0'),
    String(day.getMonth() + 1).padStart(2, '0'),
    String(day.getDate()).padStart(2, '0')].join('-');
}

/** Today through the last day of the fourth calendar month following today, inclusive. */
export function shiftPostingDateWindow(today: Date | string): { minIso: string; maxIso: string } {
  const minIso = typeof today === 'string' ? isoDay(today) : dateAsIso(today);
  if (!minIso) throw new RangeError('Invalid posting date');
  const [year, month] = minIso.split('-').map(Number);
  const maxDate = new Date(Date.UTC(year, month - 1 + 5, 0));
  const maxIso = [maxDate.getUTCFullYear(),
    String(maxDate.getUTCMonth() + 1).padStart(2, '0'),
    String(maxDate.getUTCDate()).padStart(2, '0')].join('-');
  return { minIso, maxIso };
}

/** Split rather than discard dates silently so the native host can explain every refusal. */
export function splitPostableDates(isoDates: readonly string[], today: Date | string): {
  valid: string[]; past: string[]; late: string[];
} {
  const { minIso, maxIso } = shiftPostingDateWindow(today);
  const result: { valid: string[]; past: string[]; late: string[] } = {
    valid: [], past: [], late: [],
  };
  for (const value of Array.from(new Set(isoDates)).sort()) {
    if (!isoDay(value)) continue;
    if (value < minIso) result.past.push(value);
    else if (value > maxIso) result.late.push(value);
    else result.valid.push(value);
  }
  return result;
}
