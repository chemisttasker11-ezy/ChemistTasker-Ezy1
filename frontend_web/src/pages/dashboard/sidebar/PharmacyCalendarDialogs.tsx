import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { applySavedTask, type CalendarNoteForm, type SavedTaskApi } from "@chemisttasker/shared-core";
import {
  Alert,
  Button,
  Collapse,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

type RecurrenceForm = {
  freq: string;
  interval: number;
  until: string;
};

export type CalendarEventForm = {
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  description: string;
  recurrence: RecurrenceForm;
};

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props = {
  eventModalOpen: boolean;
  setEventModalOpen: Setter<boolean>;
  eventForm: CalendarEventForm;
  setEventForm: Setter<CalendarEventForm>;
  eventSaving: boolean;
  eventError: string | null;
  editingEventId: number | null;
  handleCreateOrUpdateEvent: () => void | Promise<void>;

  noteModalOpen: boolean;
  setNoteModalOpen: Setter<boolean>;
  noteForm: CalendarNoteForm;
  setNoteForm: Setter<CalendarNoteForm>;
  noteSaving: boolean;
  noteError: string | null;
  editingNoteId: number | null;
  handleCreateOrUpdateNote: () => void | Promise<void>;

  selectedPharmacyId: number | null;
  pharmacyMembers: any[];
  membersLoading: boolean;
  getMemberLabel: (member: any) => string;
  canManage: boolean;
  savedTasks: SavedTaskApi[];
  onFillRoster: () => Promise<void>;
  onSaveReusable: () => Promise<void>;
  onDeleteSaved: (task: SavedTaskApi) => void;
  onDeleteNote: () => void;
};

export default function PharmacyCalendarDialogs({
  eventModalOpen,
  setEventModalOpen,
  eventForm,
  setEventForm,
  eventSaving,
  eventError,
  editingEventId,
  handleCreateOrUpdateEvent,
  noteModalOpen,
  setNoteModalOpen,
  noteForm,
  setNoteForm,
  noteSaving,
  noteError,
  editingNoteId,
  handleCreateOrUpdateNote,
  selectedPharmacyId,
  pharmacyMembers,
  membersLoading,
  getMemberLabel,
  canManage, savedTasks, onFillRoster, onSaveReusable, onDeleteSaved, onDeleteNote,
}: Props) {
  const [moreOptions, setMoreOptions] = useState(false);
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [savedId, setSavedId] = useState<number | "">("");
  useEffect(() => { if (noteModalOpen) { setMoreOptions(false); setSavedId(""); } }, [noteModalOpen]);
  const selectedSaved = savedTasks.find(task => task.id === savedId);
  return (
    <>
      <Dialog open={eventModalOpen} onClose={() => setEventModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingEventId ? "Edit Event" : "Create Event"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Title"
              value={eventForm.title}
              onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
              fullWidth
              required
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Date"
                type="date"
                value={eventForm.date}
                onChange={(e) => setEventForm((prev) => ({ ...prev, date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={eventForm.allDay}
                    onChange={(e) => setEventForm((prev) => ({ ...prev, allDay: e.target.checked }))}
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
                onChange={(e) => setEventForm((prev) => ({ ...prev, startTime: e.target.value }))}
                disabled={eventForm.allDay}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="End time"
                type="time"
                value={eventForm.endTime}
                onChange={(e) => setEventForm((prev) => ({ ...prev, endTime: e.target.value }))}
                disabled={eventForm.allDay}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
            <TextField
              label="Description"
              value={eventForm.description}
              onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))}
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
                  onChange={(e) =>
                    setEventForm((prev) => ({
                      ...prev,
                      recurrence: { ...prev.recurrence, freq: e.target.value as string },
                    }))
                  }
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
                  onChange={(e) =>
                    setEventForm((prev) => ({
                      ...prev,
                      recurrence: {
                        ...prev.recurrence,
                        interval: Number(e.target.value) || 1,
                      },
                    }))
                  }
                />
              )}
            </Stack>
            {eventForm.recurrence.freq !== "NONE" && (
              <TextField
                label="Repeat until (optional)"
                type="date"
                value={eventForm.recurrence.until}
                onChange={(e) =>
                  setEventForm((prev) => ({
                    ...prev,
                    recurrence: { ...prev.recurrence, until: e.target.value },
                  }))
                }
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            )}
            {eventError && <Alert severity="error">{eventError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEventModalOpen(false)} disabled={eventSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateOrUpdateEvent}
            disabled={eventSaving || !selectedPharmacyId}
          >
            {eventSaving ? "Saving..." : editingEventId ? "Update Event" : "Create Event"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={noteModalOpen} onClose={() => !noteSaving && setNoteModalOpen(false)} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="calendar-note-title" sx={{ "& button": { minHeight: 44 }, "& .MuiFormControlLabel-root": { minHeight: 44 } }}>
        <DialogTitle id="calendar-note-title">{editingNoteId ? noteForm.isPlannerTask ? "Edit task" : "Edit Work Note" : noteForm.isPlannerTask ? "Add task" : "Create Work Note"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <TextField label="Title" value={noteForm.title} onChange={e => setNoteForm(prev => ({ ...prev, title: e.target.value }))} fullWidth required />
            <TextField label="Date" type="date" value={noteForm.date} disabled={noteForm.locked} onChange={e => setNoteForm(prev => ({ ...prev, date: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
            <FormControl fullWidth disabled={noteForm.isGeneral || noteForm.locked || membersLoading}>
              <InputLabel id="assignees-label">Assignees</InputLabel>
              <Select labelId="assignees-label" multiple value={noteForm.assigneeIds} label="Assignees"
                onChange={e => setNoteForm(prev => ({ ...prev, assigneeIds: (e.target.value as (string | number)[]).map(Number) }))}
                renderValue={selected => <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>{(selected as number[]).map(id => { const member = pharmacyMembers.find(m => m.id === id); return <Chip size="small" key={id} label={member ? getMemberLabel(member) : `Member ${id}`} sx={{ maxWidth: "100%" }} />; })}</Stack>}>
                {pharmacyMembers.map(member => <MenuItem key={member.id} value={member.id}>{getMemberLabel(member)}</MenuItem>)}
              </Select>
            </FormControl>
            {membersLoading && <Typography variant="body2" color="text.secondary">Loading staff...</Typography>}
            {noteForm.locked && <Alert severity="info">This task has completions. Its date and assignees cannot change.</Alert>}
            {noteForm.isPlannerTask && <Button variant="outlined" onClick={onFillRoster} disabled={noteSaving || noteForm.locked}>Fill from roster</Button>}
            {noteForm.isPlannerTask && !editingNoteId && savedTasks.length > 0 && <>
              <FormControl fullWidth>
                <InputLabel id="saved-task-label">Use a saved task</InputLabel>
                <Select labelId="saved-task-label" label="Use a saved task" value={selectedSaved?.id ?? ""} onChange={e => {
                  const id = Number(e.target.value); setSavedId(id);
                  const task = savedTasks.find(saved => saved.id === id);
                  if (task) setNoteForm(prev => applySavedTask(prev, task));
                }}>
                  {savedTasks.map(task => <MenuItem key={task.id} value={task.id}>{task.title}</MenuItem>)}
                </Select>
              </FormControl>
              {selectedSaved && <Button color="error" onClick={() => onDeleteSaved(selectedSaved)} disabled={noteSaving}>Delete saved task</Button>}
            </>}
            <Button aria-expanded={moreOptions} aria-controls="note-more-options" endIcon={moreOptions ? <ExpandLessIcon /> : <ExpandMoreIcon />} onClick={() => setMoreOptions(open => !open)}>More options</Button>
            <Collapse in={moreOptions} id="note-more-options" unmountOnExit>
              <Stack spacing={2}>
                {noteForm.isPlannerTask && <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField label="Start time" type="time" value={noteForm.startTime} onChange={e => setNoteForm(prev => ({ ...prev, startTime: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                  <TextField label="End time" type="time" value={noteForm.endTime} onChange={e => setNoteForm(prev => ({ ...prev, endTime: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                </Stack>}
                <FormControl fullWidth>
                  <InputLabel id="note-recur-label">Repeats</InputLabel>
                  <Select labelId="note-recur-label" label="Repeats" value={noteForm.recurrence.freq} onChange={e => setNoteForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, freq: e.target.value as CalendarNoteForm["recurrence"]["freq"] } }))}>
                    <MenuItem value="NONE">Does not repeat</MenuItem><MenuItem value="DAILY">Daily</MenuItem><MenuItem value="WEEKLY">Weekly</MenuItem><MenuItem value="MONTHLY">Monthly</MenuItem>
                  </Select>
                </FormControl>
                {noteForm.recurrence.freq !== "NONE" && <>
                  <TextField label="Interval" type="number" slotProps={{ htmlInput: { min: 1 } }} value={noteForm.recurrence.interval} onChange={e => setNoteForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, interval: Number(e.target.value) || 1 } }))} />
                  <TextField label="Repeat until (optional)" type="date" value={noteForm.recurrence.until} onChange={e => setNoteForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, until: e.target.value } }))} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                  {noteForm.recurrence.freq === "WEEKLY" && <FormControl fullWidth>
                    <InputLabel id="note-weekdays">Weekdays</InputLabel>
                    <Select labelId="note-weekdays" label="Weekdays" multiple value={noteForm.recurrence.byweekday} onChange={e => setNoteForm(prev => ({ ...prev, recurrence: { ...prev.recurrence, byweekday: (e.target.value as number[]).map(Number) } }))}>
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label, index) => <MenuItem value={index} key={label}>{label}</MenuItem>)}
                    </Select>
                  </FormControl>}
                  <Typography variant="body2" color="text.secondary">Edits apply to the whole series. Single occurrences cannot be changed or excluded.</Typography>
                </>}
                {noteForm.isPlannerTask && <FormControlLabel control={<Switch checked={noteForm.isClinical} onChange={e => setNoteForm(prev => ({ ...prev, isClinical: e.target.checked }))} />} label="Clinical task" />}
                <TextField label="Details" value={noteForm.body} onChange={e => setNoteForm(prev => ({ ...prev, body: e.target.value }))} fullWidth multiline minRows={3} />
                <FormControlLabel control={<Switch checked={noteForm.notify} onChange={e => setNoteForm(prev => ({ ...prev, notify: e.target.checked }))} />} label="Notify assignees at shift start" />
                {!noteForm.isPlannerTask && <FormControlLabel control={<Switch checked={noteForm.isGeneral} onChange={e => setNoteForm(prev => ({ ...prev, isGeneral: e.target.checked, assigneeIds: [] }))} />} label="Applies to all staff (general note)" />}
                {noteForm.isPlannerTask && canManage && <Button variant="outlined" disabled={noteSaving || !noteForm.title.trim()} onClick={onSaveReusable}>Save as reusable</Button>}
              </Stack>
            </Collapse>
            {noteError && <Alert severity="error">{noteError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap" }}>
          {editingNoteId && (!noteForm.isPlannerTask || canManage) && <Button color="error" onClick={onDeleteNote} disabled={noteSaving}>Delete task</Button>}
          <Button onClick={() => setNoteModalOpen(false)} disabled={noteSaving}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateOrUpdateNote} disabled={noteSaving || !selectedPharmacyId}>{noteSaving ? "Saving..." : "Save"}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
