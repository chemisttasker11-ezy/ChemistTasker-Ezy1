import React from 'react';
import { useRouter } from 'expo-router';
import PharmacyForm from '@/roles/shared/pharmacies/PharmacyForm';
import { useGuardedNavigation } from '@/roles/shared/forms/UnsavedChangesRegistryProvider';

export default function OwnerAddPharmacyScreen() {
  const router = useRouter();
  const guardedNavigation = useGuardedNavigation();

  return (
    <PharmacyForm
      mode="create"
      onSuccess={() => router.push('/owner/pharmacies')} // Go back to list
      onCancel={() => guardedNavigation(() => router.back())}
    />
  );
}
