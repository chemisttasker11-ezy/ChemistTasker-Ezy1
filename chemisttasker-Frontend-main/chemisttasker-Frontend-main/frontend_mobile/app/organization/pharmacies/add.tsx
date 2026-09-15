import React from 'react';
import { useRouter } from 'expo-router';
import PharmacyForm from '@/roles/shared/pharmacies/PharmacyForm';

export default function OrganizationAddPharmacyScreen() {
  const router = useRouter();

  return (
    <PharmacyForm
      mode="create"
      onSuccess={() => router.push('/organization/pharmacies')}
      onCancel={() => router.back()}
    />
  );
}
