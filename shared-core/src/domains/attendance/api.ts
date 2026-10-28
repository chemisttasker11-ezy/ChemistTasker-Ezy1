import type {
    AttendanceWorkerStatus,
    AttendanceClockResult,
    AttendanceBreakResult,
    AttendancePinPharmacy,
    PendingAttendance,
    AttendanceTimeline,
    PendingKioskReview,
    DecideKioskReviewPayload,
    KioskReviewDecisionResponse,
} from '../../contracts/attendanceRoster';
/** Domain-owned operations extracted from the established shared API. */
import { API_ENDPOINTS } from '../../constants/endpoints';
import { operationalRequest } from '../../transport/operational';
export const attendance = {
    getWorkerStatus: () => operationalRequest<AttendanceWorkerStatus>(API_ENDPOINTS.attendance.workerStatus),
    clockIn: (qrToken: string) => operationalRequest<AttendanceClockResult>(API_ENDPOINTS.attendance.workerClockIn, { method: 'POST', body: { qr_token: qrToken } }),
    breakStart: () => operationalRequest<AttendanceBreakResult>(API_ENDPOINTS.attendance.workerBreakStart, { method: 'POST', body: {} }),
    breakEnd: () => operationalRequest<AttendanceBreakResult>(API_ENDPOINTS.attendance.workerBreakEnd, { method: 'POST', body: {} }),
    clockOut: (qrToken: string) => operationalRequest<AttendanceClockResult>(API_ENDPOINTS.attendance.workerClockOut, { method: 'POST', body: { qr_token: qrToken } }),
    getPinPharmacies: () => operationalRequest<{
        pharmacies: AttendancePinPharmacy[];
    }>(API_ENDPOINTS.attendance.workerPinUpdate),
    updatePin: (pharmacyId: number | string, newPin: string) => operationalRequest(API_ENDPOINTS.attendance.workerPinUpdate, { method: 'POST', body: { pharmacy_id: pharmacyId, new_pin: newPin } }),
    getManagerPending: (pharmacyId: number | string) => operationalRequest<PendingAttendance[]>(API_ENDPOINTS.attendance.managerPending, { query: { pharmacy_id: pharmacyId } }),
    approve: (provisionalId: number | string, reason = '') => operationalRequest(API_ENDPOINTS.attendance.managerApprove, { method: 'POST', body: { provisional_id: provisionalId, reason } }),
    reject: (provisionalId: number | string, reason: string) => operationalRequest(API_ENDPOINTS.attendance.managerReject, { method: 'POST', body: { provisional_id: provisionalId, reason } }),
    correct: (eventId: number | string, correctedTimestamp: string, reason: string) => operationalRequest(API_ENDPOINTS.attendance.managerCorrect, { method: 'POST', body: { event_id: eventId, corrected_timestamp: correctedTimestamp, reason } }),
    getManagerTimeline: (sessionId: number | string) => operationalRequest<AttendanceTimeline>(API_ENDPOINTS.attendance.managerTimeline(sessionId)),
    // Expo's pairing prompt consumes these named operations. The Windows
    // Tauri/Rust kiosk retains its independent device protocol and transport.
    getKioskPairingOptions: () => operationalRequest<{
        pharmacies: Array<{ id: number; name: string; timezone: string }>;
    }>('/attendance/kiosk/pairing/request/', { headers: { 'X-Client-Platform': 'mobile' } }),
    createKioskPairingCode: (pharmacyId: number, deviceName: string) => operationalRequest<{
        pairing_code: string;
        expires_in_seconds: number;
    }>('/attendance/kiosk/pairing/request/', {
        method: 'POST',
        headers: { 'X-Client-Platform': 'mobile' },
        body: { pharmacy_id: pharmacyId, device_name: deviceName },
    }),
    getManagerKioskDevices: (pharmacyId: number | string) => operationalRequest(API_ENDPOINTS.attendance.managerKioskDevices, { query: { pharmacy_id: pharmacyId } }),
    revokeManagerKioskDevice: (deviceId: number | string) => operationalRequest(API_ENDPOINTS.attendance.managerKioskDevices, { method: 'POST', body: { device_id: deviceId } }),
    getManagerPendingKioskReviews: (pharmacyId: number | string) =>
        operationalRequest<PendingKioskReview[]>(API_ENDPOINTS.attendance.managerKioskReviewPending, {
            query: { pharmacy_id: pharmacyId },
        }),
    decideKioskReview: (payload: DecideKioskReviewPayload) =>
        operationalRequest<KioskReviewDecisionResponse>(API_ENDPOINTS.attendance.managerKioskReviewDecide, {
            method: 'POST',
            body: payload,
        }),
};
