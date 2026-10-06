/** Keep public API errors useful without exposing unexpected server internals. */
export class ApiError extends Error {
    constructor(message: string, public readonly status: number, public readonly payload: unknown) {
        super(message);
        this.name = 'ApiError';
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
export async function responseError(response: Response): Promise<ApiError> {
    const fallback = `Request failed with status ${response.status}`;
    // Do not keep an HTML traceback/raw 5xx body in the error object either.
    if (response.status >= 500)
        return new ApiError(fallback, response.status, null);
    const payload: unknown = await response.json().catch(() => null);
    const object = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown> : undefined;
    const message = firstMessage(object?.detail) ?? firstMessage(object?.error) ??
        firstMessage(object?.message) ?? firstMessage(payload) ?? fallback;
    return new ApiError(message, response.status, payload);
}
