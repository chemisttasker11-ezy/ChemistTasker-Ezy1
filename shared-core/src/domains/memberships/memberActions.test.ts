import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../transport/client';
import { configureApi } from '../../transport/application';
import { getMyMemberships, respondToMyMembership } from './api';
import { getMembershipErrorMessage } from './errors';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] }), {
    headers: { 'content-type': 'application/json' },
  }));
  configureApi({
    baseURL: 'https://example.test/api/v1',
    getToken: () => 'member-token',
    fetchImpl: fetchMock,
  });
});

describe('Vite and Expo membership decision parity', () => {
  it('retains existing GET listing route and JSON response shape', async () => {
    expect(await getMyMemberships()).toEqual({ results: [] });
    expect((fetchMock.mock.calls[0][0] as URL).pathname).toBe('/api/v1/my-memberships/');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer member-token');
  });

  it.each(['accept', 'reject', 'quit'] as const)('preserves bodyless POST %s route', async action => {
    await respondToMyMembership(123, action);
    const [url, options] = fetchMock.mock.calls.at(-1)!;
    expect((url as URL).pathname).toBe(`/api/v1/my-memberships/123/${action}/`);
    expect(options.method).toBe('POST');
    expect(options.body).toBeUndefined();
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer member-token');
  });

  it('preserves fourth membership 400 explanation across ApiError and consumer interpretation', async () => {
    fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ detail: 'You already belong to 3 pharmacies.' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    ));
    configureApi({
      baseURL: 'https://example.test/api/v1',
      getToken: () => 'member-token',
      fetchImpl: fetchMock,
    });

    let caught: any;
    try {
      await respondToMyMembership(123, 'accept');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.status).toBe(400);
    expect(caught.message).toBe('You already belong to 3 pharmacies.');
    expect(caught.payload).toEqual({ detail: 'You already belong to 3 pharmacies.' });
    expect(getMembershipErrorMessage(caught, 'Unable to accept membership.')).toBe('You already belong to 3 pharmacies.');
  });

  it('preserves owner-quit 400 explanation across ApiError and consumer interpretation', async () => {
    fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ detail: 'Pharmacy owners cannot quit their owner membership.' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    ));
    configureApi({
      baseURL: 'https://example.test/api/v1',
      getToken: () => 'member-token',
      fetchImpl: fetchMock,
    });

    let caught: any;
    try {
      await respondToMyMembership(123, 'quit');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.status).toBe(400);
    expect(caught.message).toBe('Pharmacy owners cannot quit their owner membership.');
    expect(caught.payload).toEqual({ detail: 'Pharmacy owners cannot quit their owner membership.' });
    expect(getMembershipErrorMessage(caught, 'Unable to quit membership.')).toBe('Pharmacy owners cannot quit their owner membership.');
  });

  it('preserves Axios admin-invitation errors and applies fallback when detail is absent', () => {
    const axiosAdminError = {
      response: {
        data: {
          detail: 'This admin invitation has expired.',
        },
      },
    };
    expect(getMembershipErrorMessage(axiosAdminError, 'Unable to respond to this admin invitation.')).toBe('This admin invitation has expired.');

    const emptyError = {};
    expect(getMembershipErrorMessage(emptyError, 'Unable to respond to this admin invitation.')).toBe('Unable to respond to this admin invitation.');
  });
});

describe('getMembershipErrorMessage helper', () => {
  const fallback = 'Something went wrong.';

  it('extracts string detail from Axios error response', () => {
    const error = { response: { data: { detail: 'Only active members can access.' } } };
    expect(getMembershipErrorMessage(error, fallback)).toBe('Only active members can access.');
  });

  it('extracts first element from array detail in Axios error response', () => {
    const error = { response: { data: { detail: ['Maximum member limit reached.'] } } };
    expect(getMembershipErrorMessage(error, fallback)).toBe('Maximum member limit reached.');
  });

  it('extracts string response data from Axios error', () => {
    const error = { response: { data: 'Service unavailable' } };
    expect(getMembershipErrorMessage(error, fallback)).toBe('Service unavailable');
  });

  it('extracts error field from Axios response data', () => {
    const error = { response: { data: { error: 'Invalid invitation token.' } } };
    expect(getMembershipErrorMessage(error, fallback)).toBe('Invalid invitation token.');
  });

  it('extracts message field from Axios response data', () => {
    const error = { response: { data: { message: 'You have already accepted this invite.' } } };
    expect(getMembershipErrorMessage(error, fallback)).toBe('You have already accepted this invite.');
  });

  it('ignores generic status message in error.message and uses fallback or response data', () => {
    const statusError = {
      message: 'Request failed with status code 403',
      response: { data: { detail: 'Forbidden action.' } },
    };
    expect(getMembershipErrorMessage(statusError, fallback)).toBe('Forbidden action.');

    const statusOnly = { message: 'Request failed with status 500' };
    expect(getMembershipErrorMessage(statusOnly, fallback)).toBe(fallback);
  });

  it('extracts custom error.message when not a generic status string', () => {
    const customError = new Error('Network timeout during membership action.');
    expect(getMembershipErrorMessage(customError, fallback)).toBe('Network timeout during membership action.');
  });

  it('extracts detail from SDK payload', () => {
    const sdkError = { payload: { detail: 'User is not verified.' } };
    expect(getMembershipErrorMessage(sdkError, fallback)).toBe('User is not verified.');
  });

  it('extracts error and message from SDK payload', () => {
    expect(getMembershipErrorMessage({ payload: { error: 'Payload error' } }, fallback)).toBe('Payload error');
    expect(getMembershipErrorMessage({ payload: { message: 'Payload message' } }, fallback)).toBe('Payload message');
    expect(getMembershipErrorMessage({ payload: 'Raw string payload' }, fallback)).toBe('Raw string payload');
  });

  it('returns fallback for null, undefined, empty object, or whitespace', () => {
    expect(getMembershipErrorMessage(null, fallback)).toBe(fallback);
    expect(getMembershipErrorMessage(undefined, fallback)).toBe(fallback);
    expect(getMembershipErrorMessage({}, fallback)).toBe(fallback);
    expect(getMembershipErrorMessage({ message: '   ' }, fallback)).toBe(fallback);
    expect(getMembershipErrorMessage({ response: { data: { detail: '   ' } } }, fallback)).toBe(fallback);
    expect(getMembershipErrorMessage({ response: { data: { detail: [] } } }, fallback)).toBe(fallback);
  });
});
