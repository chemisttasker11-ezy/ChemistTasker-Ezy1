import type { CamelCasedPropertiesDeep } from '../types';
/** Preserve established adapter query encoding; transport performs URL security checks. */
export function buildQuery(params?: Record<string, unknown> | null): string {
    if (!params)
        return '';
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null)
            return;
        if (Array.isArray(value))
            value.forEach((item) => search.append(key, String(item)));
        else
            search.append(key, String(value));
    });
    const query = search.toString();
    return query ? `?${query}` : '';
}
const camelKeyCache = new Map<string, string>();
const snakeToCamelKey = (key: string): string => {
    if (!key.includes('_'))
        return key;
    const cached = camelKeyCache.get(key);
    if (cached)
        return cached;
    const converted = key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
    camelKeyCache.set(key, converted);
    return converted;
};
const isPlainObject = (value: unknown): value is Record<string, unknown> => !!value &&
    typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) &&
    !(typeof File !== 'undefined' && value instanceof File) &&
    !(typeof Blob !== 'undefined' && value instanceof Blob) &&
    !(typeof FormData !== 'undefined' && value instanceof FormData);
export function camelCaseKeysDeep<T>(input: T): CamelCasedPropertiesDeep<T> {
    const convert = (value: unknown): unknown => {
        if (Array.isArray(value))
            return value.map(convert);
        if (isPlainObject(value)) {
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [snakeToCamelKey(key), convert(item)]));
        }
        return value;
    };
    return convert(input) as CamelCasedPropertiesDeep<T>;
}
export function ensureArray<T>(value: T[] | null | undefined): T[];
export function ensureArray(value: unknown): unknown[];
export function ensureArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export type ApiList<T> = T[] | {
    results?: T[];
    count?: number;
    next?: string | null;
    previous?: string | null;
};
export function asList<T>(data: ApiList<T> | null | undefined): T[] {
    if (Array.isArray(data))
        return data;
    return data && Array.isArray(data.results) ? data.results : [];
}
/** Read every page of a DRF list; callers that need the complete collection must not stop at page 1. */
export async function fetchAllPages<T>(fetchPage: (page: number) => Promise<ApiList<T> | null | undefined>): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 1; ; page += 1) {
        const data = await fetchPage(page);
        rows.push(...asList(data));
        if (!extractNext(data))
            return rows;
    }
}
export function extractNext(data: unknown): string | null {
    if (data && typeof data === 'object' && 'next' in data)
        return (data as {
            next?: string | null;
        }).next ?? null;
    return null;
}
export function toPaginatedList<T, U>(data: ApiList<T>, mapFn: (value: T) => U) {
    const base = data && !Array.isArray(data) ? data : {};
    const results = asList(data).map(mapFn);
    return { count: typeof base.count === 'number' ? base.count : results.length,
        next: base.next ?? null, previous: base.previous ?? null, results };
}
