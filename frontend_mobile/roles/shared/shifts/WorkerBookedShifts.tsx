// The worker's booked shifts (Shift Centre Confirmed and History), the native twin of web WorkerBookedShifts: one card
// per shift with the pharmacy, role, rate, address and dates, the actions that fit the moment, and a shared pharmacy
// details dialog (address, shift documents, reviews).
import React, { useEffect, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Portal, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { bookedShiftRateLabel, hasVisibleBookedShiftBonus, fetchRatingsPageService, fetchRatingsSummaryService, type Shift, type ShiftRatingComment, type ShiftRatingSummary } from '@chemisttasker/shared-core';

type Pharmacy = NonNullable<Shift['pharmacyDetail']>;
const INK = '#06214A';
const MUTED = '#445474';
const BORDER = '#DCE3EE';

export const pharmacyAddress = (pharmacy?: Shift['pharmacyDetail'] | null) =>
  [pharmacy?.streetAddress, pharmacy?.suburb, pharmacy?.state, pharmacy?.postcode].filter(Boolean).join(', ');

export const openMap = (address: string) => {
  const query = encodeURIComponent(address);
  const url = Platform.select({ ios: `maps:0,0?q=${query}`, android: `geo:0,0?q=${query}`, default: `https://www.google.com/maps/search/?api=1&query=${query}` });
  void Linking.openURL(url!);
};

const dateBits = (raw?: string | null) => {
  const parsed = raw ? new Date(`${raw}T00:00:00`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { day: '', date: raw || 'Date to confirm' };
  return { day: parsed.toLocaleDateString('en-AU', { weekday: 'short' }), date: parsed.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) };
};
const clock = (raw?: string | null) => (raw ? String(raw).slice(0, 5) : '--');
const humanize = (value?: string | null) => String(value || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());


function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'navy' | 'green' | 'neutral' }) {
  const look = { navy: ['#06214A', '#FFFFFF'], green: ['#E4F5EA', '#17663A'], neutral: ['#F1F4F9', '#334565'] }[tone];
  return <View style={[styles.pill, { backgroundColor: look[0] }]}><Text style={[styles.pillText, { color: look[1] }]}>{label}</Text></View>;
}

