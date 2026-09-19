import type { Dispatch, SetStateAction } from "react";
import {
  Alert,
  Button,
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
} from "@mui/material";

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

export type CalendarNoteForm = {
  title: string;
  body: string;
  date: string;
  notify: boolean;
  isGeneral: boolean;
  assigneeIds: number[];
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
}: Props) {
  return (
    <>
      <Dialog open={eventModalOpen} onClose={() => setEventModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Event</DialogTitle>
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

      <Dialog open={noteModalOpen} onClose={() => setNoteModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Work Note</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Title"
              value={noteForm.title}
              onChange={(e) => setNoteForm((prev) => ({ ...prev, title: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Date"
              type="date"
              value={noteForm.date}
              onChange={(e) => setNoteForm((prev) => ({ ...prev, date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Details"
              value={noteForm.body}
              onChange={(e) => setNoteForm((prev) => ({ ...prev, body: e.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={noteForm.notify}
                  onChange={(e) => setNoteForm((prev) => ({ ...prev, notify: e.target.checked }))}
                />
              }
              label="Notify assignees at shift start"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={noteForm.isGeneral}
                  onChange={(e) =>
                    setNoteForm((prev) => ({
                      ...prev,
                      isGeneral: e.target.checked,
                      assigneeIds: [],
                    }))
                  }
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
                  onChange={(e) =>
                    setNoteForm((prev) => ({
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
              {noteForm.recurrence.freq !== "NONE" && (
                <TextField
                  label="Interval"
                  type="number"
                  inputProps={{ min: 1 }}
                  value={noteForm.recurrence.interval}
                  onChange={(e) =>
                    setNoteForm((prev) => ({
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
            {noteForm.recurrence.freq !== "NONE" && (
              <TextField
                label="Repeat until (optional)"
                type="date"
                value={noteForm.recurrence.until}
                onChange={(e) =>
                  setNoteForm((prev) => ({
                    ...prev,
                    recurrence: { ...prev.recurrence, until: e.target.value },
                  }))
                }
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
                  const vals = raw.map((value) => Number(value));
                  setNoteForm((prev) => ({ ...prev, assigneeIds: vals }));
                }}
                renderValue={(selected) => {
                  const selectedIds = new Set(selected as number[]);
                  const names = pharmacyMembers
                    .filter((member) => selectedIds.has(member.id))
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
          <Button onClick={() => setNoteModalOpen(false)} disabled={noteSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateOrUpdateNote}
            disabled={noteSaving || !selectedPharmacyId}
          >
            {noteSaving ? "Saving..." : editingNoteId ? "Update Work Note" : "Create Work Note"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
