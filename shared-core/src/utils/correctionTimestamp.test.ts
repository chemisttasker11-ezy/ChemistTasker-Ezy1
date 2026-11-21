import { describe, expect, it } from 'vitest';
import { correctionTimestamp } from './correctionTimestamp';

// Existing Vite conversion semantics are qualification controls. The mobile
// caller is the regression anchor, not the absence of a future shared export.
describe('pharmacy-wall-time attendance correction', () => {
  it('converts Perth 09:00 independently of a Brisbane device clock', () => {
    expect(correctionTimestamp('2026-07-10T09:00', '2026-07-10T00:00:00.000Z', 'Australia/Perth'))
      .toBe('2026-07-10T01:00:00.000Z');
  });

  it('retains the exact original instant, seconds and offset when the wall value is unchanged', () => {
    const original = '2026-07-10T01:00:37+00:00';
    expect(correctionTimestamp('2026-07-10T09:00', original, 'Australia/Perth')).toBe(original);
  });

  it('selects the first Sydney rollback occurrence for an edited ambiguous 02:30', () => {
    expect(correctionTimestamp('2026-04-05T02:30', '2026-04-04T12:00:00.000Z', 'Australia/Sydney'))
      .toBe('2026-04-04T15:30:00.000Z');
  });

  it('uses the existing web forward-normalization policy for a nonexistent spring-forward wall time', () => {
    expect(correctionTimestamp('2026-10-04T02:30', '2026-10-03T12:00:00.000Z', 'Australia/Sydney'))
      .toBe('2026-10-03T16:30:00.000Z');
  });

  it('rejects missing timezone and invalid wall values instead of using the device timezone', () => {
    for (const zone of ['', 'Unknown/Zone']) {
      expect(() => correctionTimestamp('2026-07-10T09:00', '2026-07-10T00:00:00Z', zone)).toThrow();
    }
    for (const value of ['', '2026-02-30T09:00', '2026-07-10T27:00', 'not-a-time']) {
      expect(() => correctionTimestamp(value, '2026-07-10T00:00:00Z', 'Australia/Perth')).toThrow();
    }
  });
});
