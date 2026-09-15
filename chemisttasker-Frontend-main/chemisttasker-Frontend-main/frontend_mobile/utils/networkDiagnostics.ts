import { Platform } from 'react-native';

const MAX_EVENTS = 12;

type DiagnosticEvent = {
  at: string;
  event: string;
  detail?: string;
};

const events: DiagnosticEvent[] = [];

export const networkDiagnosticsEnabled =
  process.env.EXPO_PUBLIC_SHOW_NETWORK_DIAGNOSTICS === 'true';

function safeStringify(value: unknown, maxLength = 500): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function addNetworkDiagnostic(event: string, detail?: unknown) {
  if (!networkDiagnosticsEnabled) return;
  events.unshift({
    at: new Date().toISOString(),
    event,
    detail: safeStringify(detail),
  });
  events.splice(MAX_EVENTS);
}

export function describeRequestError(label: string, error: any) {
  const status = error?.response?.status;
  const code = error?.code;
  const message = error?.message || String(error);
  const baseURL = error?.config?.baseURL;
  const url = error?.config?.url;
  const data = error?.response?.data;
  return [
    `${label}:`,
    `message=${message}`,
    status ? `status=${status}` : null,
    code ? `code=${code}` : null,
    baseURL || url ? `request=${safeStringify(`${baseURL || ''}${url || ''}`, 220)}` : null,
    data ? `data=${safeStringify(data)}` : null,
  ].filter(Boolean).join(' ');
}

export function getNetworkDiagnosticsSnapshot() {
  const pinHashes = (process.env.EXPO_PUBLIC_SSL_PINNED_PUBLIC_KEY_HASHES || '')
    .split(',')
    .map((hash) => hash.trim())
    .filter(Boolean);

  return [
    `platform=${Platform.OS}`,
    `dev=${String(__DEV__)}`,
    `api=${process.env.EXPO_PUBLIC_API_URL || '(missing)'}`,
    `ws=${process.env.EXPO_PUBLIC_WS_URL || '(missing)'}`,
    `pinningEnabled=${process.env.EXPO_PUBLIC_SSL_PINNING_ENABLED ?? '(unset)'}`,
    `pinCount=${pinHashes.length}`,
    ...events.map((item) => `${item.at} ${item.event}${item.detail ? ` ${item.detail}` : ''}`),
  ].join('\n');
}
