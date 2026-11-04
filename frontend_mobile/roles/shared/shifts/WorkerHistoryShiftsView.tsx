// The worker's Shift Centre: History (native). Same content and actions as web MyHistoryShiftsPage: create an invoice,
// rate the pharmacy, see its details.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { Receipt, Star, Store } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import {
  createRatingService,
  fetchMyHistoryShifts,
  fetchMyRatingForTargetService,
  fetchRatingsSummaryService,
  type Shift,
  type ShiftRatingSummary,
} from '@chemisttasker/shared-core';
import { ContentState } from '@/components/ui';
import { colors, radius, space } from '@/constants/tokens';
import { useWorkspace } from '@/context/WorkspaceContext';
import { filterWorkerShiftsByWorkspace } from './HistoryShiftsView';
import {
  createInitialRatingState,
  isRatingSaveDisabled,
  shouldApplyRatingResponse,
} from './shiftsScreenLogic';
import { useShiftSurface } from './useShiftSurface';
import { BookedShiftsState, PharmacyDetailsDialog, WorkerBookedShiftCard } from './WorkerBookedShifts';

const STAR_WORDS = ['', 'Poor', 'Below expectations', 'Good', 'Very good', 'Excellent'];

export function buildWorkerInvoicePath(
  invoiceRoute: string | undefined,
  shiftId: number,
  pharmacyId?: number | null,
): string | null {
  if (!invoiceRoute) return null;
  const pId = pharmacyId != null ? String(pharmacyId) : '';
  return `${invoiceRoute}?shiftId=${shiftId}&pharmacyId=${pId}`;
}

