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

// Legacy pharmacy components keep their existing token names, but use the
// single approved Expo palette. Do not create a second color system here.
import { colors } from '@/constants/tokens';
export const surfaceTokens = {
    bg: colors.surfaceBg,
    bgDark: colors.pageBg,
    subtle: colors.subtleBg,
    hover: colors.primarySoft,
    border: colors.border,
    text: colors.textPrimary,
    textMuted: colors.textSecondary,
    textSecondary: colors.textSecondary,
    primary: colors.primary,
    primaryLight: colors.primarySoft,
    error: colors.status.red.fg,
    success: colors.status.green.fg,
    warning: colors.status.amber.fg,
    info: colors.tone.blue.fg,
};
