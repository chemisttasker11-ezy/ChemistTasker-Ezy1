import { Box, Button, CircularProgress, IconButton, Paper, Stack, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import { Add, ChevronLeft, ChevronRight, ContentCopy } from "@mui/icons-material";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import type { CalendarItem } from "./PharmacyCalendarPage.model";

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
    onCopy: (mode: "day" | "week" | "previous", day: Date) => void;
    onComplete: (item: CalendarItem) => void;
};

export default function PharmacyCalendarWeekView({ day, setDay, items, manager, userId, busy, loading, onAdd, onEdit, onDuplicate, onCopy, onComplete }: Props) {
    const phone = useMediaQuery(useTheme().breakpoints.down("lg"));
    const monday = startOfWeek(day, { weekStartsOn: 1 });
    const days = phone ? [day] : Array.from({ length: 7 }, (_, index) => addDays(monday, index));
    const tasks = items.filter(item => item.noteData?.is_planner_task);
    return <Stack spacing={2} sx={{ "& button": { minHeight: 44, minWidth: 44 } }}>
        <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap gap={1}>
            <IconButton aria-label={phone ? "Previous day" : "Previous week"} onClick={() => setDay(addDays(day, phone ? -1 : -7))}><ChevronLeft /></IconButton>
            <Typography component="h2" variant="h6">{phone ? format(day, "EEEE, d MMM yyyy") : `${format(monday, "d MMM yyyy")} – ${format(addDays(monday, 6), "d MMM yyyy")}`}</Typography>
            <IconButton aria-label={phone ? "Next day" : "Next week"} onClick={() => setDay(addDays(day, phone ? 1 : 7))}><ChevronRight /></IconButton>
            <Button onClick={() => setDay(new Date())}>Today</Button>
            {phone && <TextField label="Selected day" type="date" value={format(day, "yyyy-MM-dd")} slotProps={{ inputLabel: { shrink: true } }} onChange={event => { if (event.target.value) setDay(new Date(`${event.target.value}T00:00:00`)); }} />}
            {manager && <Button startIcon={<ContentCopy />} disabled={busy || loading} onClick={() => onCopy("week", monday)}>Copy week to next week</Button>}
        </Stack>
        {loading ? <CircularProgress aria-label="Loading tasks" /> : <>
            {tasks.length === 0 && <Box><Typography color="text.secondary">No tasks this week. {manager ? "Add a task or copy last week." : "Your assigned tasks will appear here."}</Typography>
                {manager && <Button disabled={busy} onClick={() => onCopy("previous", monday)}>Copy last week</Button>}</Box>}
            <Box sx={{ display: "grid", gridTemplateColumns: phone ? "minmax(0, 1fr)" : "repeat(7, minmax(0, 1fr))", gap: 1 }}>
                {days.map(date => <Paper component="section" aria-label={format(date, "EEEE d MMMM")} key={format(date, "yyyy-MM-dd")} variant="outlined" sx={{ p: 1.25, minWidth: 0, borderColor: isSameDay(day, date) ? "primary.main" : "divider" }}>
                    <Typography component="h3" variant="subtitle2">{format(date, "EEE d MMM")}</Typography>
                    {manager && <Stack>
                        <Button startIcon={<Add />} onClick={() => onAdd(date)}>Add task</Button>
                        <Button disabled={busy} onClick={() => onCopy("day", date)} sx={{ whiteSpace: "normal", lineHeight: 1.4 }}>Copy day to tomorrow</Button>
                    </Stack>}
                    <Stack spacing={1} mt={1}>
                        {tasks.filter(item => isSameDay(item.date, date)).map(item => <Box component="article" aria-label={item.title} key={item.id} sx={{ py: 1, borderTop: "1px solid", borderColor: "divider", overflowWrap: "anywhere" }}>
                            <Typography fontWeight={600}>{item.title}</Typography>
                            {item.noteData.body && <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{item.noteData.body}</Typography>}
                            {item.time && <Typography variant="body2" color="text.secondary">{item.time}</Typography>}
                            <Typography variant="body2" color="text.secondary">{item.assignees?.join(", ") || "Unassigned"}</Typography>
                            <Typography variant="body2">{manager ? `${item.noteData.completed_count ?? 0} of ${item.assignees?.length ?? 0} done` : item.status === "DONE" ? "Done" : "To do"}</Typography>
                            {item.noteData.recurrence && <Typography variant="caption" color="text.secondary">Repeating task</Typography>}
                            {manager && <Stack>
                                <Button onClick={() => onEdit(item)}>Edit</Button>
                                <Button sx={{ px: 0.5, whiteSpace: "nowrap", overflowWrap: "normal" }} disabled={busy} onClick={() => onDuplicate(item)}>Duplicate</Button>
                            </Stack>}
                            {(!manager || item.noteData.assignees.some((person: { user_id: number | null }) => person.user_id === userId)) && <Button disabled={busy} onClick={() => onComplete(item)}>{item.status === "DONE" ? "Mark to do" : "Mark done"}</Button>}
                        </Box>)}
                        {tasks.every(item => !isSameDay(item.date, date)) && <Typography variant="body2" color="text.secondary">No tasks{phone ? " for this day" : ""}.</Typography>}
                    </Stack>
                </Paper>)}
            </Box>
        </>}
    </Stack>;
}
