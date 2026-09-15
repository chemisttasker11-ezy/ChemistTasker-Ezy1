import React from 'react';
import { useRouter } from 'expo-router';
import PharmacyForm from '@/roles/shared/pharmacies/PharmacyForm';

export default function OwnerAddPharmacyScreen() {
  const router = useRouter();

  return (
    <PharmacyForm
      mode="create"
      onSuccess={() => router.push('/owner/pharmacies')} // Go back to list
      onCancel={() => router.back()}
    />
  );
}
