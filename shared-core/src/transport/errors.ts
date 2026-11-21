import { AHPRA_UNREADABLE_MESSAGE, reportAhpraError } from '../domains/onboarding/ahpra';
/** Keep public API errors useful without exposing unexpected server internals. */
export class ApiError extends Error {
    readonly code?: string;
    readonly retry_after?: number;
    constructor(message: string, public readonly status: number, public readonly payload: unknown) {
        super(message);
        this.name = 'ApiError';
        const ahpra = reportAhpraError(payload);
        this.code = ahpra?.code;
        this.retry_after = ahpra?.retry_after;
    }
}
function firstMessage(value: unknown, depth = 0): string | undefined {
    if (depth > 12)
        return undefined;
    if (typeof value === 'string' && value.trim())
        return value;
    if (Array.isArray(value)) {
        for (const child of value) {
            const message = firstMessage(child, depth + 1);
            if (message)
                return message;
        }
    }
    else if (value && typeof value === 'object') {
        for (const child of Object.values(value)) {
            const message = firstMessage(child, depth + 1);
            if (message)
                return message;
        }
    }
    return undefined;
}
// DRF's default 404 names the model ("No Shift matches the given query."); users get plain copy.
const DRF_NOT_FOUND = /^No \w+ matches the given query\.$/;
const NOT_FOUND_MESSAGE = "This item isn't available. It may have been removed or you may not have access.";
/** Copy for the marketplace new-listings switch (MARKETPLACE_NEW_LISTINGS_ENABLED off, 503 NEW_LISTINGS_DISABLED). */
export const NEW_LISTINGS_CLOSED = "New listings aren't open yet";
/** The plain copy for a DRF default 404 detail; any other status or message is returned unchanged. */
export function plainNotFoundMessage(status: number | undefined, message: string): string {
    return status === 404 && DRF_NOT_FOUND.test(message) ? NOT_FOUND_MESSAGE : message;
}
export async function responseError(response: Response): Promise<ApiError> {
    const fallback = `Request failed with status ${response.status}`;
    // Do not keep an HTML traceback/raw 5xx body in the error object either; only a known switch-off code is read.
    if (response.status >= 500) {
        const code = response.status === 503 ? ((await response.json().catch(() => null)) as { code?: unknown } | null)?.code : undefined;
        return code === 'NEW_LISTINGS_DISABLED'
            ? new ApiError(NEW_LISTINGS_CLOSED, 503, { code })
            : new ApiError(fallback, response.status, null);
    }
    const payload: unknown = await response.json().catch(() => null);
    const object = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown> : undefined;
    const message = (object?.code === 'ahpra_unreadable' ? AHPRA_UNREADABLE_MESSAGE : undefined) ?? (object?.code === 'ahpra_recheck_cooldown' && !object.detail
        ? 'Please wait before re-checking your AHPRA registration.' : undefined) ?? firstMessage(object?.detail) ?? firstMessage(object?.error) ??
        firstMessage(object?.message) ?? firstMessage(payload) ?? fallback;
    return new ApiError(plainNotFoundMessage(response.status, message), response.status, payload);
}
