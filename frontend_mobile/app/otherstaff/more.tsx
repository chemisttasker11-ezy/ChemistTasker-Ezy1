import React from 'react';
import { MoreScreen } from '@/components/shell';
import { useScopedDashboard } from '@/roles/shared/dashboard/dashboardScope';
import { RecentActivity } from '@/roles/shared/dashboard/RecentActivity';

/** Other staff More: the shell groups plus the dashboard activity feed that used to sit on Home. */
export default function OtherStaffMore() {
  const { fetchDashboard, isLoading, workspace, selectedPharmacyId } = useScopedDashboard('OTHER_STAFF');
  return (
    <MoreScreen>
      <RecentActivity load={fetchDashboard} ready={!isLoading} scopeKey={`otherstaff:${workspace}:${selectedPharmacyId}`} persona="otherstaff" />
    </MoreScreen>
  );
}
