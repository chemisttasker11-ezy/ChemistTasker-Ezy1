import React, { useCallback } from 'react';
import { getOwnerDashboard } from '@chemisttasker/shared-core';
import { MoreScreen } from '@/components/shell';
import { useAdminWorkspace } from '@/context/AdminWorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { type DashboardPayload } from '@/roles/shared/dashboard/dashboardScope';
import { RecentActivity } from '@/roles/shared/dashboard/RecentActivity';

/** Admin More: the shell groups plus the activity feed of the active pharmacy, which used to sit on Home. */
export default function AdminMore() {
  const { activePharmacyId: pharmacyId } = useAdminWorkspace();
  const { hasCapability } = useAuth();
  const canRoster = Boolean(pharmacyId && hasCapability('MANAGE_ROSTER', pharmacyId));
  const canComms = canRoster || Boolean(pharmacyId && (hasCapability('MANAGE_STAFF', pharmacyId) || hasCapability('MANAGE_COMMUNICATIONS', pharmacyId)));
  const load = useCallback(
    async () =>
      (await getOwnerDashboard(pharmacyId ? { workspace: 'internal', pharmacy_id: pharmacyId } : { workspace: 'internal' })) as DashboardPayload,
    [pharmacyId],
  );
  return (
    <MoreScreen>
      <RecentActivity load={load} scopeKey={`admin:${pharmacyId}`} persona="admin" canRoster={canRoster} canComms={canComms} />
    </MoreScreen>
  );
}
