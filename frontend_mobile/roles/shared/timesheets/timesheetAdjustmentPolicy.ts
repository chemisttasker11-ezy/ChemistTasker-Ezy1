/** Pharmacy-local attendance correction, without dependence on the device timezone. */
export function formatLocalMinute(instant: string, timeZone: string): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid attendance event timestamp.');
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute;
}

function wallTimestamp(local: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const [year, month, day, hour, minute] = [
    Number(local.slice(0, 4)), Number(local.slice(5, 7)),
    Number(local.slice(8, 10)), Number(local.slice(11, 13)),
    Number(local.slice(14, 16)),
  ];
  if (year < 100 || year > 9999) return null;
  const stamp = Date.UTC(year, month - 1, day, hour, minute);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 16) === local ? stamp : null;
}

/**
 * Returns an unambiguous UTC instant or null for an impossible/invalid wall time.
 * Preserves an unchanged original even in the repeated DST hour. For an edited
 * repeated hour, selects the earlier occurrence, matching web correctionTimestamp.
 */
export function resolveAttendanceLocalMinute(local: string, original: string, timeZone: string): string | null {
  const wall = wallTimestamp(local);
  if (wall == null) return null;
  try {
    if (original && formatLocalMinute(original, timeZone) === local) return original;
    const candidateMs = new Set<number>();
    for (const sample of [wall - 86400000, wall, wall + 86400000]) {
      const zonedWall = wallTimestamp(formatLocalMinute(new Date(sample).toISOString(), timeZone));
      if (zonedWall == null) continue;
      const corrected = wall - (zonedWall - sample);
      if (formatLocalMinute(new Date(corrected).toISOString(), timeZone) === local) candidateMs.add(corrected);
    }
    return candidateMs.size ? new Date(Math.min(...candidateMs)).toISOString() : null;
  } catch {
    return null;
  }
}

export type CorrectionOrder = 'start' | 'finish';

/** Order two corrections so intermediate attendance events remain chronological. */
export function correctionOrder(
  newStart: string | null,
  newFinish: string | null,
  currentFinish: string | null,
): CorrectionOrder[] {
  if (!newStart) return newFinish ? ['finish'] : [];
  if (!newFinish) return ['start'];
  const start = Date.parse(newStart);
  const finish = Date.parse(newFinish);
  const oldFinish = currentFinish ? Date.parse(currentFinish) : NaN;
  return start >= oldFinish || finish > oldFinish ? ['finish', 'start'] : ['start', 'finish'];
}

/** Reject invalid chronology, future events and corrections crossing recorded break events. */
export function correctionValidation(
  startInstant: string | null,
  finishInstant: string | null,
  breakInstants: string[],
  now: number = Date.now(),
): string | null {
  const start = startInstant ? Date.parse(startInstant) : null;
  const finish = finishInstant ? Date.parse(finishInstant) : null;
  if ((start != null && !Number.isFinite(start)) || (finish != null && !Number.isFinite(finish))) return 'Invalid attendance time.';
  if (start != null && finish != null && start >= finish) return 'Start must be before finish.';
  if ((start != null && start > now) || (finish != null && finish > now)) return 'Attendance corrections cannot be in the future.';
  for (const instant of breakInstants) {
    const br = Date.parse(instant);
    if (!Number.isFinite(br)) return 'An attendance break has an invalid timestamp.';
    if (start != null && start > br) return 'Start must be before recorded breaks.';
    if (finish != null && finish < br) return 'Finish must be after recorded breaks.';
  }
  return null;
}
