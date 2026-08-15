import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Divider, IconButton, Surface, Text } from 'react-native-paper';
import { Candidate } from '../types';

const weekDayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfMondayWeek = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
};

export default function AvailabilitySidebar({
  candidate,
  onClose,
  canRequestBooking = false,
  onRequestBooking,
  currentUserId,
}: {
  candidate: Candidate | null;
  onClose: () => void;
  canRequestBooking?: boolean;
  onRequestBooking?: (candidate: Candidate, dates: string[]) => void;
  currentUserId?: number | null;
}) {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const availableSlots = candidate?.availableSlots || [];
  const availableDateSet = useMemo(() => new Set(candidate?.availableDates || []), [candidate?.availableDates]);

  useEffect(() => {
    setSelectedDates([]);
  }, [candidate?.id]);

  const slotsForSelected = useMemo(() => {
    if (selectedDates.length === 0) return [];
    return availableSlots.filter((slot) => selectedDates.includes(slot.date));
  }, [availableSlots, selectedDates]);

  if (!candidate) return null;

  const isOwnPost = currentUserId != null && candidate.authorUserId === currentUserId;
  const today = new Date();
  const calendarStart = startOfMondayWeek(today);
  const calendarGrid = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return { iso: toIsoDate(date), dayNum: date.getDate() };
  });

  const toggleSelectedDate = (dateStr: string) => {
    setSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  return (
    <Surface style={styles.panel} elevation={2}>
      <View style={styles.header}>
        <Text variant="titleLarge" style={styles.title}>Availability</Text>
        <IconButton icon="close" size={20} onPress={onClose} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Availability</Text>
          <Text style={styles.infoText}>Dates selected in the pitch calendar.</Text>

          {selectedDates.length > 0 && slotsForSelected.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              {slotsForSelected.map((slot, idx) => {
                const start = slot.startTime ?? (slot as any).start_time ?? null;
                const end = slot.endTime ?? (slot as any).end_time ?? null;
                return (
                  <Text key={`${slot.date}-${idx}`} style={styles.infoText}>
                    {slot.date} {slot.isAllDay ? '- All Day' : start && end ? `- ${start}-${end}` : '- Time not set'}
                  </Text>
                );
              })}
            </View>
          ) : null}

          {selectedDates.length === 0 && (candidate.availableSlots?.length || 0) > 0 ? (
            <Text style={[styles.infoText, { marginTop: 8 }]}>Select one or more dates to see the time slot.</Text>
          ) : null}
        </View>

        <Text style={styles.caption}>Next 4 Weeks</Text>
        {selectedDates.length > 0 ? (
          <Text style={styles.caption}>Selected: {selectedDates.length} date{selectedDates.length > 1 ? 's' : ''}</Text>
        ) : null}

        <View style={styles.weekHead}>
          {weekDayLabels.map((d, idx) => (
            <Text key={`${d}-${idx}`} style={styles.weekText}>{d}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {calendarGrid.map((day, idx) => {
            const isSelected = selectedDates.includes(day.iso);
            const isAvailable = availableDateSet.has(day.iso);
            return (
              <TouchableOpacity
                key={`${day.iso}-${idx}`}
                disabled={!isAvailable}
                onPress={() => toggleSelectedDate(day.iso)}
                style={[
                  styles.cell,
                  isAvailable ? styles.available : styles.unavailable,
                  isSelected ? styles.selected : null,
                ]}
              >
                <Text style={[styles.cellText, !isAvailable ? styles.unavailableText : null]}>{day.dayNum}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Divider />
      {canRequestBooking && !isOwnPost ? (
        <View style={styles.footer}>
          <Button
            mode="contained"
            disabled={selectedDates.length === 0}
            onPress={() => onRequestBooking?.(candidate, selectedDates)}
          >
            {selectedDates.length > 0 ? `Request Booking (${selectedDates.length})` : 'Request Booking'}
          </Button>
          {selectedDates.length === 0 ? (
            <Text style={styles.caption}>Select one or more dates to request booking.</Text>
          ) : null}
        </View>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontWeight: '700' },
  body: { paddingHorizontal: 12, paddingTop: 12, maxHeight: 420 },
  infoBox: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#A5B4FC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  infoTitle: { color: '#4F46E5', fontWeight: '700' },
  infoText: { color: '#6B7280', fontSize: 12 },
  caption: { color: '#6B7280', fontSize: 12, marginBottom: 6 },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  weekText: { width: '14.1%', textAlign: 'center', color: '#9CA3AF', fontWeight: '700', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: {
    width: '13.5%',
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  available: { backgroundColor: '#DCFCE7', borderColor: '#22C55E' },
  unavailable: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' },
  selected: { backgroundColor: '#DBEAFE', borderColor: '#2563EB' },
  cellText: { fontWeight: '700', color: '#166534' },
  unavailableText: { color: '#9CA3AF', fontWeight: '500' },
  footer: { padding: 12, gap: 6 },
});