export function WorkerBookedShiftCard({ shift, mode, rating, actions }: {
  shift: Shift; mode: 'confirmed' | 'history'; rating?: ShiftRatingSummary; actions: ReactNode;
}) {
  const pharmacy = shift.pharmacyDetail;
  const address = pharmacyAddress(pharmacy);
  const slots = shift.slots ?? [];
  return (
    <View style={styles.card} accessibilityLabel={pharmacy?.name || 'Shift'}>
      <View style={styles.cardBody}>
        <View style={styles.headerRow}>
          <View style={[styles.tile, { backgroundColor: mode === 'history' ? '#FBE8F4' : '#EEE8FC' }]}>
            <MaterialCommunityIcons name="storefront-outline" size={24} color={mode === 'history' ? '#A1196E' : '#5222B8'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{pharmacy?.name || 'Pharmacy'}</Text>
            <View style={styles.pills}>
              {shift.roleNeeded ? <Pill tone="navy" label={humanize(shift.roleLabel ?? shift.roleNeeded)} /> : null}
              {shift.employmentType ? <Pill label={humanize(shift.employmentType)} /> : null}
              <Pill tone={hasVisibleBookedShiftBonus(shift) ? 'green' : 'neutral'} label={bookedShiftRateLabel(shift)} />
            </View>
            {address ? (
              <Pressable onPress={() => openMap(address)} accessibilityRole="link" accessibilityLabel={`Open ${address} in maps`} style={styles.address}>
                <MaterialCommunityIcons name="map-marker-outline" size={15} color={MUTED} />
                <Text style={styles.muted}>{address}</Text>
              </Pressable>
            ) : null}
            {rating && rating.count > 0 ? (
              <View style={styles.address}>
                <MaterialCommunityIcons name="star" size={15} color="#F59E0B" />
                <Text style={styles.muted}>{rating.average.toFixed(1)} from {rating.count} {rating.count === 1 ? 'review' : 'reviews'}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {slots.map(slot => {
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
        <Text style={styles.footerLabel}>{mode === 'history' ? 'Worked' : 'Confirmed'} · {slots.length} {slots.length === 1 ? 'date' : 'dates'}</Text>
        <View style={styles.actions}>{actions}</View>
      </View>
    </View>
  );
}

export function BookedShiftsState({ mode, loading }: { mode: 'confirmed' | 'history'; loading: boolean }) {
  if (loading) return <View style={styles.state}><ActivityIndicator accessibilityLabel="Loading shifts" /></View>;
  return (
    <View style={styles.state}>
      <View style={[styles.tile, { backgroundColor: '#EEE8FC' }]}>
        <MaterialCommunityIcons name={mode === 'history' ? 'history' : 'calendar-check-outline'} size={24} color="#5222B8" />
      </View>
      <Text style={styles.stateTitle}>{mode === 'history' ? 'No past shifts yet' : 'No confirmed shifts yet'}</Text>
      <Text style={[styles.muted, { textAlign: 'center' }]}>
        {mode === 'history' ? 'Shifts you have worked appear here, ready for an invoice and a rating.' : 'When a pharmacy confirms you for a shift it appears here, with the address and their documents.'}
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
  useEffect(() => {
    setSummary(null);
    setReviews([]);
    if (!pharmacy?.id) return;
    setLoading(true);
    Promise.all([
      fetchRatingsSummaryService({ targetType: 'pharmacy', targetId: pharmacy.id }),
      fetchRatingsPageService({ targetType: 'pharmacy', targetId: pharmacy.id, page: 1 }),
    ]).then(([s, page]) => { setSummary(s); setReviews(page?.results || []); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [pharmacy?.id]);
  const address = pharmacyAddress(pharmacy);
  const documents = pharmacy ? DOCUMENTS.filter(([key]) => Boolean(pharmacy[key])) : [];
  return (
    <Portal>
      <Dialog visible={Boolean(pharmacy)} onDismiss={onDismiss} style={{ maxHeight: '86%' }}>
        <Dialog.Title>{pharmacy?.name || 'Pharmacy'}</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={{ paddingVertical: 12, gap: 16 }}>
            {address ? (
              <Pressable onPress={() => openMap(address)} accessibilityRole="link" style={styles.address}>
                <MaterialCommunityIcons name="map-marker-outline" size={16} color={MUTED} />
                <Text style={[styles.muted, { color: '#3C18A8' }]}>{address}</Text>
              </Pressable>
            ) : null}
            <View style={{ gap: 8 }}>
              <Text style={styles.section}>Documents for your shift</Text>
              {documents.length ? documents.map(([key, label]) => (
                <Pressable key={key} onPress={() => void Linking.openURL(String(pharmacy?.[key]))} accessibilityRole="link" style={styles.doc}>
                  <MaterialCommunityIcons name="file-document-outline" size={18} color={MUTED} />
                  <Text style={{ flex: 1, color: INK }}>{label}</Text>
                  <Text style={{ color: '#3C18A8', fontWeight: '600' }}>Open</Text>
                </Pressable>
              )) : <Text style={styles.muted}>This pharmacy has not shared documents yet.</Text>}
            </View>
            <View style={{ gap: 8 }}>
              <Text style={styles.section}>What workers say{summary && summary.count > 0 ? ` · ${summary.average.toFixed(1)} (${summary.count})` : ''}</Text>
              {loading ? <ActivityIndicator /> : reviews.length ? reviews.map(review => (
                <View key={review.id} style={styles.review}>
                  <Text style={{ color: '#B45309' }}>{'★'.repeat(review.stars)}{'☆'.repeat(Math.max(0, 5 - review.stars))}</Text>
                  {review.comment ? <Text style={{ color: INK, marginTop: 2 }}>{review.comment}</Text> : null}
                </View>
              )) : <Text style={styles.muted}>No reviews yet.</Text>}
            </View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions><Button onPress={onDismiss}>Close</Button></Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: BORDER, borderRadius: 20, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  cardBody: { padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', gap: 12 },
  tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 18, fontWeight: '600', color: INK },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: { paddingHorizontal: 10, minHeight: 26, borderRadius: 999, justifyContent: 'center' },
  pillText: { fontSize: 12, fontWeight: '600' },
  address: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  muted: { fontSize: 13.5, lineHeight: 20, color: MUTED, flexShrink: 1 },
  slot: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 10 },
  slotDay: { fontSize: 11.5, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  slotDate: { fontSize: 15, fontWeight: '600', color: INK },
  footer: { borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#F7F9FC', padding: 12, gap: 10 },
  footerLabel: { fontSize: 12.5, fontWeight: '600', color: MUTED },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  state: { alignItems: 'center', gap: 10, padding: 24, margin: 16, borderWidth: 1, borderColor: BORDER, borderRadius: 20, backgroundColor: '#FFFFFF' },
  stateTitle: { fontSize: 17, fontWeight: '600', color: INK },
  section: { fontSize: 13, fontWeight: '700', color: INK },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 12, minHeight: 48 },
  review: { padding: 10, borderRadius: 12, backgroundColor: '#F7F9FC' },
});
