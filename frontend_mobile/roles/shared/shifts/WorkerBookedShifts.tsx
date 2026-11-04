// The worker's booked shifts (Shift Centre Confirmed and History), the native twin of web WorkerBookedShifts: one card
// per shift with the pharmacy, role, rate, address and dates, the actions that fit the moment, and a shared pharmacy
// details dialog (address, shift documents, reviews).
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Portal, Text } from 'react-native-paper';
import { CalendarCheck, FileText, History, MapPin, Star, Store } from 'lucide-react-native';
import {
  bookedShiftRateLabel,
  hasVisibleBookedShiftBonus,
  fetchRatingsPageService,
  fetchRatingsSummaryService,
  type Shift,
  type ShiftRatingComment,
  type ShiftRatingSummary,
} from '@chemisttasker/shared-core';
import { ContentState } from '@/components/ui';
import { colors, radius, space } from '@/constants/tokens';
import { ShiftTermsSummary } from './ShiftTermsSummary';

type Pharmacy = NonNullable<Shift['pharmacyDetail']>;
const INK = colors.textPrimary;
const MUTED = colors.textSecondary;
const BORDER = colors.border;

export const pharmacyAddress = (pharmacy?: Shift['pharmacyDetail'] | null) =>
  [pharmacy?.streetAddress, pharmacy?.suburb, pharmacy?.state, pharmacy?.postcode].filter(Boolean).join(', ');

export const openMap = (address: string) => {
  const query = encodeURIComponent(address);
  const url = Platform.select({
    ios: `maps:0,0?q=${query}`,
    android: `geo:0,0?q=${query}`,
    default: `https://www.google.com/maps/search/?api=1&query=${query}`,
  });
  void Linking.openURL(url!);
};

const dateBits = (raw?: string | null) => {
  const parsed = raw ? new Date(`${raw}T00:00:00`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { day: '', date: raw || 'Date to confirm' };
  return {
    day: parsed.toLocaleDateString('en-AU', { weekday: 'short' }),
    date: parsed.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
};
export const clock = (raw?: string | null) => (raw ? String(raw).slice(0, 5) : '--');
export const humanize = (value?: string | null) =>
  String(value || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'navy' | 'green' | 'neutral' }) {
  const look = {
    navy: [colors.brandNavy, colors.surfaceBg],
    green: [colors.status.green.bg, colors.status.green.fg],
    neutral: [colors.subtleBg, colors.textSecondary],
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: look[0] }]}>
      <Text style={[styles.pillText, { color: look[1] }]}>{label}</Text>
    </View>
  );
}

