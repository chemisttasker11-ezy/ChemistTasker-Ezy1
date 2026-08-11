import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControlLabel,
    Switch,
    Tab,
    Tabs,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import {
    Event as EventIcon,
    Assignment as AssignmentIcon,
    Cake as CakeIcon,
    ChevronLeft,
    ChevronRight,
    Add as AddIcon,
    CalendarMonth as CalendarIcon,
    InfoOutlined,
} from "@mui/icons-material";
import {
    addDays,
    addMonths,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfWeek,
    subMonths,
} from "date-fns";
import { fetchMembershipsByPharmacy, fetchMyMemberships } from "@chemisttasker/shared-core";
import apiClient from "../../../utils/apiClient";
import { useSearchParams } from "react-router-dom";

type ItemType = "all" | "events" | "notes" | "birthdays";

type CalendarItem = {
    id: number | string;
    seriesId?: number;
    isOccurrence?: boolean;
    type: "event" | "note" | "birthday";
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

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const normalizeList = (data: any) =>
    Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];

const fetchJson = async (path: string, params?: Record<string, any>) => {
    const res = await apiClient.get(path, { params });
    return res.data;
};

const postJson = async (
    path: string,
    body: any = null,
    method: "POST" | "PATCH" | "DELETE" = "POST"
) => {
    if (method === "DELETE") {
        const res = await apiClient.delete(path);
        return res.data;
    }
    const res = await apiClient.request({ url: path, method, data: body });
    return res.data;
};

const toDate = (value?: string | null) => (value ? new Date(`${value}T00:00:00`) : null);

const formatTimeRange = (start?: string | null, end?: string | null) => {
    if (!start && !end) return undefined;
    const trim = (t?: string | null) => (t ? t.slice(0, 5) : "");
    return [trim(start), trim(end)].filter(Boolean).join(" - ");
};

const ROLE_LABELS: Record<string, string> = {
    PHARMACIST: "Pharmacist",
    INTERN: "Intern Pharmacist",
    TECHNICIAN: "Dispensary Technician",
    ASSISTANT: "Pharmacy Assistant",
    STUDENT: "Pharmacy Student",
    CONTACT: "Contact",
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
    FULL_TIME: "Full-time",
    PART_TIME: "Part-time",
    LOCUM: "Locum",
    CASUAL: "Casual",
    SHIFT_HERO: "Shift Hero",
};

const formatChoiceLabel = (value: any, labels: Record<string, string>) => {
    const key = String(value ?? "").trim().toUpperCase();
    return key ? labels[key] ?? key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase()) : "";
};

