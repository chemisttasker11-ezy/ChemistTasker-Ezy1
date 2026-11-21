import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PharmacyForm from '@/roles/shared/pharmacies/PharmacyForm';
import { useGuardedNavigation } from '@/roles/shared/forms/UnsavedChangesRegistryProvider';

export default function OrganizationEditPharmacyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const guardedNavigation = useGuardedNavigation();

  if (!id) return null;

  return (
    <PharmacyForm
      mode="edit"
      pharmacyId={String(id)}
      onSuccess={() => router.back()}
      onCancel={() => guardedNavigation(() => router.back())}
    />
  );
}
