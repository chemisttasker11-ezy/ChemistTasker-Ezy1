export const KIOSK_PROTOCOL_VERSION = 1 as const;

export type KioskEventType = 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END';

export interface KioskSignedEventPayload {
  protocol_version: typeof KIOSK_PROTOCOL_VERSION;
  event_id: string;
  device_id: string;
  device_seq: number;
  employee_id: number;
  shift_id: number | null;
  event_type: KioskEventType;
  device_timestamp: string;
  trusted_time_estimate: string | null;
  monotonic_elapsed_ms: number;
  boot_session_id: string;
  previous_event_hash: string;
}

export interface KioskSignedEvent extends KioskSignedEventPayload {
  event_hash: string;
  signature: string;
}

export interface KioskSyncResult {
  event_id: string;
  device_seq: number | null;
  result: 'accepted' | 'already_received' | 'rejected' | 'needs_review';
  integrity_flags: string[];
  reason: string | null;
}

export interface KioskSyncResponse {
  device_id: string;
  acknowledged_through: number;
  results: KioskSyncResult[];
  server_time: string;
}

const SIGNED_FIELDS: ReadonlyArray<keyof KioskSignedEventPayload> = [
  'protocol_version',
  'event_id',
  'device_id',
  'device_seq',
  'employee_id',
  'shift_id',
  'event_type',
  'device_timestamp',
  'trusted_time_estimate',
  'monotonic_elapsed_ms',
  'boot_session_id',
  'previous_event_hash',
];

export function canonicalKioskEventPayload(
  event: KioskSignedEventPayload | KioskSignedEvent,
): KioskSignedEventPayload {
  const payload = {} as KioskSignedEventPayload;
  for (const field of SIGNED_FIELDS) {
    (payload as unknown as Record<string, unknown>)[field] = event[field];
  }
  return payload;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

export function canonicalKioskEventJson(
  event: KioskSignedEventPayload | KioskSignedEvent,
): string {
  return JSON.stringify(sortJson(canonicalKioskEventPayload(event)));
}

export async function hashCanonicalKioskEvent(
  event: KioskSignedEventPayload | KioskSignedEvent,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalKioskEventJson(event));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function kioskRetryDelayMs(attempt: number, random: () => number = Math.random): number {
  const baseSeconds = [2, 5, 11, 22, 47, 90][Math.min(Math.max(attempt, 0), 5)];
  const jitter = 0.8 + random() * 0.4;
  return Math.round(baseSeconds * 1000 * jitter);
}
