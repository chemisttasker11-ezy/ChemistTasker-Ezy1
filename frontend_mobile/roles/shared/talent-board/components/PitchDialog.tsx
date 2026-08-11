import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Checkbox, Chip, IconButton, Modal, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';

type PitchAvailabilityEntry = {
  date: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  notes: string;
};

export type PitchFormState = {
  headline: string;
  body: string;
  workTypes: string[];
  postKind: 'FULL_TIME_APPLICATION' | 'AVAILABILITY';
  streetAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  openToTravel: boolean;
  travelStates: string[];
  coverageRadiusKm: number;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string;
  availabilitySlots: PitchAvailabilityEntry[];
};

const radiusOptions = [5, 10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 300, 500, 1000];
const stateOptions = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const weekDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const formatDisplayDate = (value: string) =>
  fromIsoDate(value).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const buildMonthCells = (anchor: Date) => {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      iso: toIsoDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === anchor.getMonth(),
    };
  });
};

const expandRecurringDates = (startDates: string[], recurringDays: number[], recurringEndDate: string) => {
  if (!startDates.length || !recurringDays.length || !recurringEndDate) return [];
  const start = fromIsoDate([...startDates].sort()[0]);
  const end = fromIsoDate(recurringEndDate);
  const dates: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (recurringDays.includes(cursor.getDay())) {
      dates.push(toIsoDate(cursor));
    }
  }
  return dates;
};

