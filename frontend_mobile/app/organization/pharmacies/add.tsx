import React from 'react';
import { useRouter } from 'expo-router';
import PharmacyForm from '@/roles/shared/pharmacies/PharmacyForm';
import { useGuardedNavigation } from '@/roles/shared/forms/UnsavedChangesRegistryProvider';

export default function OrganizationAddPharmacyScreen() {
  const router = useRouter();
  const guardedNavigation = useGuardedNavigation();

  return (
    <PharmacyForm
      mode="create"
      onSuccess={() => router.push('/organization/pharmacies')}
      onCancel={() => guardedNavigation(() => router.back())}
    />
  );
}
