import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text } from 'react-native-paper';
import type { MembershipDTO } from '@chemisttasker/shared-core';
import { fetchMembershipsForPharmacy } from '@/roles/shared/pharmacies/membershipApi';
import StaffManager from '@/roles/shared/pharmacies/StaffManager';

export default function OrganizationPharmacyStaffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [memberships, setMemberships] = useState<MembershipDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const mData = await fetchMembershipsForPharmacy(id);
      setMemberships(mData as any || []);
    } catch (e: any) {
      console.error(e);
      setError('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!id) return null;

  if (loading && memberships.length === 0) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" /></View>;
  }

  if (error) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>{error}</Text></View>;
  }

  return (
    <StaffManager
      pharmacyId={String(id)}
      memberships={memberships}
      onMembershipsChanged={loadData}
      loading={loading}
      category="staff"
    />
  );
}
