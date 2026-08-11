
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  HelperText,
  IconButton,
  Menu,
  Portal,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { DatePickerModal, TimePickerModal } from 'react-native-paper-dates';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { fetchMembershipsByPharmacy, fetchMyMemberships } from '@chemisttasker/shared-core';
import apiClient from '@/utils/apiClient';

type ItemType = 'all' | 'events' | 'notes' | 'birthdays';

type CalendarItem = {
  id: number | string;
  seriesId?: number;
  isOccurrence?: boolean;
  type: 'event' | 'note' | 'birthday';
  title: string;
  date: Date;
  time?: string;
  allDay?: boolean;
  source: string;
  assignees?: string[];
  assigneeMembershipIds?: number[];
  status?: string;
  completedBy?: string[];
  readOnly?: boolean;
  description?: string;
  eventData?: any;
  noteData?: any;
};

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const normalizeList = (data: any) =>
  Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];

const fetchJson = async (path: string, params?: Record<string, any>) => {
  const res = await apiClient.get(path, { params });
  return res.data;
};

const postJson = async (
  path: string,
  body: any = null,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST'
) => {
  if (method === 'DELETE') {
    const res = await apiClient.delete(path);
    return res.data;
  }
  const res = await apiClient.request({ url: path, method, data: body });
  return res.data;
};

const toDate = (value?: string | null) => {
  if (!value) return null;
  const base = String(value);
  const normalized = base.includes('T') ? base : `${base}T00:00:00`;
  const parsed = new Date(normalized);
  return isValid(parsed) ? parsed : null;
};

const formatTimeRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return undefined;
  const trim = (t?: string | null) => (t ? t.slice(0, 5) : '');
  return [trim(start), trim(end)].filter(Boolean).join(' - ');
};

const ROLE_LABELS: Record<string, string> = {
  PHARMACIST: 'Pharmacist',
  INTERN: 'Intern Pharmacist',
  TECHNICIAN: 'Dispensary Technician',
  ASSISTANT: 'Pharmacy Assistant',
  STUDENT: 'Pharmacy Student',
  CONTACT: 'Contact',
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  LOCUM: 'Locum',
  CASUAL: 'Casual',
  SHIFT_HERO: 'Shift Hero',
};

const formatChoiceLabel = (value: any, labels: Record<string, string>) => {
  const key = String(value ?? '').trim().toUpperCase();
  return key ? labels[key] ?? key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase()) : '';
};

const parseTime = (value?: string | null) => {
  if (!value) return { hours: 9, minutes: 0 };
  const [h, m] = value.split(':').map((v) => Number(v));
  return {
    hours: Number.isFinite(h) ? h : 9,
    minutes: Number.isFinite(m) ? m : 0,
  };
};

