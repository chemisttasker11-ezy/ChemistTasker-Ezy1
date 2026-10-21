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

  it('falls back to friendly message on 500 HTML traceback error across domain operation and consumer interpretation', async () => {
    fetchMock = vi.fn(async () => new Response(
      '<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><pre>Traceback (most recent call last):...</pre></body></html>',
      { status: 500, headers: { 'content-type': 'text/html' } }
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
    expect(caught.status).toBe(500);
    expect(getMembershipErrorMessage(caught, 'Unable to accept membership.')).toBe('Unable to accept membership.');
  });

  it('falls back to friendly message on network failure across domain operation and consumer interpretation', async () => {
    fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
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
    expect(caught).toBeInstanceOf(TypeError);
    expect(getMembershipErrorMessage(caught, 'Unable to accept membership.')).toBe('Unable to accept membership.');
  });
});

describe('getMembershipErrorMessage helper', () => {
  const fallback = 'Something went wrong.';

  it('extracts string detail from Axios error response', () => {
    const error = { response: { status: 400, data: { detail: 'Only active members can access.' } } };
    expect(getMembershipErrorMessage(error, fallback)).toBe('Only active members can access.');
  });

  it('extracts first element from array detail in Axios error response', () => {
    const error = { response: { status: 400, data: { detail: ['Maximum member limit reached.'] } } };
    expect(getMembershipErrorMessage(error, fallback)).toBe('Maximum member limit reached.');
  });

  it('extracts safe message from 4xx ApiError', () => {
    const apiError = new ApiError('User is not verified.', 400, { detail: 'User is not verified.' });
    expect(getMembershipErrorMessage(apiError, fallback)).toBe('User is not verified.');
  });

  it('ignores generic status message and uses fallback or Axios response detail', () => {
    const statusError = {
      message: 'Request failed with status code 403',
      response: { status: 403, data: { detail: 'Forbidden action.' } },
    };
    expect(getMembershipErrorMessage(statusError, fallback)).toBe('Forbidden action.');

    const genericApiError = new ApiError('Request failed with status 400', 400, null);
    expect(getMembershipErrorMessage(genericApiError, fallback)).toBe(fallback);

    const statusOnly = { message: 'Request failed with status 500' };
    expect(getMembershipErrorMessage(statusOnly, fallback)).toBe(fallback);
  });

  it('uses fallback for network TypeError and Error with no HTTP status', () => {
    expect(getMembershipErrorMessage(new TypeError('Failed to fetch'), fallback)).toBe(fallback);
    expect(getMembershipErrorMessage(new Error('Network timeout during membership action.'), fallback)).toBe(fallback);
  });

  it('uses fallback for 5xx ApiError and 5xx Axios responses with HTML/traceback bodies', () => {
    const serverError = new ApiError('Request failed with status 500', 500, null);
    expect(getMembershipErrorMessage(serverError, fallback)).toBe(fallback);

    const tracebackApiError = new ApiError(
      '<!DOCTYPE html><html><body>500 Internal Server Error</body></html>',
      500,
      null
    );
    expect(getMembershipErrorMessage(tracebackApiError, fallback)).toBe(fallback);

    const axios500Html = {
      response: {
        status: 500,
        data: '<html><body>Traceback (most recent call last)...</body></html>',
      },
    };
    expect(getMembershipErrorMessage(axios500Html, fallback)).toBe(fallback);

    const axios500Detail = {
      response: {
        status: 500,
        data: { detail: 'Database connection failed' },
      },
    };
    expect(getMembershipErrorMessage(axios500Detail, fallback)).toBe(fallback);
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
