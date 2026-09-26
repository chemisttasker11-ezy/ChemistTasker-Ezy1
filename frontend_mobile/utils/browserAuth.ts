/** CSRF token for Expo's browser preview; native requests use bearer tokens. */
export async function getBrowserCsrfToken(baseURL: string): Promise<string> {
  const response = await fetch(`${baseURL}/users/csrf/`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'X-Client-Platform': 'web' },
  });
  if (!response.ok) {
    throw new Error(`Unable to start browser session (${response.status}).`);
  }
  const payload = await response.json();
  if (typeof payload?.csrfToken !== 'string' || !payload.csrfToken) {
    throw new Error('Browser session did not return a CSRF token.');
  }
  return payload.csrfToken;
}
