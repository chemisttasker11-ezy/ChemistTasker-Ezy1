import React from 'react';
import { MoreScreen } from '@/components/shell';
import { useScopedDashboard } from '@/roles/shared/dashboard/dashboardScope';
import { RecentActivity } from '@/roles/shared/dashboard/RecentActivity';

/** Owner More: the shell groups plus the dashboard activity feed that used to sit on Home. */
export default function OwnerMore() {
  const { fetchDashboard, isLoading, workspace, selectedPharmacyId } = useScopedDashboard('OWNER');
  return (
    <MoreScreen>
      <RecentActivity load={fetchDashboard} ready={!isLoading} scopeKey={`owner:${workspace}:${selectedPharmacyId}`} persona="owner" />
    </MoreScreen>
  );
}
