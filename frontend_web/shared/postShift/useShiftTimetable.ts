import { useState, useMemo, useCallback, useEffect } from 'react';
import dayjs from 'dayjs';
import { expandShiftDraftSlots } from '@chemisttasker/shared-core';
import { type PharmacyOption, type SlotEntry, type SlotTime, type CalendarEvent, type CalendarViewOption,
  toIsoDate, isValidDate, applyTimeToDate, formatSlotTime, pharmacyHoursForDate } from './helpers';

interface TimetableOptions {
  selectedPharmacy: PharmacyOption | undefined;
  editingShiftId: string | null;
  showSnackbar: (message: string, severity?: 'success' | 'error') => void;
}
/** Calendar presentation state and edit interactions; recurrence policy belongs to shared-core. */
export function useShiftTimetable({ selectedPharmacy, editingShiftId, showSnackbar }: TimetableOptions) {
  // --- Timetable State ---
  const [slots, setSlots] = useState<SlotEntry[]>([]);
  const [slotDate, setSlotDate] = useState<string>('');
  const [slotStartTime, setSlotStartTime] = useState<string>('09:00');
  const [slotEndTime, setSlotEndTime] = useState<string>('17:00');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedDateTimes, setSelectedDateTimes] = useState<Record<string, { startTime: string; endTime: string }>>({});
  const [calendarView, setCalendarView] = useState<CalendarViewOption>('month');

  const [timetableError, setTimetableError] = useState('');
  // --- Calendar Control State ---
  const todayStart = useMemo(() => dayjs().startOf('day'), []);
  const [calendarDate, setCalendarDate] = useState(todayStart.toDate());
  const minCalendarDate = useMemo(() => todayStart.toDate(), [todayStart]);
  const maxCalendarDate = useMemo(() => todayStart.add(4, 'month').endOf('month').toDate(), [todayStart]);
  const safeCalendarDate = useMemo(
    () => (isValidDate(calendarDate) ? calendarDate : todayStart.toDate()),
    [calendarDate, todayStart]
  );

  const calendarTimeBounds = useMemo(() => {
    const base = dayjs(safeCalendarDate);
    if (!base.isValid()) {
      const fallback = todayStart;
      return {
        min: fallback.startOf('day').toDate(),
        max: fallback.endOf('day').toDate(),
      };
    }

    let minBound = base.startOf('day');
    let maxBound = base.endOf('day');

    return {
      min: minBound.toDate(),
      max: maxBound.toDate(),
    };
  }, [safeCalendarDate, todayStart]);

  const expandedSlots = useMemo(() => expandShiftDraftSlots(slots), [slots]);
  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const counts = new Map<number, number>();
    return expandedSlots.flatMap(slot => {
      const date = toIsoDate(slot.date);
      if (!date) return [];
      const occurrenceIndex = counts.get(slot.sourceIndex) ?? 0;
      counts.set(slot.sourceIndex, occurrenceIndex + 1);
      const start = applyTimeToDate(date, slot.startTime);
      const end = applyTimeToDate(date, slot.endTime);
      return [{ id: `${slot.sourceIndex}-${occurrenceIndex}-${start.toISOString()}`,
        title: `${formatSlotTime(slot.startTime)} — ${formatSlotTime(slot.endTime)}`,
        start, end, resource: { slotIndex: slot.sourceIndex, occurrenceIndex } }];
    });
  }, [expandedSlots]);

  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const getDefaultTimesForDate = useCallback(
    (date: string, fallback: SlotTime = { startTime: slotStartTime, endTime: slotEndTime }) =>
      pharmacyHoursForDate(selectedPharmacy, date, fallback),
    [selectedPharmacy, slotEndTime, slotStartTime]
  );
  const slotDateHours = useMemo(
    () => (slotDate ? getDefaultTimesForDate(slotDate) : null),
    [getDefaultTimesForDate, slotDate]
  );
  const closedSelectedDates = useMemo(
    () => selectedDates.map((date) => ({ date, hours: getDefaultTimesForDate(date) })).filter((item) => item.hours.closed),
    [getDefaultTimesForDate, selectedDates]
  );
  useEffect(() => {
    if (editingShiftId || !selectedPharmacy || !slotDate || selectedDates.length > 0 || slots.length > 0) return;
    const hours = getDefaultTimesForDate(slotDate);
    setSlotStartTime(hours.startTime);
    setSlotEndTime(hours.endTime);
  }, [editingShiftId, getDefaultTimesForDate, selectedDates.length, selectedPharmacy, slotDate, slots.length]);
  const mergeSelectedDates = useCallback(
    (incomingDates: string[], timeOverride?: { startTime: string; endTime: string }) => {
      if (!incomingDates.length) return;

      const normalizedIncoming = incomingDates.filter((date) => !dayjs(date).isBefore(todayStart, 'day'));
      if (!normalizedIncoming.length) return;

      setSelectedDates((prev) => {
        const merged = Array.from(new Set([...prev, ...normalizedIncoming])).sort();
        return merged;
      });

      setSelectedDateTimes((prev) => {
        const next = { ...prev };
        normalizedIncoming.forEach((date) => {
          if (timeOverride) {
            next[date] = timeOverride;
          } else if (!next[date]) {
            const hours = getDefaultTimesForDate(date);
            next[date] = { startTime: hours.startTime, endTime: hours.endTime };
          }
        });
        return next;
      });

      const latest = normalizedIncoming[normalizedIncoming.length - 1];
      if (latest) {
        const latestHours = timeOverride ?? getDefaultTimesForDate(latest);
        setSlotDate(latest);
        setSlotStartTime(latestHours.startTime);
        setSlotEndTime(latestHours.endTime);
      }
    },
    [getDefaultTimesForDate, todayStart]
  );

  useEffect(() => {
    if (slots.length === 0) return;
    const firstValidEvent = calendarEvents.find((event) => !Number.isNaN(event.start.getTime()));
    if (firstValidEvent && isValidDate(firstValidEvent.start)) {
      setCalendarDate(firstValidEvent.start);
    }
  }, [calendarEvents, slots.length]);

  const eventStyleGetter = useCallback((_event: CalendarEvent, _start: Date, _end: Date, _isSelected: boolean) => {
    const backgroundColor = '#8B5CF6'; // A slightly lighter purple
    const style = {
      backgroundColor,
      borderRadius: '6px',
      color: 'white',
      border: '1px solid #5222B8',
      boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
      padding: '2px 5px',
    };
    return { style };
  }, []);

  const dayPropGetter = useCallback(
    (date: Date) => {
      const iso = dayjs(date).format('YYYY-MM-DD');
      const hours = getDefaultTimesForDate(iso);
      if (hours.closed) {
        return {
          style: {
            backgroundColor: selectedDateSet.has(iso) ? 'rgba(239, 68, 68, 0.14)' : 'rgba(254, 242, 242, 0.95)',
            boxShadow: selectedDateSet.has(iso)
              ? 'inset 0 0 0 2px rgba(220, 38, 38, 0.55)'
              : 'inset 0 0 0 1px rgba(220, 38, 38, 0.35)',
          },
        };
      }
      if (selectedDateSet.has(iso)) {
        return {
          style: {
            backgroundColor: 'rgba(109, 40, 217, 0.12)',
            boxShadow: 'inset 0 0 0 2px rgba(109, 40, 217, 0.35)',
          },
        };
      }
      return {};
    },
    [getDefaultTimesForDate, selectedDateSet]
  );

  const addSlotEntries = (
    entries: SlotEntry[],
    options?: { clearDates?: string[]; clearAllSelected?: boolean; resetRecurring?: boolean }
  ): boolean => {
    const existingKeys = new Set(slots.map((s) => `${s.date}-${s.startTime}-${s.endTime}-${s.isRecurring}-${s.recurringDays.join(',')}`));
    const filtered = entries.filter(
      (entry) => !existingKeys.has(`${entry.date}-${entry.startTime}-${entry.endTime}-${entry.isRecurring}-${entry.recurringDays.join(',')}`)
    );

    if (!filtered.length) {
      setTimetableError('Those dates are already in your list.');
      return false;
    }

    setSlots((prev) => [...prev, ...filtered]);
    setTimetableError('');
    showSnackbar(`${filtered.length} timetable entr${filtered.length > 1 ? 'ies' : 'y'} added.`);

    if (options?.clearAllSelected) {
      setSelectedDates([]);
      setSelectedDateTimes({});
    } else if (options?.clearDates?.length) {
      setSelectedDates((prev) => prev.filter((date) => !options.clearDates?.includes(date)));
      setSelectedDateTimes((prev) => {
        const next = { ...prev };
        options.clearDates?.forEach((date) => {
          delete next[date];
        });
        return next;
      });
    }

    if (options?.resetRecurring) {
      setIsRecurring(false);
      setRecurringDays([]);
      setRecurringEndDate('');
    }

    return true;
  };

  const handleAddManualSlot = (): boolean => {
    if (!slotStartTime || !slotEndTime) {
      setTimetableError('Set a start and finish time.');
      return false;
    }
    if (new Date(`1970-01-01T${slotEndTime}`) <= new Date(`1970-01-01T${slotStartTime}`)) {
      setTimetableError('The finish time must be after the start time.');
      return false;
    }

    if (!slotDate) {
      setTimetableError('Pick a date first.');
      return false;
    }

    if (isRecurring && (!recurringEndDate || recurringDays.length === 0)) {
      setTimetableError('Pick the weekdays and the date it repeats until.');
      return false;
    }

    if (dayjs(slotDate).isBefore(todayStart, 'day')) {
      setTimetableError('That date has passed. Pick today or later.');
      return false;
    }

    const newEntries: SlotEntry[] = [{
      date: slotDate,
      startTime: slotStartTime,
      endTime: slotEndTime,
      isRecurring,
      recurringDays: isRecurring ? recurringDays : [],
      recurringEndDate: isRecurring ? recurringEndDate : '',
    }];

    return addSlotEntries(newEntries, { resetRecurring: true });
  };

  const handleAddSelectedDate = (date: string): boolean => {
    const custom = selectedDateTimes[date] || { startTime: slotStartTime, endTime: slotEndTime };
    if (!custom.startTime || !custom.endTime) {
      setTimetableError('Set a start and finish time.');
      return false;
    }
    if (new Date(`1970-01-01T${custom.endTime}`) <= new Date(`1970-01-01T${custom.startTime}`)) {
      setTimetableError('The finish time must be after the start time.');
      return false;
    }
    if (dayjs(date).isBefore(todayStart, 'day')) {
      setTimetableError('That date has passed. Pick today or later.');
      return false;
    }
    return addSlotEntries([{
      date,
      startTime: custom.startTime,
      endTime: custom.endTime,
      isRecurring: false,
      recurringDays: [],
      recurringEndDate: '',
    }], { clearDates: [date] });
  };

  const handleAddAllSelectedDates = (): boolean => {
    if (!selectedDates.length) {
      setTimetableError('Tap at least one day on the calendar.');
      return false;
    }

    const validDates = selectedDates.filter((date) => !dayjs(date).isBefore(todayStart, 'day'));
    if (!validDates.length) {
      setTimetableError('That date has passed. Pick today or later.');
      return false;
    }
    if (validDates.length < selectedDates.length) {
      showSnackbar('Past dates were left out.');
    }

    const newEntries: SlotEntry[] = [];
    for (const date of validDates) {
      const custom = selectedDateTimes[date] || { startTime: slotStartTime, endTime: slotEndTime };
      if (!custom.startTime || !custom.endTime) {
        setTimetableError('Set a start and finish time.');
        return false;
      }
      if (new Date(`1970-01-01T${custom.endTime}`) <= new Date(`1970-01-01T${custom.startTime}`)) {
        setTimetableError('Each selected day must have an end time after its start time.');
        return false;
      }
      newEntries.push({
        date,
        startTime: custom.startTime,
        endTime: custom.endTime,
        isRecurring: false,
        recurringDays: [],
        recurringEndDate: '',
      });
    }

    return addSlotEntries(newEntries, { clearAllSelected: true });
  };

  const handleEditSlot = (index: number) => {
    const slot = slots[index];
    if (!slot) return;

    setSlotDate(slot.date);
    setSlotStartTime(slot.startTime);
    setSlotEndTime(slot.endTime);
    setIsRecurring(slot.isRecurring);
    setRecurringDays(slot.recurringDays || []);
    setRecurringEndDate(slot.recurringEndDate || '');
    setSelectedDates((current) =>
      current.includes(slot.date) ? current : [...current, slot.date].sort()
    );
    setSelectedDateTimes((current) => ({
      ...current,
      [slot.date]: { startTime: slot.startTime, endTime: slot.endTime },
    }));
    setCalendarDate(dayjs(slot.date).toDate());
    setSlots((current) => current.filter((_, idx) => idx !== index));
  };

  return { slots, setSlots, slotDate, setSlotDate, slotStartTime, setSlotStartTime, slotEndTime, setSlotEndTime, isRecurring, setIsRecurring, recurringDays, setRecurringDays, recurringEndDate, setRecurringEndDate, selectedDates, setSelectedDates, selectedDateTimes, setSelectedDateTimes, calendarView, setCalendarView, timetableError, setTimetableError, todayStart, calendarDate, setCalendarDate, minCalendarDate, maxCalendarDate, safeCalendarDate, calendarTimeBounds, expandedSlots, calendarEvents, selectedDateSet, getDefaultTimesForDate, slotDateHours, closedSelectedDates, mergeSelectedDates, eventStyleGetter, dayPropGetter, addSlotEntries, handleAddManualSlot, handleAddSelectedDate, handleAddAllSelectedDates, handleEditSlot };
}
