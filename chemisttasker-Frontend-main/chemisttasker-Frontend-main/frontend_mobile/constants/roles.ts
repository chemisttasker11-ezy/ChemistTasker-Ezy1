// /constants/roles.ts

export const ORG_ROLES = ['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN'] as const;
export type OrgRole = typeof ORG_ROLES[number];
