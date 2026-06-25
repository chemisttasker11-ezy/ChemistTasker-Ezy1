import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Chip, Modal, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';
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

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());

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
  const [datePickerOpen, setDatePickerOpen] = useState(false);
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

  const handleAddAvailability = async () => {
    if (!currentEntry.date) {
      setAvailabilityError('Please select a date.');
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
    const nextEntry = {
      date: currentEntry.date,
      startTime: currentEntry.startTime,
      endTime: currentEntry.endTime,
      isAllDay: currentEntry.isAllDay,
      notes: currentEntry.notes,
    };
    setAvailabilityEntries((prev) => [...prev, nextEntry]);
    setPitchForm((prev) => ({ ...prev, availabilitySlots: [...(prev.availabilitySlots || []), nextEntry] }));
    setCurrentEntry({ date: '', startTime: '09:00', endTime: '17:00', isAllDay: false, notes: '' });
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
              <Text style={styles.label}>Pick your available day</Text>
              <Button mode="outlined" onPress={() => setDatePickerOpen(true)}>
                {currentEntry.date || 'Select date'}
              </Button>

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
              <Button mode="contained" onPress={handleAddAvailability}>Add Time Slot</Button>

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
            {pitchSaving ? 'Saving...' : tabIndex === lastTabIndex ? (existingPostId ? 'Update Pitch' : 'Create Pitch') : 'Next'}
          </Button>
          <Button onPress={onClose} disabled={pitchSaving}>Cancel</Button>
        </View>

        <DatePickerModal
          mode="single"
          locale="en"
          visible={datePickerOpen}
          onDismiss={() => setDatePickerOpen(false)}
          date={currentEntry.date ? new Date(`${currentEntry.date}T00:00:00`) : new Date()}
          onConfirm={({ date }) => {
            setCurrentEntry((prev) => ({ ...prev, date: date ? date.toISOString().split('T')[0] : '' }));
            setDatePickerOpen(false);
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
