import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Chip, IconButton, Menu, Modal, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';
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
const engagementOptions = ['FULL_TIME', 'PART_TIME', 'CASUAL', 'VOLUNTEERING', 'PLACEMENT'];
const recurringDayOptions = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

const todayIso = () => toIsoDate(new Date());

const fromIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const buildMonthCells = (anchor: Date) => {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  const mondayOffset = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - mondayOffset);
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
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [recurringEndPickerOpen, setRecurringEndPickerOpen] = useState(false);
  const [travelMenuVisible, setTravelMenuVisible] = useState(false);
  const [engagementMenuVisible, setEngagementMenuVisible] = useState(false);
  const [calendarGridWidth, setCalendarGridWidth] = useState(0);
  const [currentEntry, setCurrentEntry] = useState<PitchAvailabilityEntry>({
    date: '',
    startTime: '09:00',
    endTime: '17:00',
    isAllDay: false,
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setAvailabilityEntries((pitchForm.availabilitySlots || []).filter((slot) => slot.date >= todayIso()));
  }, [open, pitchForm.availabilitySlots]);

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
  const savedAvailabilityDateSet = useMemo(
    () => new Set(availabilityEntries.map((entry) => entry.date).filter(Boolean)),
    [availabilityEntries]
  );
  const recurringPreviewDateSet = useMemo(() => {
    if (!isRecurring || !currentEntry.date || !recurringEndDate || !recurringDays.length) return new Set<string>();
    const dates = new Set<string>();
    const end = new Date(`${recurringEndDate}T00:00:00`);
    for (let cursor = new Date(`${currentEntry.date}T00:00:00`), count = 0; cursor <= end && count < 366; cursor.setDate(cursor.getDate() + 1), count += 1) {
      if (recurringDays.includes(cursor.getDay())) dates.add(toIsoDate(cursor));
    }
    return dates;
  }, [currentEntry.date, isRecurring, recurringDays, recurringEndDate]);
  const syncSelectedDates = (dates: string[]) => {
    const sorted = [...new Set(dates)].sort();
    setSelectedDates(sorted);
    setCurrentEntry((prev) => ({ ...prev, date: sorted[0] || '' }));
    if (isRecurring) setRecurringEndDate(sorted[sorted.length - 1] || '');
  };
  const toggleCalendarDate = (date: string) => {
    syncSelectedDates(selectedDates.includes(date) ? selectedDates.filter((item) => item !== date) : [...selectedDates, date]);
  };
  const addCalendarDate = (date: string) => {
    setSelectedDates((prevDates) => {
      if (prevDates.includes(date)) return prevDates;
      const sorted = [...prevDates, date].sort();
      setCurrentEntry((prev) => ({ ...prev, date: sorted[0] || '' }));
      if (isRecurring) setRecurringEndDate(sorted[sorted.length - 1] || '');
      return sorted;
    });
  };
  const getCalendarDateFromTouch = (locationX: number, locationY: number) => {
    if (!calendarGridWidth) return null;
    const cellSize = calendarGridWidth / 7;
    const column = Math.max(0, Math.min(6, Math.floor(locationX / cellSize)));
    const row = Math.max(0, Math.floor(locationY / cellSize));
    const cell = monthCells[row * 7 + column];
    return cell?.inMonth ? cell.iso : null;
  };

  const handleAddAvailability = async () => {
    const targetDates = isRecurring
      ? expandRecurringDates([currentEntry.date].filter(Boolean), recurringDays, recurringEndDate)
      : (selectedDates.length ? selectedDates : [currentEntry.date].filter(Boolean));
    const futureTargetDates = targetDates.filter((date) => date >= todayIso());
    if (!futureTargetDates.length) {
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
    const nextEntries = futureTargetDates
      .map((date) => {
        return {
          date,
          startTime: currentEntry.isAllDay ? '00:00' : currentEntry.startTime,
          endTime: currentEntry.isAllDay ? '23:59' : currentEntry.endTime,
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
    setSelectedDates([]);
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
                <Menu
                  visible={travelMenuVisible}
                  onDismiss={() => setTravelMenuVisible(false)}
                  anchor={
                    <Button mode="outlined" onPress={() => setTravelMenuVisible(true)}>
                      {`Travel States: ${pitchForm.travelStates.join(', ') || 'Select'}`}
                    </Button>
                  }
                >
                  {stateOptions.map((state) => {
                    const selected = pitchForm.travelStates.includes(state);
                    return (
                      <Checkbox.Item
                        key={state}
                        label={state}
                        status={selected ? 'checked' : 'unchecked'}
                        onPress={() =>
                          setPitchForm((prev) => ({
                            ...prev,
                            travelStates: selected
                              ? prev.travelStates.filter((s) => s !== state)
                              : [...prev.travelStates, state],
                          }))
                        }
                        position="leading"
                        style={styles.checkboxItem}
                      />
                    );
                  })}
                </Menu>
              ) : null}

              <Menu
                visible={engagementMenuVisible}
                onDismiss={() => setEngagementMenuVisible(false)}
                anchor={
                  <Button mode="outlined" onPress={() => setEngagementMenuVisible(true)}>
                    {`Engagement Type: ${pitchForm.workTypes.length ? pitchForm.workTypes.map(titleCase).join(', ') : 'Select'}`}
                  </Button>
                }
              >
                {engagementOptions.map((value) => {
                  const selected = pitchForm.workTypes.includes(value);
                  return (
                  <Checkbox.Item
                    key={value}
                    label={titleCase(value)}
                    status={selected ? 'checked' : 'unchecked'}
                    onPress={() =>
                      setPitchForm((prev) => ({
                        ...prev,
                        workTypes: selected
                          ? prev.workTypes.filter((w) => w !== value)
                          : [...prev.workTypes, value],
                      }))
                    }
                    position="leading"
                    style={styles.checkboxItem}
                  />
                  );
                })}
              </Menu>
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
              <SegmentedButtons
                value={isRecurring ? 'recurring' : 'single'}
                onValueChange={(value) => {
                  setIsRecurring(value === 'recurring');
                  setRecurringDays([]);
                  setRecurringEndDate(value === 'recurring' ? selectedDates[selectedDates.length - 1] || '' : '');
                }}
                buttons={[
                  { label: 'Recurring availability', value: 'recurring' },
                  { label: 'Pick specific dates', value: 'single' },
                ]}
                style={styles.modeTabs}
              />
              <Text style={styles.modeDescription}>
                {isRecurring
                  ? 'Select the start and end date on the calendar, then choose the weekdays you are available before publishing.'
                  : 'Pick the dates you are available on the calendar. Tap again to deselect, or drag across dates to select multiple days.'}
              </Text>
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
                <View
                  style={styles.calendarGrid}
                  onLayout={(event) => setCalendarGridWidth(event.nativeEvent.layout.width)}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(event) => {
                    const date = getCalendarDateFromTouch(event.nativeEvent.locationX, event.nativeEvent.locationY);
                    if (date) toggleCalendarDate(date);
                  }}
                  onResponderMove={(event) => {
                    const date = getCalendarDateFromTouch(event.nativeEvent.locationX, event.nativeEvent.locationY);
                    if (date) addCalendarDate(date);
                  }}
                >
                  {monthCells.map((cell, index) => {
                    const selected = selectedDates.includes(cell.iso);
                    const saved = savedAvailabilityDateSet.has(cell.iso);
                    const recurringPreview = recurringPreviewDateSet.has(cell.iso);
                    return (
                      <View
                        key={`${cell.iso}-${index}`}
                        style={[
                          styles.calendarCell,
                          !cell.inMonth && styles.calendarCellMuted,
                          saved && styles.calendarCellSaved,
                          recurringPreview && styles.calendarCellRecurring,
                          selected && styles.calendarCellSelected,
                        ]}
                      >
                        <Text style={[styles.calendarCellText, recurringPreview && styles.calendarCellTextRecurring, selected && styles.calendarCellTextSelected]}>{cell.day}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              <TextInput
                mode="outlined"
                label={isRecurring ? 'Start Date' : 'Date'}
                value={currentEntry.date}
                placeholder="YYYY-MM-DD"
                onChangeText={(value) => syncSelectedDates(value ? [value] : [])}
              />
              {selectedDates.length > 0 ? <Text style={styles.hint}>{`Selected dates: ${selectedDates.join(', ')}`}</Text> : null}
              {isRecurring ? (
                <>
                  <TextInput
                    mode="outlined"
                    label="End Date"
                    value={recurringEndDate}
                    placeholder="YYYY-MM-DD"
                    right={<TextInput.Icon icon="calendar" onPress={() => setRecurringEndPickerOpen(true)} />}
                    editable={false}
                  />
                  <View style={styles.chipsWrap}>
                    {recurringDayOptions.map(({ label, value }) => (
                      <Chip
                        key={label}
                        selected={recurringDays.includes(value)}
                        onPress={() =>
                          setRecurringDays((prev) =>
                            prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value].sort()
                          )
                        }
                      >
                        {label}
                      </Chip>
                    ))}
                  </View>
                </>
              ) : null}

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
              <Button mode="contained" onPress={handleAddAvailability}>Add Availability</Button>

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
  modeTabs: { alignSelf: 'center', maxWidth: 520 },
  modeDescription: { color: '#6B7280', fontSize: 12, fontWeight: '600', textAlign: 'center', alignSelf: 'center', maxWidth: 520 },
  checkboxItem: { paddingVertical: 0 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallMuted: { color: '#6B7280', fontSize: 12 },
  hint: { color: '#6B7280', fontSize: 11 },
  calendarPanel: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 6,
    gap: 6,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
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
    height: 30,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  calendarCellMuted: { opacity: 0.35 },
  calendarCellSaved: { borderColor: '#A5B4FC', borderWidth: 2 },
  calendarCellRecurring: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  calendarCellSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  calendarCellWithEntry: { borderColor: '#7C3AED', borderWidth: 2 },
  calendarCellText: { color: '#111827', fontWeight: '600', fontSize: 12 },
  calendarCellTextRecurring: { color: '#166534', fontWeight: '800' },
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
