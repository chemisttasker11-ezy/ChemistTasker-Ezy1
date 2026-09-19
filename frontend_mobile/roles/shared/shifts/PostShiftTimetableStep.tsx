import type { Dispatch, SetStateAction } from 'react';
import { TouchableOpacity, View } from 'react-native';
import {
  Button,
  Checkbox,
  Chip,
  IconButton,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import {
  formatAuDate,
  formatLongSlotDate,
  type PharmacyHoursForDate,
  type SlotEntry,
  type SlotTime,
} from './PostShiftScreen.helpers';
import { styles } from './PostShiftScreen.styles';

type Setter<T> = Dispatch<SetStateAction<T>>;

type CalendarCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

type Props = {
  selectedDates: string[];
  setSelectedDates: Setter<string[]>;
  slotDate: string;
  setSlotDate: Setter<string>;
  slotStart: string;
  setSlotStart: Setter<string>;
  slotEnd: string;
  setSlotEnd: Setter<string>;
  setSlotDatePickerOpen: Setter<boolean>;
  slotDateHours: PharmacyHoursForDate | null;
  calendarMonthAnchor: Date;
  setCalendarMonthAnchor: Setter<Date>;
  monthLabel: string;
  monthCalendarCells: CalendarCell[];
  selectedDateSet: Set<string>;
  slotDateSet: Set<string>;
  getDefaultTimesForDate: (date: string, fallback?: SlotTime) => PharmacyHoursForDate;
  selectedDateTimes: Record<string, SlotTime>;
  setSelectedDateTimes: Setter<Record<string, SlotTime>>;
  slotRecurring: boolean;
  setSlotRecurring: Setter<boolean>;
  slotRecurringDays: number[];
  toggleRecurringDay: (day: number) => void;
  slotRecurringEnd: string;
  setRecurringEndPickerOpen: Setter<boolean>;
  singleUserOnly: boolean;
  setSingleUserOnly: Setter<boolean>;
  closedSelectedDates: Array<{ date: string; hours: PharmacyHoursForDate }>;
  addAllSelectedSlots: () => void;
  addSelectedDateSlot: (date: string) => void;
  slots: SlotEntry[];
  addManualSlot: () => void;
  editSlot: (index: number) => void;
  removeSlot: (index: number) => void;
};

const chipStyle = (selected: boolean) => [
  styles.chip,
  selected ? styles.chipSelected : styles.chipUnselected,
];

const chipTextStyle = (selected: boolean) =>
  selected ? styles.chipTextSelected : styles.chipText;

export default function PostShiftTimetableStep({
  selectedDates,
  setSelectedDates,
  slotDate,
  setSlotDate,
  slotStart,
  setSlotStart,
  slotEnd,
  setSlotEnd,
  setSlotDatePickerOpen,
  slotDateHours,
  calendarMonthAnchor,
  setCalendarMonthAnchor,
  monthLabel,
  monthCalendarCells,
  selectedDateSet,
  slotDateSet,
  getDefaultTimesForDate,
  selectedDateTimes,
  setSelectedDateTimes,
  slotRecurring,
  setSlotRecurring,
  slotRecurringDays,
  toggleRecurringDay,
  slotRecurringEnd,
  setRecurringEndPickerOpen,
  singleUserOnly,
  setSingleUserOnly,
  closedSelectedDates,
  addAllSelectedSlots,
  addSelectedDateSlot,
  slots,
  addManualSlot,
  editSlot,
  removeSlot,
}: Props) {
  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.slotHeader}>
        <Text style={styles.label}>Timetable</Text>
        <Button
          mode="contained"
          onPress={addManualSlot}
          icon="plus"
          style={styles.primaryBtn}
          labelStyle={styles.primaryBtnText}
        >
          Add slot
        </Button>
      </View>

      <View style={styles.slotRow}>
        <TextInput
          mode="outlined"
          label="Date"
          value={
            selectedDates.length > 0
              ? `${selectedDates.length} dates selected`
              : formatAuDate(slotDate)
          }
          style={styles.slotInput}
          placeholder="Select date(s)"
          right={
            <TextInput.Icon
              icon="calendar"
              onPress={() => setSlotDatePickerOpen(true)}
            />
          }
          editable={false}
        />
        <TextInput
          mode="outlined"
          label="Start"
          value={slotStart}
          onChangeText={setSlotStart}
          style={styles.slotInput}
          placeholder="09:00"
        />
        <TextInput
          mode="outlined"
          label="End"
          value={slotEnd}
          onChangeText={setSlotEnd}
          style={styles.slotInput}
          placeholder="17:00"
        />
      </View>

      {slotDateHours?.closed ? (
        <View style={styles.closedNotice}>
          <Text style={styles.closedNoticeText}>
            This pharmacy is marked closed on this {slotDateHours.label}. You can still edit the times and add the shift.
          </Text>
        </View>
      ) : null}

      <Surface style={styles.calendarPanel} elevation={0}>
        <View style={styles.calendarHeader}>
          <IconButton
            icon="chevron-left"
            size={18}
            onPress={() =>
              setCalendarMonthAnchor(
                (previous) =>
                  new Date(previous.getFullYear(), previous.getMonth() - 1, 1),
              )
            }
          />
          <Text style={styles.calendarTitle}>{monthLabel}</Text>
          <IconButton
            icon="chevron-right"
            size={18}
            onPress={() =>
              setCalendarMonthAnchor(
                (previous) =>
                  new Date(previous.getFullYear(), previous.getMonth() + 1, 1),
              )
            }
          />
        </View>

        <View style={styles.calendarWeekHead}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <Text key={`${day}-${index}`} style={styles.calendarWeekText}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {monthCalendarCells.map((cell, index) => {
            if (!cell.inMonth) {
              return (
                <View
                  key={`${cell.iso}-${index}`}
                  style={[styles.calendarCell, styles.calendarCellPad]}
                />
              );
            }

            const isSelected = selectedDateSet.has(cell.iso);
            const hasSlot = slotDateSet.has(cell.iso);
            const hours = getDefaultTimesForDate(cell.iso);

            return (
              <TouchableOpacity
                key={`${cell.iso}-${index}`}
                style={[
                  styles.calendarCell,
                  hours.closed && styles.calendarCellClosed,
                  isSelected && styles.calendarCellSelected,
                  hours.closed &&
                    isSelected &&
                    styles.calendarCellClosedSelected,
                  hasSlot && styles.calendarCellWithSlot,
                ]}
                onPress={() => {
                  setSlotDate(cell.iso);
                  setSlotStart(hours.startTime);
                  setSlotEnd(hours.endTime);
                  setSelectedDates((previous) =>
                    previous.includes(cell.iso)
                      ? previous.filter((date) => date !== cell.iso)
                      : [...previous, cell.iso].sort(),
                  );
                  setSelectedDateTimes((previous) => {
                    const next = { ...previous };
                    if (selectedDateSet.has(cell.iso)) {
                      delete next[cell.iso];
                    } else if (!next[cell.iso]) {
                      next[cell.iso] = {
                        startTime: hours.startTime,
                        endTime: hours.endTime,
                      };
                    }
                    return next;
                  });
                }}
              >
                <Text
                  style={[
                    styles.calendarCellText,
                    isSelected && styles.calendarCellTextSelected,
                  ]}
                >
                  {cell.day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Blue: selected dates, purple border: dates already added to timetable.
        </Text>
      </Surface>

      <View style={styles.row}>
        <Checkbox
          status={slotRecurring ? 'checked' : 'unchecked'}
          onPress={() => setSlotRecurring((value) => !value)}
        />
        <Text style={styles.rowText}>Recurring</Text>
      </View>

      {slotRecurring ? (
        <>
          <View style={styles.recurringRow}>
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <Chip
                key={day}
                selected={slotRecurringDays.includes(day)}
                onPress={() => toggleRecurringDay(day)}
                style={chipStyle(slotRecurringDays.includes(day))}
                textStyle={chipTextStyle(slotRecurringDays.includes(day))}
              >
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}
              </Chip>
            ))}
          </View>
          <TextInput
            mode="outlined"
            label="Recurring end date"
            value={formatAuDate(slotRecurringEnd)}
            style={styles.input}
            placeholder="DD/MM/YYYY"
            right={
              <TextInput.Icon
                icon="calendar"
                onPress={() => setRecurringEndPickerOpen(true)}
              />
            }
            editable={false}
          />
        </>
      ) : null}

      <View style={styles.row}>
        <Checkbox
          status={singleUserOnly ? 'checked' : 'unchecked'}
          onPress={() => setSingleUserOnly((value) => !value)}
        />
        <Text style={styles.rowText}>Single user only</Text>
      </View>

      {selectedDates.length > 0 ? (
        <View style={styles.selectedDaysPanel}>
          <View style={styles.selectedDaysHeader}>
            <Text style={styles.label}>Selected calendar days</Text>
            <View style={styles.selectedDaysActions}>
              <Button
                mode="contained"
                onPress={addAllSelectedSlots}
                icon="plus"
                style={styles.primaryBtn}
                labelStyle={styles.primaryBtnText}
              >
                Add all
              </Button>
              <Button
                mode="text"
                onPress={() => {
                  setSelectedDates([]);
                  setSelectedDateTimes({});
                }}
              >
                Clear
              </Button>
            </View>
          </View>

          {closedSelectedDates.length > 0 ? (
            <View style={styles.closedNotice}>
              <Text style={styles.closedNoticeText}>
                {closedSelectedDates.length} selected date
                {closedSelectedDates.length > 1 ? 's are' : ' is'} marked closed for this pharmacy. They stay selected and the times remain editable.
              </Text>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            {selectedDates.map((date) => {
              const times = selectedDateTimes[date] || {
                startTime: slotStart,
                endTime: slotEnd,
              };
              const hours = getDefaultTimesForDate(date, times);

              return (
                <Surface
                  key={date}
                  style={[
                    styles.selectedDayCard,
                    hours.closed && styles.selectedDayCardClosed,
                  ]}
                  elevation={0}
                >
                  <View style={styles.selectedDayHeader}>
                    <View style={styles.selectedDayChipRow}>
                      <Chip
                        onClose={() => {
                          setSelectedDates((previous) =>
                            previous.filter((value) => value !== date),
                          );
                          setSelectedDateTimes((previous) => {
                            const next = { ...previous };
                            delete next[date];
                            return next;
                          });
                        }}
                        style={styles.chipUnselected}
                        textStyle={styles.chipText}
                      >
                        {formatAuDate(date)}
                      </Chip>

                      {hours.closed ? (
                        <Chip
                          icon="block-helper"
                          style={styles.closedChip}
                          textStyle={styles.closedChipText}
                        >
                          Closed {hours.label}
                        </Chip>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={styles.selectedDayAddBtn}
                      onPress={() => addSelectedDateSlot(date)}
                    >
                      <IconButton icon="plus" size={18} iconColor="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.slotRow}>
                    <TextInput
                      mode="outlined"
                      label="Start"
                      value={times.startTime}
                      onChangeText={(value) =>
                        setSelectedDateTimes((previous) => ({
                          ...previous,
                          [date]: {
                            startTime: value,
                            endTime: times.endTime,
                          },
                        }))
                      }
                      style={styles.slotInput}
                      placeholder="09:00"
                    />
                    <TextInput
                      mode="outlined"
                      label="End"
                      value={times.endTime}
                      onChangeText={(value) =>
                        setSelectedDateTimes((previous) => ({
                          ...previous,
                          [date]: {
                            startTime: times.startTime,
                            endTime: value,
                          },
                        }))
                      }
                      style={styles.slotInput}
                      placeholder="17:00"
                    />
                  </View>
                </Surface>
              );
            })}
          </View>

          <Text style={styles.hint}>
            Adjust times per day, then use the purple plus to add one day or Add all to add everything at once.
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 8, marginTop: 8 }}>
        {slots.map((slot, index) => (
          <Surface
            key={`${slot.date}-${index}`}
            style={styles.slotItem}
            elevation={0}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.slotText}>
                {formatLongSlotDate(slot.date)} — {slot.startTime} to {slot.endTime}
              </Text>
              {slot.isRecurring ? (
                <Text style={styles.slotRecurringText}>
                  Recurring: {slot.recurringDays.join(', ')} until{' '}
                  {slot.recurringEndDate
                    ? formatLongSlotDate(slot.recurringEndDate)
                    : 'N/A'}
                </Text>
              ) : null}
            </View>
            <View style={styles.slotActions}>
              <IconButton
                icon="pencil"
                size={18}
                onPress={() => editSlot(index)}
              />
              <IconButton
                icon="delete"
                size={18}
                onPress={() => removeSlot(index)}
              />
            </View>
          </Surface>
        ))}
        {slots.length === 0 && (
          <Text style={styles.hint}>
            Add at least one slot (date + start/end time).
          </Text>
        )}
      </View>
    </Surface>
  );
}