const formatTime = (hours: number, minutes: number) => {
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}`;
};

export default function SharedCalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ date?: string; pharmacy_id?: string; note_id?: string }>();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
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
  const [noteSaving, setNoteSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | string | null>(null);
  const [pharmacyMenuVisible, setPharmacyMenuVisible] = useState(false);
  const [eventRepeatMenuVisible, setEventRepeatMenuVisible] = useState(false);
  const [noteRepeatMenuVisible, setNoteRepeatMenuVisible] = useState(false);
  const [eventDatePickerOpen, setEventDatePickerOpen] = useState(false);
  const [noteDatePickerOpen, setNoteDatePickerOpen] = useState(false);
  const [eventUntilPickerOpen, setEventUntilPickerOpen] = useState(false);
  const [noteUntilPickerOpen, setNoteUntilPickerOpen] = useState(false);
  const [eventStartTimeOpen, setEventStartTimeOpen] = useState(false);
  const [eventEndTimeOpen, setEventEndTimeOpen] = useState(false);
  const [assigneeMenuVisible, setAssigneeMenuVisible] = useState(false);
  const isWide = Platform.OS === 'web' ? true : width >= 900;

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

  const [noteForm, setNoteForm] = useState({
    title: '',
    body: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    notify: false,
    isGeneral: false,
    assigneeIds: [] as number[],
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
        const raw = await fetchMyMemberships({ page_size: 200 } as any);
        const list = normalizeList(raw);
        setMemberships(list);
        if (list.length > 0 && selectedPharmacyId === null) {
          const paramPharmacy = getParamString(params?.pharmacy_id);
          const parsed = paramPharmacy ? Number(paramPharmacy) : null;
          const initialId = Number.isFinite(parsed as number) ? (parsed as number) : getPharmacyId(list[0]);
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
    const loadMembers = async () => {
      try {
        setMembersLoading(true);
        const data = await fetchMembershipsByPharmacy(selectedPharmacyId);
        setPharmacyMembers(data as any);
      } catch {
        // keep previous members list if fetch fails
      } finally {
        setMembersLoading(false);
      }
    };
    void loadMembers();
  }, [selectedPharmacyId]);

  useEffect(() => {
    const newDate = format(selectedDay, 'yyyy-MM-dd');
    setEventForm((prev) => ({ ...prev, date: newDate }));
    setNoteForm((prev) => ({ ...prev, date: newDate }));
  }, [selectedDay]);

  useEffect(() => {
    selectedDayRef.current = selectedDay;
    currentMonthRef.current = currentMonth;
  }, [selectedDay, currentMonth]);

  const dateRange = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(start);
    return {
      from: format(start, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
    };
  }, [currentMonth]);

  const loadFeed = useCallback(async () => {
    if (!selectedPharmacyId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const feed = await fetchJson('/client-profile/calendar-feed/', {
        pharmacy_id: selectedPharmacyId,
        date_from: dateRange.from,
        date_to: dateRange.to,
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
          allDay: true,
          source: 'work_note',
          assignees: assigneeNames,
          completedBy: Array.isArray(note.completed_by) ? note.completed_by : [],
          assigneeMembershipIds: (note.assignees ?? []).map((a: any) => a.membershipId ?? a.membership_id),
          status: (note.status ?? '').toString().toUpperCase(),
          noteData: note,
        };
      });

      const combined = [...mappedEvents, ...mappedNotes];
      setItems(combined);
    } catch {
      setError('Unable to load calendar data.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPharmacyId, dateRange.from, dateRange.to]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    const dateParam = getParamString(params?.date);
    if (dateParam) {
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
    if (noteParam) {
      const noteId = Number(noteParam);
      if (Number.isFinite(noteId)) {
        const target = items.find(
          (itm) => itm.type === 'note' && (itm.seriesId === noteId || itm.id === noteId)
        );
        if (target) {
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
    if (pharmacyParam) {
      const nextPharmacyId = Number(pharmacyParam);
      if (Number.isFinite(nextPharmacyId) && nextPharmacyId !== selectedPharmacyId) {
        setSelectedPharmacyId(nextPharmacyId);
      }
    }
  }, [params, items, selectedPharmacyId]);

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
        if (filterType === 'all') return true;
        if (filterType === 'events') return item.type === 'event';
        if (filterType === 'notes') return item.type === 'note';
        if (filterType === 'birthdays') return item.type === 'birthday';
        return true;
      });
  }, [selectedDay, items, filterType]);
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

  const handleOpenNoteModal = () => {
    setNoteError(null);
    setEditingNoteId(null);
    setNoteForm({
      title: '',
      body: '',
      date: format(selectedDay, 'yyyy-MM-dd'),
      notify: false,
      isGeneral: false,
      assigneeIds: [],
      recurrence: {
        freq: 'NONE',
        interval: 1,
        until: '',
      },
    });
    setNoteModalOpen(true);
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
        await postJson(`/client-profile/calendar-events/${editingEventId}/`, payload, 'PATCH');
      } else {
        await postJson('/client-profile/calendar-events/', payload);
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
    if (!item.noteData) return;
    const note = item.noteData;
    const baseId = getBaseItemId(item);
    if (!baseId) return;
    setEditingNoteId(baseId);
    setNoteError(null);
    const rec = note.recurrence || {};
    setNoteForm({
      title: note.title || '',
      body: note.body || '',
      date: note.date || format(selectedDay, 'yyyy-MM-dd'),
      notify: Boolean(note.notify_on_shift_start),
      isGeneral: Boolean(note.is_general),
      assigneeIds: item.assigneeMembershipIds?.filter((id) => Number.isFinite(id)) ?? [],
      recurrence: {
        freq: (rec.freq || 'NONE').toString().toUpperCase(),
        interval: Number(rec.interval || 1),
        until: rec.until_date || '',
      },
    });
    setNoteModalOpen(true);
  };

  const handleCreateOrUpdateNote = async () => {
    if (!selectedPharmacyId) return;
    if (!noteForm.title.trim()) {
      setNoteError('Title is required.');
      return;
    }
    setNoteSaving(true);
    setNoteError(null);
    try {
      const recurrence =
        noteForm.recurrence.freq !== 'NONE'
          ? {
              freq: noteForm.recurrence.freq,
              interval: noteForm.recurrence.interval || 1,
              until_date: noteForm.recurrence.until || null,
            }
          : null;
      const payload = {
        pharmacy: selectedPharmacyId,
        title: noteForm.title,
        body: noteForm.body,
        date: noteForm.date,
        notify_on_shift_start: noteForm.notify,
        is_general: noteForm.isGeneral,
        assignee_membership_ids: noteForm.isGeneral ? [] : noteForm.assigneeIds,
        recurrence,
      };
      if (editingNoteId) {
        await postJson(`/client-profile/work-notes/${editingNoteId}/`, payload, 'PATCH');
      } else {
        await postJson('/client-profile/work-notes/', payload);
      }
      setNoteModalOpen(false);
      setEditingNoteId(null);
      void loadFeed();
    } catch (e: any) {
      setNoteError(e?.message || 'Failed to save work note.');
    } finally {
      setNoteSaving(false);
    }
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

  const selectedAssigneeNames = useMemo(() => {
    if (!noteForm.assigneeIds.length) return '';
    const selected = new Set(noteForm.assigneeIds);
    return pharmacyMembers
      .filter((m) => selected.has(Number(m.id)))
      .map(getMemberLabel)
      .join(', ');
  }, [noteForm.assigneeIds, pharmacyMembers]);

  const noPharmacies = memberships.length === 0;

  const safeSelectedDay = isValid(selectedDay) ? selectedDay : new Date();

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <IconButton icon="calendar" size={24} iconColor="#FFFFFF" />
            </View>
            <View>
              <Text variant="titleLarge" style={styles.headerTitle}>
                Pharmacy Calendar
              </Text>
              <Text variant="bodySmall" style={styles.headerSubtitle}>
                Track events, work notes, and birthdays in one place.
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.mainGrid, isWide ? styles.mainGridWide : null]}>
          <Card style={[styles.card, isWide ? styles.calendarCardWide : null]}>
            <Card.Content>
            <View style={styles.toolbarRow}>
              <View style={styles.monthNav}>
                <IconButton icon="chevron-left" onPress={handlePrevMonth} />
                <Text style={styles.monthLabel}>{format(currentMonth, 'MMMM yyyy')}</Text>
                <IconButton icon="chevron-right" onPress={handleNextMonth} />
              </View>
              <Button mode="outlined" onPress={handleToday}>
                Today
              </Button>
            </View>

            <View style={styles.selectorRow}>
              <Text style={styles.selectorLabel}>Pharmacy</Text>
              <Menu
                visible={pharmacyMenuVisible}
                onDismiss={() => setPharmacyMenuVisible(false)}
                anchor={
                  <Button mode="outlined" onPress={() => setPharmacyMenuVisible(true)}>
                    {selectedPharmacyId
                      ? getPharmacyLabel(memberships.find((m) => getPharmacyId(m) === selectedPharmacyId) || {})
                      : 'Select pharmacy'}
                  </Button>
                }
              >
                {memberships.map((m) => (
                  <Menu.Item
                    key={m.id}
                    title={getPharmacyLabel(m)}
                    onPress={() => {
                      setSelectedPharmacyId(getPharmacyId(m));
                      setPharmacyMenuVisible(false);
                    }}
                  />
                ))}
              </Menu>
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
              <Button mode="contained" onPress={handleOpenEventModal} disabled={!selectedPharmacyId}>
                Add Event
              </Button>
              <Button mode="contained" onPress={handleOpenNoteModal} disabled={!selectedPharmacyId}>
                Add Work Note
              </Button>
            </View>
            </Card.Content>
          </Card>

          <Card style={[styles.card, isWide ? styles.summaryCardWide : null]}>
            <Card.Content>
            <View style={styles.dayHeader}>
              <Text variant="titleMedium" style={styles.dayHeaderTitle}>
                {format(safeSelectedDay, 'EEEE, MMM d')}
              </Text>
              <Text style={styles.dayHeaderSubtitle}>Items for selected day</Text>
            </View>

            <View style={styles.filterRow}>
              {(['all', 'events', 'notes', 'birthdays'] as ItemType[]).map((type) => (
                <Chip
                  key={type}
                  style={[styles.filterChip, filterType === type && styles.filterChipActive]}
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
            </View>

            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <Text>Loading calendar data...</Text>
              </View>
            )}

            {error && <HelperText type="error">{error}</HelperText>}

            {!loading && filteredItems.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No items scheduled for this day</Text>
              </View>
            )}

            {filteredItems.map((item) => {
              const isExpanded = expandedId === item.id;
              const typeColor = getTypeColor(item.type);

              return (
                <TouchableOpacity
                  key={`${item.id}-${item.type}`}
                  onPress={() => setExpandedId(isExpanded ? null : item.id)}
                  activeOpacity={0.8}
                >
                  <Card style={styles.itemCard}>
                    <Card.Content>
                      <View style={styles.itemHeader}>
                        <View style={[styles.itemIcon, { backgroundColor: `${typeColor}22` }]}>
                          <IconButton icon={getTypeIcon(item.type)} size={18} iconColor={typeColor} />
                        </View>
                        <View style={styles.itemHeaderContent}>
                          <Text style={styles.itemTitle}>{item.title}</Text>
                          <Text style={styles.itemMeta}>
                            {item.allDay ? 'All day' : item.time || ''}
                          </Text>
                        </View>
                        {item.type === 'note' && item.status && (
                          <Chip style={styles.statusChip}>{item.status}</Chip>
                        )}
                      </View>

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
                              <Button mode="text" onPress={() => handleEditEvent(item)}>
                                Edit
                              </Button>
                            )}

                            {item.type === 'event' && !item.readOnly && (
                              <Button
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
                                          await postJson(`/client-profile/calendar-events/${baseId}/`, {}, 'DELETE');
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

                            {item.type === 'note' && (
                              <Button mode="text" onPress={() => handleEditNote(item)}>
                                Edit
                              </Button>
                            )}

                            {item.type === 'note' && (
                              <Button
                                mode="text"
                                textColor={theme.colors.error}
                                onPress={() => {
                                  Alert.alert('Delete work note', 'Delete this work note?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Delete',
                                      style: 'destructive',
                                      onPress: async () => {
                                        try {
                                          const baseId = getBaseItemId(item);
                                          if (!baseId) return;
                                          await postJson(`/client-profile/work-notes/${baseId}/`, {}, 'DELETE');
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

                            {item.type === 'note' && item.status && (
                              <Button
                                mode="outlined"
                                onPress={async () => {
                                  try {
                                    const action = item.status === 'DONE' ? 'mark_open' : 'mark_done';
                                    const baseId = getBaseItemId(item);
                                    if (!baseId) return;
                                    const occurrenceDate = format(item.date, 'yyyy-MM-dd');
                                    await postJson(
                                      `/client-profile/work-notes/${baseId}/${action}/`,
                                      { occurrence_date: occurrenceDate },
                                      'POST'
                                    );
                                    void loadFeed();
                                  } catch {
                                    // ignore
                                  }
                                }}
                              >
                                {item.status === 'DONE' ? 'Mark Open' : 'Mark Done'}
                              </Button>
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

        <Dialog visible={noteModalOpen} onDismiss={() => setNoteModalOpen(false)} style={styles.dialog}>
          <Dialog.Title>{editingNoteId ? 'Update Work Note' : 'Create Work Note'}</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              <TextInput
                label="Title"
                value={noteForm.title}
                onChangeText={(text) => setNoteForm((prev) => ({ ...prev, title: text }))}
                mode="outlined"
              />
              <TextInput
                label="Date"
                value={noteForm.date}
                onChangeText={(text) => setNoteForm((prev) => ({ ...prev, date: text }))}
                mode="outlined"
                style={styles.dialogInput}
                right={<TextInput.Icon icon="calendar" onPress={() => setNoteDatePickerOpen(true)} />}
              />
              <TextInput
                label="Details"
                value={noteForm.body}
                onChangeText={(text) => setNoteForm((prev) => ({ ...prev, body: text }))}
                mode="outlined"
                multiline
                style={styles.dialogInput}
              />
              <View style={styles.switchRow}>
                <Text>Notify assignees at shift start</Text>
                <Switch
                  value={noteForm.notify}
                  onValueChange={(value) => setNoteForm((prev) => ({ ...prev, notify: value }))}
                />
              </View>
              <View style={styles.switchRow}>
                <Text>Applies to all staff (general note)</Text>
                <Switch
                  value={noteForm.isGeneral}
                  onValueChange={(value) =>
                    setNoteForm((prev) => ({ ...prev, isGeneral: value, assigneeIds: [] }))
                  }
                />
              </View>

              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Repeats</Text>
                <Menu
                  visible={noteRepeatMenuVisible}
                  onDismiss={() => setNoteRepeatMenuVisible(false)}
                  anchor={
                    <Button mode="outlined" onPress={() => setNoteRepeatMenuVisible(true)}>
                      {noteForm.recurrence.freq === 'NONE'
                        ? 'Does not repeat'
                        : noteForm.recurrence.freq}
                    </Button>
                  }
                >
                  {['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'].map((freq) => (
                    <Menu.Item
                      key={freq}
                      title={freq === 'NONE' ? 'Does not repeat' : freq}
                      onPress={() => {
                        setNoteForm((prev) => ({
                          ...prev,
                          recurrence: { ...prev.recurrence, freq },
                        }));
                        setNoteRepeatMenuVisible(false);
                      }}
                    />
                  ))}
                </Menu>
              </View>

              {noteForm.recurrence.freq !== 'NONE' && (
                <TextInput
                  label="Interval"
                  value={String(noteForm.recurrence.interval)}
                  onChangeText={(text) =>
                    setNoteForm((prev) => ({
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

              {noteForm.recurrence.freq !== 'NONE' && (
                <TextInput
                  label="Repeat until (optional)"
                  value={noteForm.recurrence.until}
                  onChangeText={(text) =>
                    setNoteForm((prev) => ({
                      ...prev,
                      recurrence: { ...prev.recurrence, until: text },
                    }))
                  }
                  mode="outlined"
                  style={styles.dialogInput}
                  right={<TextInput.Icon icon="calendar" onPress={() => setNoteUntilPickerOpen(true)} />}
                />
              )}

              <View style={styles.assigneeSection}>
                <Text style={styles.menuLabel}>Assign to</Text>
                {noteForm.isGeneral ? (
                  <HelperText type="info">General note applies to all staff.</HelperText>
                ) : (
                  <>
                    <Menu
                      visible={assigneeMenuVisible}
                      onDismiss={() => setAssigneeMenuVisible(false)}
                      anchor={
                        <TextInput
                          label="Assign to"
                          value={selectedAssigneeNames}
                          mode="outlined"
                          editable={false}
                          style={styles.dialogInput}
                          right={<TextInput.Icon icon="chevron-down" onPress={() => setAssigneeMenuVisible(true)} />}
                          onPressIn={() => setAssigneeMenuVisible(true)}
                        />
                      }
                    >
                      {membersLoading && <Menu.Item title="Loading staff..." disabled />}
                      {!membersLoading && pharmacyMembers.length === 0 && (
                        <Menu.Item title="No staff found for this pharmacy." disabled />
                      )}
                      {pharmacyMembers.map((member) => {
                        const id = Number(member.id);
                        const checked = noteForm.assigneeIds.includes(id);
                        return (
                          <Menu.Item
                            key={member.id}
                            title={getMemberLabel(member)}
                            leadingIcon={checked ? 'check' : undefined}
                            onPress={() => {
                              setNoteForm((prev) => {
                                const next = new Set(prev.assigneeIds);
                                if (checked) {
                                  next.delete(id);
                                } else {
                                  next.add(id);
                                }
                                return { ...prev, assigneeIds: Array.from(next) };
                              });
                            }}
                          />
                        );
                      })}
                    </Menu>
                    <HelperText type="info">
                      {selectedAssigneeNames ? selectedAssigneeNames : 'Select staff to assign.'}
                    </HelperText>
                  </>
                )}
              </View>

              {noteError && <HelperText type="error">{noteError}</HelperText>}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setNoteModalOpen(false)} disabled={noteSaving}>
              Cancel
            </Button>
            <Button onPress={handleCreateOrUpdateNote} disabled={noteSaving || !selectedPharmacyId}>
              {noteSaving ? 'Saving...' : editingNoteId ? 'Update' : 'Create'}
            </Button>
          </Dialog.Actions>
        </Dialog>

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
          visible={noteDatePickerOpen}
          onDismiss={() => setNoteDatePickerOpen(false)}
          date={toDate(noteForm.date) ?? new Date()}
          onConfirm={({ date }) => {
            if (date) {
              setNoteForm((prev) => ({ ...prev, date: format(date, 'yyyy-MM-dd') }));
            }
            setNoteDatePickerOpen(false);
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

        <DatePickerModal
          locale="en"
          mode="single"
          visible={noteUntilPickerOpen}
          onDismiss={() => setNoteUntilPickerOpen(false)}
          date={toDate(noteForm.recurrence.until) ?? new Date()}
          onConfirm={({ date }) => {
            if (date) {
              setNoteForm((prev) => ({
                ...prev,
                recurrence: { ...prev.recurrence, until: format(date, 'yyyy-MM-dd') },
              }));
            }
            setNoteUntilPickerOpen(false);
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
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  dayHeader: {
    marginBottom: 12,
  },
  dayHeaderTitle: {
    fontWeight: '700',
    color: '#111827',
  },
  dayHeaderSubtitle: {
    color: '#6B7280',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderRadius: 16,
  },
  filterChipActive: {
    backgroundColor: '#6366F1',
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
  statusChip: {
    height: 24,
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
  assigneeSection: {
    marginTop: 12,
  },
  assigneeList: {
    gap: 8,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