export default function WorkerHistoryShiftsView({ invoiceRoute }: { invoiceRoute?: string }) {
  const router = useRouter();
  const surface = useShiftSurface();
  const { selectedPharmacyId } = useWorkspace();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [ratings, setRatings] = useState<Record<number, ShiftRatingSummary>>({});
  const [pharmacy, setPharmacy] = useState<Shift['pharmacyDetail'] | null>(null);

  const [ratingState, setRatingState] = useState(() => createInitialRatingState<{ id: number; name: string }>(null));
  const rateTargetRef = useRef<{ id: number; name: string } | null>(null);

  const loadGenRef = useRef(0);
  const ratingGenRef = useRef(0);
  const saveGenRef = useRef(0);

  const loadRating = useCallback((id: number, gen = loadGenRef.current) =>
    fetchRatingsSummaryService({ targetType: 'pharmacy', targetId: id })
      .then((summary) => {
        if (gen !== loadGenRef.current) return;
        setRatings((prev) => ({ ...prev, [id]: summary }));
      })
      .catch(() => undefined), []);

  const loadShifts = useCallback(async (isRefresh = false) => {
    const gen = ++loadGenRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchMyHistoryShifts();
      if (gen !== loadGenRef.current) return;
      const list = Array.isArray(data) ? data : [];
      setShifts((prev) => (prev.length === 0 && list.length === 0 ? prev : list));
      new Set(list.map((shift) => shift.pharmacyDetail?.id).filter((id): id is number => typeof id === 'number'))
        .forEach((id) => void loadRating(id, gen));
    } catch (err: any) {
      if (gen !== loadGenRef.current) return;
      const msg = err?.response?.data?.detail || err?.message || 'We could not load your past shifts. Try again in a moment.';
      setError(msg);
      setMessage(msg);
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [loadRating]);

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

  const closeRating = useCallback(() => {
    ratingGenRef.current++;
    saveGenRef.current++;
    rateTargetRef.current = null;
    setRatingState(createInitialRatingState<{ id: number; name: string }>(null));
  }, []);

  useEffect(() => {
    return () => {
      loadGenRef.current++;
      ratingGenRef.current++;
      saveGenRef.current++;
      rateTargetRef.current = null;
    };
  }, [surface.scopeKey]);

  const openRating = async (id: number, name: string) => {
    const gen = ++ratingGenRef.current;
    const target = { id, name };
    rateTargetRef.current = target;
    setRatingState(createInitialRatingState(target));

    try {
      const existing = await fetchMyRatingForTargetService({ targetType: 'pharmacy', targetId: id });
      if (!shouldApplyRatingResponse(ratingGenRef.current, gen, rateTargetRef.current?.id ?? null, id)) return;
      setRatingState((prev) => ({
        ...prev,
        loading: false,
        stars: existing?.stars || 0,
        comment: existing?.comment || '',
        error: null,
      }));
    } catch (err: any) {
      if (!shouldApplyRatingResponse(ratingGenRef.current, gen, rateTargetRef.current?.id ?? null, id)) return;
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load existing rating';
      setRatingState((prev) => ({
        ...prev,
        loading: false,
        error: msg,
        stars: 0,
        comment: '',
      }));
    }
  };

  const saveRating = async () => {
    const target = rateTargetRef.current;
    if (!target || isRatingSaveDisabled({ loading: ratingState.loading, saving: ratingState.saving, stars: ratingState.stars, hasError: Boolean(ratingState.error) })) return;
    const gen = ++saveGenRef.current;
    setRatingState((prev) => ({ ...prev, saving: true }));
    try {
      await createRatingService({ direction: 'WORKER_TO_PHARMACY', ratee_pharmacy: target.id, stars: ratingState.stars, comment: ratingState.comment });
      if (saveGenRef.current !== gen || rateTargetRef.current?.id !== target.id) return;
      await loadRating(target.id, loadGenRef.current);
      if (saveGenRef.current !== gen || rateTargetRef.current?.id !== target.id) return;
      setMessage('Thanks. Your rating is saved.');
      closeRating();
    } catch {
      if (saveGenRef.current !== gen || rateTargetRef.current?.id !== target.id) return;
      setMessage('Your rating could not be saved. Try again.');
    } finally {
      if (saveGenRef.current === gen) {
        setRatingState((prev) => ({ ...prev, saving: false }));
      }
    }
  };

  const displayedShifts = filterWorkerShiftsByWorkspace(shifts, surface.workspace, selectedPharmacyId);

  if (!loading && error && shifts.length === 0) {
    return (
      <ContentState
        kind="error"
        title="Could not load shift history"
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
        <BookedShiftsState mode="history" loading={false} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadShifts(true)} />}
        >
          {displayedShifts.map((shift) => {
            const p = shift.pharmacyDetail;
            const invoicePath = buildWorkerInvoicePath(invoiceRoute, shift.id, p?.id);
            return (
              <WorkerBookedShiftCard
                key={shift.id}
                shift={shift}
                mode="history"
                rating={p?.id ? ratings[p.id] : undefined}
                actions={
                  <>
                    {invoicePath ? (
                      <Button
                        mode="contained"
                        icon={({ size, color }) => <Receipt size={size} color={color} />}
                        onPress={() => router.push(invoicePath as any)}
                        style={styles.actionBtn}
                      >
                        Create invoice
                      </Button>
                    ) : null}
                    <Button
                      mode="outlined"
                      icon={({ size, color }) => <Star size={size} color={color} />}
                      disabled={!p?.id}
                      onPress={() => p?.id && void openRating(p.id, p.name ?? 'Pharmacy')}
                      style={styles.actionBtn}
                    >
                      Rate pharmacy
                    </Button>
                    <Button
                      mode="text"
                      icon={({ size, color }) => <Store size={size} color={color} />}
                      disabled={!p}
                      onPress={() => setPharmacy(p)}
                      style={styles.actionBtn}
                    >
                      Details
                    </Button>
                  </>
                }
              />
            );
          })}
        </ScrollView>
      )}

      <PharmacyDetailsDialog pharmacy={pharmacy ?? null} onDismiss={() => setPharmacy(null)} />

      <Portal>
        <Dialog visible={Boolean(rateTargetRef.current)} onDismiss={closeRating} style={{ borderRadius: radius.card }}>
          <Dialog.Title>Rate {rateTargetRef.current?.name}</Dialog.Title>
          <Dialog.Content style={{ gap: space.sm }}>
            {ratingState.loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : ratingState.error ? (
              <ContentState
                kind="error"
                title="Could not load rating"
                description={ratingState.error}
                actionLabel="Try again"
                onAction={() => rateTargetRef.current && void openRating(rateTargetRef.current.id, rateTargetRef.current.name)}
              />
            ) : (
              <>
                <Text style={styles.muted}>Your rating helps other workers choose where to work.</Text>
                <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Star rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => setRatingState((prev) => ({ ...prev, stars: value }))}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: ratingState.stars === value }}
                      accessibilityLabel={`${value} ${value === 1 ? 'star' : 'stars'}`}
                      hitSlop={8}
                      style={styles.star}
                    >
                      <Star
                        size={30}
                        color={value <= ratingState.stars ? colors.status.amber.solid : colors.textMuted}
                        fill={value <= ratingState.stars ? colors.status.amber.solid : 'transparent'}
                      />
                    </Pressable>
                  ))}
                  <Text style={styles.word}>{STAR_WORDS[ratingState.stars]}</Text>
                </View>
                <TextInput
                  mode="outlined"
                  label="Comment (optional)"
                  multiline
                  numberOfLines={3}
                  value={ratingState.comment}
                  onChangeText={(text) => setRatingState((prev) => ({ ...prev, comment: text }))}
                />
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeRating} disabled={ratingState.saving} style={styles.actionBtn}>Cancel</Button>
            <Button
              mode="contained"
              onPress={saveRating}
              loading={ratingState.saving}
              disabled={isRatingSaveDisabled({ loading: ratingState.loading, saving: ratingState.saving, stars: ratingState.stars, hasError: Boolean(ratingState.error) })}
              style={styles.actionBtn}
            >
              Save rating
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')} duration={4000}>{message}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.md, gap: space.md, paddingBottom: 40 },
  muted: { fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
  stars: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  word: { marginLeft: space.sm, fontWeight: '600', color: colors.textPrimary },
  actionBtn: { minHeight: 44, justifyContent: 'center' },
});
