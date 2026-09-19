import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BlockIcon from '@mui/icons-material/Block';
import { Calendar } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CALENDAR_VIEWS,
  WEEK_DAYS,
  localizer,
  formatSlotDate,
  formatSlotDisplayDate,
  formatSlotTime,
  describeRecurringDays,
  isValidDate,
  type CalendarEvent,
  type CalendarSlotSelection,
  type CalendarViewOption,
  type PharmacyHoursForDate,
  type SlotEntry,
  type SlotTime,
} from './PostShiftPage.helpers';

type Setter<T> = Dispatch<SetStateAction<T>>;

type CalendarPropResult = {
  className?: string;
  style?: CSSProperties;
};

type Props = {
  isDarkMode: boolean;
  isEmbedded: boolean;
  flexibleTiming: boolean;
  setFlexibleTiming: Setter<boolean>;
  slotDate: string;
  setSlotDate: Setter<string>;
  slotStartTime: string;
  setSlotStartTime: Setter<string>;
  slotEndTime: string;
  setSlotEndTime: Setter<string>;
  slotDateHours: PharmacyHoursForDate | null;
  selectedDates: string[];
  setSelectedDates: Setter<string[]>;
  selectedDateTimes: Record<string, SlotTime>;
  setSelectedDateTimes: Setter<Record<string, SlotTime>>;
  selectedDateSet: Set<string>;
  closedSelectedDates: Array<{ date: string; hours: PharmacyHoursForDate }>;
  getDefaultTimesForDate: (date: string, fallback?: SlotTime) => PharmacyHoursForDate;
  mergeSelectedDates: (incomingDates: string[], timeOverride?: SlotTime) => void;
  isRecurring: boolean;
  setIsRecurring: Setter<boolean>;
  recurringDays: number[];
  setRecurringDays: Setter<number[]>;
  recurringEndDate: string;
  setRecurringEndDate: Setter<string>;
  singleUserOnly: boolean;
  setSingleUserOnly: Setter<boolean>;
  slots: SlotEntry[];
  setSlots: Setter<SlotEntry[]>;
  handleAddManualSlot: () => boolean;
  handleAddSelectedDate: (date: string) => boolean;
  handleAddAllSelectedDates: () => boolean;
  handleEditSlot: (index: number) => void;
  calendarEvents: CalendarEvent[];
  safeCalendarDate: Date;
  calendarView: CalendarViewOption;
  setCalendarView: Setter<CalendarViewOption>;
  setCalendarDate: Setter<Date>;
  dayPropGetter: (date: Date) => CalendarPropResult;
  eventStyleGetter: (
    event: CalendarEvent,
    start: Date,
    end: Date,
    isSelected: boolean,
  ) => CalendarPropResult;
  calendarTimeBounds: { min: Date; max: Date };
  minCalendarDate: Date;
  maxCalendarDate: Date;
  todayStart: Dayjs;
  showSnackbar: (message: string, severity?: 'success' | 'error') => void;
};

