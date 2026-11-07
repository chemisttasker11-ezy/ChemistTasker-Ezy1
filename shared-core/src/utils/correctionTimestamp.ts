/**
 * Convert an edited pharmacy-wall-time value to a UTC instant.
 *
 * Preserve an unchanged event instant (including its seconds and original
 * offset). At a daylight-saving rollback choose the earlier occurrence.
 * At a nonexistent spring-forward wall time, retain the old Vite helper's
 * forward-normalisation policy. No device timezone is consulted.
 */
export function correctionTimestamp(local: string, original: string, timeZone: string): string {
  if (!timeZone || !timeZone.trim()) {
    throw new Error('The pharmacy timezone is missing. Reload the attendance timeline.');
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) {
    throw new Error('Enter a valid pharmacy date and time (YYYY-MM-DDTHH:mm).');
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const valid = new Date(wall);
  if (valid.getUTCFullYear() !== year || valid.getUTCMonth() !== month - 1 ||
      valid.getUTCDate() !== day || valid.getUTCHours() !== hour ||
      valid.getUTCMinutes() !== minute) {
    throw new Error('The selected date/time is invalid.');
  }

  // Intl is available on browser and Hermes; no dayjs dependency is added to shared-core.
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  type WallParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
  const parts = (epoch: number): WallParts => Object.fromEntries(
    formatter.formatToParts(new Date(epoch))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as WallParts;
  const wallEpoch = (p: WallParts) =>
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const display = (epoch: number) => {
    const p = parts(epoch);
    const two = (value: number) => String(value).padStart(2, '0');
    return [p.year, two(p.month), two(p.day)].join('-') + 'T' +
      [two(p.hour), two(p.minute)].join(':');
  };

  const originalEpoch = Date.parse(original);
  if (!Number.isFinite(originalEpoch)) {
    throw new Error('The original event time is unavailable. Reload the attendance timeline.');
  }
  if (display(originalEpoch) === local) return original;

  // Sample offsets on both sides of possible transitions, independently of the device zone.
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wall + hours * 3_600_000;
    offsets.add(Math.round((wallEpoch(parts(sample)) - sample) / 60_000));
  }
  const candidates = [...offsets].map((offset) => wall - offset * 60_000);
  const matches = candidates.filter((epoch) => display(epoch) === local);
  if (matches.length) return new Date(Math.min(...matches)).toISOString();

  // A skipped wall time (DST spring forward) resolves to the nearest later
  // valid local wall time, matching dayjs.tz's existing web behaviour.
  const later = candidates
    .map((epoch) => ({ epoch, delta: wallEpoch(parts(epoch)) - wall }))
    .filter((candidate) => candidate.delta > 0)
    .sort((a, b) => a.delta - b.delta || a.epoch - b.epoch);
  if (!later.length) {
    throw new Error('Unable to resolve this time in the pharmacy timezone.');
  }
  return new Date(later[0].epoch).toISOString();
}