export function WorkerBookedShiftCard({
  shift,
  mode,
  rating,
  actions,
}: {
  shift: Shift;
  mode: 'confirmed' | 'history';
  rating?: ShiftRatingSummary;
  actions: ReactNode;
}) {
  const pharmacy = shift.pharmacyDetail;
  const address = pharmacyAddress(pharmacy);
  const slots = shift.slots ?? [];
  return (
    <View style={styles.card} accessibilityLabel={pharmacy?.name || 'Shift'}>
      <View style={styles.cardBody}>
        <View style={styles.headerRow}>
          <View style={[styles.tile, { backgroundColor: mode === 'history' ? colors.tone.magenta.bg : colors.primarySoft }]}>
            <Store size={22} color={mode === 'history' ? colors.tone.magenta.fg : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{pharmacy?.name || 'Pharmacy'}</Text>
            <View style={styles.pills}>
              {shift.roleNeeded ? <Pill tone="navy" label={humanize(shift.roleLabel ?? shift.roleNeeded)} /> : null}
              {shift.employmentType ? <Pill label={humanize(shift.employmentType)} /> : null}
              <Pill tone={hasVisibleBookedShiftBonus(shift) ? 'green' : 'neutral'} label={bookedShiftRateLabel(shift)} />
            </View>
            {address ? (
              <Pressable
                onPress={() => openMap(address)}
                accessibilityRole="link"
                accessibilityLabel={`Open ${address} in maps`}
                hitSlop={8}
                style={styles.address}
              >
                <MapPin size={15} color={MUTED} />
                <Text style={styles.muted}>{address}</Text>
              </Pressable>
            ) : null}
            {rating && rating.count > 0 ? (
              <View style={styles.address}>
                <Star size={15} color={colors.status.amber.solid} fill={colors.status.amber.solid} />
                <Text style={styles.muted}>
                  {rating.average.toFixed(1)} from {rating.count} {rating.count === 1 ? 'review' : 'reviews'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <ShiftTermsSummary shift={shift} style={{ marginTop: 4 }} />
        {slots.map((slot) => {
          const bits = dateBits(slot.date);
          return (
            <View key={slot.id} style={styles.slot}>
              <Text style={styles.slotDay}>{bits.day}</Text>
              <Text style={styles.slotDate}>{bits.date}</Text>
              <Text style={styles.muted}>{clock(slot.startTime)} – {clock(slot.endTime)}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerLabel}>
          {mode === 'history' ? 'Worked' : 'Confirmed'} · {slots.length} {slots.length === 1 ? 'date' : 'dates'}
        </Text>
        <View style={styles.actions}>{actions}</View>
      </View>
    </View>
  );
}

export function BookedShiftsState({ mode, loading }: { mode: 'confirmed' | 'history'; loading: boolean }) {
  if (loading) return <View style={styles.state}><ActivityIndicator accessibilityLabel="Loading shifts" color={colors.primary} /></View>;
  return (
    <View style={styles.state}>
      <View style={[styles.tile, { backgroundColor: colors.primarySoft }]}>
        {mode === 'history' ? <History size={24} color={colors.primary} /> : <CalendarCheck size={24} color={colors.primary} />}
      </View>
      <Text style={styles.stateTitle}>{mode === 'history' ? 'No past shifts yet' : 'No confirmed shifts yet'}</Text>
      <Text style={[styles.muted, { textAlign: 'center' }]}>
        {mode === 'history'
          ? 'Shifts you have worked appear here, ready for an invoice and a rating.'
          : 'When a pharmacy confirms you for a shift it appears here, with the address and their documents.'}
      </Text>
    </View>
  );
}

const DOCUMENTS: [keyof Pharmacy, string][] = [
  ['sops', 'Standard operating procedures'],
  ['inductionGuides', 'Induction guide'],
  ['methadoneS8Protocols', 'Methadone and S8 protocols'],
  ['qldSumpDocs', 'QLD SUMP documents'],
];

export function PharmacyDetailsDialog({ pharmacy, onDismiss }: { pharmacy: Pharmacy | null; onDismiss: () => void }) {
  const [summary, setSummary] = useState<ShiftRatingSummary | null>(null);
  const [reviews, setReviews] = useState<ShiftRatingComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const genRef = useRef(0);

  const loadInitial = useCallback(async (pharmacyId: number) => {
    const gen = ++genRef.current;
    setLoading(true);
    setLoadingMore(false);
    setPaginationError(null);
    setError(null);
    setSummary(null);
    setReviews([]);
    setNextPage(null);
    try {
      const [s, page] = await Promise.all([
        fetchRatingsSummaryService({ targetType: 'pharmacy', targetId: pharmacyId }),
        fetchRatingsPageService({ targetType: 'pharmacy', targetId: pharmacyId, page: 1 }),
      ]);
      if (gen !== genRef.current) return;
      setSummary(s);
      const results = page?.results || [];
      setReviews(results);
      setNextPage(page?.next ? 2 : null);
    } catch (err: any) {
      if (gen !== genRef.current) return;
      const msg = err?.response?.data?.detail || err?.message || 'Could not load reviews.';
      setError(msg);
      setReviews([]);
    } finally {
      if (gen === genRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!pharmacy?.id || !nextPage || loadingMore) return;
    const gen = genRef.current;
    const pageToLoad = nextPage;
    setLoadingMore(true);
    setPaginationError(null);
    try {
      const page = await fetchRatingsPageService({
        targetType: 'pharmacy',
        targetId: pharmacy.id,
        page: pageToLoad,
      });
      if (gen !== genRef.current) return;
      const results = page?.results || [];
      setReviews((prev) => [...prev, ...results]);
      setNextPage(page?.next ? pageToLoad + 1 : null);
    } catch (err: any) {
      if (gen !== genRef.current) return;
      const msg = err?.response?.data?.detail || err?.message || 'Could not load more reviews.';
      setPaginationError(msg);
    } finally {
      if (gen === genRef.current) {
        setLoadingMore(false);
      }
    }
  }, [pharmacy?.id, nextPage, loadingMore]);

  useEffect(() => {
    setLoadingMore(false);
    setPaginationError(null);
    if (!pharmacy?.id) {
      genRef.current++;
      setSummary(null);
      setReviews([]);
      setError(null);
      setLoading(false);
      setNextPage(null);
      return;
    }
    void loadInitial(pharmacy.id);
  }, [pharmacy?.id, loadInitial]);

  const address = pharmacyAddress(pharmacy);
  const documents = pharmacy ? DOCUMENTS.filter(([key]) => Boolean(pharmacy[key])) : [];

  return (
    <Portal>
      <Dialog visible={Boolean(pharmacy)} onDismiss={onDismiss} style={{ maxHeight: '86%', borderRadius: radius.card }}>
        <Dialog.Title>{pharmacy?.name || 'Pharmacy'}</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={{ paddingVertical: space.sm, gap: space.md }}>
            {address ? (
              <Pressable onPress={() => openMap(address)} accessibilityRole="link" hitSlop={8} style={styles.address}>
                <MapPin size={16} color={colors.accentStrong} />
                <Text style={[styles.muted, { color: colors.accentStrong }]}>{address}</Text>
              </Pressable>
            ) : null}
            <View style={{ gap: space.xs }}>
              <Text style={styles.section}>Documents for your shift</Text>
              {documents.length ? documents.map(([key, label]) => (
                <Pressable key={key} onPress={() => void Linking.openURL(String(pharmacy?.[key]))} accessibilityRole="link" style={styles.doc}>
                  <FileText size={18} color={MUTED} />
                  <Text style={{ flex: 1, color: INK }}>{label}</Text>
                  <Text style={{ color: colors.accentStrong, fontWeight: '600' }}>Open</Text>
                </Pressable>
              )) : <Text style={styles.muted}>This pharmacy has not shared documents yet.</Text>}
            </View>
            <View style={{ gap: space.xs }}>
              <Text style={styles.section}>
                What workers say{summary && summary.count > 0 ? ` · ${summary.average.toFixed(1)} (${summary.count})` : ''}
              </Text>
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : error ? (
                <ContentState
                  kind="error"
                  title="Could not load reviews"
                  description={error}
                  actionLabel="Try again"
                  onAction={() => pharmacy?.id && void loadInitial(pharmacy.id)}
                />
              ) : reviews.length ? (
                <>
                  {reviews.map((review) => (
                    <View key={review.id} style={styles.review}>
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {[1, 2, 3, 4, 5].map((v) => (
                          <Star
                            key={v}
                            size={14}
                            color={v <= review.stars ? colors.status.amber.solid : colors.textMuted}
                            fill={v <= review.stars ? colors.status.amber.solid : 'transparent'}
                          />
                        ))}
                      </View>
                      {review.comment ? <Text style={{ color: INK, marginTop: 2 }}>{review.comment}</Text> : null}
                    </View>
                  ))}
                  {paginationError ? (
                    <ContentState
                      kind="error"
                      title="Could not load more reviews"
                      description={paginationError}
                      actionLabel="Try again"
                      onAction={() => void loadMore()}
                    />
                  ) : nextPage ? (
                    <Button
                      mode="text"
                      loading={loadingMore}
                      disabled={loadingMore}
                      onPress={() => void loadMore()}
                      style={styles.actionBtn}
                    >
                      {loadingMore ? 'Loading more...' : 'Load more reviews'}
                    </Button>
                  ) : null}
                </>
              ) : (
                <Text style={styles.muted}>No reviews yet.</Text>
              )}
            </View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss} style={styles.actionBtn}>Close</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: BORDER, borderRadius: radius.card, backgroundColor: colors.surfaceBg, overflow: 'hidden' },
  cardBody: { padding: space.md, gap: 10 },
  headerRow: { flexDirection: 'row', gap: space.sm },
  tile: { width: 44, height: 44, borderRadius: radius.nested, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 18, fontWeight: '600', color: INK },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.xs },
  pill: { paddingHorizontal: 10, minHeight: 26, borderRadius: radius.pill, justifyContent: 'center' },
  pillText: { fontSize: 12, fontWeight: '600' },
  address: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingVertical: space.xs },
  muted: { fontSize: 13.5, lineHeight: 20, color: MUTED, flexShrink: 1 },
  slot: { borderWidth: 1, borderColor: BORDER, borderRadius: radius.control, padding: 10 },
  slotDay: { fontSize: 11.5, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  slotDate: { fontSize: 15, fontWeight: '600', color: INK },
  footer: { borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: colors.subtleBg, padding: space.sm, gap: 10 },
  footerLabel: { fontSize: 12.5, fontWeight: '600', color: MUTED },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  state: { alignItems: 'center', gap: 10, padding: space.lg, margin: space.md, borderWidth: 1, borderColor: BORDER, borderRadius: radius.card, backgroundColor: colors.surfaceBg },
  stateTitle: { fontSize: 17, fontWeight: '600', color: INK },
  section: { fontSize: 13, fontWeight: '700', color: INK },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: space.sm, borderWidth: 1, borderColor: BORDER, borderRadius: radius.control, minHeight: 48 },
  review: { padding: 10, borderRadius: radius.control, backgroundColor: colors.subtleBg },
  actionBtn: { minHeight: 44, justifyContent: 'center' },
});
