// The worker's Shift Centre: History (native). Same content and actions as web MyHistoryShiftsPage: create an invoice,
// rate the pharmacy, see its details.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  createRatingService,
  fetchMyHistoryShifts,
  fetchMyRatingForTargetService,
  fetchRatingsSummaryService,
  type Shift,
  type ShiftRatingSummary,
} from '@chemisttasker/shared-core';
import { BookedShiftsState, PharmacyDetailsDialog, WorkerBookedShiftCard } from './WorkerBookedShifts';

const STAR_WORDS = ['', 'Poor', 'Below expectations', 'Good', 'Very good', 'Excellent'];

export default function WorkerHistoryShiftsView({ invoiceRoute }: { invoiceRoute?: string }) {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [ratings, setRatings] = useState<Record<number, ShiftRatingSummary>>({});
  const [pharmacy, setPharmacy] = useState<Shift['pharmacyDetail'] | null>(null);
  const [rateTarget, setRateTarget] = useState<{ id: number; name: string } | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRating = (id: number) =>
    fetchRatingsSummaryService({ targetType: 'pharmacy', targetId: id })
      .then(summary => setRatings(prev => ({ ...prev, [id]: summary })))
      .catch(() => undefined);

  useEffect(() => {
    fetchMyHistoryShifts()
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setShifts(list);
        new Set(list.map(shift => shift.pharmacyDetail?.id).filter((id): id is number => typeof id === 'number')).forEach(id => void loadRating(id));
      })
      .catch(() => setMessage('We could not load your past shifts. Try again in a moment.'))
      .finally(() => setLoading(false));
  }, []);

  const openRating = async (id: number, name: string) => {
    setRateTarget({ id, name });
    setLoadingExisting(true);
    try {
      const existing = await fetchMyRatingForTargetService({ targetType: 'pharmacy', targetId: id });
      setStars(existing?.stars || 0);
      setComment(existing?.comment || '');
    } catch {
      setStars(0);
      setComment('');
    } finally {
      setLoadingExisting(false);
    }
  };

  const saveRating = async () => {
    if (!rateTarget) return;
    setSaving(true);
    try {
      await createRatingService({ direction: 'WORKER_TO_PHARMACY', ratee_pharmacy: rateTarget.id, stars, comment });
      await loadRating(rateTarget.id);
      setMessage('Thanks. Your rating is saved.');
      setRateTarget(null);
    } catch {
      setMessage('Your rating could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {loading || !shifts.length ? <BookedShiftsState mode="history" loading={loading} /> : (
        <ScrollView contentContainerStyle={styles.list}>
          {shifts.map(shift => {
            const p = shift.pharmacyDetail;
            return (
              <WorkerBookedShiftCard key={shift.id} shift={shift} mode="history" rating={p?.id ? ratings[p.id] : undefined}
                actions={<>
                  <Button mode="contained" icon="receipt" onPress={() => router.push({ pathname: (invoiceRoute || '/pharmacist/invoice/new') as any, params: { shiftId: shift.id, pharmacyId: p?.id ?? '' } })}>Create invoice</Button>
                  <Button mode="outlined" icon="star-outline" disabled={!p?.id} onPress={() => p?.id && void openRating(p.id, p.name ?? 'Pharmacy')}>Rate pharmacy</Button>
                  <Button mode="text" icon="storefront-outline" disabled={!p} onPress={() => setPharmacy(p)}>Details</Button>
                </>} />
            );
          })}
        </ScrollView>
      )}

      <PharmacyDetailsDialog pharmacy={pharmacy ?? null} onDismiss={() => setPharmacy(null)} />

      <Portal>
        <Dialog visible={Boolean(rateTarget)} onDismiss={() => !saving && setRateTarget(null)}>
          <Dialog.Title>Rate {rateTarget?.name}</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            {loadingExisting ? <ActivityIndicator /> : (
              <>
                <Text style={styles.muted}>Your rating helps other workers choose where to work.</Text>
                <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Star rating">
                  {[1, 2, 3, 4, 5].map(value => (
                    <Pressable key={value} onPress={() => setStars(value)} accessibilityRole="radio" accessibilityState={{ checked: stars === value }}
                      accessibilityLabel={`${value} ${value === 1 ? 'star' : 'stars'}`} hitSlop={6} style={styles.star}>
                      <MaterialCommunityIcons name={value <= stars ? 'star' : 'star-outline'} size={32} color={value <= stars ? '#F59E0B' : '#8A97AD'} />
                    </Pressable>
                  ))}
                  <Text style={styles.word}>{STAR_WORDS[stars]}</Text>
                </View>
                <TextInput mode="outlined" label="Comment (optional)" multiline numberOfLines={3} value={comment} onChangeText={setComment} />
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRateTarget(null)} disabled={saving}>Cancel</Button>
            <Button mode="contained" onPress={saveRating} loading={saving} disabled={saving || stars === 0}>Save rating</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')} duration={4000}>{message}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 16, paddingBottom: 40 },
  muted: { fontSize: 13.5, lineHeight: 20, color: '#445474' },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  word: { marginLeft: 8, fontWeight: '600', color: '#06214A' },
});
