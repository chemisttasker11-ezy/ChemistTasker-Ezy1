// Presentation helpers for shift dates and times returned by the API as
// "YYYY-MM-DD" and "HH:MM[:SS]". They only format; they never shift time zones.

/** "2026-10-14" -> "Wed 14 Oct". Returns the raw value if it cannot be parsed. */
export function formatShiftDate(raw?: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(`${raw.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

/** "08:30:00" -> "08:30". */
export function formatShiftTime(raw?: string | null): string | null {
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : raw;
}

/** "08:30:00", "18:00:00" -> "08:30–18:00"; null unless both ends are known. */
export function formatShiftTimeRange(start?: string | null, end?: string | null): string | null {
  const from = formatShiftTime(start);
  const to = formatShiftTime(end);
  return from && to ? `${from}–${to}` : null;
}
