import React, { useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ActivityIndicator, Text } from 'react-native-paper';
import { getPharmacyById, fetchPharmacyAdminsService, PharmacyDTO, MembershipDTO, PharmacyAdminDTO, updatePharmacy } from '@chemisttasker/shared-core';
import { fetchMembershipsForPharmacy } from '@/roles/shared/pharmacies/membershipApi';
import PharmacyDetailView from '@/roles/shared/pharmacies/PharmacyDetailView';

export default function PharmacyDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [pharmacy, setPharmacy] = useState<PharmacyDTO | null>(null);
  const [memberships, setMemberships] = useState<MembershipDTO[]>([]);
  const [admins, setAdmins] = useState<PharmacyAdminDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoPublishSaving, setAutoPublishSaving] = useState(false);
  const [autoPublishError, setAutoPublishError] = useState('');

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    setPharmacy(null);
    setError('');
    try {
      const [pData, mData, aData] = await Promise.all([
        getPharmacyById(id),
        fetchMembershipsForPharmacy(id),
        fetchPharmacyAdminsService({ pharmacy: id })
      ]);
      setPharmacy(pData as any);
      setMemberships(mData as any || []);
      setAdmins(aData as any || []);
    } catch (e: any) {
      console.error(e);
      setError('Failed to load pharmacy details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const title = pharmacy?.name || (loading ? 'Loading..' : 'Pharmacy');

  // Adjust font size based on text length
  const headerFontSize = title.length > 30 ? 12 : title.length > 20 ? 14 : 16;

  useLayoutEffect(() => {
    const HeaderTitle = () => (
      <View style={styles.headerTitleContainer}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.headerTitle, { fontSize: headerFontSize }]}
        >
          {title}
        </Text>
      </View>
    );

    navigation.setOptions({
      headerTitle: () => <HeaderTitle />,
    });
  }, [navigation, title, headerFontSize]);

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" /></View>;
  }

  if (error || !pharmacy) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>{error || 'Pharmacy not found'}</Text></View>;
  }

  const handleToggleAutoPublishWorkerRequests = async (nextValue: boolean) => {
    if (!pharmacy) return;
    setAutoPublishSaving(true);
    setAutoPublishError('');
    try {
      const updated = await updatePharmacy(String(pharmacy.id), {
        auto_publish_worker_requests: nextValue,
      } as any);
      setPharmacy(updated as any);
    } catch (e: any) {
      setAutoPublishError(e?.response?.data?.detail || e?.message || 'Failed to update publishing preference');
    } finally {
      setAutoPublishSaving(false);
    }
  };

  return (
    <PharmacyDetailView
      pharmacy={pharmacy}
      memberships={memberships}
      adminAssignments={admins}
      onMembershipsChanged={loadData}
      onAdminsChanged={loadData}
      loading={loading}
      autoPublishWorkerRequests={Boolean((pharmacy as any).auto_publish_worker_requests)}
      onToggleAutoPublishWorkerRequests={handleToggleAutoPublishWorkerRequests}
      autoPublishSaving={autoPublishSaving}
      autoPublishError={autoPublishError}
    />
  );
}

const styles = StyleSheet.create({
  headerTitleContainer: {
    flexShrink: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
