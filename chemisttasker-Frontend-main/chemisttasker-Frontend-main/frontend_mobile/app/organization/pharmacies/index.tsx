import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchPharmaciesService, deletePharmacy, PharmacyDTO } from '@chemisttasker/shared-core';
import { fetchMembershipsForPharmacy } from '@/roles/shared/pharmacies/membershipApi';
import PharmaciesListView from '@/roles/shared/pharmacies/PharmaciesListView';
import { Snackbar } from 'react-native-paper';

export default function OrganizationPharmaciesScreen() {
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState<PharmacyDTO[]>([]);
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState('');

  const loadPharmacies = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await fetchPharmaciesService({});
      const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      const normalized: PharmacyDTO[] = list.map((item: any) => ({ ...item, id: String(item.id ?? item.pharmacy_id ?? '') }));
      setPharmacies(normalized);

      const counts: Record<string, number> = {};
      await Promise.all(
        normalized.map(async (p) => {
          try {
            const memberships: any = await fetchMembershipsForPharmacy(p.id);
            counts[p.id] = Array.isArray(memberships) ? memberships.length : 0;
          } catch {
            counts[p.id] = 0;
          }
        })
      );
      setStaffCounts(counts);
    } catch (err: any) {
      console.error(err);
      setSnackbar('Failed to load pharmacies');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPharmacies();
    }, [loadPharmacies])
  );

  const handleDelete = async (id: string) => {
    try {
      await deletePharmacy(id);
      setSnackbar('Pharmacy deleted');
      loadPharmacies();
    } catch {
      setSnackbar('Failed to delete pharmacy');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <PharmaciesListView
        pharmacies={pharmacies}
        staffCounts={staffCounts}
        loading={loading}
        onOpenPharmacy={(id) => router.push(`/organization/pharmacies/${id}`)}
        onEditPharmacy={(p) => router.push(`/organization/pharmacies/${p.id}/edit`)}
        onDeletePharmacy={handleDelete}
        onAddPharmacy={() => router.push('/organization/pharmacies/add')}
      />
      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
}
