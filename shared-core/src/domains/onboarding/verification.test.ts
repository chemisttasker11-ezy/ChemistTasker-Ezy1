import { describe, expect, it } from 'vitest';
import { normalizeVerification } from './verification';

describe('normalizeVerification with separate AHPRA payloads', () => {
  it('normalizes separate verified AHPRA fixture without inventing synthetic badges', () => {
    const verifiedFixture = {
      verification: {
        verified: true,
        badges: [{ code: 'ID', state: 'verified' as const }],
      },
      ahpra: {
        state: 'ok',
        registration_status: 'Registered',
        registration_type: 'General',
        expiry_date: '2027-11-30',
        frozen: false,
      },
    };

    const result = normalizeVerification(verifiedFixture.verification, verifiedFixture.ahpra);
    expect(result).not.toBeNull();
    expect(result?.verified).toBe(true);
    expect(result?.ahpra).toMatchObject({
      state: 'ok',
      registration_status: 'Registered',
      registration_type: 'General',
      expiry_date: '2027-11-30',
      frozen: false,
    });
    expect(result?.badges).toEqual([{ code: 'ID', state: 'verified' }]);
  });

  it('normalizes separate pending AHPRA fixture with review state and note', () => {
    const pendingFixture = {
      verification: {
        verified: false,
        badges: [],
      },
      ahpra: {
        state: 'review',
        registration_status: null,
        registration_type: null,
        frozen: false,
        note: 'Manual review in progress',
      },
    };

    const result = normalizeVerification(pendingFixture.verification, pendingFixture.ahpra);
    expect(result).not.toBeNull();
    expect(result?.verified).toBe(false);
    expect(result?.ahpra?.state).toBe('review');
    expect(result?.ahpra?.frozen).toBe(false);
    expect(result?.ahpra?.note).toBe('Manual review in progress');
    expect(result?.badges).toEqual([]);
  });

  it('normalizes separate unreadable AHPRA fixture with attempts and support flag', () => {
    const unreadableFixture = {
      verification: {
        verified: false,
        badges: [],
      },
      ahpra: {
        state: 'unreadable',
        registration_status: null,
        registration_type: null,
        frozen: false,
        attempts: 2,
        contact_support: true,
        note: 'Unable to read register',
      },
    };

    const result = normalizeVerification(unreadableFixture.verification, unreadableFixture.ahpra);
    expect(result).not.toBeNull();
    expect(result?.verified).toBe(false);
    expect(result?.ahpra?.state).toBe('unreadable');
    expect(result?.ahpra?.attempts).toBe(2);
    expect(result?.ahpra?.contact_support).toBe(true);
    expect(result?.ahpra?.frozen).toBe(false);
    expect(result?.ahpra?.note).toBe('Unable to read register');
    expect(result?.badges).toEqual([]);
  });

  it('normalizes separate absent AHPRA payload leaving ahpra summary null', () => {
    const absentFixture = {
      verification: {
        verified: false,
        badges: [],
      },
      ahpra: null,
    };

    const result = normalizeVerification(absentFixture.verification, absentFixture.ahpra);
    expect(result).not.toBeNull();
    expect(result?.verified).toBe(false);
    expect(result?.ahpra).toBeNull();
    expect(result?.badges).toEqual([]);
  });

  it('returns null when both verification and ahpra are absent or non-object', () => {
    expect(normalizeVerification(null, null)).toBeNull();
    expect(normalizeVerification(undefined, undefined)).toBeNull();
  });
});
