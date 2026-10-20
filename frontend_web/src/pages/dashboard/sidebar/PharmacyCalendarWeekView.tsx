import { calendarTaskState, taskRepeatLabel, weekRange } from "@chemisttasker/shared-core";
import DashboardContentState from "../../../components/dashboard/DashboardContentState";
import { useState } from "react";
import { Box, Button, Card, CardActionArea, Chip, CircularProgress, IconButton, Menu, MenuItem, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import { ChevronLeft, ChevronRight, ContentCopy, MoreVert, RepeatRounded } from "@mui/icons-material";
import { addDays, format, isSameDay } from "date-fns";
import type { CalendarItem } from "@chemisttasker/shared-core";

type Props = {
    day: Date;
    setDay: (day: Date) => void;
    items: CalendarItem[];
    manager: boolean;
    userId?: number;
    busy: boolean;
    loading: boolean;
    onAdd: (day: Date) => void;
    onEdit: (item: CalendarItem) => void;
    onDuplicate: (item: CalendarItem) => void;
    onDelete: (item: CalendarItem) => void;
    onCopy: (mode: "day" | "week" | "previous", day: Date) => void;
    onComplete: (item: CalendarItem) => void;
};

export default function PharmacyCalendarWeekView({ day, setDay, items, manager, userId, busy, loading, onAdd, onEdit, onDuplicate, onDelete, onCopy, onComplete }: Props) {
    const phone = useMediaQuery(useTheme().breakpoints.down("lg"));
    const monday = new Date(`${weekRange(day).from}T00:00:00`);
    const days = phone ? [day] : Array.from({ length: 7 }, (_, index) => addDays(monday, index));
    const tasks = items.filter(item => item.noteData?.is_planner_task);
    const [menu, setMenu] = useState<{ anchor: HTMLElement; task?: CalendarItem; date?: Date } | null>(null);
    const act = (action: () => void) => { setMenu(null); action(); };
    return <Stack spacing={2} sx={{ "& button": { minHeight: 44, minWidth: 44 } }}>
        <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap gap={1}>
            <IconButton aria-label={phone ? "Previous day" : "Previous week"} onClick={() => setDay(addDays(day, phone ? -1 : -7))}><ChevronLeft /></IconButton>
            {phone ? <TextField type="date" size="small" value={format(day, "yyyy-MM-dd")} slotProps={{ htmlInput: { "aria-label": "Selected day" } }} sx={{ flex: 1, minWidth: 0 }} onChange={event => { if (event.target.value) setDay(new Date(`${event.target.value}T00:00:00`)); }} />
                : <Typography component="h2" variant="subtitle1" fontWeight={600}>{format(monday, "d MMM yyyy")} to {format(addDays(monday, 6), "d MMM yyyy")}</Typography>}
            <IconButton aria-label={phone ? "Next day" : "Next week"} onClick={() => setDay(addDays(day, phone ? 1 : 7))}><ChevronRight /></IconButton>
            <Button onClick={() => setDay(new Date())}>Today</Button>
            {manager && <Button variant="outlined" sx={{ ml: { lg: "auto" }, width: { xs: "100%", sm: "auto" } }} startIcon={<ContentCopy />} disabled={busy || loading} onClick={() => onCopy("week", monday)}>Copy week to next week</Button>}
        </Stack>
        {loading ? <CircularProgress aria-label="Loading tasks" /> : tasks.length === 0 ? <>
            <DashboardContentState kind="empty" title="No tasks this week."
                description={manager ? "Add a task or copy last week. Save a task as reusable in More options to use it again." : "Your assigned tasks will appear here."}
                actionLabel={manager ? "Add task" : undefined} onAction={() => onAdd(day)} />
            {manager && <Button disabled={busy} onClick={() => onCopy("previous", monday)}>Copy last week</Button>}
        </> : <>
            <Box sx={{ display: "grid", gridTemplateColumns: phone ? "minmax(0, 1fr)" : "repeat(7, minmax(0, 1fr))", gap: 1 }}>
                {days.map(date => <Box component="section" aria-label={format(date, "EEEE d MMMM")} key={format(date, "yyyy-MM-dd")} sx={{ minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography component="h3" variant="subtitle2" color={isSameDay(day, date) ? "primary.main" : "text.primary"}>{format(date, "EEE d MMM")}</Typography>
                        {manager && <Tooltip title="Day actions"><IconButton aria-label={`Day actions for ${format(date, "EEEE d MMMM")}`} aria-haspopup="menu" aria-expanded={menu?.date?.getTime() === date.getTime()} onClick={event => setMenu({ anchor: event.currentTarget, date })}><MoreVert /></IconButton></Tooltip>}
                    </Stack>
                    <Stack spacing={1} mt={1}>
                        {tasks.filter(item => isSameDay(item.date, date)).map(item => { const state = calendarTaskState(item.noteData, manager, userId); return <Card component="article" aria-label={item.title} key={item.id} variant="outlined" sx={{ borderRadius: "var(--ct-card-radius)", overflowWrap: "anywhere", minWidth: 0 }}>
                            {manager && <Box sx={{ display: "flex", justifyContent: "flex-end" }}><Tooltip title="More actions"><IconButton aria-label={`More actions for ${item.title}`} aria-haspopup="menu" aria-expanded={menu?.task?.id === item.id} disabled={busy} onClick={event => setMenu({ anchor: event.currentTarget, task: item })}><MoreVert /></IconButton></Tooltip></Box>}
                            <CardActionArea component={state.canEdit ? "button" : "div"} disabled={busy} role={state.canEdit ? "button" : "presentation"} tabIndex={state.canEdit ? 0 : -1} aria-label={state.canEdit ? `Edit ${item.title}` : undefined} onClick={state.canEdit ? () => onEdit(item) : undefined} sx={{ p: 1.5, pt: manager ? 0 : 1.5 }}>
                                <Stack spacing={1}>
                                    <Typography fontWeight={600}>{item.title}</Typography>
                                    {item.noteData.body && <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{item.noteData.body}</Typography>}
                                    {item.time && <Typography variant="body2" color="text.secondary">{item.time}</Typography>}
                                    <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>
                                        {item.noteData.is_clinical && <Chip size="small" label="Clinical" color="primary" variant="outlined" />}
                                        <Chip size="small" label={state.label} color={item.status === "DONE" ? "success" : "default"} />
                                    </Stack>
                                    <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>
                                        {item.assignees?.length ? item.assignees.map((name, index) => <Chip key={index} size="small" label={name} sx={{ maxWidth: "100%", "& .MuiChip-label": { whiteSpace: "normal" }, height: "auto", minHeight: 24 }} />) : <Typography variant="caption" color="text.secondary">Unassigned</Typography>}
                                    </Stack>
                                    {item.noteData.recurrence && <Stack direction="row" alignItems="center" gap={0.5}><RepeatRounded fontSize="small" /><Typography variant="caption">{taskRepeatLabel(item.noteData.recurrence)}</Typography></Stack>}
                                </Stack>
                            </CardActionArea>
                            {state.canComplete && <Button sx={{ m: 0.5 }} disabled={busy} onClick={() => onComplete(item)}>{item.status === "DONE" ? "Mark to do" : "Mark done"}</Button>}
                        </Card>; })}
                        {tasks.every(item => !isSameDay(item.date, date)) && <Typography variant="body2" color="text.secondary">No tasks{phone ? " for this day" : ""}.</Typography>}
                    </Stack>
                </Box>)}
            </Box>
        </>}
        <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { "& .MuiMenuItem-root": { minHeight: 44 } } } }}>
            {menu?.task ? [
                <MenuItem key="edit" onClick={() => act(() => onEdit(menu.task!))}>Edit</MenuItem>,
                <MenuItem key="duplicate" disabled={busy} onClick={() => act(() => onDuplicate(menu.task!))}>Duplicate</MenuItem>,
                <MenuItem key="delete" disabled={busy} onClick={() => act(() => onDelete(menu.task!))}>Delete</MenuItem>,
            ] : [
                <MenuItem key="add" disabled={busy} onClick={() => act(() => onAdd(menu!.date!))}>Add task here</MenuItem>,
                <MenuItem key="copy" disabled={busy} onClick={() => act(() => onCopy("day", menu!.date!))}>Copy day to tomorrow</MenuItem>,
            ]}
        </Menu>
    </Stack>;
}
