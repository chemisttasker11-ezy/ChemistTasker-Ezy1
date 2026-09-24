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

export const isDesktopKiosk = () => Boolean(window.__TAURI_INTERNALS__?.invoke);

function invoke<T>(command: string, args?: Record<string, unknown>) {
  const tauri = window.__TAURI_INTERNALS__;
  if (!tauri) throw new Error('Desktop kiosk runtime is unavailable.');
  return tauri.invoke<T>(command, args);
}

export const getDesktopKioskStatus = () => invoke<DesktopKioskStatus>('kiosk_status');

export type DesktopKioskQr = {
  qr_token: string;
  expires_at: string;
  pharmacy_id: number;
  pharmacy_name: string;
  refresh_interval_seconds: number;
};

export const getDesktopOnlineQr = () => invoke<DesktopKioskQr>('fetch_online_qr');

export const pairDesktopKiosk = (input: {
  pairingCode: string;
  deviceName: string;
  apiBaseUrl: string;
  appVersion: string;
  dashboardPin: string;
}) => invoke<DesktopKioskStatus>('pair_device', {
  pairingCode: input.pairingCode,
  deviceName: input.deviceName,
  apiBaseUrl: input.apiBaseUrl,
  appVersion: input.appVersion,
  dashboardPin: input.dashboardPin,
});

export const getDesktopPendingCount = () => invoke<number>('pending_count');

export const syncDesktopNow = () => invoke('sync_now');

export type OfflinePinResult = {
  action: 'CLOCKED_IN' | 'CLOCKED_OUT' | 'BREAK_START' | 'BREAK_END';
  worker_id: number;
  worker_name: string;
  event: { event_id: string; device_seq: number; queued: boolean; captured_at: string };
  recovered: boolean;
};

export const prepareDesktopCaptureRequest = (
  identifier: string,
  requestedAction: 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END',
) => invoke<string>('prepare_capture_request', { identifier, requestedAction });

export const confirmDesktopCaptureReceipt = (requestId: string, eventId: string) =>
  invoke<void>('confirm_capture_receipt', { requestId, eventId });

export const captureDesktopPinAttendance = (
  identifier: string,
  pin: string,
  requestedAction: 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END',
  localRequestId: string,
) => invoke<OfflinePinResult>('capture_pin_attendance', {
  identifier,
  pin,
  requestedAction,
  localRequestId,
});
