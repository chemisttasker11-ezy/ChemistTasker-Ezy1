import { describe, expect, it } from 'vitest';

import {
  canonicalKioskEventJson,
  hashCanonicalKioskEvent,
  kioskRetryDelayMs,
  type KioskSignedEventPayload,
} from './kioskProtocol';

const fixture: KioskSignedEventPayload = {
  protocol_version: 1,
  event_id: 'be1f4b58-2b25-4d04-b59f-5f01421a8fa2',
  device_id: '1a268495-ea9e-4f12-9e8c-c1a18ea782c7',
  device_seq: 7,
  employee_id: 42,
  shift_id: null,
  event_type: 'CLOCK_IN',
  device_timestamp: '2026-09-16T08:00:00+10:00',
  trusted_time_estimate: '2026-09-16T08:00:01+10:00',
  monotonic_elapsed_ms: 12050,
  boot_session_id: 'boot-1',
  previous_event_hash: 'abc123',
};

describe('kiosk protocol', () => {
  it('uses stable alphabetical JSON keys', () => {
    expect(canonicalKioskEventJson(fixture)).toBe(
      '{"boot_session_id":"boot-1","device_id":"1a268495-ea9e-4f12-9e8c-c1a18ea782c7","device_seq":7,"device_timestamp":"2026-09-16T08:00:00+10:00","employee_id":42,"event_id":"be1f4b58-2b25-4d04-b59f-5f01421a8fa2","event_type":"CLOCK_IN","monotonic_elapsed_ms":12050,"previous_event_hash":"abc123","protocol_version":1,"shift_id":null,"trusted_time_estimate":"2026-09-16T08:00:01+10:00"}',
    );
  });

  it('produces a deterministic SHA-256 hash', async () => {
    await expect(hashCanonicalKioskEvent(fixture)).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(hashCanonicalKioskEvent({ ...fixture })).resolves.toBe(
      await hashCanonicalKioskEvent(fixture),
    );
  });

  it('adds bounded jitter to retry delays', () => {
    expect(kioskRetryDelayMs(0, () => 0)).toBe(1600);
    expect(kioskRetryDelayMs(99, () => 1)).toBe(108000);
  });
});
