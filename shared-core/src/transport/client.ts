import { apiUrl, assertAllowedPath } from './urls';
import { responseError } from './errors';
export { ApiError } from './errors';

export type MaybePromise<T> = T | Promise<T>;
export type ApiQueryValue = string | number | boolean | null | undefined;
export type ApiQuery = Record<string, ApiQueryValue | ApiQueryValue[]>;

export interface ApiClientConfig {
  /** Absolute Django API base, or a same-origin browser BFF base. */
  baseUrl: string;
  getAuthToken?: () => MaybePromise<string | null | undefined>;
  getSessionGeneration?: () => number;
  refreshAuthToken?: () => MaybePromise<string | null | undefined>;
  onAuthFailure?: () => MaybePromise<void>;
  credentials?: RequestCredentials;
  fetchImpl?: typeof fetch;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | object | null;
  query?: ApiQuery;
  auth?: boolean;
  retryAuth?: boolean;
}

export interface ApiRequestPolicy {
  /** Finance and other scoped downloads may not escape this path. */
  allowedPathPrefix?: string;
  errorMessage?: string;
  /** Compatibility for Django endpoints historically sent JSON on bodyless reads. */
  jsonContentTypeWithoutBody?: boolean;
}

function isJsonBody(body: ApiRequestOptions['body']): body is object {
  if (!body || typeof body !== 'object') return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) return false;
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return false;
  return true;
}

export interface ApiClient {
  /** The single HTTP engine. Raw response is used for PDFs and compatibility decoding. */
  response(path: string, options?: ApiRequestOptions, policy?: ApiRequestPolicy): Promise<Response>;
  request<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T>;
  get<T = unknown>(path: string, query?: ApiQuery, options?: ApiRequestOptions): Promise<T>;
  post<T = unknown>(path: string, body?: ApiRequestOptions['body'], options?: ApiRequestOptions): Promise<T>;
  put<T = unknown>(path: string, body?: ApiRequestOptions['body'], options?: ApiRequestOptions): Promise<T>;
  patch<T = unknown>(path: string, body?: ApiRequestOptions['body'], options?: ApiRequestOptions): Promise<T>;
  delete<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T>;
}

/**
 * One transport implementation, NOT one global user session.
 * Next SSR creates an instance per request. Vite/Expo retain a per-application
 * instance. Refresh coordination is instance-local; unrelated users never share it.
 */
export function createApiClient(configuration: ApiClientConfig): ApiClient {
  const config = { ...configuration };
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('A fetch implementation is required');
  let refreshInFlight: { generation: number | undefined; promise: Promise<string | null | undefined> } | undefined;
  const refresh = (generation: number | undefined, assertCurrent: () => void): Promise<string | null | undefined> => {
    if (!refreshInFlight || refreshInFlight.generation !== generation) {
      const pending = Promise.resolve().then(() => { assertCurrent(); return config.refreshAuthToken?.(); });
      refreshInFlight = { generation, promise: pending };
      // Use both handlers, not an ignored rejected finally() promise.
      void pending.then(
        () => { if (refreshInFlight?.promise === pending) refreshInFlight = undefined; },
        () => { if (refreshInFlight?.promise === pending) refreshInFlight = undefined; },
      );
    }
    return refreshInFlight.promise;
  };

  const response = async (path: string, options: ApiRequestOptions = {}, policy: ApiRequestPolicy = {}): Promise<Response> => {
    const generation = config.getSessionGeneration?.();
    const auth = options.auth ?? true;
    const assertCurrent = () => {
      if (auth && generation !== config.getSessionGeneration?.()) throw new Error('Session changed during request');
    };
    let url: URL;
    try {
      url = apiUrl(config.baseUrl, path, options.query);
      if (policy.allowedPathPrefix) assertAllowedPath(config.baseUrl, url, policy.allowedPathPrefix, policy.errorMessage);
    } catch (error) {
      if (policy.errorMessage) throw new Error(policy.errorMessage);
      throw error;
    }
    const { auth: _auth, retryAuth = true, query: _query, body: requestBody, ...requestInit } = options;
    const headers = new Headers(options.headers ?? {});
    let body = requestBody as BodyInit | null | undefined;
    const multipart = typeof FormData !== 'undefined' && requestBody instanceof FormData;
    if (isJsonBody(requestBody)) {
      body = JSON.stringify(requestBody);
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    } else if (!multipart && policy.jsonContentTypeWithoutBody && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const send = async (token: string | null | undefined) => {
      assertCurrent();
      const attemptHeaders = new Headers(headers);
      if (auth && token) attemptHeaders.set('Authorization', `Bearer ${token}`);
      if (!auth) attemptHeaders.delete('Authorization');
      return fetchImpl(url, {
        ...requestInit,
        // API consumers must not transparently follow a redirect with credentials.
        redirect: 'error',
        credentials: requestInit.credentials ?? config.credentials,
        body,
        headers: attemptHeaders,
      });
    };
    assertCurrent();
    let result = await send(auth ? await config.getAuthToken?.() : null);
    if (result.status === 401 && auth && retryAuth && config.refreshAuthToken) {
      let refreshed: string | null | undefined;
      assertCurrent();
      try { refreshed = await refresh(generation, assertCurrent); }
      catch (error) {
        assertCurrent();
        if (config.onAuthFailure) await config.onAuthFailure();
        throw error;
      }
      assertCurrent();
      if (refreshed) result = await send(refreshed);
    }
    if (result.status === 401 && auth && config.onAuthFailure) { assertCurrent(); await config.onAuthFailure(); }
    if (!result.ok) throw await responseError(result);
    return result;
  };

  const request = async <T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
    const result = await response(path, options);
    if (result.status === 204) return undefined as T;
    const contentType = result.headers.get('content-type') ?? '';
    const payload: unknown = contentType.includes('application/json') || contentType.includes('+json')
      ? await result.json() : await result.text();
    return payload as T;
  };
  return {
    response, request,
    get: (path, query, options = {}) => request(path, { ...options, method: 'GET', query }),
    post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
  };
}
