
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  HelperText,
  Icon,
  IconButton,
  Menu,
  Portal,
  Switch,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
  ThemeProvider,
  useTheme,
} from 'react-native-paper';
import { DatePickerModal, TimePickerModal } from 'react-native-paper-dates';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import {
  fetchMembershipsByPharmacy, fetchMyMemberships, getOperationsContext, getCalendarFeed,
  copyPlannerTasks, markWorkNoteDone, markWorkNoteOpen,
  type PlannerCopyInput, type WorkNoteApi,
} from '@chemisttasker/shared-core';
import {
  type ItemType,
  type CalendarItem,
  WEEKDAYS,
  normalizeList,
  postJson,
  toDate,
  formatTimeRange,
  ROLE_LABELS,
  plannerWeek,
  plannerCopyRequest,
  copyResultMessage,
  taskStatusLabel,
  EMPLOYMENT_TYPE_LABELS,
  formatChoiceLabel,
  parseTime,
  formatTime,
} from './calendarModel';
import CalendarTaskDialog from './CalendarTaskDialog';

export default function SharedCalendarScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { selectedPharmacyId: workspacePharmacyId } = useWorkspace();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ date?: string; pharmacy_id?: string; note_id?: string }>();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [view, setView] = useState('month');
  const [managedPharmacyIds, setManagedPharmacyIds] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [copying, setCopying] = useState(false);
  const [completing, setCompleting] = useState(false);
  const copyBusy = useRef(false);
  const copyRetry = useRef<PlannerCopyInput | null>(null);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const appliedLink = useRef('');
  const expandedLink = useRef('');
  const feedRequest = useRef(0);
  const activeFeedScope = useRef('');
  const [editingNote, setEditingNote] = useState<WorkNoteApi | undefined>();
  const [newPlannerTask, setNewPlannerTask] = useState(true);
  const [filterType, setFilterType] = useState<ItemType>('all');
  const [memberships, setMemberships] = useState<any[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<number | null>(null);
  const [pharmacyMembers, setPharmacyMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | string | null>(null);
  const [eventRepeatMenuVisible, setEventRepeatMenuVisible] = useState(false);
  const [eventDatePickerOpen, setEventDatePickerOpen] = useState(false);
  const [eventUntilPickerOpen, setEventUntilPickerOpen] = useState(false);
  const [eventStartTimeOpen, setEventStartTimeOpen] = useState(false);
  const [eventEndTimeOpen, setEventEndTimeOpen] = useState(false);
  const isWide = width >= 900;
  const canManagePlanner = selectedPharmacyId !== null && managedPharmacyIds.includes(selectedPharmacyId);

  const selectedDayRef = useRef(selectedDay);
  const currentMonthRef = useRef(currentMonth);

  const [eventForm, setEventForm] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    allDay: true,
    startTime: '',
    endTime: '',
    description: '',
    recurrence: {
      freq: 'NONE',
      interval: 1,
      until: '',
    },
  });

  const getParamString = (value?: string | string[] | null) =>
    Array.isArray(value) ? value[0] : value ?? null;

  useEffect(() => {
    const loadMemberships = async () => {
      try {
        const [membersResult, managersResult] = await Promise.allSettled([
          fetchMyMemberships({ page_size: 200 } as any), getOperationsContext(),
        ]);
        const staff = membersResult.status === 'fulfilled' ? normalizeList(membersResult.value) : [];
        setManagedPharmacyIds(managersResult.status === 'fulfilled' ? managersResult.value.pharmacies.map(p => p.id) : []);
        const managers = managersResult.status === 'fulfilled'
          ? managersResult.value.pharmacies.map(p => ({ id: 'managed-' + p.id, pharmacyId: p.id, pharmacyName: p.name }))
          : [];
        const staffIds = new Set(staff.map((m: any) => Number(getPharmacyId(m))));
        const list = [...staff, ...managers.filter(p => !staffIds.has(p.pharmacyId))];
        setMemberships(list);
        if (list.length > 0 && selectedPharmacyId === null) {
          const paramPharmacy = getParamString(params?.pharmacy_id);
          const parsed = paramPharmacy ? Number(paramPharmacy) : workspacePharmacyId;
          const initialId = parsed && list.some(m => Number(getPharmacyId(m)) === parsed) ? parsed : getPharmacyId(list[0]);
          setSelectedPharmacyId(Number.isFinite(initialId) ? initialId : getPharmacyId(list[0]));
        }
      } catch {
        setError('Unable to load your pharmacy memberships.');
      }
    };
    void loadMemberships();
  }, []);

  useEffect(() => {
    if (!selectedPharmacyId) {
      setPharmacyMembers([]);
      return;
    }
    let active = true;
    setPharmacyMembers([]);
    const loadMembers = async () => {
      try {
        setMembersLoading(true);
        const data = await fetchMembershipsByPharmacy(selectedPharmacyId);
        if (active) setPharmacyMembers(data as any);
      } catch {
        if (active) setPharmacyMembers([]);
      } finally {
        if (active) setMembersLoading(false);
      }
    };
    void loadMembers();
    return () => { active = false; };
  }, [selectedPharmacyId]);

  useEffect(() => {
    const newDate = format(selectedDay, 'yyyy-MM-dd');
    setEventForm((prev) => ({ ...prev, date: newDate }));
  }, [selectedDay]);

  useEffect(() => {
    selectedDayRef.current = selectedDay;
    currentMonthRef.current = currentMonth;
  }, [selectedDay, currentMonth]);

  const dateRange = useMemo(() => {
    if (view === 'plan') return plannerWeek(selectedDay);
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(start);
    return {
      from: format(start, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
    };
  }, [currentMonth, selectedDay, view]);

  useEffect(() => {
    if (workspacePharmacyId && memberships.some(m => Number(getPharmacyId(m)) === workspacePharmacyId)) {
      setSelectedPharmacyId(workspacePharmacyId);
    }
  }, [workspacePharmacyId, memberships]);

  const feedScope = `${selectedPharmacyId}:${dateRange.from}:${dateRange.to}`;
  const loadFeed = useCallback(async () => {
    if (activeFeedScope.current !== feedScope) return;
    const request = ++feedRequest.current;
    if (!selectedPharmacyId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const feed = await getCalendarFeed({
        pharmacyId: selectedPharmacyId,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
      });
      const eventsRaw = normalizeList(feed?.events);
      const notesRaw = normalizeList(feed?.work_notes);

      const mappedEvents: CalendarItem[] = normalizeList(eventsRaw).map((evt: any) => {
        const dateObj = toDate(evt.date) ?? new Date();
        const type: CalendarItem['type'] = evt.source === 'birthday' ? 'birthday' : 'event';
        const rawId = evt.id;
        const id = typeof rawId === 'number' ? rawId : String(rawId ?? '');
        const seriesId = evt.series_id ?? (typeof rawId === 'number' ? rawId : undefined);
        return {
          id,
          seriesId,
          isOccurrence: Boolean(evt.is_occurrence),
          type,
          title: evt.title,
          date: dateObj,
          time: formatTimeRange(evt.start_time, evt.end_time),
          allDay: evt.all_day ?? !evt.start_time,
          source: evt.source,
          readOnly: evt.source !== 'manual',
          description: evt.description,
          eventData: evt,
        };
      });

      const mappedNotes: CalendarItem[] = normalizeList(notesRaw).map((note: any) => {
        const dateObj = toDate(note.date) ?? new Date();
        const assigneeNames = (note.assignees ?? []).map(
          (a: any) =>
            a.user_name ||
            a.userName ||
            a.name ||
            a.email ||
            a.user?.full_name ||
            'Assignee'
        );
        const rawId = note.id;
        const id = typeof rawId === 'number' ? rawId : String(rawId ?? '');
        const seriesId = note.series_id ?? (typeof rawId === 'number' ? rawId : undefined);
        return {
          id,
          seriesId,
          isOccurrence: Boolean(note.is_occurrence),
          type: 'note',
          title: note.title,
          date: dateObj,
          allDay: !note.start_time,
          time: formatTimeRange(note.start_time, note.end_time),
          source: 'work_note',
          assignees: assigneeNames,
          completedBy: Array.isArray(note.completed_by) ? note.completed_by : [],
          assigneeMembershipIds: (note.assignees ?? []).map((a: any) => a.membershipId ?? a.membership_id),
          status: (note.status ?? '').toString().toUpperCase(),
          noteData: note,
        };
      });

      const combined = [...mappedEvents, ...mappedNotes];
      if (request === feedRequest.current && activeFeedScope.current === feedScope) setItems(combined);
    } catch {
      if (request === feedRequest.current && activeFeedScope.current === feedScope) {
        setError('Unable to load calendar data.');
        setItems([]);
      }
    } finally {
      if (request === feedRequest.current && activeFeedScope.current === feedScope) setLoading(false);
    }
  }, [selectedPharmacyId, dateRange.from, dateRange.to, feedScope]);

  useEffect(() => {
    activeFeedScope.current = feedScope;
    setItems([]);
    void loadFeed();
    return () => { activeFeedScope.current = ''; };
  }, [loadFeed, feedScope]);

  useEffect(() => {
    const link = `${params?.date ?? ''}:${params?.pharmacy_id ?? ''}:${params?.note_id ?? ''}`;
    const freshLink = appliedLink.current !== link;
    appliedLink.current = link;
    const dateParam = getParamString(params?.date);
    if (dateParam && freshLink) {
      const parsed = toDate(String(dateParam));
      if (parsed && isValid(parsed)) {
        const current = selectedDayRef.current;
        const currentStr = isValid(current) ? format(current, 'yyyy-MM-dd') : null;
        if (!currentStr || currentStr !== String(dateParam)) {
          setSelectedDay(parsed);
        }
        if (!isSameMonth(parsed, currentMonthRef.current)) {
          setCurrentMonth(parsed);
        }
      }
    }

    const noteParam = getParamString(params?.note_id);
    if (noteParam && expandedLink.current !== link) {
      const noteId = Number(noteParam);
      if (Number.isFinite(noteId)) {
        const target = items.find(
          (itm) => itm.type === 'note' && (itm.seriesId === noteId || itm.id === noteId)
            && (!dateParam || format(itm.date, 'yyyy-MM-dd') === dateParam)
        );
        if (target) {
          expandedLink.current = link;
          setExpandedId(target.id);
          if (!isSameDay(target.date, selectedDayRef.current)) {
            setSelectedDay(target.date);
          }
          if (!isSameMonth(target.date, currentMonthRef.current)) {
            setCurrentMonth(target.date);
          }
        }
      }
    }
    const pharmacyParam = getParamString(params?.pharmacy_id);
    if (pharmacyParam && freshLink) {
      const nextPharmacyId = Number(pharmacyParam);
      if (Number.isFinite(nextPharmacyId) && nextPharmacyId !== selectedPharmacyId) {
        setSelectedPharmacyId(nextPharmacyId);
      }
    }
  }, [params, items, selectedPharmacyId]);

  useEffect(() => { setNoteModalOpen(false); setExpandedId(null); }, [selectedPharmacyId]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);

    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const getEventsForDay = (day: Date) => items.filter((item) => isSameDay(item.date, day));

  const filteredItems = useMemo(() => {
    if (!selectedDay || !isValid(selectedDay)) return [];
    return items
      .filter((item) => isSameDay(item.date, selectedDay))
      .filter((item) => {
        if (view === 'plan') return item.type === 'note' && item.noteData?.is_planner_task;
        if (filterType === 'all') return true;
        if (filterType === 'events') return item.type === 'event';
        if (filterType === 'notes') return item.type === 'note';
        if (filterType === 'birthdays') return item.type === 'birthday';
        return true;
      });
  }, [selectedDay, items, filterType, view]);
  const handlePrevMonth = () => {
    setCurrentMonth((prev) => subMonths(prev, 1));
    setSelectedDay((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
    setSelectedDay((prev) => addMonths(prev, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDay(today);
  };

  const handleOpenEventModal = () => {
    setEventError(null);
    setEditingEventId(null);
    setEventForm((prev) => ({
      ...prev,
      date: format(selectedDay, 'yyyy-MM-dd'),
      title: '',
      description: '',
      startTime: '',
      endTime: '',
      allDay: true,
      recurrence: {
        freq: 'NONE',
        interval: 1,
        until: '',
      },
    }));
    setEventModalOpen(true);
  };

  const handleOpenNoteModal = (planner = true) => {
    if (planner && !canManagePlanner) return;
    setEditingNote(undefined);
    setNewPlannerTask(planner);
    setNoteModalOpen(true);
  };

  const selectDay = (day: Date) => {
    setSelectedDay(day);
    setCurrentMonth(day);
  };

  const handleCopy = async (mode: 'task' | 'day' | 'week', item?: CalendarItem) => {
    if (!selectedPharmacyId || !canManagePlanner || copyBusy.current) return;
    if (mode === 'task' && (!item || !getBaseItemId(item))) {
      setMessage('Unable to identify this task. Reload the calendar.');
      return;
    }
    const request = plannerCopyRequest(selectedPharmacyId, selectedDay, mode, copyRetry.current, item ? getBaseItemId(item) : undefined);
    copyRetry.current = request;
    copyBusy.current = true; setCopying(true);
    try {
      const result = await copyPlannerTasks(request);
      copyRetry.current = null;
      setMessage(copyResultMessage(result));
      await loadFeed();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Copy failed. Tap the same action to retry safely.'); }
    finally { copyBusy.current = false; setCopying(false); }
  };

  const handleEditEvent = (item: CalendarItem) => {
    if (!item.eventData) return;
    const evt = item.eventData;
    const baseId = getBaseItemId(item);
    if (!baseId) return;
    setEditingEventId(baseId);
    setEventError(null);
    const rec = evt.recurrence || {};
    setEventForm({
      title: evt.title || '',
      description: evt.description || '',
      date: evt.date || format(selectedDay, 'yyyy-MM-dd'),
      allDay: Boolean(evt.all_day ?? true),
      startTime: evt.start_time || '',
      endTime: evt.end_time || '',
      recurrence: {
        freq: (rec.freq || 'NONE').toString().toUpperCase(),
        interval: Number(rec.interval || 1),
        until: rec.until_date || '',
      },
    });
    setEventModalOpen(true);
  };

  const handleCreateOrUpdateEvent = async () => {
    if (!selectedPharmacyId) return;
    if (!eventForm.title.trim()) {
      setEventError('Title is required.');
      return;
    }
    setEventSaving(true);
    setEventError(null);
    try {
      const recurrence =
        eventForm.recurrence.freq !== 'NONE'
          ? {
              freq: eventForm.recurrence.freq,
              interval: eventForm.recurrence.interval || 1,
              until_date: eventForm.recurrence.until || null,
            }
          : null;
      const payload = {
        pharmacy: selectedPharmacyId,
        title: eventForm.title,
        description: eventForm.description,
        date: eventForm.date,
        all_day: eventForm.allDay,
        start_time: eventForm.allDay ? null : eventForm.startTime || null,
        end_time: eventForm.allDay ? null : eventForm.endTime || null,
        recurrence,
      };
      if (editingEventId) {
        await postJson(`/calendar-events/${editingEventId}/`, payload, 'PATCH');
      } else {
        await postJson('/calendar-events/', payload);
      }
      setEventModalOpen(false);
      setEditingEventId(null);
      void loadFeed();
    } catch (e: any) {
      setEventError(e?.message || 'Failed to save event.');
    } finally {
      setEventSaving(false);
    }
  };

  const handleEditNote = (item: CalendarItem) => {
    if (item.noteData?.is_planner_task && !canManagePlanner) return;
    setEditingNote(item.noteData);
    setNoteModalOpen(true);
  };

  const getBaseItemId = (item: CalendarItem) => {
    if (item.seriesId) return item.seriesId;
    if (typeof item.id === 'number') return item.id;
    const parsed = Number.parseInt(String(item.id), 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getTypeColor = (type: CalendarItem['type']) => {
    switch (type) {
      case 'event':
        return theme.colors.primary;
      case 'note':
        return '#f59e0b';
      case 'birthday':
        return '#10b981';
      default:
        return theme.colors.primary;
    }
  };

  const getTypeIcon = (type: CalendarItem['type']) => {
    switch (type) {
      case 'event':
        return 'calendar';
      case 'note':
        return 'clipboard-text';
      case 'birthday':
        return 'cake-variant';
      default:
        return 'calendar';
    }
  };

  const getMemberLabel = (member: any) => {
    const userDetails = member?.userDetails ?? member?.user_details ?? member?.user ?? {};
    const fullName =
      userDetails?.fullName ||
      userDetails?.full_name ||
      [userDetails?.firstName ?? userDetails?.first_name, userDetails?.lastName ?? userDetails?.last_name]
        .filter(Boolean)
        .join(' ');
    const name =
      member?.invitedName ||
      member?.invited_name ||
      member?.name ||
      fullName ||
      userDetails?.email ||
      member?.email ||
      `Member ${member?.id ?? ''}`;
    const details = [
      formatChoiceLabel(member?.role, ROLE_LABELS),
      member?.jobTitle ?? member?.job_title,
      formatChoiceLabel(member?.employmentType ?? member?.employment_type, EMPLOYMENT_TYPE_LABELS),
    ].filter(Boolean);
    return [name, ...details].join(' | ');
  };

  const getPharmacyId = (m: any) =>
    m?.pharmacyId ?? m?.pharmacy_id ?? m?.pharmacyDetail?.id ?? m?.pharmacy?.id ?? null;

  const getPharmacyLabel = (m: any) =>
    m?.pharmacyName ||
    m?.pharmacy_name ||
    m?.pharmacyDetail?.name ||
    m?.pharmacy?.name ||
    (getPharmacyId(m) !== null ? `Pharmacy ${getPharmacyId(m)}` : `Pharmacy ${m?.id ?? ''}`);

  const noPharmacies = memberships.length === 0;

  const safeSelectedDay = isValid(selectedDay) ? selectedDay : new Date();

  return (
    <ThemeProvider theme={{ ...theme, colors: { ...theme.colors, primary: theme.colors.onPrimaryContainer } }}>
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.dayLabel}>
              <Text variant="titleLarge" style={styles.headerTitle}>
                Pharmacy Calendar
              </Text>
              <Text variant="bodySmall" style={styles.headerSubtitle}>
                Tasks, events, work notes, and birthdays.
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.selectorLabel}>{selectedPharmacyId
          ? getPharmacyLabel(memberships.find(m => Number(getPharmacyId(m)) === selectedPharmacyId) || {})
          : 'Select a pharmacy in your workspace'}</Text>
        <SegmentedButtons style={styles.selectorRow} value={view} onValueChange={setView} buttons={[
          { value: 'month', label: 'Month', style: styles.touch }, { value: 'plan', label: 'Plan', style: styles.touch },
        ]} />
        <View style={[styles.mainGrid, isWide && view === 'month' ? styles.mainGridWide : null]}>
          {view === 'month' && <>
          <Card style={[styles.card, isWide ? styles.calendarCardWide : null]}>
            <Card.Content>
            <View style={styles.toolbarRow}>
              <View style={styles.monthNav}>
                <IconButton icon="chevron-left" style={styles.iconTouch} accessibilityLabel="Previous month" onPress={handlePrevMonth} />
                <Text style={styles.monthLabel}>{format(currentMonth, 'MMMM yyyy')}</Text>
                <IconButton icon="chevron-right" style={styles.iconTouch} accessibilityLabel="Next month" onPress={handleNextMonth} />
              </View>
              <Button mode="outlined" contentStyle={styles.touch} onPress={handleToday}>
                Today
              </Button>
            </View>

            {noPharmacies && (
              <HelperText type="info">
                You do not have any active pharmacy memberships, so the calendar is empty for now.
              </HelperText>
            )}

            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((day) => (
                <Text key={day} style={styles.weekdayLabel}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day) => {
                const dayItems = getEventsForDay(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = isSameDay(day, selectedDay);
                const isDayToday = isToday(day);
                const types = Array.from(new Set(dayItems.map((item) => item.type)));

                return (
                  <TouchableOpacity
                    key={day.toISOString()}
                    style={[
                      styles.dayCell,
                      !isCurrentMonth && styles.dayCellMuted,
                      isSelected && styles.dayCellSelected,
                      isDayToday && styles.dayCellToday,
                    ]}
                        onPress={() => setSelectedDay(day)}
                        disabled={!isCurrentMonth && dayItems.length === 0}
                      >
                        <Text
                      style={[
                        styles.dayNumber,
                        isSelected && styles.dayNumberSelected,
                        !isCurrentMonth && styles.dayNumberMuted,
                      ]}
                    >
              {format(day, 'd')}
                    </Text>
                    <View style={styles.dayDots}>
                      {types.map((type) => (
                        <View
                          key={`${format(day, 'yyyy-MM-dd')}-${type}`}
                          style={[styles.dayDot, { backgroundColor: getTypeColor(type) }]}
                        />
                      ))}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Divider style={styles.sectionDivider} />

            <View style={styles.actionsRow}>
              <Button mode="text" contentStyle={styles.touch} onPress={handleOpenEventModal} disabled={!selectedPharmacyId}>
                Add Event
              </Button>
              <Button mode="text" contentStyle={styles.touch} onPress={() => handleOpenNoteModal(false)} disabled={!selectedPharmacyId}>
                Add Work Note
              </Button>
            </View>
            </Card.Content>
          </Card>
          </>}

          <Card style={[styles.card, isWide && view === 'month' ? styles.summaryCardWide : null]}>
            <Card.Content>
            <View style={styles.dayNavigation}>
              <IconButton icon="chevron-left" size={24} style={styles.iconTouch} accessibilityLabel="Previous day" onPress={() => selectDay(addDays(selectedDay, -1))} />
              <Button style={styles.dayLabel} contentStyle={styles.touch} onPress={() => setDayPickerOpen(true)}>
                {format(safeSelectedDay, 'EEE, d MMM')}
              </Button>
              <IconButton icon="chevron-right" size={24} style={styles.iconTouch} accessibilityLabel="Next day" onPress={() => selectDay(addDays(selectedDay, 1))} />
            </View>
            {canManagePlanner && <Button mode="contained" contentStyle={styles.touch} icon="plus" onPress={() => handleOpenNoteModal()}>Add task</Button>}
            {view === 'plan' && canManagePlanner && <View style={styles.copyActions}>
              <Button contentStyle={styles.touch} disabled={copying || loading} onPress={() => handleCopy('day')}>Copy day to tomorrow</Button>
              <Button contentStyle={styles.touch} disabled={copying || loading} onPress={() => handleCopy('week')}>Copy week to next week</Button>
            </View>}
            {view === 'plan' && <Text style={styles.itemMeta}>Week: {plannerWeek(selectedDay).from} to {plannerWeek(selectedDay).to}</Text>}
            {view === 'plan' && !selectedPharmacyId && <HelperText type="info">Select a pharmacy in your workspace to view its plan.</HelperText>}

            {view === 'month' && <View style={styles.filterRow}>
              {(['all', 'events', 'notes', 'birthdays'] as ItemType[]).map((type) => (
                <Chip
                  key={type}
                  style={[styles.filterChip, filterType === type && { backgroundColor: theme.colors.onPrimaryContainer }]}
                  textStyle={filterType === type ? styles.filterChipTextActive : undefined}
                  onPress={() => setFilterType(type)}
                >
                  {type === 'all'
                    ? 'All'
                    : type === 'events'
                      ? 'Events'
                      : type === 'notes'
                        ? 'Work Notes'
                        : 'Birthdays'}
                </Chip>
              ))}
            </View>}

            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <Text>Loading calendar data...</Text>
              </View>
            )}

            {error && <HelperText type="error">{error}</HelperText>}

            {!loading && filteredItems.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{view === 'plan'
                  ? items.some(item => item.noteData?.is_planner_task) ? 'No tasks for this day.' : canManagePlanner
                    ? 'No tasks this week. Add a task or copy last week.' : 'No tasks assigned this week.'
                  : 'No items scheduled for this day'}</Text>
              </View>
            )}

            {filteredItems.map((item) => {
              const isExpanded = expandedId === item.id;
              const typeColor = item.noteData?.is_planner_task ? theme.colors.primary : getTypeColor(item.type);

              return (
                <TouchableOpacity
                  key={`${item.id}-${item.type}`}
                  onPress={() => setExpandedId(isExpanded ? null : item.id)}
                  activeOpacity={0.8}
                >
                  <Card style={styles.itemCard}>
                    <Card.Content>
                      <View style={styles.itemHeader}>
                        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.itemIcon, { backgroundColor: `${typeColor}22` }]}>
                          <Icon source={getTypeIcon(item.type)} size={20} color={typeColor} />
                        </View>
                        <View style={styles.itemHeaderContent}>
                          <Text style={styles.itemTitle}>{item.title}</Text>
                          <Text style={styles.itemMeta}>{item.allDay ? 'All day' : item.time || ''}</Text>
                          {item.type === 'note' && item.status && <Text style={styles.itemMeta}>
                            {item.noteData?.is_planner_task ? taskStatusLabel(item.noteData, canManagePlanner) : item.status}
                          </Text>}
                        </View>
                      </View>

                      {item.noteData?.is_planner_task && canManagePlanner && <Button contentStyle={styles.touch} icon="content-copy"
                        disabled={copying || loading} onPress={() => handleCopy('task', item)}>Duplicate</Button>}
                      {isExpanded && (
                        <View style={styles.itemDetails}>
                          {item.type === 'note' && item.noteData?.body ? (
                            <Text style={styles.itemDetailText}>{item.noteData.body}</Text>
                          ) : null}
                          {item.type !== 'note' && item.description ? (
                            <Text style={styles.itemDetailText}>{item.description}</Text>
                          ) : null}
                          {item.assignees && item.assignees.length > 0 && (
                            <Text style={styles.itemDetailText}>
                              Assignees: {item.assignees.join(', ')}
                            </Text>
                          )}
                          {item.completedBy && item.completedBy.length > 0 && (
                            <Text style={styles.itemDetailText}>
                              Completed by: {item.completedBy.join(', ')}
                            </Text>
                          )}

                          <View style={styles.itemActions}>
                            {item.type === 'event' && !item.readOnly && (
                              <Button mode="text" contentStyle={styles.touch} onPress={() => handleEditEvent(item)}>
                                Edit
                              </Button>
                            )}

                            {item.type === 'event' && !item.readOnly && (
                              <Button
                                contentStyle={styles.touch}
                                mode="text"
                                textColor={theme.colors.error}
                                onPress={() => {
                                  Alert.alert('Delete event', 'Delete this event?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Delete',
                                      style: 'destructive',
                                      onPress: async () => {
                                        try {
                                          const baseId = getBaseItemId(item);
                                          if (!baseId) return;
                                          await postJson(`/calendar-events/${baseId}/`, {}, 'DELETE');
                                          void loadFeed();
                                        } catch {
                                          // ignore
                                        }
                                      },
                                    },
                                  ]);
                                }}
                              >
                                Delete
                              </Button>
                            )}

                            {item.type === 'note' && (!item.noteData?.is_planner_task || canManagePlanner) && (
                              <Button mode="text" contentStyle={styles.touch} onPress={() => handleEditNote(item)}>
                                Edit
                              </Button>
                            )}

                            {item.type === 'note' && (!item.noteData?.is_planner_task ||
                              item.noteData.assignees.some((person: { user_id: number }) => person.user_id === user?.id)) && (
                              <Button contentStyle={styles.touch} mode="outlined" disabled={completing || loading} onPress={async () => {
                                const baseId = getBaseItemId(item);
                                if (!baseId) return;
                                setCompleting(true);
                                try {
                                  const action = item.status === 'DONE' ? markWorkNoteOpen : markWorkNoteDone;
                                  await action(baseId, format(item.date, 'yyyy-MM-dd'), item.noteData.updated_at);
                                  await loadFeed();
                                } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to update completion.'); }
                                finally { setCompleting(false); }
                              }}>{item.status === 'DONE' ? 'Mark to do' : 'Mark done'}</Button>
                            )}
                          </View>
                        </View>
                      )}
                    </Card.Content>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </Card.Content>
          </Card>
        </View>
      </ScrollView>
      {noteModalOpen && selectedPharmacyId && <CalendarTaskDialog
        pharmacyId={selectedPharmacyId} date={format(selectedDay, 'yyyy-MM-dd')} note={editingNote} isPlannerTask={newPlannerTask}
        members={pharmacyMembers.map(member => ({ id: Number(member.id), label: getMemberLabel(member) }))} membersLoading={membersLoading}
        onDismiss={() => setNoteModalOpen(false)} onSaved={() => { setNoteModalOpen(false); void loadFeed(); }} onMessage={setMessage} />}
      {message ? <Portal><Snackbar visible onDismiss={() => setMessage('')} duration={8000}
        action={{ label: 'Dismiss', onPress: () => setMessage('') }}>{message}</Snackbar></Portal> : null}
      <Portal>
        <Dialog visible={eventModalOpen} onDismiss={() => setEventModalOpen(false)} style={styles.dialog}>
          <Dialog.Title>{editingEventId ? 'Update Event' : 'Create Event'}</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              <TextInput
                label="Title"
                value={eventForm.title}
                onChangeText={(text) => setEventForm((prev) => ({ ...prev, title: text }))}
                mode="outlined"
              />
              <TextInput
                label="Date"
                value={eventForm.date}
                onChangeText={(text) => setEventForm((prev) => ({ ...prev, date: text }))}
                mode="outlined"
                style={styles.dialogInput}
                right={<TextInput.Icon icon="calendar" onPress={() => setEventDatePickerOpen(true)} />}
              />
              <View style={styles.switchRow}>
                <Text>All day</Text>
                <Switch
                  value={eventForm.allDay}
                  onValueChange={(value) => setEventForm((prev) => ({ ...prev, allDay: value }))}
                />
              </View>
              <TextInput
                label="Start time"
                value={eventForm.startTime}
                onChangeText={(text) => setEventForm((prev) => ({ ...prev, startTime: text }))}
                mode="outlined"
                disabled={eventForm.allDay}
                style={styles.dialogInput}
                right={<TextInput.Icon icon="clock-outline" onPress={() => setEventStartTimeOpen(true)} />}
              />
              <TextInput
                label="End time"
                value={eventForm.endTime}
                onChangeText={(text) => setEventForm((prev) => ({ ...prev, endTime: text }))}
                mode="outlined"
                disabled={eventForm.allDay}
                style={styles.dialogInput}
                right={<TextInput.Icon icon="clock-outline" onPress={() => setEventEndTimeOpen(true)} />}
              />
              <TextInput
                label="Description"
                value={eventForm.description}
                onChangeText={(text) => setEventForm((prev) => ({ ...prev, description: text }))}
                mode="outlined"
                multiline
                style={styles.dialogInput}
              />

              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Repeats</Text>
                <Menu
                  visible={eventRepeatMenuVisible}
                  onDismiss={() => setEventRepeatMenuVisible(false)}
                  anchor={
                    <Button mode="outlined" onPress={() => setEventRepeatMenuVisible(true)}>
                      {eventForm.recurrence.freq === 'NONE'
                        ? 'Does not repeat'
                        : eventForm.recurrence.freq}
                    </Button>
                  }
                >
                  {['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'].map((freq) => (
                    <Menu.Item
                      key={freq}
                      title={freq === 'NONE' ? 'Does not repeat' : freq}
                      onPress={() => {
                        setEventForm((prev) => ({
                          ...prev,
                          recurrence: { ...prev.recurrence, freq },
                        }));
                        setEventRepeatMenuVisible(false);
                      }}
                    />
                  ))}
                </Menu>
              </View>

              {eventForm.recurrence.freq !== 'NONE' && (
                <TextInput
                  label="Interval"
                  value={String(eventForm.recurrence.interval)}
                  onChangeText={(text) =>
                    setEventForm((prev) => ({
                      ...prev,
                      recurrence: {
                        ...prev.recurrence,
                        interval: Number(text) || 1,
                      },
                    }))
                  }
                  mode="outlined"
                  keyboardType="numeric"
                  style={styles.dialogInput}
                />
              )}

              {eventForm.recurrence.freq !== 'NONE' && (
                <TextInput
                  label="Repeat until (optional)"
                  value={eventForm.recurrence.until}
                  onChangeText={(text) =>
                    setEventForm((prev) => ({
                      ...prev,
                      recurrence: { ...prev.recurrence, until: text },
                    }))
                  }
                  mode="outlined"
                  style={styles.dialogInput}
                  right={<TextInput.Icon icon="calendar" onPress={() => setEventUntilPickerOpen(true)} />}
                />
              )}

              {eventError && <HelperText type="error">{eventError}</HelperText>}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setEventModalOpen(false)} disabled={eventSaving}>
              Cancel
            </Button>
            <Button onPress={handleCreateOrUpdateEvent} disabled={eventSaving || !selectedPharmacyId}>
              {eventSaving ? 'Saving...' : editingEventId ? 'Update' : 'Create'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <DatePickerModal locale="en" mode="single" visible={dayPickerOpen} date={selectedDay}
          onDismiss={() => setDayPickerOpen(false)} onConfirm={({ date }) => {
            if (date) selectDay(date);
            setDayPickerOpen(false);
          }} />

        <DatePickerModal
          locale="en"
          mode="single"
          visible={eventDatePickerOpen}
          onDismiss={() => setEventDatePickerOpen(false)}
          date={toDate(eventForm.date) ?? new Date()}
          onConfirm={({ date }) => {
            if (date) {
              setEventForm((prev) => ({ ...prev, date: format(date, 'yyyy-MM-dd') }));
            }
            setEventDatePickerOpen(false);
          }}
        />

        <DatePickerModal
          locale="en"
          mode="single"
          visible={eventUntilPickerOpen}
          onDismiss={() => setEventUntilPickerOpen(false)}
          date={toDate(eventForm.recurrence.until) ?? new Date()}
          onConfirm={({ date }) => {
            if (date) {
              setEventForm((prev) => ({
                ...prev,
                recurrence: { ...prev.recurrence, until: format(date, 'yyyy-MM-dd') },
              }));
            }
            setEventUntilPickerOpen(false);
          }}
        />

        <TimePickerModal
          visible={eventStartTimeOpen}
          onDismiss={() => setEventStartTimeOpen(false)}
          onConfirm={({ hours, minutes }) => {
            setEventForm((prev) => ({ ...prev, startTime: formatTime(hours, minutes) }));
            setEventStartTimeOpen(false);
          }}
          hours={parseTime(eventForm.startTime).hours}
          minutes={parseTime(eventForm.startTime).minutes}
        />

        <TimePickerModal
          visible={eventEndTimeOpen}
          onDismiss={() => setEventEndTimeOpen(false)}
          onConfirm={({ hours, minutes }) => {
            setEventForm((prev) => ({ ...prev, endTime: formatTime(hours, minutes) }));
            setEventEndTimeOpen(false);
          }}
          hours={parseTime(eventForm.endTime).hours}
          minutes={parseTime(eventForm.endTime).minutes}
        />
      </Portal>
    </SafeAreaView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  mainGrid: {
    gap: 16,
  },
  mainGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  calendarCardWide: {
    flex: 1.2,
  },
  summaryCardWide: {
    flex: 1,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    color: '#6B7280',
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  toolbarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  selectorRow: {
    marginBottom: 12,
  },
  selectorLabel: {
    marginBottom: 6,
    color: '#374151',
    fontWeight: '600',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  weekdayLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    color: '#6B7280',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    minHeight: 44,
    width: '14.28%',
    aspectRatio: 1,
    padding: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellMuted: {
    opacity: 0.35,
  },
  dayCellSelected: {
    backgroundColor: '#EEF2FF',
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  dayNumberMuted: {
    color: '#9CA3AF',
  },
  dayNumberSelected: {
    color: '#4338CA',
  },
  dayDots: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionDivider: {
    marginVertical: 16,
  },
  actionsRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  touch: { minHeight: 48 },
  iconTouch: { width: 48, height: 48, margin: 0 },
  dayNavigation: { flexDirection: 'row', alignItems: 'center' },
  dayLabel: { flex: 1 },
  copyActions: { marginVertical: 8 },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    minHeight: 44,
    borderRadius: 16,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#6B7280',
  },
  itemCard: {
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemHeaderContent: {
    flex: 1,
    marginLeft: 8,
  },
  itemTitle: {
    fontWeight: '600',
    color: '#111827',
  },
  itemMeta: {
    color: '#6B7280',
    fontSize: 12,
  },
  itemDetails: {
    marginTop: 12,
    gap: 6,
  },
  itemDetailText: {
    color: '#374151',
  },
  itemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
  },
  dialogScroll: {
    maxHeight: 420,
  },
  dialogInput: {
    marginTop: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  menuRow: {
    marginTop: 12,
  },
  menuLabel: {
    fontWeight: '600',
    marginBottom: 6,
  },
});
