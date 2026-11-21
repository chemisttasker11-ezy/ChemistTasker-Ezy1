import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import PharmacyMembersRoute from '@/roles/shared/pharmacies/PharmacyMembersRoute';

export default function OwnerPharmacyLocumsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PharmacyMembersRoute pharmacyId={id} kind="locum" />;
}
