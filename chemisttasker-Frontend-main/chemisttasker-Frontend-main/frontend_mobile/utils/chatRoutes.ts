export function getMessageDetailRoute(userRole: string | null | undefined, roomId: number | string) {
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
            : normalized === 'ORGANIZATION'
              ? 'organization'
              : normalized === 'ADMIN' || normalized === 'SUPERUSER'
                ? 'admin'
                : 'shared';

  return `/${rolePrefix}/messages/${roomId}`;
}
