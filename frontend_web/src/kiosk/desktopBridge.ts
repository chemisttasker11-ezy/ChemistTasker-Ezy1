type TauriInternals = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export type DesktopKioskStatus = {
  public_signing_key: string;
  paired: boolean;
  installation_id: string | null;
  pharmacy_id: number | null;
  pharmacy_name: string | null;
};

export type OfflineChallenge = {
  payload: {
    expires_at: string;
    pharmacy_id: number;
    device_id: string;
    [key: string]: unknown;
  };
  challenge_hash: string;
  signature: string;
};

export const isDesktopKiosk = () => Boolean(window.__TAURI_INTERNALS__?.invoke);

function invoke<T>(command: string, args?: Record<string, unknown>) {
  const tauri = window.__TAURI_INTERNALS__;
  if (!tauri) throw new Error('Desktop kiosk runtime is unavailable.');
  return tauri.invoke<T>(command, args);
}

export const getDesktopKioskStatus = () => invoke<DesktopKioskStatus>('kiosk_status');

export const pairDesktopKiosk = (input: {
  pairingCode: string;
  deviceName: string;
  apiBaseUrl: string;
  appVersion: string;
}) => invoke<DesktopKioskStatus>('pair_device', {
  pairingCode: input.pairingCode,
  deviceName: input.deviceName,
  apiBaseUrl: input.apiBaseUrl,
  appVersion: input.appVersion,
});

export const generateDesktopChallenge = () =>
  invoke<OfflineChallenge>('generate_offline_challenge');

export const getDesktopPendingCount = () => invoke<number>('pending_count');

export const syncDesktopNow = () => invoke('sync_now');

export const enrolDesktopWorker = (input: {
  employeeId: number;
  identifier: string;
  displayName: string;
  pin: string;
}) => invoke<void>('enrol_worker_credential', {
  employeeId: input.employeeId,
  identifier: input.identifier,
  displayName: input.displayName,
  pin: input.pin,
});

export type OfflinePinResult = {
  action: 'CLOCKED_IN' | 'CLOCKED_OUT';
  worker_id: number;
  worker_name: string;
  event: { event_id: string; device_seq: number; queued: boolean };
};

export const recordDesktopOfflinePin = (identifier: string, pin: string) =>
  invoke<OfflinePinResult>('record_offline_pin_attendance', { identifier, pin });
