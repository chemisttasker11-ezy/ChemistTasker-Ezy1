import type { PharmacyApi } from './organizations';
import type { UserSummaryApi } from '../types';
/** Full membership API, distinct from the privacy-minimized Hub identity projection. */
export interface MembershipRecordApi {
    id: number;
    user?: number | null;
    pharmacy?: number | {
        id: number;
    } | null;
    pharmacy_id?: number | null;
    pharmacy_name?: string | null;
    pharmacy_detail?: PharmacyApi | null;
    user_details?: UserSummaryApi | null;
    email?: string | null;
    name?: string | null;
    invited_name?: string | null;
    role?: string | null;
    employment_type?: string | null;
    job_title?: string | null;
    is_active?: boolean;
    status?: string | null;
    is_pharmacy_owner?: boolean;
    is_pharmacy_admin?: boolean;
    admin_level?: string | null;
    admin_level_label?: string | null;
    admin_level_description?: string | null;
}
export interface MembershipInviteLinkApi {
    id: number;
    token: string;
    url?: string;
    created_at?: string;
    expires_at?: string | null;
}
