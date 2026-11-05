// The worker's Shift Centre: Confirmed (native). Same content and actions as web MyConfirmedShiftsPage.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Snackbar } from 'react-native-paper';
import { Store } from 'lucide-react-native';
import { fetchMyConfirmedShifts, type Shift } from '@chemisttasker/shared-core';
import { ContentState } from '@/components/ui';
import { space } from '@/constants/tokens';
import { useWorkspace } from '@/context/WorkspaceContext';
import { filterWorkerShiftsByWorkspace } from './HistoryShiftsView';
import { useShiftSurface } from './useShiftSurface';
import { BookedShiftsState, PharmacyDetailsDialog, WorkerBookedShiftCard } from './WorkerBookedShifts';

export default function WorkerConfirmedShiftsView() {
  const surface = useShiftSurface();
  const { selectedPharmacyId } = useWorkspace();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pharmacy, setPharmacy] = useState<Shift['pharmacyDetail'] | null>(null);
  const loadGenRef = useRef(0);

  const loadShifts = useCallback(async (isRefresh = false) => {
    const gen = ++loadGenRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchMyConfirmedShifts();
      if (gen !== loadGenRef.current) return;
      const list = Array.isArray(data) ? data : [];
      setShifts((prev) => (prev.length === 0 && list.length === 0 ? prev : list));
    } catch (err: any) {
      if (gen !== loadGenRef.current) return;
      const msg = err?.response?.data?.detail || err?.message || 'We could not load your confirmed shifts. Try again in a moment.';
      setError(msg);
      setMessage(msg);
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      loadGenRef.current++;
    };
  }, [surface.scopeKey]);

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

  const displayedShifts = filterWorkerShiftsByWorkspace(shifts, surface.workspace, selectedPharmacyId);

  if (!loading && error && shifts.length === 0) {
    return (
      <ContentState
        kind="error"
        title="Could not load confirmed shifts"
        description={error}
        onAction={() => void loadShifts()}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {loading && shifts.length === 0 ? (
        <ContentState kind="loading" />
      ) : displayedShifts.length === 0 ? (
        <BookedShiftsState mode="confirmed" loading={false} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadShifts(true)} />}
        >
          {displayedShifts.map((shift) => (
            <WorkerBookedShiftCard
              key={shift.id}
              shift={shift}
              mode="confirmed"
              actions={
                <Button
                  mode="contained"
                  icon={({ size, color }) => <Store size={size} color={color} />}
                  disabled={!shift.pharmacyDetail}
                  onPress={() => setPharmacy(shift.pharmacyDetail)}
                  style={styles.actionBtn}
                >
                  Pharmacy details
                </Button>
              }
            />
          ))}
        </ScrollView>
      )}
      <PharmacyDetailsDialog pharmacy={pharmacy ?? null} onDismiss={() => setPharmacy(null)} />
      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')} duration={4000}>{message}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.md, gap: space.md, paddingBottom: 40 },
  actionBtn: { minHeight: 44, justifyContent: 'center' },
});
