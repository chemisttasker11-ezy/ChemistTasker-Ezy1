// Serialize session-dependent requests so rotating refresh tokens cannot race in this tab.
let pending: Promise<unknown> = Promise.resolve();
export function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const execute = async () => {
    const response = await fetch(`/api/hub/${path}`, { method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 204) return undefined as T;
    const data = await response.json();
    if (!response.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : Object.values(data).flat().filter(v => typeof v === 'string').join(' ');
      throw new Error(detail || 'This action could not be completed. Please try again.');
    }
    return data as T;
  };
  const request = pending.then(execute, execute);
  pending = request.catch(() => undefined);
  return request;
}
