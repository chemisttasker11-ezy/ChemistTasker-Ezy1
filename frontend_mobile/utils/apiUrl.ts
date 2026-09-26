import { Platform } from 'react-native';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Resolve the configured API base URL for the current runtime.
 *
 * Expo web must use the same loopback hostname as the page so browser cookies
 * remain same-site. Native runtimes keep the configured emulator/device host.
 */
export function resolveApiBaseUrl(value = process.env.EXPO_PUBLIC_API_URL): string {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  const normalized = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return normalized;
  }

  try {
    const apiUrl = new URL(normalized);
    const pageHost = window.location.hostname;
    if (LOOPBACK_HOSTS.has(apiUrl.hostname) && LOOPBACK_HOSTS.has(pageHost)) {
      apiUrl.hostname = pageHost;
      return apiUrl.toString().replace(/\/$/, '');
    }
  } catch {
    // Preserve the configured value so the caller reports its normal URL error.
  }

  return normalized;
}
