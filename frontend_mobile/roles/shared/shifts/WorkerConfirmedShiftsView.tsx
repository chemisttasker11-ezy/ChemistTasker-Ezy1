// The worker's Shift Centre: Confirmed (native). Same content and actions as web MyConfirmedShiftsPage.
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Snackbar } from 'react-native-paper';
import { fetchMyConfirmedShifts, type Shift } from '@chemisttasker/shared-core';
import { BookedShiftsState, PharmacyDetailsDialog, WorkerBookedShiftCard } from './WorkerBookedShifts';

export default function WorkerConfirmedShiftsView() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [pharmacy, setPharmacy] = useState<Shift['pharmacyDetail'] | null>(null);

  useEffect(() => {
    fetchMyConfirmedShifts()
      .then(data => setShifts(Array.isArray(data) ? data : []))
      .catch(() => setMessage('We could not load your confirmed shifts. Try again in a moment.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {loading || !shifts.length ? <BookedShiftsState mode="confirmed" loading={loading} /> : (
        <ScrollView contentContainerStyle={styles.list}>
          {shifts.map(shift => (
            <WorkerBookedShiftCard key={shift.id} shift={shift} mode="confirmed"
              actions={<Button mode="contained" icon="storefront-outline" disabled={!shift.pharmacyDetail} onPress={() => setPharmacy(shift.pharmacyDetail)}>Pharmacy details</Button>} />
          ))}
        </ScrollView>
      )}
      <PharmacyDetailsDialog pharmacy={pharmacy ?? null} onDismiss={() => setPharmacy(null)} />
      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')} duration={4000}>{message}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({ list: { padding: 16, gap: 16, paddingBottom: 40 } });
