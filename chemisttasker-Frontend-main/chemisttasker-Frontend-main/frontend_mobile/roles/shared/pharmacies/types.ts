// Mobile types for pharmacy management
// Re-exports from shared-core with mobile-specific additions

export type {
    Role,
    WorkType,
    UserPortalRole,
    PharmacyDTO,
    MembershipDTO,
    AdminLevel,
    AdminStaffRole,
    PharmacyAdminDTO,
} from '@chemisttasker/shared-core';

export {
    ROLE_LABELS,
    USER_ROLE_LABELS,
    STAFF_ROLE_LABELS,
    STAFF_ROLE_OPTIONS,
    ADMIN_LEVEL_LABELS,
    ADMIN_LEVEL_HELPERS,
    ADMIN_LEVEL_OPTIONS,
    requiredUserRoleForMembership,
    formatMembershipRole,
    formatUserPortalRole,
    coerceRole,
    coerceWorkType,
} from '@chemisttasker/shared-core';

// Mobile-specific surface tokens for consistent styling
export const surfaceTokens = {
    bg: '#FFFFFF',
    bgDark: '#F9FAFB',
    subtle: 'rgba(0, 0, 0, 0.04)',
    hover: 'rgba(99, 102, 241, 0.08)',
    border: '#E5E7EB',
    text: '#1F2937',
    textMuted: 'rgba(0, 0, 0, 0.6)',
    textSecondary: 'rgba(0, 0, 0, 0.6)',
    primary: '#6366F1',
    primaryLight: '#A78BFA',
    error: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    info: '#3B82F6',
};
