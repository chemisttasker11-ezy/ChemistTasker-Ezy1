import React from 'react';
import { MoreScreen } from '@/components/shell';
import { useScopedDashboard } from '@/roles/shared/dashboard/dashboardScope';
import { RecentActivity } from '@/roles/shared/dashboard/RecentActivity';
import { orgCapabilities } from '@/roles/shared/dashboard/ManagerHome';
import { getOrganizationMembership } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';

/** Organization More: the shell groups plus the dashboard activity feed that used to sit on Home. */
export default function OrganizationMore() {
  const { fetchDashboard, isLoading, selectedPharmacyId } = useScopedDashboard('ORGANIZATION');
  const { user } = useAuth();
  const can = orgCapabilities(user);
  const scopeKey = `organization:${getOrganizationMembership(user)?.organization_id}:${selectedPharmacyId}`;
  return (
    <MoreScreen>
      <RecentActivity load={fetchDashboard} ready={!isLoading} scopeKey={scopeKey} persona="organization" canRoster={can.roster} canComms={can.comms} />
    </MoreScreen>
  );
}