export default function PharmacyCalendarPage() {
    const theme = useTheme();
    const isDarkMode = theme.palette.mode === "dark";
    const pageBg = isDarkMode ? "var(--ct-page-bg, #07111f)" : "#f8fafc";
    const cardBg = isDarkMode ? "var(--ct-elevated-bg, #101b2f)" : "#FFFFFF";
    const subtleBg = isDarkMode ? alpha(theme.palette.common.white, 0.045) : alpha(theme.palette.primary.main, 0.04);
    const hoverBg = isDarkMode ? alpha(theme.palette.primary.light, 0.12) : alpha(theme.palette.primary.main, 0.08);
    const borderColor = isDarkMode ? alpha(theme.palette.common.white, 0.12) : "rgba(15, 23, 42, 0.10)";
    const [searchParams, setSearchParams] = useSearchParams();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState<Date>(new Date());
    const [filterType, setFilterType] = useState<ItemType>("all");
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
    const selectedDayRef = useRef(selectedDay);
    const currentMonthRef = useRef(currentMonth);
  const [eventForm, setEventForm] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    allDay: true,
    startTime: "",
    endTime: "",
    description: "",
    recurrence: {
      freq: "NONE",
      interval: 1,
      until: "",
    },
  });
  const [noteForm, setNoteForm] = useState({
    title: "",
    body: "",
    date: format(new Date(), "yyyy-MM-dd"),
    notify: false,
    isGeneral: false,
    assigneeIds: [] as number[],
    recurrence: {
      freq: "NONE",
      interval: 1,
      until: "",
    },
  });

    useEffect(() => {
        const loadMemberships = async () => {
            try {
                const data = await fetchMyMemberships({ page_size: 200 });
                setMemberships(data);
                if (data.length > 0 && selectedPharmacyId === null) {
                    const paramPharmacy = searchParams.get("pharmacy_id");
                    const initialId = paramPharmacy ? Number(paramPharmacy) : getPharmacyId(data[0]);
                    setSelectedPharmacyId(Number.isFinite(initialId) ? initialId : getPharmacyId(data[0]));
                }
            } catch (e) {
                setError("Unable to load your pharmacy memberships.");
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
                setPharmacyMembers(data);
            } catch (e) {
                // keep previous members list if fetch fails
            } finally {
                setMembersLoading(false);
            }
        };
        void loadMembers();
    }, [selectedPharmacyId]);

    useEffect(() => {
        const newDate = format(selectedDay, "yyyy-MM-dd");
        const newPharma = selectedPharmacyId ? String(selectedPharmacyId) : null;
        const currentDate = searchParams.get("date");
        const currentPharma = searchParams.get("pharmacy_id");

        // keep search params in sync for deep link without causing loops
        if (currentDate !== newDate || currentPharma !== newPharma) {
            const params = new URLSearchParams(searchParams);
            params.set("date", newDate);
            if (newPharma) {
                params.set("pharmacy_id", newPharma);
            } else {
                params.delete("pharmacy_id");
            }
            setSearchParams(params, { replace: true });
        }

        setEventForm(prev => ({ ...prev, date: newDate }));
        setNoteForm(prev => ({ ...prev, date: newDate }));
    }, [selectedDay, selectedPharmacyId, setSearchParams]);

    useEffect(() => {
        selectedDayRef.current = selectedDay;
        currentMonthRef.current = currentMonth;
    }, [selectedDay, currentMonth]);

    const dateRange = useMemo(() => {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(start);
        return {
            from: format(start, "yyyy-MM-dd"),
            to: format(end, "yyyy-MM-dd"),
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
            const feed = await fetchJson("/client-profile/calendar-feed/", {
                pharmacy_id: selectedPharmacyId,
                date_from: dateRange.from,
                date_to: dateRange.to,
            });
            const eventsRaw = normalizeList(feed?.events);
            const notesRaw = normalizeList(feed?.work_notes);

            const mappedEvents: CalendarItem[] = normalizeList(eventsRaw).map((evt: any) => {
                const dateObj = toDate(evt.date) ?? new Date();
                const type: CalendarItem["type"] = evt.source === "birthday" ? "birthday" : "event";
                const rawId = evt.id;
                const id = typeof rawId === "number" ? rawId : String(rawId ?? "");
                const seriesId = evt.series_id ?? (typeof rawId === "number" ? rawId : undefined);
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
                    readOnly: evt.source !== "manual",
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
                        "Assignee"
                );
                const rawId = note.id;
                const id = typeof rawId === "number" ? rawId : String(rawId ?? "");
                const seriesId = note.series_id ?? (typeof rawId === "number" ? rawId : undefined);
                return {
                    id,
                    seriesId,
                    isOccurrence: Boolean(note.is_occurrence),
                    type: "note",
                    title: note.title,
                    date: dateObj,
                    allDay: true,
                    source: "work_note",
                    assignees: assigneeNames,
                    completedBy: Array.isArray(note.completed_by) ? note.completed_by : [],
                    assigneeMembershipIds: (note.assignees ?? []).map((a: any) => a.membershipId ?? a.membership_id),
                    status: (note.status ?? "").toString().toUpperCase(),
                    noteData: note,
                };
            });

            const combined = [...mappedEvents, ...mappedNotes];
            setItems(combined);
        } catch (e) {
            setError("Unable to load calendar data.");
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [selectedPharmacyId, dateRange.from, dateRange.to]);

    useEffect(() => {
        void loadFeed();
    }, [loadFeed]);

    useEffect(() => {
        const dateParam = searchParams.get("date");
        if (dateParam) {
            const parsed = toDate(dateParam);
            if (parsed) {
                if (!isSameDay(parsed, selectedDayRef.current)) {
                    setSelectedDay(parsed);
                }
                if (!isSameMonth(parsed, currentMonthRef.current)) {
                    setCurrentMonth(parsed);
                }
            }
        }

        const noteParam = searchParams.get("note_id");
        if (noteParam) {
            const noteId = Number(noteParam);
            if (Number.isFinite(noteId)) {
                const target = items.find((itm) => itm.type === "note" && (itm.seriesId === noteId || itm.id === noteId));
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
    }, [searchParams, items]);

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

    const getEventsForDay = (day: Date) => items.filter(item => isSameDay(item.date, day));

    const filteredItems = useMemo(() => {
        if (!selectedDay) return [];
        return items
            .filter(item => isSameDay(item.date, selectedDay))
            .filter(item => {
                if (filterType === "all") return true;
                if (filterType === "events") return item.type === "event";
                if (filterType === "notes") return item.type === "note";
                if (filterType === "birthdays") return item.type === "birthday";
                return true;
            });
    }, [selectedDay, items, filterType]);

    const handlePrevMonth = () => {
        setCurrentMonth(prev => subMonths(prev, 1));
        setSelectedDay(prev => subMonths(prev, 1));
    };
    const handleNextMonth = () => {
        setCurrentMonth(prev => addMonths(prev, 1));
        setSelectedDay(prev => addMonths(prev, 1));
    };
    const handleToday = () => {
        const today = new Date();
        setCurrentMonth(today);
        setSelectedDay(today);
    };

    const handleOpenEventModal = () => {
        setEventError(null);
        setEditingEventId(null);
        setEventForm(prev => ({
            ...prev,
            date: format(selectedDay, "yyyy-MM-dd"),
            title: "",
            description: "",
            startTime: "",
            endTime: "",
            allDay: true,
            recurrence: {
                freq: "NONE",
                interval: 1,
                until: "",
            },
        }));
        setEventModalOpen(true);
    };

    const handleOpenNoteModal = () => {
        setNoteError(null);
        setEditingNoteId(null);
        setNoteForm({
            title: "",
            body: "",
            date: format(selectedDay, "yyyy-MM-dd"),
            notify: false,
            isGeneral: false,
            assigneeIds: [],
            recurrence: {
                freq: "NONE",
                interval: 1,
                until: "",
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
      title: evt.title || "",
      description: evt.description || "",
      date: evt.date || format(selectedDay, "yyyy-MM-dd"),
      allDay: Boolean(evt.all_day ?? true),
      startTime: evt.start_time || "",
      endTime: evt.end_time || "",
      recurrence: {
        freq: (rec.freq || "NONE").toString().toUpperCase(),
        interval: Number(rec.interval || 1),
        until: rec.until_date || "",
      },
    });
    setEventModalOpen(true);
  };

  const handleCreateOrUpdateEvent = async () => {
    if (!selectedPharmacyId) return;
    if (!eventForm.title.trim()) {
      setEventError("Title is required.");
      return;
        }
        setEventSaving(true);
        setEventError(null);
        try {
      const recurrence =
        eventForm.recurrence.freq !== "NONE"
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
        await postJson(`/client-profile/calendar-events/${editingEventId}/`, payload, "PATCH");
      } else {
        await postJson("/client-profile/calendar-events/", payload);
      }
            setEventModalOpen(false);
            setEditingEventId(null);
            void loadFeed();
        } catch (e: any) {
            setEventError(e.message || "Failed to save event.");
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
      title: note.title || "",
      body: note.body || "",
      date: note.date || format(selectedDay, "yyyy-MM-dd"),
      notify: Boolean(note.notify_on_shift_start),
      isGeneral: Boolean(note.is_general),
      assigneeIds: item.assigneeMembershipIds?.filter((id) => Number.isFinite(id)) ?? [],
      recurrence: {
        freq: (rec.freq || "NONE").toString().toUpperCase(),
        interval: Number(rec.interval || 1),
        until: rec.until_date || "",
      },
    });
    setNoteModalOpen(true);
  };

    const handleCreateOrUpdateNote = async () => {
        if (!selectedPharmacyId) return;
        if (!noteForm.title.trim()) {
            setNoteError("Title is required.");
            return;
        }
        setNoteSaving(true);
        setNoteError(null);
        try {
      const recurrence =
        noteForm.recurrence.freq !== "NONE"
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
                await postJson(`/client-profile/work-notes/${editingNoteId}/`, payload, "PATCH");
            } else {
                await postJson("/client-profile/work-notes/", payload);
            }
            setNoteModalOpen(false);
            setEditingNoteId(null);
            void loadFeed();
        } catch (e: any) {
            setNoteError(e.message || "Failed to save work note.");
        } finally {
            setNoteSaving(false);
        }
    };

    const getBaseItemId = (item: CalendarItem) => {
        if (item.seriesId) return item.seriesId;
        if (typeof item.id === "number") return item.id;
        const parsed = Number.parseInt(String(item.id), 10);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const getTypeColor = (type: CalendarItem["type"]) => {
        switch (type) {
            case "event": return theme.palette.primary.main;
            case "note": return "#f59e0b";
            case "birthday": return "#10b981";
            default: return theme.palette.primary.main;
        }
    };

    const getTypeIcon = (type: CalendarItem["type"]) => {
        switch (type) {
            case "event": return <EventIcon fontSize="small" />;
            case "note": return <AssignmentIcon fontSize="small" />;
            case "birthday": return <CakeIcon fontSize="small" />;
            default: return <EventIcon fontSize="small" />;
        }
    };

    const getMemberLabel = (member: any) => {
        const userDetails = member?.userDetails ?? member?.user_details ?? member?.user ?? {};
        const fullName =
            userDetails?.fullName ||
            userDetails?.full_name ||
            [userDetails?.firstName ?? userDetails?.first_name, userDetails?.lastName ?? userDetails?.last_name]
                .filter(Boolean)
                .join(" ");
        const name =
            member?.invitedName ||
            member?.invited_name ||
            member?.name ||
            fullName ||
            userDetails?.email ||
            member?.email ||
            `Member ${member?.id ?? ""}`;
        const details = [
            formatChoiceLabel(member?.role, ROLE_LABELS),
            member?.jobTitle ?? member?.job_title,
            formatChoiceLabel(member?.employmentType ?? member?.employment_type, EMPLOYMENT_TYPE_LABELS),
        ].filter(Boolean);
        return [name, ...details].join(" | ");
    };

    const getPharmacyId = (m: any) =>
        m?.pharmacyId ?? m?.pharmacyDetail?.id ?? m?.pharmacy?.id ?? null;

    const getPharmacyLabel = (m: any) =>
        m?.pharmacyName ||
        m?.pharmacyDetail?.name ||
        m?.pharmacy?.name ||
        (getPharmacyId(m) !== null
            ? `Pharmacy ${getPharmacyId(m)}`
            : `Pharmacy ${m?.id ?? ""}`);

    const noPharmacies = memberships.length === 0;

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, minHeight: "100vh", bgcolor: pageBg, color: "text.primary" }}>
            <Paper
                elevation={0}
                sx={{
                    p: 3,
                    mb: 3,
                    borderRadius: 3,
                    background: cardBg,
                    border: "1px solid",
                    borderColor,
                }}
            >
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={2}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Box
                            sx={{
                                width: 48,
                                height: 48,
                                borderRadius: 2,
                                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "white",
                            }}
                        >
                            <CalendarIcon />
                        </Box>
                        <Box>
                            <Typography
                                variant="h5"
                                component="h1"
                                sx={{
                                    fontWeight: 700,
                                    fontFamily: '"Inter", "Roboto", sans-serif',
                                    letterSpacing: "-0.02em",
                                }}
                            >
                                Pharmacy Calendar
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: '"Inter", sans-serif' }}>
                                View pharmacy events, work notes, and birthdays
                            </Typography>
                        </Box>
                    </Box>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            disabled={!selectedPharmacyId}
                            onClick={handleOpenEventModal}
                            sx={{
                                borderRadius: 2,
                                textTransform: "none",
                                fontWeight: 600,
                                fontFamily: '"Inter", sans-serif',
                                px: 2.5,
                            }}
                        >
                            Add Event
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<AssignmentIcon />}
                            disabled={!selectedPharmacyId}
                            onClick={handleOpenNoteModal}
                            sx={{
                                borderRadius: 2,
                                textTransform: "none",
                                fontWeight: 600,
                                fontFamily: '"Inter", sans-serif',
                                px: 2.5,
                                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                                boxShadow: `0 4px 14px 0 ${alpha(theme.palette.primary.main, 0.4)}`,
                                "&:hover": {
                                    background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
                                },
                            }}
                        >
                            Add Work Note
                        </Button>
                    </Stack>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mt={2} alignItems={{ xs: "flex-start", sm: "center" }}>
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel id="pharmacy-select-label">Pharmacy</InputLabel>
                        <Select
                            labelId="pharmacy-select-label"
                            value={selectedPharmacyId ?? ""}
                            label="Pharmacy"
                            onChange={(e) => {
                                const raw = e.target.value;
                                if (typeof raw === "string" && raw === "") {
                                    setSelectedPharmacyId(null);
                                    return;
                                }
                                const nextId = Number(raw);
                                setSelectedPharmacyId(Number.isFinite(nextId) ? nextId : null);
                            }}
                            disabled={memberships.length === 0}
                        >
                            {memberships.map((m) => (
                                <MenuItem key={m.id} value={getPharmacyId(m) ?? ""}>
                                    {getPharmacyLabel(m)}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: '"Inter", sans-serif' }}>
                        Showing items for the selected pharmacy. Org-wide events not included yet.
                    </Typography>
                </Stack>
            </Paper>

            {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                    {error}
                </Alert>
            )}

            {noPharmacies ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                    You don't have any active pharmacy memberships, so the calendar is empty for now.
                </Alert>
            ) : (
                <Stack direction={{ xs: "column", lg: "row" }} spacing={3}>
                    <Paper
                        elevation={0}
                        sx={{
                            flex: 2,
                            p: 3,
                            borderRadius: 3,
                            background: cardBg,
                            border: "1px solid",
                            borderColor,
                            position: "relative",
                        }}
                    >
                        {loading && (
                            <Box
                                sx={{
                                    position: "absolute",
                                    inset: 0,
                                    bgcolor: subtleBg,
                                    zIndex: 1,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 3,
                                }}
                            >
                                <CircularProgress size={32} />
                            </Box>
                        )}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                            <Stack direction="row" alignItems="center" spacing={2}>
                                <Typography
                                    variant="h5"
                                    sx={{
                                        fontWeight: 700,
                                        fontFamily: '"Inter", sans-serif',
                                        letterSpacing: "-0.01em",
                                    }}
                                >
                                    {format(currentMonth, "MMMM yyyy")}
                                </Typography>
                                <Stack direction="row" spacing={0.5}>
                                    <IconButton
                                        onClick={handlePrevMonth}
                                        size="small"
                                        sx={{
                                            border: "1px solid",
                                            borderColor: "divider",
                                            borderRadius: 1.5,
                                            "&:hover": { bgcolor: hoverBg },
                                        }}
                                    >
                                        <ChevronLeft fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                        onClick={handleNextMonth}
                                        size="small"
                                        sx={{
                                            border: "1px solid",
                                            borderColor: "divider",
                                            borderRadius: 1.5,
                                            "&:hover": { bgcolor: hoverBg },
                                        }}
                                    >
                                        <ChevronRight fontSize="small" />
                                    </IconButton>
                                </Stack>
                            </Stack>
                            <Button
                                variant="text"
                                onClick={handleToday}
                                sx={{
                                    textTransform: "none",
                                    fontWeight: 600,
                                    fontFamily: '"Inter", sans-serif',
                                    color: theme.palette.primary.main,
                                }}
                            >
                                Today
                            </Button>
                        </Stack>

                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(7, 1fr)",
                                mb: 1,
                            }}
                        >
                            {WEEKDAYS.map(day => (
                                <Typography
                                    key={day}
                                    sx={{
                                        textAlign: "center",
                                        py: 1.5,
                                        fontWeight: 600,
                                        fontSize: "0.75rem",
                                        color: "text.secondary",
                                        fontFamily: '"Inter", sans-serif',
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    {day}
                                </Typography>
                            ))}
                        </Box>

                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(7, 1fr)",
                                gap: 0.5,
                            }}
                        >
                            {calendarDays.map((day, idx) => {
                                const dayEvents = getEventsForDay(day);
                                const isCurrentMonth = isSameMonth(day, currentMonth);
                                const isSelected = isSameDay(day, selectedDay);
                                const isTodayDate = isToday(day);

                                return (
                                    <Box
                                        key={idx}
                                        onClick={() => setSelectedDay(day)}
                                        sx={{
                                            aspectRatio: "1",
                                            p: 0.75,
                                            cursor: "pointer",
                                            borderRadius: 2,
                                            position: "relative",
                                            transition: "all 0.2s ease",
                                            bgcolor: isSelected
                                                ? alpha(theme.palette.primary.main, isDarkMode ? 0.22 : 0.1)
                                                : "transparent",
                                            border: "2px solid",
                                            borderColor: isSelected
                                                ? theme.palette.primary.main
                                                : isTodayDate
                                                    ? alpha(theme.palette.primary.main, 0.3)
                                                    : "transparent",
                                            "&:hover": {
                                                bgcolor: hoverBg,
                                            },
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                fontWeight: isTodayDate || isSelected ? 700 : 500,
                                                fontSize: "0.9rem",
                                                fontFamily: '"Inter", sans-serif',
                                                color: !isCurrentMonth
                                                    ? "text.disabled"
                                                    : isSelected
                                                        ? theme.palette.primary.main
                                                        : isTodayDate
                                                            ? theme.palette.primary.main
                                                            : "text.primary",
                                            }}
                                        >
                                            {format(day, "d")}
                                        </Typography>

                                        {dayEvents.length > 0 && (
                                            <Stack
                                                direction="row"
                                                spacing={0.3}
                                                sx={{
                                                    position: "absolute",
                                                    bottom: 4,
                                                    left: "50%",
                                                    transform: "translateX(-50%)",
                                                }}
                                            >
                                                {dayEvents.slice(0, 3).map((event, i) => (
                                                    <Box
                                                        key={i}
                                                        sx={{
                                                            width: 6,
                                                            height: 6,
                                                            borderRadius: "50%",
                                                            bgcolor: getTypeColor(event.type),
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>

                        <Stack direction="row" spacing={3} mt={3} pt={2} borderTop="1px solid" sx={{ borderColor: "divider" }}>
                            {[
                                { label: "Events", color: theme.palette.primary.main },
                                { label: "Work Notes", color: "#f59e0b" },
                                { label: "Birthdays", color: "#10b981" },
                            ].map(item => (
                                <Stack key={item.label} direction="row" alignItems="center" spacing={1}>
                                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: item.color }} />
                                    <Typography
                                        variant="caption"
                                        sx={{ color: "text.secondary", fontFamily: '"Inter", sans-serif' }}
                                    >
                                        {item.label}
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                    </Paper>

                    <Paper
                        elevation={0}
                        sx={{
                            flex: 1,
                            p: 3,
                            borderRadius: 3,
                            background: cardBg,
                            border: "1px solid",
                            borderColor,
                            minWidth: { lg: 360 },
                            maxHeight: { lg: "75vh" },
                            overflowY: "auto",
                        }}
                    >
                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 700,
                                fontFamily: '"Inter", sans-serif',
                                mb: 2,
                                letterSpacing: "-0.01em",
                            }}
                        >
                            {format(selectedDay, "MMMM d, yyyy")}
                        </Typography>

                        <Tabs
                            value={filterType}
                            onChange={(_, newValue) => setFilterType(newValue)}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{
                                mb: 3,
                                "& .MuiTab-root": {
                                    textTransform: "none",
                                    fontWeight: 600,
                                    fontFamily: '"Inter", sans-serif',
                                    minHeight: 40,
                                    fontSize: "0.85rem",
                                },
                                "& .MuiTabs-indicator": {
                                    height: 3,
                                    borderRadius: 1.5,
                                },
                            }}
                        >
                            <Tab label="All" value="all" />
                            <Tab label="Events" value="events" icon={<EventIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
                            <Tab label="Notes" value="notes" icon={<AssignmentIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
                            <Tab label="Birthdays" value="birthdays" icon={<CakeIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
                        </Tabs>

                        <Stack spacing={2}>
                            {filteredItems.map((item) => (
                                <Card
                                    key={item.id}
                                    variant="outlined"
                                    sx={{
                                        borderRadius: 2.5,
                                        border: "1px solid",
                                        borderColor: "divider",
                                        transition: "all 0.2s ease",
                                        cursor: "pointer",
                                        "&:hover": {
                                            borderColor: getTypeColor(item.type),
                                            boxShadow: `0 4px 12px ${alpha(getTypeColor(item.type), 0.15)}`,
                                        },
                                    }}
                                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                >
                                    <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                                        <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                            <Box
                                                sx={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 2,
                                                    bgcolor: alpha(getTypeColor(item.type), 0.12),
                                                    color: getTypeColor(item.type),
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {getTypeIcon(item.type)}
                                            </Box>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Stack direction="row" justifyContent="space-between" alignItems="start" mb={0.5}>
                                                    <Typography
                                                        variant="subtitle2"
                                                        sx={{
                                                            fontWeight: 600,
                                                            fontFamily: '"Inter", sans-serif',
                                                            lineHeight: 1.3,
                                                        }}
                                                    >
                                                        {item.title}
                                                    </Typography>
                                                    {item.readOnly && (
                                                        <Chip
                                                            label="Read-only"
                                                            size="small"
                                                            sx={{
                                                                height: 20,
                                                                fontSize: "0.65rem",
                                                                bgcolor: alpha(theme.palette.secondary.main, 0.1),
                                                                color: theme.palette.secondary.main,
                                                            }}
                                                        />
                                                    )}
                                                </Stack>

                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: "text.secondary",
                                                        fontFamily: '"Inter", sans-serif',
                                                        fontSize: "0.8rem",
                                                        mb: item.assignees || item.status ? 1 : 0,
                                                    }}
                                                >
                                                    {item.allDay ? "All Day" : item.time || "â€”"}
                                                </Typography>

                                                {item.assignees && (
                                                    <Stack direction="row" spacing={0.5} flexWrap="wrap" mb={0.5}>
                                                        {item.assignees.map((assignee, idx) => (
                                                            <Chip
                                                                key={idx}
                                                                label={assignee}
                                                                size="small"
                                                                sx={{
                                                                    height: 22,
                                                                    fontSize: "0.7rem",
                                                                    fontFamily: '"Inter", sans-serif',
                                                                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                                                                }}
                                                            />
                                                        ))}
                                                    </Stack>
                                                )}

                                                {item.status && (
                                                    <Chip
                                                        label={item.status}
                                                        size="small"
                                                        sx={{
                                                            height: 22,
                                                            fontSize: "0.7rem",
                                                            fontWeight: 600,
                                                            bgcolor: item.status === "OPEN"
                                                                ? alpha("#f59e0b", 0.12)
                                                                : alpha("#10b981", 0.12),
                                                            color: item.status === "OPEN" ? "#d97706" : "#059669",
                                                        }}
                                                    />
                                                )}
                                                {expandedId === item.id && (
                                                    <Box sx={{ mt: 1 }}>
                                                        {item.description && (
                                                            <Typography
                                                                variant="body2"
                                                                sx={{ color: "text.primary", fontFamily: '"Inter", sans-serif', mb: 0.5 }}
                                                            >
                                                                {item.description}
                                                            </Typography>
                                                        )}
                                                        {item.noteData?.body && (
                                                            <Typography
                                                                variant="body2"
                                                                sx={{ color: "text.primary", fontFamily: '"Inter", sans-serif', mb: 0.5 }}
                                                            >
                                                                {item.noteData.body}
                                                            </Typography>
                                                        )}
                                                        {item.completedBy && item.completedBy.length > 0 && (
                                                            <Box sx={{ mt: 0.5 }}>
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{ color: "text.secondary", fontFamily: '"Inter", sans-serif' }}
                                                                >
                                                                    Completed by
                                                                </Typography>
                                                                <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                                                                    {item.completedBy.map((name, idx) => (
                                                                        <Typography
                                                                            key={`${name}-${idx}`}
                                                                            variant="body2"
                                                                            sx={{ color: "text.secondary", fontFamily: '"Inter", sans-serif' }}
                                                                        >
                                                                            - {name}
                                                                        </Typography>
                                                                    ))}
                                                                </Stack>
                                                            </Box>
                                                        )}
                                                    </Box>
                                                )}
                                                <Stack direction="row" spacing={1} mt={1}>
                                                    {item.type === "event" && !item.readOnly && (
                                                        <>
                                                            <Button
                                                                size="small"
                                                                variant="text"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleEditEvent(item);
                                                                }}
                                                            >
                                                                Edit
                                                            </Button>
                                                            <Button
                                                                size="small"
                                                                variant="text"
                                                                color="error"
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (!window.confirm("Delete this event?")) return;
                                                                    try {
                                                                        const baseId = getBaseItemId(item);
                                                                        if (!baseId) return;
                                                                        await postJson(`/client-profile/calendar-events/${baseId}/`, {}, "DELETE" as any);
                                                                        void loadFeed();
                                                                    } catch (e) {
                                                                        // swallow errors for now
                                                                    }
                                                                }}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </>
                                                    )}
                                                    {item.type === "note" && (
                                                        <>
                                                            <Button
                                                                size="small"
                                                                variant="text"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleEditNote(item);
                                                                }}
                                                            >
                                                                Edit
                                                            </Button>
                                                            <Button
                                                                size="small"
                                                                variant="text"
                                                                color="error"
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (!window.confirm("Delete this work note?")) return;
                                                                    try {
                                                                        const baseId = getBaseItemId(item);
                                                                        if (!baseId) return;
                                                                        await postJson(`/client-profile/work-notes/${baseId}/`, {}, "DELETE" as any);
                                                                        void loadFeed();
                                                                    } catch (e) {
                                                                        // swallow errors for now
                                                                    }
                                                                }}
                                                            >
                                                                Delete
                                                            </Button>
                                                            {item.status && (
                                                                <Button
                                                                    size="small"
                                                                    variant="outlined"
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        try {
                                                                            const action = item.status === "DONE" ? "mark_open" : "mark_done";
                                                                            const baseId = getBaseItemId(item);
                                                                            if (!baseId) return;
                                                                            const occurrenceDate = format(item.date, "yyyy-MM-dd");
                                                                            await postJson(
                                                                                `/client-profile/work-notes/${baseId}/${action}/`,
                                                                                { occurrence_date: occurrenceDate },
                                                                                "POST"
                                                                            );
                                                                            void loadFeed();
                                                                        } catch (e) {
                                                                            // swallow errors for now
                                                                        }
                                                                    }}
                                                                >
                                                                    {item.status === "DONE" ? "Mark Open" : "Mark Done"}
                                                                </Button>
                                                            )}
                                                        </>
                                                    )}
                                                </Stack>
                                            </Box>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            ))}

                            {filteredItems.length === 0 && (
                                <Box
                                    sx={{
                                        textAlign: "center",
                                        py: 6,
                                        px: 2,
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: 56,
                                            height: 56,
                                            borderRadius: "50%",
                                            bgcolor: alpha(theme.palette.text.secondary, 0.08),
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            mx: "auto",
                                            mb: 2,
                                        }}
                                    >
                                        <InfoOutlined sx={{ color: "text.disabled", fontSize: 28 }} />
                                    </Box>
                                    <Typography
                                        variant="body1"
                                        sx={{
                                            color: "text.secondary",
                                            fontFamily: '"Inter", sans-serif',
                                            fontWeight: 500,
                                        }}
                                    >
                                        No items scheduled for this day
                                    </Typography>
                                </Box>
                            )}
                        </Stack>
                    </Paper>
                </Stack>
            )}

            <Dialog open={eventModalOpen} onClose={() => setEventModalOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Create Event</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} mt={1}>
                        <TextField
                            label="Title"
                            value={eventForm.title}
                            onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                            fullWidth
                            required
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <TextField
                                label="Date"
                                type="date"
                                value={eventForm.date}
                                onChange={(e) => setEventForm(prev => ({ ...prev, date: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={eventForm.allDay}
                                        onChange={(e) => setEventForm(prev => ({ ...prev, allDay: e.target.checked }))}
                                    />
                                }
                                label="All day"
                            />
                        </Stack>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <TextField
                                label="Start time"
                                type="time"
                                value={eventForm.startTime}
                                onChange={(e) => setEventForm(prev => ({ ...prev, startTime: e.target.value }))}
                                disabled={eventForm.allDay}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                            <TextField
                                label="End time"
                                type="time"
                                value={eventForm.endTime}
                                onChange={(e) => setEventForm(prev => ({ ...prev, endTime: e.target.value }))}
                                disabled={eventForm.allDay}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                        </Stack>
                        <TextField
                            label="Description"
                            value={eventForm.description}
                            onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                            fullWidth
                            multiline
                            minRows={2}
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <FormControl fullWidth>
                                <InputLabel id="event-recur-label">Repeats</InputLabel>
                                <Select
                                    labelId="event-recur-label"
                                    label="Repeats"
                                    value={eventForm.recurrence.freq}
                                    onChange={(e) => setEventForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, freq: e.target.value as string } }))}
                                >
                                    <MenuItem value="NONE">Does not repeat</MenuItem>
                                    <MenuItem value="DAILY">Daily</MenuItem>
                                    <MenuItem value="WEEKLY">Weekly</MenuItem>
                                    <MenuItem value="MONTHLY">Monthly</MenuItem>
                                </Select>
                            </FormControl>
                            {eventForm.recurrence.freq !== "NONE" && (
                                <TextField
                                    label="Interval"
                                    type="number"
                                    inputProps={{ min: 1 }}
                                    value={eventForm.recurrence.interval}
                                    onChange={(e) => setEventForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, interval: Number(e.target.value) || 1 } }))}
                                />
                            )}
                        </Stack>
                        {eventForm.recurrence.freq !== "NONE" && (
                            <TextField
                                label="Repeat until (optional)"
                                type="date"
                                value={eventForm.recurrence.until}
                                onChange={(e) => setEventForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, until: e.target.value } }))}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                        )}
                        {eventError && <Alert severity="error">{eventError}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEventModalOpen(false)} disabled={eventSaving}>Cancel</Button>
                    <Button variant="contained" onClick={handleCreateOrUpdateEvent} disabled={eventSaving || !selectedPharmacyId}>
                        {eventSaving ? "Saving..." : editingEventId ? "Update Event" : "Create Event"}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={noteModalOpen} onClose={() => setNoteModalOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Create Work Note</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} mt={1}>
                        <TextField
                            label="Title"
                            value={noteForm.title}
                            onChange={(e) => setNoteForm(prev => ({ ...prev, title: e.target.value }))}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Date"
                            type="date"
                            value={noteForm.date}
                            onChange={(e) => setNoteForm(prev => ({ ...prev, date: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
            <TextField
              label="Details"
              value={noteForm.body}
              onChange={(e) => setNoteForm(prev => ({ ...prev, body: e.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={noteForm.notify}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, notify: e.target.checked }))}
                />
              }
              label="Notify assignees at shift start"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={noteForm.isGeneral}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, isGeneral: e.target.checked, assigneeIds: [] }))}
                />
              }
              label="Applies to all staff (general note)"
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="note-recur-label">Repeats</InputLabel>
                <Select
                  labelId="note-recur-label"
                  label="Repeats"
                  value={noteForm.recurrence.freq}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, freq: e.target.value as string } }))}
                >
                  <MenuItem value="NONE">Does not repeat</MenuItem>
                  <MenuItem value="DAILY">Daily</MenuItem>
                  <MenuItem value="WEEKLY">Weekly</MenuItem>
                  <MenuItem value="MONTHLY">Monthly</MenuItem>
                </Select>
              </FormControl>
              {noteForm.recurrence.freq !== "NONE" && (
                <TextField
                  label="Interval"
                  type="number"
                  inputProps={{ min: 1 }}
                  value={noteForm.recurrence.interval}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, interval: Number(e.target.value) || 1 } }))}
                />
              )}
            </Stack>
            {noteForm.recurrence.freq !== "NONE" && (
              <TextField
                label="Repeat until (optional)"
                type="date"
                value={noteForm.recurrence.until}
                onChange={(e) => setNoteForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, until: e.target.value } }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            )}
            <FormControl fullWidth disabled={noteForm.isGeneral}>
              <InputLabel id="assignees-label">Assign to</InputLabel>
              <Select
                labelId="assignees-label"
                multiple
                                value={noteForm.assigneeIds}
                                label="Assign to"
                                onChange={(e) => {
                                    const raw = e.target.value as (string | number)[];
                                    const vals = raw.map(v => Number(v));
                                    setNoteForm(prev => ({ ...prev, assigneeIds: vals }));
                                }}
                                renderValue={(selected) => {
                                    const selectedIds = new Set(selected as number[]);
                                    const names = pharmacyMembers
                                        .filter((m) => selectedIds.has(m.id))
                                        .map(getMemberLabel);
                                    return names.join(", ");
                                }}
                            >
                                {pharmacyMembers.map((member) => (
                                    <MenuItem key={member.id} value={member.id}>
                                        {getMemberLabel(member)}
                                    </MenuItem>
                                ))}
                            </Select>
                            {membersLoading && (
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                    Loading staff...
                                </Typography>
                            )}
                            {!membersLoading && pharmacyMembers.length === 0 && (
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                    No staff found for this pharmacy.
                                </Typography>
                            )}
                        </FormControl>
                        {noteError && <Alert severity="error">{noteError}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNoteModalOpen(false)} disabled={noteSaving}>Cancel</Button>
                    <Button variant="contained" onClick={handleCreateOrUpdateNote} disabled={noteSaving || !selectedPharmacyId}>
                        {noteSaving ? "Saving..." : editingNoteId ? "Update Work Note" : "Create Work Note"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