export default function PostShiftTimetableStep({
  isDarkMode,
  isEmbedded,
  flexibleTiming,
  setFlexibleTiming,
  slotDate,
  setSlotDate,
  slotStartTime,
  setSlotStartTime,
  slotEndTime,
  setSlotEndTime,
  slotDateHours,
  selectedDates,
  setSelectedDates,
  selectedDateTimes,
  setSelectedDateTimes,
  selectedDateSet,
  closedSelectedDates,
  getDefaultTimesForDate,
  mergeSelectedDates,
  isRecurring,
  setIsRecurring,
  recurringDays,
  setRecurringDays,
  recurringEndDate,
  setRecurringEndDate,
  singleUserOnly,
  setSingleUserOnly,
  slots,
  setSlots,
  handleAddManualSlot,
  handleAddSelectedDate,
  handleAddAllSelectedDates,
  handleEditSlot,
  calendarEvents,
  safeCalendarDate,
  calendarView,
  setCalendarView,
  setCalendarDate,
  dayPropGetter,
  eventStyleGetter,
  calendarTimeBounds,
  minCalendarDate,
  maxCalendarDate,
  todayStart,
  showSnackbar,
}: Props) {
  const minDateInputValue = dayjs(minCalendarDate).format('YYYY-MM-DD');

  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      bgcolor: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : 'background.paper',
    },
  };

  return (
          <Grid
            container
            rowSpacing={isEmbedded ? 1.5 : 2}
            columnSpacing={{ xs: 0, lg: isEmbedded ? 2 : 0 }}
            sx={isEmbedded ? { alignItems: 'stretch' } : undefined}
          >
            <Grid size={{ xs: 12 }}>
              <Paper
                variant="outlined"
                sx={{
                  p: isEmbedded ? { xs: 0.5, sm: 1 } : { xs: 1.5, sm: 2 },
                  borderRadius: isEmbedded ? 0 : 3,
                  borderColor: isEmbedded ? 'transparent' : 'grey.200',
                  bgcolor: isEmbedded ? 'transparent' : isDarkMode ? 'rgba(15, 23, 42, 0.84)' : 'grey.50',
                  mx: 0,
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: { xs: 0.5, sm: 2 },
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  width: '100%',
                  boxShadow: 'none',
                }}
              >
                <FormControlLabel
                  control={<Checkbox size="small" checked={flexibleTiming} onChange={e => setFlexibleTiming(e.target.checked)} />}
                  label="Flexible timing (start/end may adjust)"
                />
                <FormControlLabel
                  control={<Checkbox size="small" checked={singleUserOnly} onChange={e => setSingleUserOnly(e.target.checked)} />}
                  label="A single person must work all timetable entries"
                />
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: isEmbedded ? 4.5 : 5 }} sx={{ order: { xs: 1, lg: 0 }, minWidth: 0 }}>
              <Stack spacing={isEmbedded ? 1.5 : 2.5}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: isEmbedded ? 1.75 : 2.5,
                    borderRadius: isEmbedded ? 2 : 3,
                    borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.10)' : 'grey.200',
                    boxShadow: isEmbedded ? 'none' : undefined,
                  }}
                >
                  <Stack spacing={2}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Add schedule entry
                    </Typography>
                    <Grid container rowSpacing={2} columnSpacing={2}>
                      <Grid size={{ xs: 12 }}>
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                          <DatePicker
                            label="Date"
                            format="DD/MM/YYYY"
                            value={slotDate ? dayjs(slotDate) : null}
                            minDate={dayjs(minDateInputValue)}
                            onChange={(value) => {
                              const nextDate = value && value.isValid() ? value.format('YYYY-MM-DD') : '';
                              setSlotDate(nextDate);
                              if (nextDate) {
                                const hours = getDefaultTimesForDate(nextDate);
                                setSlotStartTime(hours.startTime);
                                setSlotEndTime(hours.endTime);
                              }
                            }}
                            // slotProps={{
                            //   textField: {
                            //     fullWidth: true,
                            //     size: 'small',
                            //     helperText: slotDate ? `Display: ${formatSlotDate(slotDate)}` : 'Use DD/MM/YYYY display',
                            //     sx: fieldSx,
                            //   },
                            // }}
                          />
                        </LocalizationProvider>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="Start"
                          type="time"
                          value={slotStartTime}
                          onChange={e => setSlotStartTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="End"
                          type="time"
                          value={slotEndTime}
                          onChange={e => setSlotEndTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      {slotDateHours?.closed && (
                        <Grid size={12}>
                          <Alert severity="warning" icon={<BlockIcon />}>
                            This pharmacy is marked closed on this {slotDateHours.label}. You can still edit the times and add the shift.
                          </Alert>
                        </Grid>
                      )}
                      <Grid size={12}>
                        <Button
                          variant="contained"
                          onClick={handleAddManualSlot}
                          startIcon={<AddIcon />}
                          fullWidth
                          sx={{ height: 44, borderRadius: 2 }}
                        >
                          Add slot
                        </Button>
                      </Grid>
                    </Grid>
                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={isRecurring}
                          onChange={e => {
                            const checked = e.target.checked;
                            setIsRecurring(checked);
                            if (!checked) {
                              setRecurringDays([]);
                              setRecurringEndDate('');
                            }
                          }}
                        />
                      )}
                      label="This is a recurring weekly schedule"
                    />
                    {isRecurring && (
                      <Stack spacing={2}>
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                          <DatePicker
                            label="Repeat until"
                            format="DD/MM/YYYY"
                            value={recurringEndDate ? dayjs(recurringEndDate) : null}
                            minDate={slotDate ? dayjs(slotDate) : dayjs(minDateInputValue)}
                            onChange={(value) => setRecurringEndDate(value && value.isValid() ? value.format('YYYY-MM-DD') : '')}
                            slotProps={{
                              textField: {
                                fullWidth: true,
                                size: 'small',
                                helperText: recurringEndDate ? `Display: ${formatSlotDate(recurringEndDate)}` : 'Use DD/MM/YYYY display',
                                sx: fieldSx,
                              },
                            }}
                          />
                        </LocalizationProvider>
                        <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1}>
                          {WEEK_DAYS.map((d) => (
                            <Button
                              key={d.v}
                              variant={recurringDays.includes(d.v) ? 'contained' : 'outlined'}
                              onClick={() =>
                                setRecurringDays(days => {
                                  if (days.includes(d.v)) {
                                    return days.filter(x => x !== d.v);
                                  }
                                  const next = [...days, d.v];
                                  return next.sort((a, b) => ((a === 0 ? 7 : a) - (b === 0 ? 7 : b)));
                                })
                              }
                              sx={{ minWidth: 44, borderRadius: '10px' }}
                              aria-label={d.full}
                            >
                              {d.l}
                            </Button>
                          ))}
                        </Stack>
                      </Stack>
                    )}
                    {closedSelectedDates.length > 0 && (
                      <Alert severity="warning" icon={<BlockIcon />}>
                        {closedSelectedDates.length} selected date{closedSelectedDates.length > 1 ? 's are' : ' is'} marked closed for this pharmacy. They stay selected and the times remain editable.
                      </Alert>
                    )}
                  </Stack>
                </Paper>

                {selectedDates.length > 0 && (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: isEmbedded ? 1.5 : 2,
                      borderRadius: isEmbedded ? 2 : 3,
                      borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.10)' : 'grey.200',
                      boxShadow: isEmbedded ? 'none' : undefined,
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight={600}>
                          Selected calendar days
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleAddAllSelectedDates}
                            sx={{ borderRadius: 999 }}
                          >
                            Add all slots
                          </Button>
                          <Button size="small" onClick={() => { setSelectedDates([]); setSelectedDateTimes({}); }}>
                            Clear
                          </Button>
                        </Stack>
                      </Stack>
                      <Stack spacing={1}>
                        {selectedDates.map((date) => {
                          const times = selectedDateTimes[date] || { startTime: slotStartTime, endTime: slotEndTime };
                          const hours = getDefaultTimesForDate(date, times);
                          return (
                            <Box
                              key={date}
                              sx={{
                                display: 'flex',
                                flexWrap: 'nowrap',
                                gap: 1,
                                alignItems: 'center',
                                border: '1px solid',
                                borderColor: 'grey.200',
                                borderRadius: 1,
                                p: 1,
                                overflowX: 'auto',
                              }}
                            >
                              <Chip
                                label={formatSlotDate(date)}
                                onDelete={() => {
                                  setSelectedDates((prev) => prev.filter((d) => d !== date));
                                  setSelectedDateTimes((prev) => {
                                    const next = { ...prev };
                                    delete next[date];
                                    return next;
                                  });
                                }}
                              />
                              {hours.closed && (
                                <Chip
                                  icon={<BlockIcon />}
                                  color="error"
                                  variant="outlined"
                                  label={`Closed ${hours.label}`}
                                  sx={{ flexShrink: 0 }}
                                />
                              )}
                              <TextField
                                label="Start"
                                type="time"
                                value={times.startTime}
                                onChange={(e) =>
                                  setSelectedDateTimes((prev) => ({
                                    ...prev,
                                    [date]: { startTime: e.target.value, endTime: times.endTime },
                                  }))
                                }
                                size="small"
                                sx={{ width: 140 }}
                                InputLabelProps={{ shrink: true }}
                              />
                              <TextField
                                label="End"
                                type="time"
                                value={times.endTime}
                                onChange={(e) =>
                                  setSelectedDateTimes((prev) => ({
                                    ...prev,
                                    [date]: { startTime: times.startTime, endTime: e.target.value },
                                  }))
                                }
                                size="small"
                                sx={{ width: 140 }}
                                InputLabelProps={{ shrink: true }}
                              />
                              <IconButton
                                onClick={() => handleAddSelectedDate(date)}
                                sx={{
                                  bgcolor: 'primary.main',
                                  color: 'common.white',
                                  '&:hover': { bgcolor: 'primary.dark' },
                                }}
                              >
                                <AddIcon />
                              </IconButton>
                            </Box>
                          );
                        })}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Adjust times per day, then use the purple plus to add one day or "Add all slots" to add everything at once.
                      </Typography>
                    </Stack>
                  </Paper>
                )}

                <Paper
                  variant="outlined"
                  sx={{
                    p: isEmbedded ? 1.5 : 2.5,
                    borderRadius: isEmbedded ? 2 : 3,
                    borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.10)' : 'grey.200',
                    boxShadow: isEmbedded ? 'none' : undefined,
                  }}
                >
                  {slots.length === 0 ? (
                    <Alert severity="info">No schedule entries added yet.</Alert>
                  ) : (
                    <Stack spacing={1.5}>
                      {slots.map((slot, index) => {
                        const recurringLabel = describeRecurringDays(slot.recurringDays);
                        return (
                          <Box
                            key={`${slot.date}-${slot.startTime}-${index}`}
                            sx={{
                              border: '1px solid',
                              borderColor: 'grey.200',
                              borderRadius: 2,
                              px: 2,
                              py: 1.5,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 2,
                            }}
                          >
                            <Box>
                              <Typography variant="subtitle2" fontWeight={600}>
                                {formatSlotDisplayDate(slot.date)}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {`${formatSlotTime(slot.startTime)} – ${formatSlotTime(slot.endTime)}`}
                              </Typography>
                              {slot.isRecurring && (
                                <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
                                  <Chip size="small" color="primary" label="Recurring" />
                                  {recurringLabel && (
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={recurringLabel}
                                    />
                                  )}
                                  {slot.recurringEndDate && (
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={`Ends ${formatSlotDisplayDate(slot.recurringEndDate)}`}
                                    />
                                  )}
                                </Stack>
                              )}
                            </Box>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Tooltip title="Edit slot">
                                <IconButton edge="end" onClick={() => handleEditSlot(index)} color="primary">
                                  <EditIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete slot">
                                <IconButton edge="end" onClick={() => setSlots(sc => sc.filter((_, idx) => idx !== index))} color="error">
                                  <DeleteIcon />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                </Paper>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, lg: isEmbedded ? 7.5 : 7 }} sx={{ order: { xs: 0, lg: 1 }, minWidth: 0 }}>
              <Paper
                variant="outlined"
                sx={{
                  p: isEmbedded ? { xs: 1, md: 1.5 } : 2,
                  borderRadius: isEmbedded ? 2 : 3,
                  borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.10)' : 'grey.200',
                  height: isEmbedded ? { xs: 420, sm: 480, md: 560 } : { xs: 420, sm: 460, md: 540 },
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: isEmbedded ? 'none' : undefined,
                  '& .rbc-calendar': {
                    fontFamily: "'Inter', sans-serif",
                  },
                  '& .rbc-toolbar': {
                    gap: 0.75,
                    mb: isEmbedded ? 1 : undefined,
                  },
                  '& .rbc-toolbar button': {
                    px: isEmbedded ? 1 : undefined,
                    py: isEmbedded ? 0.5 : undefined,
                  },
                  '& .rbc-toolbar-label': {
                    fontWeight: 600,
                    fontSize: isEmbedded ? '0.95rem' : undefined,
                  },
                  '& .rbc-event': {
                    fontSize: '0.75rem',
                  },
                }}
              >
                <Stack spacing={1.5} sx={{ height: '100%' }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Timetable preview
                  </Typography>
                  <Calendar
                    selectable
                    longPressThrottle={50}
                    localizer={localizer}
                    events={calendarEvents}
                    dayPropGetter={dayPropGetter}
                    date={safeCalendarDate}
                    view={calendarView}
                    views={CALENDAR_VIEWS}
                    step={calendarView === 'week' || calendarView === 'day' ? 15 : 30}
                    timeslots={calendarView === 'week' || calendarView === 'day' ? 4 : 2}
                    style={{ flex: 1 }}
                    eventPropGetter={eventStyleGetter}
                    startAccessor="start"
                    endAccessor="end"
                    popup
                    onNavigate={(newDate: Date) => {
                      if (!isValidDate(newDate)) {
                        console.warn('Ignoring calendar navigation to invalid date', newDate);
                        return;
                      }
                      const next = dayjs(newDate);
                      if (next.isBefore(todayStart, 'day')) {
                        setCalendarDate(minCalendarDate);
                      } else if (next.isAfter(dayjs(maxCalendarDate), 'day')) {
                        setCalendarDate(maxCalendarDate);
                      } else {
                        setCalendarDate(next.toDate());
                      }
                    }}
                    onView={(newView: string) => {
                      const nextView = CALENDAR_VIEWS.includes(newView as CalendarViewOption)
                        ? (newView as CalendarViewOption)
                        : 'month';
                      setCalendarView(nextView);
                    }}
                    min={calendarTimeBounds.min}
                    max={calendarTimeBounds.max}
                    onSelectSlot={({ start, end, slots }: CalendarSlotSelection) => {
                      const startMoment = dayjs(start as Date);
                      const endMoment = dayjs(end as Date);

                      if (startMoment.isBefore(todayStart, 'minute')) {
                        showSnackbar('Cannot select time in the past.', 'error');
                        return;
                      }

                      if (calendarView === 'week' || calendarView === 'day') {
                        const dateStr = startMoment.format('YYYY-MM-DD');
                        if (selectedDateSet.has(dateStr)) {
                          setSelectedDates((prev) => prev.filter((date) => date !== dateStr));
                          setSelectedDateTimes((prev) => {
                            const next = { ...prev };
                            delete next[dateStr];
                            return next;
                          });
                          return;
                        }
                        setSlotStartTime(startMoment.format('HH:mm'));
                        let endCandidate = endMoment;
                        if (!endMoment.isAfter(startMoment)) {
                          endCandidate = startMoment.add(1, 'hour');
                        }
                        const endVal = endCandidate.format('HH:mm');
                        setSlotEndTime(endVal);
                        mergeSelectedDates([dateStr], {
                          startTime: startMoment.format('HH:mm'),
                          endTime: endVal,
                        });
                        setIsRecurring(false);
                        setRecurringDays([]);
                        setRecurringEndDate('');
                        return;
                      }

                      const slotValues: Array<Date | string> = slots && slots.length ? (slots as Array<Date | string>) : [start as Date];
                      const slotDates = slotValues.map((slotValue) =>
                        dayjs(slotValue).format('YYYY-MM-DD')
                      );
                      const uniqueDates = Array.from(new Set<string>(slotDates)).filter(
                        (date) => !dayjs(date).isBefore(todayStart, 'day')
                      );

                      if (!uniqueDates.length) {
                        showSnackbar('Cannot select past dates.', 'error');
                        return;
                      }

                      setSelectedDates((prev) => {
                        const next = new Set(prev);
                        uniqueDates.forEach((date) => {
                          if (next.has(date)) {
                            next.delete(date);
                          } else {
                            next.add(date);
                          }
                        });
                        return [...next].sort();
                      });
                      setSelectedDateTimes((prev) => {
                        const next = { ...prev };
                        uniqueDates.forEach((date) => {
                          if (selectedDateSet.has(date)) {
                            delete next[date];
                          } else if (!next[date]) {
                            const hours = getDefaultTimesForDate(date);
                            next[date] = { startTime: hours.startTime, endTime: hours.endTime };
                          }
                        });
                        return next;
                      });
                      const latestSelected = uniqueDates.find((date) => !selectedDateSet.has(date));
                      if (latestSelected) {
                        const hours = getDefaultTimesForDate(latestSelected);
                        setSlotDate(latestSelected);
                        setSlotStartTime(hours.startTime);
                        setSlotEndTime(hours.endTime);
                      }
                      setIsRecurring(false);
                      setRecurringDays([]);
                      setRecurringEndDate('');
                    }}
                    onSelectEvent={(event: CalendarEvent) => {
                      const resource = event.resource;
                      if (resource?.slotIndex !== undefined) {
                        const slot = slots[resource.slotIndex];
                        if (slot) {
                          setSlotDate(slot.date);
                          setSlotStartTime(slot.startTime);
                          setSlotEndTime(slot.endTime);
                          setIsRecurring(slot.isRecurring);
                          setRecurringDays(slot.recurringDays || []);
                          setRecurringEndDate(slot.recurringEndDate || '');
                          setSelectedDates([slot.date]);
                          setSelectedDateTimes({ [slot.date]: { startTime: slot.startTime, endTime: slot.endTime } });
                        }
                      }
                    }}
                    messages={{ next: 'Next', previous: 'Back', today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
                  />
                  {calendarEvents.length === 0 && (
                    <Typography variant="body2" color="text.secondary" align="center">
                      Tap a date to set the timetable above. You can add multiple entries and combine recurring schedules.
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
  );
}
