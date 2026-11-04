import React, { useCallback, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchPharmaciesService, deletePharmacy, PharmacyDTO } from '@chemisttasker/shared-core';
import { fetchMembershipsForPharmacy } from '@/roles/shared/pharmacies/membershipApi';
import PharmaciesListView from '@/roles/shared/pharmacies/PharmaciesListView';
import { Snackbar } from 'react-native-paper';
import { ContentState } from '@/components/ui';

export default function OrganizationPharmaciesScreen() {
  const router = useRouter();
  const loadGenRef = useRef(0);
  const [pharmacies, setPharmacies] = useState<PharmacyDTO[]>([]);
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState('');

  const loadPharmacies = useCallback(async () => {
    const request = ++loadGenRef.current;
    setLoading(true);
    setLoadError(false);
    try {
      const data: any = await fetchPharmaciesService({});
      const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      const normalized: PharmacyDTO[] = list.map((item: any) => ({ ...item, id: String(item.id ?? item.pharmacy_id ?? ''), can_edit: item.can_edit ?? item.canEdit }));
      if (request !== loadGenRef.current) return;
      setPharmacies(normalized);

      const counts: Record<string, number> = {};
      for (let start = 0; start < normalized.length; start += 5) {
        await Promise.all(normalized.slice(start, start + 5).map(async (pharmacy) => {
          try {
            const memberships = await fetchMembershipsForPharmacy(pharmacy.id);
            counts[pharmacy.id] = Array.isArray(memberships) ? memberships.length : 0;
          } catch {
            counts[pharmacy.id] = 0;
          }
        }));
        if (request !== loadGenRef.current) return;
      }
      if (request === loadGenRef.current) setStaffCounts(counts);
    } catch (err: any) {
      if (request === loadGenRef.current) {
        console.error(err);
        setLoadError(true);
        setSnackbar('Failed to load pharmacies');
      }
    } finally {
      if (request === loadGenRef.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPharmacies();
      return () => { loadGenRef.current += 1; };
    }, [loadPharmacies])
  );

  const handleDelete = (id: string) => {
    if (deletingId) return;
    const pharmacy = pharmacies.find((item) => String(item.id) === id);
    Alert.alert(
      'Delete pharmacy?',
      'Deleting ' + (pharmacy?.name || 'this pharmacy') + ' may affect workforce and historical records. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete pharmacy', style: 'destructive',
          onPress: () => {
            setDeletingId(id);
            void deletePharmacy(id)
              .then(async () => { setSnackbar('Pharmacy deleted'); await loadPharmacies(); })
              .catch(() => setSnackbar('Pharmacy could not be deleted.'))
              .finally(() => setDeletingId(null));
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {loadError && !loading ? (
        <ContentState kind="error" title="Unable to load pharmacies" description="Check your connection and retry." actionLabel="Try again" onAction={() => void loadPharmacies()} />
      ) : <PharmaciesListView
        pharmacies={pharmacies}
        staffCounts={staffCounts}
        loading={loading}
        onOpenPharmacy={(id) => router.push(`/organization/pharmacies/${id}`)}
        onEditPharmacy={(p) => router.push(`/organization/pharmacies/${p.id}/edit`)}
        onDeletePharmacy={handleDelete}
        onAddPharmacy={() => router.push('/organization/pharmacies/add')}
      />}
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
