import React from 'react';
import { useRouter } from 'expo-router';
import PharmacyForm from '@/roles/shared/pharmacies/PharmacyForm';

export default function AdminAddPharmacyScreen() {
  const router = useRouter();

  return (
    <PharmacyForm
      mode="create"
      onSuccess={() => router.push('/admin/pharmacies')}
      onCancel={() => router.back()}
    />
  );
}
