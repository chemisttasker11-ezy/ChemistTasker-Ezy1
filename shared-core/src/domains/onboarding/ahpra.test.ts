import { describe, expect, it, vi } from 'vitest';
import { getOnboardingDetail, updateOnboardingForm, recheckAhpra } from './api';
import { acceptShiftOfferService, expressInterestInPublicShiftService, submitShiftCounterOfferService } from '../shifts/api';
import { configureApi } from '../../transport/application';
import { responseError } from '../../transport/errors';
import { AHPRA_REVIEW_MESSAGE, AHPRA_UNREADABLE_MESSAGE, ahpraCooldownSeconds, ahpraStatusMessage, subscribeAhpraErrors, type AhpraSummary } from './ahpra';
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

  it.each(['ahpra_suspended', 'ahpra_not_found', 'ahpra_rejected', 'ahpra_review', 'ahpra_type_not_accepted', 'ahpra_unreadable', 'ahpra_recheck_cooldown'])('preserves %s and notifies recovery listeners', async code => {
    const listener = vi.fn();
    const unsubscribe = subscribeAhpraErrors(listener);
    try {
      const payload = { code, detail: 'Exact backend message.', retry_after: 52 };
      const error = await responseError(new Response(JSON.stringify(payload), { status: code.endsWith('cooldown') ? 429 : 403 }));
      expect(error.message).toBe(code === 'ahpra_unreadable' ? AHPRA_UNREADABLE_MESSAGE : payload.detail);
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
    const summary: AhpraSummary = { state: 'suspended', frozen: true, attempts: 0, contact_support: false, note: '', registration_status: null,
      registration_type: null, expiry_date: null, checked_at: null, recheck_available_at: null };
    expect(ahpraStatusMessage(summary)).toContain('Your account is paused');
    expect(ahpraStatusMessage({ ...summary, frozen: false })).not.toContain('Your account is paused');
    expect(ahpraStatusMessage({ ...summary, state: 'unreadable', note: 'Unknown register result.' })).toBe(AHPRA_UNREADABLE_MESSAGE);
    expect(ahpraStatusMessage({ ...summary, state: 'not_found' })).toContain('Check your number');
    expect(ahpraStatusMessage({ ...summary, note: 'Exact owner refusal.' })).toBe('Exact owner refusal.');
    expect(ahpraStatusMessage({ ...summary, state: 'ok' })).toBe('');
  });

  it('explains a code-only unreadable public refusal without freezing the user', async () => {
    const error = await responseError(new Response(JSON.stringify({ code: 'ahpra_unreadable' }), { status: 403 }));
    expect(error.code).toBe('ahpra_unreadable');
    expect(error.message).toBe(AHPRA_UNREADABLE_MESSAGE);
    expect(error.payload).toEqual({ code: 'ahpra_unreadable' });
  });

  it('preserves unreadable retry and support fields through API projections', () => {
    const fields = { state: 'unreadable', frozen: false, attempts: 2, contact_support: true };
    expect(normalizeVerification({}, fields)?.ahpra).toMatchObject(fields);
    expect(normalizeVerification({}, { ...fields, contact_support: undefined, contactSupport: true })?.ahpra).toMatchObject(fields);
  });

  it.each(['Non Practising', 'Limited', 'Provisional'])('preserves the backend note and normal cooldown for %s registration', registration_type => {
    const fields = {
      state: 'type_not_accepted', frozen: false, registration_status: 'Registered', registration_type,
      note: `Backend message for ${registration_type}.`, recheck_available_at: '2026-10-19T01:00:00Z',
    };
    const summary = normalizeVerification({}, fields)!.ahpra!;
    expect(summary).toMatchObject(fields);
    expect(ahpraStatusMessage(summary)).toBe(fields.note);
    expect(ahpraCooldownSeconds(summary.recheck_available_at, Date.parse('2026-10-19T00:00:00Z'))).toBe(3600);
  });

  it.each([
    ['interest', () => expressInterestInPublicShiftService({ shiftId: 1, slotId: null })],
    ['counter-offer', () => submitShiftCounterOfferService({ shiftId: 1, slots: [] })],
    ['accept', () => acceptShiftOfferService(1)],
  ] as const)('preserves review and registration type refusal details for public %s', async (_action, submit) => {
    for (const payload of [{ code: 'ahpra_review', detail: AHPRA_REVIEW_MESSAGE },
      { code: 'ahpra_type_not_accepted', detail: 'Exact registration type refusal.' }]) {
      configureApi({ baseURL: 'https://example.test/api/v1/', getToken: () => 'session', fetchImpl: (async () =>
        new Response(JSON.stringify(payload), { status: 403 })) as typeof fetch });
      await expect(submit()).rejects.toMatchObject({ status: 403, code: payload.code, message: payload.detail });
    }
  });

  it('shows the review message, permits hourly recovery and never freezes review', () => {
    const summary = normalizeVerification({}, {
      state: 'review', registration_status: 'Registered', frozen: true,
      note: 'Old status note.', recheck_available_at: '2026-10-20T01:00:00Z',
    })!.ahpra!;
    expect(summary.state).toBe('review');
    expect(summary.frozen).toBe(false);
    expect(ahpraStatusMessage(summary)).toBe(AHPRA_REVIEW_MESSAGE);
    expect(ahpraCooldownSeconds(summary.recheck_available_at, Date.parse('2026-10-20T00:00:00Z'))).toBe(3600);
    expect(ahpraCooldownSeconds(summary.recheck_available_at, Date.parse('2026-10-20T01:00:00Z'))).toBe(0);
  });

  it('counts down without allowing a check early', () => {
    const now = Date.parse('2026-10-19T00:00:00Z');
    expect(ahpraCooldownSeconds('2026-10-19T00:00:01.500Z', now)).toBe(2);
    expect(ahpraCooldownSeconds('2026-10-18T00:00:00Z', now)).toBe(0);
    expect(ahpraCooldownSeconds(null, now)).toBe(0);
  });

  it('keeps employer register status through snake and camel case projections and uses the backend note', () => {
    const summary = normalizeVerification({ badges: [{ code: 'AHPRA', state: 'failed' }] }, {
      state: 'suspended', frozen: true, registrationStatus: 'Suspended', note: 'Please contact AHPRA.',
    });
    expect(summary?.ahpra?.registration_status).toBe('Suspended');
    expect(summary?.ahpra?.frozen).toBe(true);
    expect(normalizeVerification({}, { state: 'suspended', frozen: false })?.ahpra?.frozen).toBe(false);
    expect(verificationRows(summary, 'worker')[0].explainer).toBe('Please contact AHPRA.');
    expect(evidenceExplainer('failed', 'worker', 'AHPRA registration')).not.toContain('Upload');
    expect(evidenceExplainer('failed', 'worker', 'photo ID')).toContain('Upload a clear copy');
  });
});
