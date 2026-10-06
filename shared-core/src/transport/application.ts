import { createApiClient, type ApiClient, type ApiClientConfig, type ApiRequestOptions, type ApiRequestPolicy } from './client';
export interface ApplicationApiConfig {
    baseURL: string;
    getToken: NonNullable<ApiClientConfig['getAuthToken']>;
    refreshToken?: ApiClientConfig['refreshAuthToken'];
    onAuthFailure?: ApiClientConfig['onAuthFailure'];
    credentials?: RequestCredentials;
    fetchImpl?: typeof fetch;
}
export interface ApplicationRequestOptions extends ApiRequestOptions {
    skipAuth?: boolean;
}
let application: {
    config: ApplicationApiConfig;
    client: ApiClient;
} | undefined;
/** Browser/native app configuration only. SSR always uses createApiClient per request. */
export function configureApi(configuration: ApplicationApiConfig): void {
    const config = { ...configuration };
    application = { config, client: createApiClient({
            baseUrl: config.baseURL,
            getAuthToken: config.getToken,
            refreshAuthToken: config.refreshToken,
            onAuthFailure: config.onAuthFailure,
            credentials: config.credentials ?? 'include',
            fetchImpl: config.fetchImpl,
        }) };
}
function currentApplication(): NonNullable<typeof application> {
    if (!application)
        throw new Error('API not configured. Call configureApi() first.');
    return application;
}
export function getApiConfig(): Readonly<ApplicationApiConfig> { return currentApplication().config; }
export function performApiRequest(path: string, options: ApplicationRequestOptions = {}, policy: ApiRequestPolicy = {}): Promise<Response> {
    const { skipAuth = false, ...request } = options;
    // Snapshot the instance before any await. Reconfiguration cannot change in-flight credentials.
    return currentApplication().client.response(path, { ...request, auth: !skipAuth }, policy);
}
/** Retain existing application decoding while all HTTP/auth uses client.ts. */
export async function fetchApi<T = unknown>(path: string, options: ApplicationRequestOptions = {}): Promise<T> {
    const response = await performApiRequest(path, options, { jsonContentTypeWithoutBody: true });
    if (response.status === 204 || !response.headers.get('content-type')?.includes('application/json'))
        return {} as T;
    return response.json() as Promise<T>;
}
export async function fetchWithAuth<T = unknown>(path: string, options: ApplicationRequestOptions = {}): Promise<T> {
    const response = await performApiRequest(path, options, {
        jsonContentTypeWithoutBody: true,
        errorMessage: 'Cross-origin authenticated requests are not allowed.',
    });
    return response.status === 204 ? {} as T : response.json() as Promise<T>;
}
