import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    IconButton,
    Paper,
    Stack,
    Snackbar,
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
import { fetchMembershipsByPharmacy, getOperationsContext, getCalendarFeed, getWorkNoteDetail,
    createWorkNoteService, updateWorkNoteService, deleteWorkNoteService, markWorkNoteDone, markWorkNoteOpen,
    copyPlannerTasks, listSavedTasks, createSavedTask, deleteSavedTask, fillPlannerFromRoster,
    type SavedTaskApi, type PlannerCopyInput,
    calendarTaskState, weekRange, copyResultMessage, plannerCopyRequest,
    projectCalendarFeed, createCalendarEventService, updateCalendarEventService, deleteCalendarEventService,
    type CalendarItem, emptyNoteForm, editNoteForm, notePayload,
    plannerRosterInput, mergeRosterAssignees, savedTaskInput,
} from "@chemisttasker/shared-core";
import { useSearchParams } from "react-router-dom";
import {
    type ItemType,
    WEEKDAYS,
    toDate,
    ROLE_LABELS,
    EMPLOYMENT_TYPE_LABELS,
    formatChoiceLabel,
} from "./PharmacyCalendarPage.model";
import PharmacyCalendarDialogs from "./PharmacyCalendarDialogs";
import PharmacyCalendarWeekView from "./PharmacyCalendarWeekView";
import PageHeader from "../../../components/ui/PageHeader";
import { plannerWeekSummary } from "@chemisttasker/shared-core";
import { CountBadge } from "../../../components/ui/Pill";
import SegmentTabs, { tabPanelProps } from "../../../components/ui/SegmentTabs";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useWorkspace } from "../../../contexts/WorkspaceContext";
import { useAuth } from "../../../contexts/AuthContext";

