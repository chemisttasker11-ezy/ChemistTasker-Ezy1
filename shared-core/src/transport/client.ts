export type MaybePromise<T> = T | Promise<T>;

export type ApiQueryValue = string | number | boolean | null | undefined;
export type ApiQuery = Record<string, ApiQueryValue | ApiQueryValue[]>;

export interface ApiClientConfig {
  /** Base URL ending at the Django /api boundary, e.g. https://chemisttasker.com.au/api. */
  baseUrl: string;
  getAuthToken?: () => MaybePromise<string | null>;
  refreshAuthToken?: () => Promise<string | null>;
  onAuthFailure?: () => MaybePromise<void>;
  fetchImpl?: typeof fetch;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
  query?: ApiQuery;
  auth?: boolean;
  retryAuth?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const ensureLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`);

function withQuery(path: string, query?: ApiQuery): string {
  if (!query) return path;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, raw]) => {
    const values = Array.isArray(raw) ? raw : [raw];
    values.forEach((value) => {
      if (value !== undefined && value !== null) params.append(key, String(value));
    });
  });
  const suffix = params.toString();
  return suffix ? `${path}${path.includes('?') ? '&' : '?'}${suffix}` : path;
}

function isJsonBody(body: ApiRequestOptions['body']): body is Record<string, unknown> | unknown[] {
  if (!body || typeof body !== 'object') return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return false;
  return true;
}

export interface ApiClient {
  request<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T>;
  get<T = unknown>(path: string, query?: ApiQuery, options?: ApiRequestOptions): Promise<T>;
  post<T = unknown>(path: string, body?: ApiRequestOptions['body'], options?: ApiRequestOptions): Promise<T>;
  put<T = unknown>(path: string, body?: ApiRequestOptions['body'], options?: ApiRequestOptions): Promise<T>;
  patch<T = unknown>(path: string, body?: ApiRequestOptions['body'], options?: ApiRequestOptions): Promise<T>;
  delete<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T>;
}

/**
 * Creates an isolated ChemistTasker API client.
 *
 * Use one instance per Next.js server request. React/Expo may keep one instance
 * per application process. This avoids sharing a user's token through module
 * globals during SSR while preserving one transport implementation everywhere.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('A fetch implementation is required');
  const baseUrl = trimTrailingSlash(config.baseUrl);

  const request = async <T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
    const perform = async (tokenOverride?: string | null): Promise<Response> => {
      const headers = new Headers(options.headers ?? {});
      const wantsAuth = options.auth !== false;
      const token = tokenOverride !== undefined
        ? tokenOverride
        : wantsAuth && config.getAuthToken
          ? await config.getAuthToken()
          : null;
      if (wantsAuth && token) headers.set('Authorization', `Bearer ${token}`);

      let body = options.body as BodyInit | null | undefined;
      if (isJsonBody(options.body)) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
      }

      return fetchImpl(`${baseUrl}${withQuery(ensureLeadingSlash(path), options.query)}`, {
        ...options,
        body,
        headers,
      });
    };

    let response = await perform();
    if (
      response.status === 401 &&
      options.auth !== false &&
      options.retryAuth !== false &&
      config.refreshAuthToken
    ) {
      const refreshed = await config.refreshAuthToken();
      if (refreshed) response = await perform(refreshed);
    }

    if (response.status === 401 && config.onAuthFailure) await config.onAuthFailure();
    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get('content-type') ?? '';
    const payload: unknown = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'detail' in payload
          ? String((payload as { detail?: unknown }).detail ?? response.statusText)
          : response.statusText || `HTTP ${response.status}`;
      throw new ApiError(message, response.status, payload);
    }
    return payload as T;
  };

  return {
    request,
    get: (path, query, options = {}) => request(path, { ...options, method: 'GET', query }),
    post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
  };
}
