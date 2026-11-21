// The four account types the sign-up form offers; /register?role= may preselect only one of these.
export const REGISTER_ROLES = ['OWNER', 'PHARMACIST', 'OTHER_STAFF', 'EXPLORER'] as const;
export type RegisterRole = (typeof REGISTER_ROLES)[number];

/** The `role` route param as a sign-up role, or '' (expo-router may hand over an array for a repeated param). */
export function registerRoleFromParam(raw: string | string[] | undefined): RegisterRole | '' {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return REGISTER_ROLES.find((role) => role === value) ?? '';
}
