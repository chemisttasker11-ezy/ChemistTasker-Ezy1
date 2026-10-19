import { describe, expect, it, vi } from 'vitest';
import { getOnboardingDetail, updateOnboardingForm, recheckAhpra } from './api';
import { configureApi } from '../../transport/application';
import { responseError } from '../../transport/errors';
import { ahpraCooldownSeconds, ahpraStatusMessage, subscribeAhpraErrors, type AhpraSummary } from './ahpra';
import { evidenceExplainer, normalizeVerification, verificationRows } from './verification';

describe('AHPRA recovery contract', () => {
  it('posts to the recovery endpoint with the current session', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://example.test/api/v1/onboarding/ahpra/recheck/');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer session');
      return new Response('{"queued":true}', { status: 202, headers: { 'content-type': 'application/json' } });
    });
    configureApi({ baseURL: 'https://example.test/api/v1/', getToken: () => 'session', fetchImpl: fetchImpl as typeof fetch });
    await expect(recheckAhpra()).resolves.toEqual({ queued: true });
  });

  it.each(['ahpra_suspended', 'ahpra_not_found', 'ahpra_recheck_cooldown'])('preserves %s and notifies recovery listeners', async code => {
    const listener = vi.fn();
    const unsubscribe = subscribeAhpraErrors(listener);
    try {
      const payload = { code, detail: 'Exact backend message.', retry_after: 52 };
      const error = await responseError(new Response(JSON.stringify(payload), { status: code.endsWith('cooldown') ? 429 : 403 }));
      expect(error.message).toBe(payload.detail);
      expect(error.code).toBe(code);
      expect(error.retry_after).toBe(52);
      expect(listener).toHaveBeenCalledWith(payload);
    } finally { unsubscribe(); }
  });

  it('lets owners load their status and submit a corrected number through onboarding', async () => {
    const summary = { state: 'not_found', note: 'Check your number.' };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://example.test/api/v1/owner/onboarding/me/');
      if (init?.method === 'PATCH') {
        expect((init.body as FormData).get('ahpra_number')).toBe('PHA0001234567');
        expect((init.body as FormData).get('submitted_for_verification')).toBe('true');
      }
      return new Response(JSON.stringify({ ahpra: summary }), { headers: { 'content-type': 'application/json' } });
    });
    configureApi({ baseURL: 'https://example.test/api/v1/', getToken: () => 'owner-session', fetchImpl: fetchImpl as typeof fetch });
    expect((await getOnboardingDetail('owner')).ahpra).toEqual(summary);
    const body = new FormData();
    body.append('ahpra_number', 'PHA0001234567');
    body.append('submitted_for_verification', 'true');
    await updateOnboardingForm('owner', body);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('always explains suspension and missing registration, preserving the backend message', () => {
    const summary: AhpraSummary = { state: 'suspended', note: '', registration_status: null,
      registration_type: null, expiry_date: null, checked_at: null, recheck_available_at: null };
    expect(ahpraStatusMessage(summary)).toContain('Your account is paused');
    expect(ahpraStatusMessage({ ...summary, state: 'not_found' })).toContain('Check your number');
    expect(ahpraStatusMessage({ ...summary, note: 'Exact owner refusal.' })).toBe('Exact owner refusal.');
    expect(ahpraStatusMessage({ ...summary, state: 'ok' })).toBe('');
  });

  it('counts down without allowing a check early', () => {
    const now = Date.parse('2026-10-19T00:00:00Z');
    expect(ahpraCooldownSeconds('2026-10-19T00:00:01.500Z', now)).toBe(2);
    expect(ahpraCooldownSeconds('2026-10-18T00:00:00Z', now)).toBe(0);
    expect(ahpraCooldownSeconds(null, now)).toBe(0);
  });

  it('keeps employer register status through snake and camel case projections and uses the backend note', () => {
    const summary = normalizeVerification({ badges: [{ code: 'AHPRA', state: 'failed' }] }, {
      state: 'suspended', registrationStatus: 'Suspended', note: 'Please contact AHPRA.',
    });
    expect(summary?.ahpra?.registration_status).toBe('Suspended');
    expect(verificationRows(summary, 'worker')[0].explainer).toBe('Please contact AHPRA.');
    expect(evidenceExplainer('failed', 'worker', 'AHPRA registration')).not.toContain('Upload');
    expect(evidenceExplainer('failed', 'worker', 'photo ID')).toContain('Upload a clear copy');
  });
});
