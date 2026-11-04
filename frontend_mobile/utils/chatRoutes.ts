import type { ShiftPersona } from '@/roles/shared/shifts/shiftSurface';

/** A chat thread route. `persona` (the active shell, see shiftPersonaFromPath) wins, so a delegated admin stays in /admin. */
export function getMessageDetailRoute(userRole: string | null | undefined, roomId: number | string, persona?: ShiftPersona | null) {
  if (persona) return `/${persona}/messages/${roomId}`;
  const normalized = String(userRole || '').toUpperCase();
  const rolePrefix =
    normalized === 'OWNER'
      ? 'owner'
      : normalized === 'PHARMACIST'
        ? 'pharmacist'
        : normalized === 'OTHER_STAFF'
          ? 'otherstaff'
          : normalized === 'EXPLORER'
            ? 'explorer'
            : normalized === 'ORGANIZATION' || normalized === 'ORG_ADMIN' || normalized === 'ORG_OWNER' || normalized === 'ORG_STAFF' || normalized === 'CHIEF_ADMIN' || normalized === 'REGION_ADMIN'
              ? 'organization'
              : normalized === 'ADMIN' || normalized === 'SUPERUSER'
                ? 'admin'
                : 'shared';

  return `/${rolePrefix}/messages/${roomId}`;
}
