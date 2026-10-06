import { fetchApi } from './application';
import { buildQuery } from '../utils/serialization';
export interface OperationalOptions {
    method?: string;
    query?: Record<string, unknown>;
    body?: unknown;
}
/** Thin request-shape adapter; HTTP, credentials, refresh and errors live only in client.ts. */
export function operationalRequest<T = unknown>(path: string, { method = 'GET', query, body }: OperationalOptions = {}): Promise<T> {
    return fetchApi<T>(`${path}${buildQuery(query)}`, {
        method,
        ...(body !== undefined ? { body: typeof FormData !== 'undefined' && body instanceof FormData ? body : JSON.stringify(body) } : {}),
    });
}
