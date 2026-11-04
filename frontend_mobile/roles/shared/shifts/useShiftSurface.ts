import { useMemo } from 'react';
import { usePathname } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useOptionalAdminWorkspace } from '@/context/AdminWorkspaceContext';
import { orgCapabilities } from '@/roles/shared/dashboard/ManagerHome';
import { resolveShiftSurface, type ShiftSurface } from './shiftSurface';

/** The shift surface for the screen on show: persona from the route, scope from the workspace contexts, rights from web's guards. */
export function useShiftSurface(): ShiftSurface {
  const pathname = usePathname();
  const { user, hasCapability } = useAuth();
  const { workspace, canUsePlatform, selectedPharmacyId, isLoading } = useWorkspace();
  const admin = useOptionalAdminWorkspace();
  const orgRoster = useMemo(() => orgCapabilities(user).roster, [user]);
  const adminPharmacyId = admin?.activePharmacyId ?? null;
  const adminLoading = admin?.isLoading ?? false;
  return useMemo(
    () =>
      resolveShiftSurface({
        pathname,
        role: user?.role,
        userId: user?.id,
        workspace,
        canUsePlatform,
        selectedPharmacyId,
        workspaceLoading: isLoading,
        adminPharmacyId,
        adminLoading,
        orgRoster,
        hasCapability,
      }),
    [adminLoading, adminPharmacyId, canUsePlatform, hasCapability, isLoading, orgRoster, pathname, selectedPharmacyId, user?.id, user?.role, workspace],
  );
}
