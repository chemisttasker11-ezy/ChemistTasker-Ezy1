import type { ApiQuery } from './client';
/** Resolve once before reading credentials; relative bases are browser-only. */
export function apiUrl(baseUrl: string, path: string, query?: ApiQuery): URL {
    const locationHref = typeof globalThis.location !== 'undefined' ? globalThis.location.href : undefined;
    const base = new URL(`${baseUrl.replace(/\/+$/, '')}/`, locationHref);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
        throw new Error('Invalid API base URL.');
    }
    // Never interpret a protocol-relative URL or backslash as a local API path.
    if (path.startsWith('//') || path.includes('\\'))
        throw new Error('Invalid API path.');
    const target = /^[a-z][a-z\d+.-]*:/i.test(path)
        ? new URL(path)
        : new URL(path.replace(/^\/+/, ''), base);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.origin !== base.origin) {
        throw new Error('Cross-origin authenticated requests are not allowed.');
    }
    target.hash = '';
    Object.entries(query ?? {}).forEach(([key, raw]) => {
        const values = Array.isArray(raw) ? raw : [raw];
        for (const value of values) {
            if (value !== undefined && value !== null)
                target.searchParams.append(key, String(value));
        }
    });
    return target;
}
export function assertAllowedPath(baseUrl: string, target: URL, prefix: string, message?: string): void {
    const allowed = apiUrl(baseUrl, prefix);
    const root = `${allowed.pathname.replace(/\/+$/, '')}/`;
    // Reject encoded separators/dot components too: a downstream proxy may decode them.
    let decoded: string;
    try {
        decoded = decodeURIComponent(target.pathname);
    }
    catch {
        throw new Error(message ?? 'Invalid encoded API path.');
    }
    if (target.origin !== allowed.origin ||
        !(target.pathname === root.slice(0, -1) || target.pathname.startsWith(root)) ||
        decoded.includes('\\') || decoded.split('/').some((part) => part === '.' || part === '..') ||
        /%(?:2f|5c|25)/i.test(target.pathname)) {
        throw new Error(message ?? 'Request is outside the allowed API boundary.');
    }
}
