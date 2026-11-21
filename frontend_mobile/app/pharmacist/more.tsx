import React from 'react';
import { MoreScreen } from '@/components/shell';
import { useScopedDashboard } from '@/roles/shared/dashboard/dashboardScope';
import { RecentActivity } from '@/roles/shared/dashboard/RecentActivity';

/** Pharmacist More: the shell groups plus the dashboard activity feed that used to sit on Home. */
export default function PharmacistMore() {
  const { fetchDashboard, isLoading, workspace, selectedPharmacyId } = useScopedDashboard('PHARMACIST');
  return (
    <MoreScreen>
      <RecentActivity load={fetchDashboard} ready={!isLoading} scopeKey={`pharmacist:${workspace}:${selectedPharmacyId}`} persona="pharmacist" />
    </MoreScreen>
  );
}
