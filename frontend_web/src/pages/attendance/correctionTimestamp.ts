import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export function correctionTimestamp(local: string, original: string, timeZone: string): string {
  const format = "YYYY-MM-DDTHH:mm";
  if (dayjs(original).tz(timeZone).format(format) === local) return original;

  // For edited rollback times, choose the earlier occurrence using the offsets on both sides.
  const wallTime = dayjs.utc(local);
  const candidates = [-1, 0, 1].map((days) => {
    const offset = wallTime.add(days, "day").tz(timeZone).utcOffset();
    return wallTime.subtract(offset, "minute");
  }).filter((instant) => instant.tz(timeZone).format(format) === local);
  return candidates.length
    ? dayjs(Math.min(...candidates.map((instant) => instant.valueOf()))).toISOString()
    : dayjs.tz(local, timeZone).toISOString();
}