export default function PitchDialog(props: {
  open: boolean;
  isExplorer: boolean;
  existingPostId: number | null;
  pitchForm: PitchFormState;
  setPitchForm: React.Dispatch<React.SetStateAction<PitchFormState>>;
  pitchError: string | null;
  pitchSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const {
    open,
    isExplorer,
    existingPostId,
    pitchForm,
    setPitchForm,
    pitchError,
    pitchSaving,
    onClose,
    onSave,
    onDelete,
  } = props;

  const [tabIndex, setTabIndex] = useState(0);
  const [availabilityEntries, setAvailabilityEntries] = useState<PitchAvailabilityEntry[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedDateTimes, setSelectedDateTimes] = useState<Record<string, { startTime: string; endTime: string }>>({});
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [recurringEndPickerOpen, setRecurringEndPickerOpen] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<PitchAvailabilityEntry>({
    date: '',
    startTime: '09:00',
    endTime: '17:00',
    isAllDay: false,
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    if (availabilityEntries.length > 0) return;
    if (!pitchForm.availabilitySlots || pitchForm.availabilitySlots.length === 0) return;
    setAvailabilityEntries(pitchForm.availabilitySlots);
  }, [open, availabilityEntries.length, pitchForm.availabilitySlots]);

  useEffect(() => {
    if (pitchForm.postKind === 'FULL_TIME_APPLICATION') {
      setAvailabilityEntries([]);
      setAvailabilityError(null);
    } else if (!pitchForm.availabilitySlots || pitchForm.availabilitySlots.length === 0) {
      setAvailabilityEntries([]);
    }
  }, [pitchForm.postKind, pitchForm.availabilitySlots]);

  const validateTimeRange = (start: string, end: string) => new Date(`2025-01-01T${end}`) > new Date(`2025-01-01T${start}`);

  const monthCells = useMemo(() => buildMonthCells(calendarMonth), [calendarMonth]);
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const entryDateSet = useMemo(() => new Set(availabilityEntries.map((entry) => entry.date)), [availabilityEntries]);

  const toggleSelectedDate = (iso: string) => {
    setSelectedDates((prev) => (prev.includes(iso) ? prev.filter((date) => date !== iso) : [...prev, iso].sort()));
    setSelectedDateTimes((prev) => {
      const next = { ...prev };
      if (selectedDateSet.has(iso)) {
        delete next[iso];
      } else if (!next[iso]) {
        next[iso] = { startTime: currentEntry.startTime, endTime: currentEntry.endTime };
      }
      return next;
    });
  };

  const clearSelectedDates = () => {
    setSelectedDates([]);
    setSelectedDateTimes({});
  };

  const handleAddAvailability = async () => {
    const targetDates = isRecurring
      ? expandRecurringDates(selectedDates, recurringDays, recurringEndDate)
      : selectedDates;
    if (!targetDates.length) {
      setAvailabilityError(isRecurring ? 'Please select a start date, recurring days, and an end date.' : 'Please select at least one date.');
      return;
    }
    if (!currentEntry.startTime || !currentEntry.endTime) {
      setAvailabilityError('Please set start and end times.');
      return;
    }
    if (!validateTimeRange(currentEntry.startTime, currentEntry.endTime)) {
      setAvailabilityError('End time must be after start time.');
      return;
    }
    setAvailabilityError(null);
    const existingKeys = new Set(availabilityEntries.map((entry) => `${entry.date}-${entry.startTime}-${entry.endTime}`));
    const nextEntries = targetDates
      .map((date) => {
        const times = selectedDateTimes[date] || { startTime: currentEntry.startTime, endTime: currentEntry.endTime };
        return {
          date,
          startTime: currentEntry.isAllDay ? '00:00' : times.startTime,
          endTime: currentEntry.isAllDay ? '23:59' : times.endTime,
          isAllDay: currentEntry.isAllDay,
          notes: currentEntry.notes,
        };
      })
      .filter((entry) => !existingKeys.has(`${entry.date}-${entry.startTime}-${entry.endTime}`));
    if (!nextEntries.length) {
      setAvailabilityError('Those availability slots are already added.');
      return;
    }
    const mergedEntries = [...availabilityEntries, ...nextEntries].sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
    setAvailabilityEntries(mergedEntries);
    setPitchForm((prev) => ({ ...prev, availabilitySlots: mergedEntries }));
    setCurrentEntry({ date: '', startTime: '09:00', endTime: '17:00', isAllDay: false, notes: '' });
    clearSelectedDates();
    setIsRecurring(false);
    setRecurringDays([]);
    setRecurringEndDate('');
  };

  const handleDeleteAvailability = (index: number) => {
    setAvailabilityEntries((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      setPitchForm((prevForm) => ({ ...prevForm, availabilitySlots: next }));
      return next;
    });
  };

  const lastTabIndex = 2;
  const handleNextTab = () => {
    if (tabIndex >= lastTabIndex) {
      onSave();
      return;
    }
    setTabIndex((prev) => Math.min(prev + 1, lastTabIndex));
  };
  const handleBackTab = () => {
    setTabIndex((prev) => Math.max(prev - 1, 0));
  };

  const selectedStatesLabel = useMemo(
    () => (pitchForm.travelStates.length ? pitchForm.travelStates.join(', ') : 'Select states'),
    [pitchForm.travelStates]
  );

  return (
    <Portal>
      <Modal visible={open} onDismiss={onClose} contentContainerStyle={styles.modal}>
        <Text variant="titleLarge" style={styles.title}>{existingPostId ? 'Update Pitch' : 'Pitch Yourself'}</Text>
        <SegmentedButtons
          value={String(tabIndex)}
          onValueChange={(v) => setTabIndex(Number(v))}
          buttons={[
            { label: 'Basic', value: '0' },
            { label: 'Location', value: '1' },
            { label: 'Availability', value: '2' },
          ]}
          style={{ marginBottom: 10 }}
        />

        <ScrollView>
          {tabIndex === 0 ? (
            <View style={styles.tabBody}>
              {pitchError ? <Text style={styles.errorText}>{pitchError}</Text> : null}
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>Please do not add contact details or identifying information.</Text>
              </View>
              <TextInput
                mode="outlined"
                label="Headline"
                value={pitchForm.headline}
                onChangeText={(value) => setPitchForm((prev) => ({ ...prev, headline: value }))}
              />
              <TextInput
                mode="outlined"
                label={isExplorer ? "What's on your mind?" : 'Short Bio'}
                multiline
                numberOfLines={4}
                value={pitchForm.body}
                onChangeText={(value) => setPitchForm((prev) => ({ ...prev, body: value }))}
              />
            </View>
          ) : null}

          {tabIndex === 1 ? (
            <View style={styles.tabBody}>
              <TextInput
                mode="outlined"
                label="Address"
                value={pitchForm.streetAddress}
                onChangeText={(value) => setPitchForm((prev) => ({ ...prev, streetAddress: value }))}
              />
              <View style={styles.row}>
                <TextInput
                  mode="outlined"
                  label="Suburb"
                  value={pitchForm.suburb}
                  onChangeText={(value) => setPitchForm((prev) => ({ ...prev, suburb: value }))}
                  style={styles.flex}
                />
                <TextInput
                  mode="outlined"
                  label="State"
                  value={pitchForm.state}
                  onChangeText={(value) => setPitchForm((prev) => ({ ...prev, state: value }))}
                  style={styles.flex}
                />
              </View>
              <TextInput
                mode="outlined"
                label="Postcode"
                value={pitchForm.postcode}
                onChangeText={(value) => setPitchForm((prev) => ({ ...prev, postcode: value }))}
              />

              <Text style={styles.label}>Work Travel Radius (km)</Text>
              <View style={styles.chipsWrap}>
                {radiusOptions.map((value) => (
                  <Chip
                    key={value}
                    selected={pitchForm.coverageRadiusKm === value}
                    onPress={() => setPitchForm((prev) => ({ ...prev, coverageRadiusKm: value }))}
                    disabled={pitchForm.openToTravel}
                  >
                    {value}
                  </Chip>
                ))}
              </View>

              <Checkbox.Item
                label="Willing to travel/Regional"
                status={pitchForm.openToTravel ? 'checked' : 'unchecked'}
                onPress={() =>
                  setPitchForm((prev) => ({
                    ...prev,
                    openToTravel: !prev.openToTravel,
                    travelStates: !prev.openToTravel ? prev.travelStates : [],
                  }))
                }
                position="leading"
              />

              {pitchForm.openToTravel ? (
                <>
                  <Text style={styles.label}>Travel States</Text>
                  <Text style={styles.smallMuted}>{selectedStatesLabel}</Text>
                  <View style={styles.chipsWrap}>
                    {stateOptions.map((state) => (
                      <Chip
                        key={state}
                        selected={pitchForm.travelStates.includes(state)}
                        onPress={() =>
                          setPitchForm((prev) => ({
                            ...prev,
                            travelStates: prev.travelStates.includes(state)
                              ? prev.travelStates.filter((s) => s !== state)
                              : [...prev.travelStates, state],
                          }))
                        }
                      >
                        {state}
                      </Chip>
                    ))}
                  </View>
                </>
              ) : null}

              <Text style={styles.label}>Engagement Type</Text>
              <View style={styles.chipsWrap}>
                {['FULL_TIME', 'PART_TIME', 'CASUAL', 'VOLUNTEERING', 'PLACEMENT'].map((value) => (
                  <Chip
                    key={value}
                    selected={pitchForm.workTypes.includes(value)}
                    onPress={() =>
                      setPitchForm((prev) => ({
                        ...prev,
                        workTypes: prev.workTypes.includes(value)
                          ? prev.workTypes.filter((w) => w !== value)
                          : [...prev.workTypes, value],
                      }))
                    }
                  >
                    {titleCase(value)}
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}

          {tabIndex === 2 ? (
            <View style={styles.tabBody}>
              <Text style={styles.label}>Availability Style</Text>
              <SegmentedButtons
                value={pitchForm.postKind}
                onValueChange={(value) => {
                  setAvailabilityEntries([]);
                  setPitchForm((prev) => ({
                    ...prev,
                    postKind: value as 'FULL_TIME_APPLICATION' | 'AVAILABILITY',
                    workTypes:
                      value === 'FULL_TIME_APPLICATION' && !prev.workTypes.includes('FULL_TIME')
                        ? [...prev.workTypes, 'FULL_TIME']
                        : prev.workTypes,
                    availabilitySlots: value === 'FULL_TIME_APPLICATION' ? [] : prev.availabilitySlots,
                  }));
                }}
                buttons={[
                  { label: 'Open to Opportunities', value: 'FULL_TIME_APPLICATION' },
                  { label: 'Posting Availability', value: 'AVAILABILITY' },
                ]}
              />
              {pitchForm.postKind === 'FULL_TIME_APPLICATION' ? (
                <View style={styles.infoBox}>
                  <Text style={styles.infoTitle}>Open anytime</Text>
                  <Text style={styles.smallMuted}>
                    Opportunity posts do not show dated availability on the talent board.
                  </Text>
                </View>
              ) : (
                <>
              {availabilityError ? <Text style={styles.errorText}>{availabilityError}</Text> : null}
              <View style={styles.calendarPanel}>
                <View style={styles.calendarHeader}>
                  <IconButton icon="chevron-left" size={18} onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} />
                  <Text style={styles.calendarTitle}>
                    {calendarMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                  </Text>
                  <IconButton icon="chevron-right" size={18} onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} />
                </View>
                <View style={styles.calendarWeekHead}>
                  {weekDayLabels.map((day) => (
                    <Text key={day} style={styles.calendarWeekText}>{day.slice(0, 1)}</Text>
                  ))}
                </View>
                <View style={styles.calendarGrid}>
                  {monthCells.map((cell, index) => {
                    const selected = selectedDateSet.has(cell.iso);
                    const hasEntry = entryDateSet.has(cell.iso);
                    return (
                      <TouchableOpacity
                        key={`${cell.iso}-${index}`}
                        style={[
                          styles.calendarCell,
                          !cell.inMonth && styles.calendarCellMuted,
                          selected && styles.calendarCellSelected,
                          hasEntry && !selected && styles.calendarCellWithEntry,
                        ]}
                        onPress={() => toggleSelectedDate(cell.iso)}
                      >
                        <Text style={[styles.calendarCellText, selected && styles.calendarCellTextSelected]}>{cell.day}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.hint}>Blue: selected dates. Purple border: availability already added.</Text>
              </View>

              <Checkbox.Item
                label="All Day"
                status={currentEntry.isAllDay ? 'checked' : 'unchecked'}
                onPress={() =>
                  setCurrentEntry((prev) => ({
                    ...prev,
                    isAllDay: !prev.isAllDay,
                    startTime: !prev.isAllDay ? '00:00' : '09:00',
                    endTime: !prev.isAllDay ? '23:59' : '17:00',
                  }))
                }
                position="leading"
              />

              <View style={styles.row}>
                <TextInput
                  mode="outlined"
                  label="Start Time"
                  value={currentEntry.startTime}
                  onChangeText={(value) => setCurrentEntry((prev) => ({ ...prev, startTime: value }))}
                  style={styles.flex}
                  disabled={currentEntry.isAllDay}
                />
                <TextInput
                  mode="outlined"
                  label="End Time"
                  value={currentEntry.endTime}
                  onChangeText={(value) => setCurrentEntry((prev) => ({ ...prev, endTime: value }))}
                  style={styles.flex}
                  disabled={currentEntry.isAllDay}
                />
              </View>
              <TextInput
                mode="outlined"
                label="Notes"
                multiline
                value={currentEntry.notes}
                onChangeText={(value) => setCurrentEntry((prev) => ({ ...prev, notes: value }))}
              />
              <Checkbox.Item
                label="Repeats"
                status={isRecurring ? 'checked' : 'unchecked'}
                onPress={() => setIsRecurring((value) => !value)}
                position="leading"
              />
              {isRecurring ? (
                <>
                  <View style={styles.chipsWrap}>
                    {weekDayLabels.map((day, index) => (
                      <Chip
                        key={day}
                        selected={recurringDays.includes(index)}
                        onPress={() =>
                          setRecurringDays((prev) =>
                            prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index].sort()
                          )
                        }
                      >
                        {day}
                      </Chip>
                    ))}
                  </View>
                  <TextInput
                    mode="outlined"
                    label="Repeat until"
                    value={recurringEndDate}
                    placeholder="YYYY-MM-DD"
                    right={<TextInput.Icon icon="calendar" onPress={() => setRecurringEndPickerOpen(true)} />}
                    editable={false}
                  />
                </>
              ) : null}
              {selectedDates.length > 0 ? (
                <View style={styles.selectedDaysPanel}>
                  <View style={styles.selectedDaysHeader}>
                    <Text style={styles.label}>Selected days</Text>
                    <Button mode="text" onPress={clearSelectedDates}>Clear</Button>
                  </View>
                  {selectedDates.map((date) => {
                    const times = selectedDateTimes[date] || { startTime: currentEntry.startTime, endTime: currentEntry.endTime };
                    return (
                      <View key={date} style={styles.selectedDayCard}>
                        <Chip onClose={() => toggleSelectedDate(date)}>{formatDisplayDate(date)}</Chip>
                        <View style={styles.row}>
                          <TextInput
                            mode="outlined"
                            label="Start"
                            value={times.startTime}
                            onChangeText={(value) => setSelectedDateTimes((prev) => ({ ...prev, [date]: { startTime: value, endTime: times.endTime } }))}
                            style={styles.flex}
                            disabled={currentEntry.isAllDay}
                          />
                          <TextInput
                            mode="outlined"
                            label="End"
                            value={times.endTime}
                            onChangeText={(value) => setSelectedDateTimes((prev) => ({ ...prev, [date]: { startTime: times.startTime, endTime: value } }))}
                            style={styles.flex}
                            disabled={currentEntry.isAllDay}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <Button mode="contained" onPress={handleAddAvailability}>Add Selected Availability</Button>

              <Text style={styles.label}>Your Time Slots</Text>
              {availabilityEntries.length === 0 ? (
                <Text style={styles.smallMuted}>No time slots added yet.</Text>
              ) : (
                availabilityEntries.map((entry, index) => (
                  <View key={`${entry.date}-${index}`} style={styles.slotItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600' }}>
                        {entry.date} - {entry.isAllDay ? 'All Day' : `${entry.startTime}-${entry.endTime}`}
                      </Text>
                      {entry.notes ? <Text style={styles.smallMuted}>{entry.notes}</Text> : null}
                    </View>
                    <Button textColor="#DC2626" onPress={() => handleDeleteAvailability(index)}>Delete</Button>
                  </View>
                ))
              )}
                </>
              )}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {existingPostId ? (
            <Button textColor="#DC2626" onPress={onDelete} disabled={pitchSaving}>Delete Pitch</Button>
          ) : <View />}
          <Button onPress={handleBackTab} disabled={pitchSaving || tabIndex === 0}>Back</Button>
          <Button mode="contained" onPress={handleNextTab} disabled={pitchSaving}>
            {pitchSaving ? 'Saving...' : tabIndex === lastTabIndex ? (existingPostId ? 'Update Availability' : 'Post Availability') : 'Next'}
          </Button>
          <Button onPress={onClose} disabled={pitchSaving}>Cancel</Button>
        </View>

        <DatePickerModal
          mode="single"
          locale="en"
          visible={recurringEndPickerOpen}
          onDismiss={() => setRecurringEndPickerOpen(false)}
          date={recurringEndDate ? fromIsoDate(recurringEndDate) : new Date()}
          onConfirm={({ date }) => {
            setRecurringEndDate(date ? toIsoDate(date) : '');
            setRecurringEndPickerOpen(false);
          }}
        />
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    maxHeight: '94%',
  },
  title: { fontWeight: '700', marginBottom: 8 },
  tabBody: { gap: 10, paddingVertical: 8 },
  warningBox: { backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#F87171', borderRadius: 12, padding: 12 },
  warningText: { color: '#B91C1C', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  infoBox: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, gap: 4 },
  infoTitle: { fontWeight: '700', color: '#111827' },
  errorText: { color: '#B91C1C', fontSize: 13 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  label: { fontWeight: '600', color: '#111827' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallMuted: { color: '#6B7280', fontSize: 12 },
  hint: { color: '#6B7280', fontSize: 11 },
  calendarPanel: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarTitle: { fontWeight: '700', color: '#111827' },
  calendarWeekHead: {
    flexDirection: 'row',
  },
  calendarWeekText: {
    flex: 1,
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  calendarCell: {
    width: '13.65%',
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  calendarCellMuted: { opacity: 0.35 },
  calendarCellSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  calendarCellWithEntry: { borderColor: '#7C3AED', borderWidth: 2 },
  calendarCellText: { color: '#111827', fontWeight: '600', fontSize: 12 },
  calendarCellTextSelected: { color: '#FFFFFF' },
  selectedDaysPanel: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  selectedDaysHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedDayCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 8,
    gap: 8,
  },
  slotItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
});
