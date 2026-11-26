import type { CurrentUserApi } from '../../contracts/accounts';
import type { AdminCapability } from '../../constants/capabilities';
import type { AdminLevel } from '../../constants/roles';
import { fetchApi } from '../../transport/application';

export type TwoFactorMethod = 'email' | 'authenticator' | 'backup';

export interface LoginCredentials {
    email: string;
    password: string;
    remember_me?: boolean;
    captcha_token?: string;
    recovery_code?: string;
    device_name?: string;
    trusted_device_token?: string;
}

type SessionPharmacy = { id: number; name: string };
type SessionMembership = { role: string } & (
    | {
        organization_id: number;
        organization_name: string;
        role_label: string;
        admin_level: string;
        admin_level_label: string;
        job_title: string;
        region: string | null;
        pharmacies: SessionPharmacy[];
        organization_pharmacies: SessionPharmacy[];
        capabilities: string[];
    }
    | { pharmacy_id: number; pharmacy_name: string | null; id?: number; employment_type?: string | null }
);

interface LoginSessionUser extends CurrentUserApi {
    mobile_number: string | null;
    memberships: SessionMembership[];
    admin_assignments: {
        id: number;
        pharmacy_id: number;
        pharmacy_name: string | null;
        admin_level: AdminLevel;
        capabilities: AdminCapability[];
        staff_role: string | null;
        job_title: string | null;
        is_active: boolean;
    }[];
}

export interface LoginSession {
    access: string;
    refresh?: string;
    user: LoginSessionUser;
    trusted_device_token?: string;
}

/** The 401 response is available on ApiError.payload. */
export interface TwoFactorChallenge {
    code: 'two_factor_required';
    methods: TwoFactorMethod[];
    challenge_token: string;
}

export interface TwoFactorCode {
    method: TwoFactorMethod;
    code: string;
}

export interface CompleteTwoFactorLogin extends TwoFactorCode {
    challenge_token: string;
    remember_device?: boolean;
}

export interface TwoFactorStatus {
    eligible: boolean;
    enabled: boolean;
    methods: TwoFactorMethod[];
}

export interface DeviceSession {
    sid: string;
    device_label: string;
    client_kind: 'web' | 'native';
    created_at: string;
    last_seen_at: string;
    current: boolean;
}

export interface EmailCodeSent {
    resend_after_seconds: number;
}

export const SESSION_SECURITY_ROUTES = {
    completeTwoFactorLogin: '/users/login/2fa/',
    sendTwoFactorLoginCode: '/users/login/2fa/email/',
    twoFactorStatus: '/users/2fa/',
    startTwoFactorEmail: '/users/2fa/email/start/',
    confirmTwoFactorEmail: '/users/2fa/email/confirm/',
    startAuthenticator: '/users/2fa/authenticator/start/',
    confirmAuthenticator: '/users/2fa/authenticator/confirm/',
    regenerateBackupCodes: '/users/2fa/backup-codes/regenerate/',
    disableTwoFactor: '/users/2fa/disable/',
    deviceSessions: '/users/sessions/',
    revokeDeviceSession: (sid: string) => `/users/sessions/${encodeURIComponent(sid)}/revoke/`,
    revokeAllDeviceSessions: '/users/sessions/revoke-all/',
} as const;

export function completeTwoFactorLogin(payload: CompleteTwoFactorLogin) {
    return fetchApi<LoginSession>(SESSION_SECURITY_ROUTES.completeTwoFactorLogin, {
        method: 'POST', body: payload, skipAuth: true,
    });
}

export function sendTwoFactorLoginCode(challenge_token: string) {
    return fetchApi<EmailCodeSent>(SESSION_SECURITY_ROUTES.sendTwoFactorLoginCode, {
        method: 'POST', body: { challenge_token }, skipAuth: true,
    });
}

function settingsPost<T>(path: string, csrfToken?: string, body?: object) {
    return fetchApi<T>(path, {
        method: 'POST', body,
        headers: csrfToken ? { 'X-CSRFToken': csrfToken, 'X-Client-Platform': 'web' } : undefined,
    });
}

export function getTwoFactorStatus() {
    return fetchApi<TwoFactorStatus>(SESSION_SECURITY_ROUTES.twoFactorStatus);
}

export function startTwoFactorEmail(csrfToken?: string) {
    return settingsPost<EmailCodeSent>(SESSION_SECURITY_ROUTES.startTwoFactorEmail, csrfToken);
}

export function confirmTwoFactorEmail(code: string, csrfToken?: string) {
    return settingsPost<TwoFactorStatus>(SESSION_SECURITY_ROUTES.confirmTwoFactorEmail, csrfToken, { code });
}

export function startAuthenticator(csrfToken?: string) {
    return settingsPost<{ otpauth_uri: string }>(SESSION_SECURITY_ROUTES.startAuthenticator, csrfToken);
}

export function confirmAuthenticator(code: string, csrfToken?: string) {
    return settingsPost<TwoFactorStatus>(SESSION_SECURITY_ROUTES.confirmAuthenticator, csrfToken, { code });
}

export function regenerateBackupCodes(csrfToken?: string) {
    return settingsPost<{ backup_codes: string[] }>(SESSION_SECURITY_ROUTES.regenerateBackupCodes, csrfToken);
}

export function disableTwoFactor(payload: TwoFactorCode & { password: string }, csrfToken?: string) {
    return settingsPost<TwoFactorStatus>(SESSION_SECURITY_ROUTES.disableTwoFactor, csrfToken, payload);
}

export function listDeviceSessions() {
    return fetchApi<DeviceSession[]>(SESSION_SECURITY_ROUTES.deviceSessions);
}

export async function revokeDeviceSession(sid: string, csrfToken?: string): Promise<void> {
    await settingsPost(SESSION_SECURITY_ROUTES.revokeDeviceSession(sid), csrfToken);
}

export async function revokeAllDeviceSessions(csrfToken?: string): Promise<void> {
    await settingsPost(SESSION_SECURITY_ROUTES.revokeAllDeviceSessions, csrfToken);
}