export default function PharmacyCalendarPage() {
    const theme = useTheme();
    const isDarkMode = theme.palette.mode === "dark";
    const pageBg = isDarkMode ? "var(--ct-page-bg, #07111f)" : "#f8fafc";
    const cardBg = isDarkMode ? "var(--ct-elevated-bg, #101b2f)" : "#FFFFFF";
    const subtleBg = isDarkMode ? alpha(theme.palette.common.white, 0.045) : alpha(theme.palette.primary.main, 0.04);
    const hoverBg = isDarkMode ? alpha(theme.palette.primary.light, 0.12) : alpha(theme.palette.primary.main, 0.08);
    const borderColor = isDarkMode ? alpha(theme.palette.common.white, 0.12) : "rgba(15, 23, 42, 0.10)";
    const [searchParams, setSearchParams] = useSearchParams();
    const [currentMonth, setCurrentMonth] = useState(() => toDate(searchParams.get("date")) ?? new Date());
    const [selectedDay, setSelectedDay] = useState<Date>(() => toDate(searchParams.get("date")) ?? new Date());
    const [filterType, setFilterType] = useState<ItemType>("all");
    const { selectedPharmacyId } = useWorkspace();
    const { user } = useAuth();
    const [managerPharmacies, setManagerPharmacies] = useState<number[]>([]);
    const canManage = selectedPharmacyId !== null && managerPharmacies.includes(selectedPharmacyId);
    const [view, setView] = useState<"month" | "plan">("month");
    const [notice, setNotice] = useState("");
    const [actionBusy, setActionBusy] = useState(false);
    const [savedTasks, setSavedTasks] = useState<SavedTaskApi[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<CalendarItem | SavedTaskApi | null>(null);
    const pendingCopy = useRef<PlannerCopyInput | null>(null);
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
    const feedRequest = useRef(0);
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
    const [noteForm, setNoteForm] = useState(() => emptyNoteForm(new Date()));

    useEffect(() => {
        let active = true;
        getOperationsContext().then(context => { if (active) setManagerPharmacies(context.pharmacies.map(p => p.id)); })
            .catch(() => { if (active) setManagerPharmacies([]); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        setNoteModalOpen(false);
        setEditingNoteId(null);
        setDeleteTarget(null);
        setSavedTasks([]);
        pendingCopy.current = null;
        setNotice("");
        if (!selectedPharmacyId || !canManage) return;
        let active = true;
        listSavedTasks(selectedPharmacyId).then(tasks => { if (active) setSavedTasks(tasks); })
            .catch(() => { if (active) setError("Unable to load saved tasks."); });
        return () => { active = false; };
    }, [selectedPharmacyId, canManage]);

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
                setPharmacyMembers([]);
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
    }, [selectedDay, selectedPharmacyId, setSearchParams]);

    useEffect(() => {
        selectedDayRef.current = selectedDay;
        currentMonthRef.current = currentMonth;
    }, [selectedDay, currentMonth]);

    const dateRange = useMemo(() => {
        if (view === "plan") return weekRange(selectedDay);
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(start);
        return {
            from: format(start, "yyyy-MM-dd"),
            to: format(end, "yyyy-MM-dd"),
        };
    }, [currentMonth, selectedDay, view]);

    const loadFeed = useCallback(async () => {
        if (!selectedPharmacyId) {
            setItems([]);
            return;
        }
        const request = ++feedRequest.current;
        setLoading(true);
        setError(null);
        try {
            const feed = await getCalendarFeed({ pharmacyId: selectedPharmacyId, dateFrom: dateRange.from, dateTo: dateRange.to });
            const combined = projectCalendarFeed(feed);
            if (request === feedRequest.current) setItems(combined);
        } catch (e) {
            if (request === feedRequest.current) { setError("Unable to load calendar data."); setItems([]); }
        } finally {
            if (request === feedRequest.current) setLoading(false);
        }
    }, [selectedPharmacyId, dateRange.from, dateRange.to]);

    useEffect(() => {
        setItems([]);
        void loadFeed();
        return () => { feedRequest.current += 1; };
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

    const handleOpenNoteModal = (day = selectedDay, planner = false) => {
        if (planner && !canManage) return;
        setSelectedDay(day);
        setNoteError(null);
        setEditingNoteId(null);
        setNoteForm(emptyNoteForm(day, planner));
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
              freq: eventForm.recurrence.freq as "DAILY" | "WEEKLY" | "MONTHLY",
              interval: eventForm.recurrence.interval || 1,
              until_date: eventForm.recurrence.until || null,
            }
          : null;
      const payload = {
        pharmacy: selectedPharmacyId,
        title: eventForm.title,
        description: eventForm.description,
        date: eventForm.date,
        allDay: eventForm.allDay,
        startTime: eventForm.allDay ? null : eventForm.startTime || null,
        endTime: eventForm.allDay ? null : eventForm.endTime || null,
        recurrence,
      };
      if (editingEventId) {
        await updateCalendarEventService(editingEventId, payload);
      } else {
        await createCalendarEventService(payload);
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

    const handleEditNote = async (item: CalendarItem) => {
        if (!calendarTaskState(item.noteData, canManage, user?.id).canEdit) return;
        const id = getBaseItemId(item);
        if (!id) return;
        try {
            // Fetch the original series, rather than editing an expanded occurrence.
            const note = await getWorkNoteDetail(id);
            setEditingNoteId(id);
            setNoteError(null);
            setNoteForm(editNoteForm(note, item.noteData?.completed_count ?? 0));
            setNoteModalOpen(true);
        } catch (err) { setError(err instanceof Error ? err.message : "Unable to open task."); }
    };

    const handleCreateOrUpdateNote = async () => {
        if (!selectedPharmacyId || (noteForm.isPlannerTask && !canManage)) return;
        if (!noteForm.title.trim()) { setNoteError("Title is required."); return; }
        if (noteForm.endTime && (!noteForm.startTime || noteForm.endTime <= noteForm.startTime)) {
            setNoteError("End time must be after start time on the same day."); return;
        }
        setNoteSaving(true);
        setNoteError(null);
        try {
            const payload = notePayload(noteForm, selectedPharmacyId);
            if (editingNoteId) await updateWorkNoteService(editingNoteId, payload);
            else await createWorkNoteService(payload);
            setNoteModalOpen(false);
            setEditingNoteId(null);
            await loadFeed();
        } catch (err) { setNoteError(err instanceof Error ? err.message : "Failed to save task."); }
        finally { setNoteSaving(false); }
    };

    const handleCopy = async (mode: "day" | "week" | "previous" | "task", day: Date, item?: CalendarItem) => {
        if (!selectedPharmacyId || !canManage || actionBusy) return;
        const request = plannerCopyRequest(selectedPharmacyId, mode === "previous" ? addDays(day, -7) : day,
            mode === "previous" ? "week" : mode, pendingCopy.current, item ? getBaseItemId(item) : undefined);
        pendingCopy.current = request;
        setActionBusy(true);
        setError(null);
        try {
            const result = await copyPlannerTasks(request);
            pendingCopy.current = null;
            setNotice(copyResultMessage(result));
            await loadFeed();
        } catch (err) { setError(err instanceof Error ? err.message : "Copy failed. Retry the same action."); }
        finally { setActionBusy(false); }
    };

    const handleComplete = async (item: CalendarItem) => {
        const id = getBaseItemId(item);
        if (!id || actionBusy) return;
        setActionBusy(true);
        try {
            const action = item.status === "DONE" ? markWorkNoteOpen : markWorkNoteDone;
            await action(id, format(item.date, "yyyy-MM-dd"), item.noteData?.updated_at);
            await loadFeed();
        } catch (err) { setError(err instanceof Error ? err.message : "Unable to update completion."); }
        finally { setActionBusy(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setActionBusy(true);
        try {
            if ("type" in deleteTarget) {
                const id = getBaseItemId(deleteTarget);
                if (!id) return;
                await deleteWorkNoteService(id, deleteTarget.noteData?.updated_at);
                setNoteModalOpen(false);
                await loadFeed();
            } else {
                await deleteSavedTask(deleteTarget.id);
                setSavedTasks(tasks => tasks.filter(task => task.id !== deleteTarget.id));
            }
            setDeleteTarget(null);
        } catch (err) { setError(err instanceof Error ? err.message : "Unable to delete. Reload and try again."); setDeleteTarget(null); }
        finally { setActionBusy(false); }
    };

    const handleSaveReusable = async () => {
        if (!selectedPharmacyId || !canManage || !noteForm.title.trim()) return;
        setNoteSaving(true);
        setNoteError(null);
        try {
            const saved = await createSavedTask(savedTaskInput(noteForm, selectedPharmacyId));
            setSavedTasks(tasks => [...tasks, saved]);
            setNotice("Saved as a reusable task.");
        } catch (err) { setNoteError(err instanceof Error ? err.message : "Unable to save reusable task."); }
        finally { setNoteSaving(false); }
    };

    const handleFillRoster = async () => {
        if (!selectedPharmacyId || !canManage) return;
        setNoteSaving(true);
        setNoteError(null);
        try {
            const result = await fillPlannerFromRoster(plannerRosterInput(noteForm, selectedPharmacyId));
            setNoteForm(form => mergeRosterAssignees(form, result.assignee_membership_ids));
        } catch (err) { setNoteError(err instanceof Error ? err.message : "Unable to fill from roster."); }
        finally { setNoteSaving(false); }
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

    const planSummary = plannerWeekSummary(items, selectedDay);
    return (
        <Box sx={{ ...(view === "plan" ? { "& header > .MuiStack-root": { flexDirection: { xs: "row" }, alignItems: "center", gap: 1 }, "& header h1": { fontSize: { xs: 22, md: 32 } }, "& header > .MuiBox-root": { mt: 1 } } : {}), p: { xs: 2, md: 4 }, minHeight: "100vh", bgcolor: pageBg, color: "text.primary" }}>
            <PageHeader title="Pharmacy Calendar" subtitle={view === "month" ? "Events, work notes and tasks for the selected pharmacy" : undefined} actions={<>
                {view === "month" && <Button sx={{ minHeight: 44 }} variant="outlined" startIcon={<AddIcon />} disabled={!selectedPharmacyId} onClick={handleOpenEventModal}>Add Event</Button>}
                {view === "month" && <Button sx={{ minHeight: 44 }} variant="outlined" disabled={!selectedPharmacyId} onClick={() => handleOpenNoteModal()}>Add Work Note</Button>}
                {canManage && <Button sx={{ minHeight: 44 }} variant="contained" startIcon={<AddIcon />} disabled={loading} onClick={() => handleOpenNoteModal(selectedDay, true)}>Add task</Button>}
            </>}>
            <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap gap={1.5}>
                <Box sx={{ width: '100%', maxWidth: 180 }}>
                    <SegmentTabs tabs={[{ value: "month", label: "Month" }, { value: "plan", label: "Plan" }]} value={view} onChange={setView} label="Calendar views" idPrefix="calendar-view" />
                </Box>
                {view === 'plan' && !loading && selectedPharmacyId && <Stack direction="row" alignItems="center" gap={0.75} sx={{ flexShrink: 0 }}>
                    <CountBadge value={planSummary.total} label={`${planSummary.total} tasks`} />
                    <Typography variant="body2" color="text.secondary">tasks · {planSummary.unassigned} unassigned · {planSummary.done} done</Typography>
                </Stack>}
            </Stack>
            </PageHeader>
            <Snackbar open={Boolean(notice)} autoHideDuration={6000} onClose={() => setNotice("")} sx={{ bottom: { xs: "calc(16px + env(safe-area-inset-bottom))", md: 24 } }}><Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert></Snackbar>
            {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                    {error}
                </Alert>
            )}

            {!selectedPharmacyId ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                    Select a pharmacy in the dashboard to view its calendar.
                </Alert>
            ) : view === "plan" ? (
                <Box {...tabPanelProps("calendar-view", view)}>
                    <PharmacyCalendarWeekView day={selectedDay} setDay={setSelectedDay} items={items} manager={canManage} userId={user?.id}
                        busy={actionBusy} loading={loading} onAdd={day => handleOpenNoteModal(day, true)} onEdit={handleEditNote}
                        onDelete={setDeleteTarget} onDuplicate={item => handleCopy("task", item.date, item)} onCopy={handleCopy} onComplete={handleComplete} />
                </Box>
            ) : (
                <Stack {...tabPanelProps("calendar-view", view)} direction={{ xs: "column", lg: "row" }} spacing={3}>
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

                                                {item.status && (!item.noteData?.is_planner_task || calendarTaskState(item.noteData, canManage, user?.id).label) && (
                                                    <Chip
                                                        label={item.noteData?.is_planner_task ? calendarTaskState(item.noteData, canManage, user?.id).label : item.status}
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
                                                                        await deleteCalendarEventService(baseId);
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
                                                    {item.type === "note" && <>
                                                        {(!item.noteData?.is_planner_task || canManage) && <>
                                                            <Button sx={{ minHeight: 44 }} onClick={e => { e.stopPropagation(); void handleEditNote(item); }}>Edit</Button>
                                                            <Button sx={{ minHeight: 44 }} color="error" onClick={e => { e.stopPropagation(); setDeleteTarget(item); }}>Delete</Button>
                                                        </>}
                                                        {item.noteData?.is_planner_task && canManage && <Button sx={{ minHeight: 44 }} disabled={actionBusy} onClick={e => { e.stopPropagation(); void handleCopy("task", item.date, item); }}>Duplicate</Button>}
                                                        {(!item.noteData?.is_planner_task || !canManage || item.noteData.assignees.some((a: { user_id: number | null }) => a.user_id === user?.id)) && <Button sx={{ minHeight: 44 }} disabled={actionBusy} onClick={e => { e.stopPropagation(); void handleComplete(item); }}>{item.status === "DONE" ? "Mark to do" : "Mark done"}</Button>}
                                                    </>}
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

            <ConfirmDialog open={Boolean(deleteTarget)} title={`Delete ${deleteTarget && "type" in deleteTarget ? "task" : "saved task"}?`}
                body={<>Delete "{deleteTarget?.title}"? {deleteTarget && !("type" in deleteTarget) ? "Placed tasks will stay." : "This cannot be undone."}</>}
                confirmLabel="Delete" busyLabel="Deleting..." busy={actionBusy} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
            <PharmacyCalendarDialogs
                eventModalOpen={eventModalOpen}
                setEventModalOpen={setEventModalOpen}
                eventForm={eventForm}
                setEventForm={setEventForm}
                eventSaving={eventSaving}
                eventError={eventError}
                editingEventId={editingEventId}
                handleCreateOrUpdateEvent={handleCreateOrUpdateEvent}
                noteModalOpen={noteModalOpen}
                setNoteModalOpen={setNoteModalOpen}
                noteForm={noteForm}
                setNoteForm={setNoteForm}
                noteSaving={noteSaving}
                noteError={noteError}
                editingNoteId={editingNoteId}
                handleCreateOrUpdateNote={handleCreateOrUpdateNote}
                selectedPharmacyId={selectedPharmacyId}
                pharmacyMembers={pharmacyMembers}
                membersLoading={membersLoading}
                getMemberLabel={getMemberLabel}
                canManage={canManage}
                savedTasks={savedTasks}
                onFillRoster={handleFillRoster}
                onSaveReusable={handleSaveReusable}
                onDeleteSaved={setDeleteTarget}
                onDeleteNote={() => { if (editingNoteId) setDeleteTarget({ id: editingNoteId, type: "note", title: noteForm.title, date: selectedDay, source: "work_note", noteData: { updated_at: noteForm.updatedAt } }); }}
            />
        </Box>
    );
}
