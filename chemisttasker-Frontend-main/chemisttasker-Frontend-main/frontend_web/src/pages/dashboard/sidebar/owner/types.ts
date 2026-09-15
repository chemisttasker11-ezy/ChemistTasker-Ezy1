// src/pages/dashboard/sidebar/owner/types.ts
import { alpha, Theme } from "@mui/material/styles";

export type {
  Role,
  WorkType,
  UserPortalRole,
  PharmacyDTO,
  MembershipDTO,
  AdminLevel,
  AdminStaffRole,
  PharmacyAdminDTO,
} from "@chemisttasker/shared-core";

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
} from "@chemisttasker/shared-core";

// Dark-mode safe surface tokens for consistent contrast
export const surface = (t: Theme) => ({
  bg: t.palette.background.paper,
  subtle: alpha(t.palette.text.primary, 0.04),
  hover: alpha(t.palette.primary.main, 0.08),
  border: t.palette.divider,
  textMuted: alpha(t.palette.text.primary, 0.7),
});
