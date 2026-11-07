import React from 'react';
import { RootPageHeader } from '@/components/RootPageHeader';
import ManageMembershipsScreen from '@/roles/shared/ManageMembershipsScreen';

export default function AdminInvitationsPage() {
  return (
    <>
      <RootPageHeader title="Manage memberships" />
      <ManageMembershipsScreen />
    </>
  );
}
