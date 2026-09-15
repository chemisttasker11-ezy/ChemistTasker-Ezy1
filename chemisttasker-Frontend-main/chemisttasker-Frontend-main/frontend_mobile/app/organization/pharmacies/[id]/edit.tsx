import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PharmacyForm from '@/roles/shared/pharmacies/PharmacyForm';

export default function OrganizationEditPharmacyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  if (!id) return null;

  return (
    <PharmacyForm
      mode="edit"
      pharmacyId={String(id)}
      onSuccess={() => router.back()}
      onCancel={() => router.back()}
    />
  );
}
