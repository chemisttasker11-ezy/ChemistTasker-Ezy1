import { Platform } from 'react-native';
import { addNetworkDiagnostic } from './networkDiagnostics';

type SslPinningInitializer = (config: Record<string, { includeSubdomains?: boolean; publicKeyHashes: string[] }>) => Promise<void>;

const normalizeApiBaseUrl = (value?: string) => {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const PINNING_ENABLED = process.env.EXPO_PUBLIC_SSL_PINNING_ENABLED;
const PUBLIC_KEY_HASHES = (process.env.EXPO_PUBLIC_SSL_PINNED_PUBLIC_KEY_HASHES || '')
  .split(',')
  .map((hash) => hash.trim())
  .filter(Boolean);

let initPromise: Promise<void> | null = null;

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
}

function isPrivateIp(hostname: string): boolean {
  return /^(10\.|127\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(hostname);
}

function shouldEnablePinning(hostname: string, protocol: string): boolean {
  if (Platform.OS === 'web' || __DEV__) {
    addNetworkDiagnostic('ssl-pinning-skip', { reason: 'web-or-dev', platform: Platform.OS, dev: __DEV__ });
    return false;
  }

  // Pinning is release-risky: a stale or incomplete pin set bricks all API calls
  // before the backend can respond. Keep it opt-in only after pins are verified.
  if (PINNING_ENABLED !== 'true') {
    addNetworkDiagnostic('ssl-pinning-skip', { reason: 'not-enabled', value: PINNING_ENABLED ?? '(unset)' });
    return false;
  }

  if (protocol !== 'https:' || isLocalHost(hostname) || isPrivateIp(hostname)) {
    addNetworkDiagnostic('ssl-pinning-skip', { reason: 'non-public-https', hostname, protocol });
    return false;
  }
  const enabled = PUBLIC_KEY_HASHES.length > 0;
  addNetworkDiagnostic(enabled ? 'ssl-pinning-enable' : 'ssl-pinning-skip', {
    reason: enabled ? 'enabled' : 'no-pins',
    hostname,
    pinCount: PUBLIC_KEY_HASHES.length,
  });
  return enabled;
}

export async function initializeMobileSslPinning(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const baseURL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);
    if (!baseURL) {
      addNetworkDiagnostic('ssl-pinning-skip', { reason: 'missing-api-url' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(baseURL);
    } catch {
      addNetworkDiagnostic('ssl-pinning-skip', { reason: 'invalid-api-url', baseURL });
      console.warn('SSL pinning skipped: invalid EXPO_PUBLIC_API_URL');
      return;
    }

    if (!shouldEnablePinning(parsed.hostname, parsed.protocol)) {
      if (!__DEV__ && parsed.protocol === 'https:' && !isLocalHost(parsed.hostname) && !isPrivateIp(parsed.hostname) && PUBLIC_KEY_HASHES.length === 0) {
        console.warn('SSL pinning skipped: EXPO_PUBLIC_SSL_PINNED_PUBLIC_KEY_HASHES is not configured.');
      }
      return;
    }

    try {
      const pinningModule = require('react-native-ssl-public-key-pinning') as {
        initializeSslPinning?: SslPinningInitializer;
      };
      if (typeof pinningModule.initializeSslPinning !== 'function') {
        addNetworkDiagnostic('ssl-pinning-skip', { reason: 'native-module-unavailable' });
        console.warn('SSL pinning skipped: native pinning module is unavailable.');
        return;
      }

      await pinningModule.initializeSslPinning({
        [parsed.hostname]: {
          includeSubdomains: true,
          publicKeyHashes: PUBLIC_KEY_HASHES,
        },
      });
      addNetworkDiagnostic('ssl-pinning-initialized', { hostname: parsed.hostname });
    } catch (error) {
      addNetworkDiagnostic('ssl-pinning-init-error', error instanceof Error ? error.message : String(error));
      console.error('SSL pinning initialization failed', error);
      throw error;
    }
  })();

  return initPromise;
}
