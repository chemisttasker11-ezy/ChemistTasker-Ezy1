import { brandColors } from '@/constants/theme';

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
    bg: brandColors.white,
    bgDark: brandColors.mist,
    subtle: '#F7F9FC',
    hover: '#F0EAFF',
    border: brandColors.border,
    text: brandColors.navy,
    textMuted: brandColors.body,
    textSecondary: brandColors.body,
    primary: brandColors.purple,
    primaryLight: '#F0EAFF',
    error: brandColors.danger,
    success: brandColors.success,
    warning: brandColors.warning,
    info: brandColors.blue,
};
