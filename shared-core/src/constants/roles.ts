import type { AdminCapability } from './capabilities';

/**
 * Shared role/type constants for owner/admin experiences
 */
export const ORG_ROLES = ['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type Role =
    | 'PHARMACIST'
    | 'TECHNICIAN'
    | 'ASSISTANT'
    | 'INTERN'
    | 'STUDENT'
    | 'CONTACT';

export type WorkType =
    | 'FULL_TIME'
    | 'PART_TIME'
    | 'CASUAL'
    | 'LOCUM'
    | 'SHIFT_HERO'
    | 'CONTACT';

export type UserPortalRole = 'OWNER' | 'PHARMACIST' | 'OTHER_STAFF' | 'EXPLORER';

export type AdminLevel = 'OWNER' | 'MANAGER' | 'ROSTER_MANAGER' | 'COMMUNICATION_MANAGER';

export type AdminStaffRole = 'PHARMACIST' | 'INTERN' | 'TECHNICIAN' | 'ASSISTANT' | 'STUDENT';

export type PharmacyDTO = {
    id: string;
    name: string;
    street_address: string;
    suburb: string;
    state: string;
    postcode: string;
    email?: string | null;
    claimed?: boolean;
    claim_status?: string | null;
    claimStatus?: string | null;
    organization?: number | { id: number; name?: string | null } | null;
    organization_id?: number | null;
    organizationId?: number | null;
};

export type MembershipDTO = {
    id: string | number;
    user?: number;
    role?: string;
    employment_type?: string;
    employmentType?: string | null;
    job_title?: string | null;
    jobTitle?: string | null;
    invited_name?: string;
    invitedName?: string | null;
    name?: string;
    email?: string;
    user_details?: { email?: string; first_name?: string; last_name?: string };
    userDetails?: { email?: string; firstName?: string; lastName?: string };
    status?: string | null;
    is_active?: boolean;
    isActive?: boolean;
    is_pharmacy_owner?: boolean;
    isPharmacyOwner?: boolean;
    is_pharmacy_admin?: boolean;
    isPharmacyAdmin?: boolean;
    admin_level?: string | null;
    admin_level_label?: string | null;
    admin_level_description?: string | null;
};

export type PharmacyAdminDTO = {
    id: string | number;
    pharmacy?: number;
    pharmacy_name?: string | null;
    user?: number | null;
    invited_name?: string | null;
    email?: string | null;
    admin_level: AdminLevel;
    staff_role?: AdminStaffRole | null;
    job_title?: string | null;
    user_details?: { email?: string; first_name?: string; last_name?: string };
    capabilities?: AdminCapability[];
    can_remove?: boolean;
    is_active?: boolean;
};

export const ROLE_LABELS: Record<Role, string> = {
    PHARMACIST: 'Pharmacist',
    TECHNICIAN: 'Dispensary Technician',
    ASSISTANT: 'Pharmacy Assistant',
    INTERN: 'Intern Pharmacist',
    STUDENT: 'Pharmacy Student',
    CONTACT: 'Contact',
};

export const USER_ROLE_LABELS: Record<UserPortalRole, string> = {
    OWNER: 'Pharmacy Owner',
    PHARMACIST: 'Pharmacist',
    OTHER_STAFF: 'Other Staff',
    EXPLORER: 'Explorer',
};

export const STAFF_ROLE_LABELS: Record<AdminStaffRole, string> = {
    PHARMACIST: 'Pharmacist',
    INTERN: 'Intern Pharmacist',
    TECHNICIAN: 'Dispensary Technician',
    ASSISTANT: 'Pharmacy Assistant',
    STUDENT: 'Pharmacy Student',
};

export const STAFF_ROLE_OPTIONS = Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => ({
    value: value as AdminStaffRole,
    label,
}));

export const ADMIN_LEVEL_LABELS: Record<AdminLevel, string> = {
    OWNER: 'Owner',
    MANAGER: 'Manager',
    ROSTER_MANAGER: 'Roster Manager',
    COMMUNICATION_MANAGER: 'Communication Manager',
};

export const ADMIN_LEVEL_HELPERS: Record<AdminLevel, string> = {
    OWNER: 'Full control. Cannot be removed.',
    MANAGER: 'Full control except removing the owner.',
    ROSTER_MANAGER: 'Manage roster/shifts and broadcast communications.',
    COMMUNICATION_MANAGER: 'Communications only. Cannot manage staff or admins.',
};

export const ADMIN_LEVEL_OPTIONS = Object.entries(ADMIN_LEVEL_LABELS).map(([value, label]) => ({
    value: value as AdminLevel,
    label,
}));

const ROLE_REQUIRED_USER_ROLE: Partial<Record<Role, UserPortalRole>> = {
    PHARMACIST: 'PHARMACIST',
    INTERN: 'OTHER_STAFF',
    STUDENT: 'OTHER_STAFF',
    TECHNICIAN: 'OTHER_STAFF',
    ASSISTANT: 'OTHER_STAFF',
};

export const requiredUserRoleForMembership = (role: Role): UserPortalRole | null =>
    ROLE_REQUIRED_USER_ROLE[role] ?? null;

export const formatMembershipRole = (role: Role): string => ROLE_LABELS[role] ?? role;

export const formatUserPortalRole = (role: UserPortalRole): string => USER_ROLE_LABELS[role] ?? role;

export function coerceRole(raw?: string): Role {
    const r = (raw || '').toUpperCase();
    if (r.includes('INTERN')) return 'INTERN';
    if (r.includes('STUDENT')) return 'STUDENT';
    if (r.includes('CONTACT')) return 'CONTACT';
    if (r.includes('PHARM')) return 'PHARMACIST';
    if (r.includes('TECH')) return 'TECHNICIAN';
    if (r.includes('ASSIST')) return 'ASSISTANT';
    return 'ASSISTANT';
}

export function coerceWorkType(raw?: string): WorkType {
    const r = (raw || '').toUpperCase().replace('-', '_');
    if (r.includes('FULL')) return 'FULL_TIME';
    if (r.includes('PART')) return 'PART_TIME';
    if (r.includes('LOCUM')) return 'LOCUM';
    if (r.includes('SHIFT')) return 'SHIFT_HERO';
    if (r.includes('CONTACT')) return 'CONTACT';
    return 'CASUAL';
}
