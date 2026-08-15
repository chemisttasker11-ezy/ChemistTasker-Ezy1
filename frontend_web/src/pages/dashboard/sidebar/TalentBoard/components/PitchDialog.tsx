import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Typography,
  Box,
  FormControlLabel,
  Checkbox,
  Tabs,
  Tab,
  IconButton,
  Chip,
} from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { GoogleMap, Marker, Circle, Autocomplete, useJsApiLoader } from "@react-google-maps/api";
type PitchAvailabilityEntry = {
  date: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  notes: string;
};

export type PitchFormState = {
  headline: string;
  body: string;
  workTypes: string[];
  postKind: "FULL_TIME_APPLICATION" | "AVAILABILITY";
  streetAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  openToTravel: boolean;
  travelStates: string[];
  coverageRadiusKm: number;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string;
  availabilitySlots: PitchAvailabilityEntry[];
};

const radiusOptions = [5, 10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 300, 500, 1000];
const stateOptions = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const engagementOptions = ["FULL_TIME", "PART_TIME", "CASUAL", "VOLUNTEERING", "PLACEMENT"];
const recurringDayOptions = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayIso = () => toIsoDate(new Date());

const fromIsoDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const buildMonthCells = (anchor: Date) => {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  const mondayOffset = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      iso: toIsoDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === anchor.getMonth(),
    };
  });
};

const expandRecurringDates = (startDates: string[], recurringDays: number[], recurringEndDate: string) => {
  if (!startDates.length || !recurringDays.length || !recurringEndDate) return [];
  const start = fromIsoDate([...startDates].sort()[0]);
  const end = fromIsoDate(recurringEndDate);
  const dates: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (recurringDays.includes(cursor.getDay())) {
      dates.push(toIsoDate(cursor));
    }
  }
  return dates;
};

export default function PitchDialog(props: {
  open: boolean;
  isExplorer: boolean;
  existingPostId: number | null;
  pitchForm: PitchFormState;
  setPitchForm: React.Dispatch<React.SetStateAction<PitchFormState>>;
  pitchError: string | null;
  pitchSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const {
    open,
    isExplorer,
    existingPostId,
    pitchForm,
    setPitchForm,
    pitchError,
    pitchSaving,
    onClose,
    onSave,
    onDelete,
  } = props;

  const { isLoaded: isMapsLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY || "",
    libraries: ["places"],
  });

  const pitchMapCenter = useMemo(() => {
    if (pitchForm.latitude != null && pitchForm.longitude != null) {
      return { lat: pitchForm.latitude, lng: pitchForm.longitude };
    }
    return { lat: -37.8136, lng: 144.9631 };
  }, [pitchForm.latitude, pitchForm.longitude]);

  const pitchAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [tabIndex, setTabIndex] = useState(0);

  const [availabilityEntries, setAvailabilityEntries] = useState<PitchAvailabilityEntry[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dragSelecting, setDragSelecting] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState("");
  const [currentEntry, setCurrentEntry] = useState<PitchAvailabilityEntry>({
    date: "",
    startTime: "09:00",
    endTime: "17:00",
    isAllDay: false,
    notes: "",
  });

  const handlePitchPlaceChanged = () => {
    if (!pitchAutocompleteRef.current) return;
    const place = pitchAutocompleteRef.current.getPlace();
    if (!place || !place.geometry || !place.geometry.location) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const components = place.address_components || [];

    const getComponent = (types: string[]) =>
      components.find((c) => types.every((t) => c.types.includes(t)))?.long_name || "";

    setPitchForm((prev) => ({
      ...prev,
      streetAddress: place.formatted_address || prev.streetAddress,
      suburb: getComponent(["locality"]) || getComponent(["sublocality", "sublocality_level_1"]) || prev.suburb,
      state: getComponent(["administrative_area_level_1"]) || prev.state,
      postcode: getComponent(["postal_code"]) || prev.postcode,
      latitude: lat,
      longitude: lng,
      googlePlaceId: place.place_id || prev.googlePlaceId,
    }));
  };

  useEffect(() => {
    if (!open) return;
    setAvailabilityEntries((pitchForm.availabilitySlots || []).filter((slot) => slot.date >= todayIso()));
  }, [open, pitchForm.availabilitySlots]);

  useEffect(() => {
    if (pitchForm.postKind === "FULL_TIME_APPLICATION") {
      setAvailabilityEntries([]);
      setAvailabilityError(null);
    } else if (!pitchForm.availabilitySlots || pitchForm.availabilitySlots.length === 0) {
      setAvailabilityEntries([]);
    }
  }, [pitchForm.postKind, pitchForm.availabilitySlots]);

  const validateTimeRange = (start: string, end: string) =>
    new Date(`2025-01-01T${end}`) > new Date(`2025-01-01T${start}`);
  const monthCells = useMemo(() => buildMonthCells(calendarMonth), [calendarMonth]);
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const savedAvailabilityDateSet = useMemo(
    () => new Set(availabilityEntries.map((entry) => entry.date).filter(Boolean)),
    [availabilityEntries]
  );
  const recurringPreviewDateSet = useMemo(() => {
    if (!isRecurring || !currentEntry.date || !recurringEndDate || !recurringDays.length) return new Set<string>();
    const dates = new Set<string>();
    const end = new Date(`${recurringEndDate}T00:00:00`);
    for (let cursor = new Date(`${currentEntry.date}T00:00:00`), count = 0; cursor <= end && count < 366; cursor.setDate(cursor.getDate() + 1), count += 1) {
      if (recurringDays.includes(cursor.getDay())) dates.add(toIsoDate(cursor));
    }
    return dates;
  }, [currentEntry.date, isRecurring, recurringDays, recurringEndDate]);
  const syncSelectedDates = (dates: string[]) => {
    const sorted = [...new Set(dates)].sort();
    setSelectedDates(sorted);
    setCurrentEntry((prev) => ({ ...prev, date: sorted[0] || "" }));
    if (isRecurring) setRecurringEndDate(sorted[sorted.length - 1] || "");
  };
  const toggleCalendarDate = (date: string) => {
    syncSelectedDates(selectedDateSet.has(date) ? selectedDates.filter((item) => item !== date) : [...selectedDates, date]);
  };
  const addCalendarDate = (date: string) => {
    setSelectedDates((prevDates) => {
      if (prevDates.includes(date)) return prevDates;
      const sorted = [...prevDates, date].sort();
      setCurrentEntry((prev) => ({ ...prev, date: sorted[0] || "" }));
      if (isRecurring) setRecurringEndDate(sorted[sorted.length - 1] || "");
      return sorted;
    });
  };

  const handleAddAvailability = async () => {
    const targetDates = isRecurring
      ? expandRecurringDates([currentEntry.date].filter(Boolean), recurringDays, recurringEndDate)
      : (selectedDates.length ? selectedDates : [currentEntry.date].filter(Boolean));
    const futureTargetDates = targetDates.filter((date) => date >= todayIso());
    if (!futureTargetDates.length) {
      setAvailabilityError(isRecurring ? "Please select a start date, recurring days, and an end date." : "Please select at least one date.");
      return;
    }
    if (!currentEntry.startTime || !currentEntry.endTime) {
      setAvailabilityError("Please set start and end times.");
      return;
    }
    if (!validateTimeRange(currentEntry.startTime, currentEntry.endTime)) {
      setAvailabilityError("End time must be after start time.");
      return;
    }
    setAvailabilityError(null);
    const existingKeys = new Set(
      availabilityEntries.map((entry) => `${entry.date}-${entry.startTime}-${entry.endTime}`)
    );
    const nextEntries = futureTargetDates
      .map((date) => {
        return {
          date,
          startTime: currentEntry.isAllDay ? "00:00" : currentEntry.startTime,
          endTime: currentEntry.isAllDay ? "23:59" : currentEntry.endTime,
          isAllDay: currentEntry.isAllDay,
          notes: currentEntry.notes,
        };
      })
      .filter((entry) => !existingKeys.has(`${entry.date}-${entry.startTime}-${entry.endTime}`));
    if (!nextEntries.length) {
      setAvailabilityError("Those availability slots are already added.");
      return;
    }
    const mergedEntries = [...availabilityEntries, ...nextEntries].sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
    setAvailabilityEntries(mergedEntries);
    setPitchForm((prev) => ({ ...prev, availabilitySlots: mergedEntries }));
    setCurrentEntry({
      date: "",
      startTime: "09:00",
      endTime: "17:00",
      isAllDay: false,
      notes: "",
    });
    setSelectedDates([]);
    setIsRecurring(false);
    setRecurringDays([]);
    setRecurringEndDate("");
  };

  const handleDeleteAvailability = (index: number) => {
    setAvailabilityEntries((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      setPitchForm((prevForm) => ({ ...prevForm, availabilitySlots: next }));
      return next;
    });
  };
  const lastTabIndex = 2;
  const handleNextTab = () => {
    if (tabIndex >= lastTabIndex) {
      onSave();
      return;
    }
    setTabIndex((prev) => Math.min(prev + 1, lastTabIndex));
  };
  const handleBackTab = () => {
    setTabIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{existingPostId ? "Update Pitch" : "Pitch Yourself"}</DialogTitle>
      <DialogContent>
        <Tabs
          value={tabIndex}
          onChange={(_, next) => setTabIndex(next)}
          sx={{ mb: 2 }}
          centered
        >
          <Tab label="Basic Info" />
          <Tab label="Location & Travel" />
          <Tab label="Time Availability" />
        </Tabs>

        {tabIndex === 0 && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            {pitchError && (
              <Box sx={{ color: "error.main", fontSize: 14 }}>
                {pitchError}
              </Box>
            )}
            <Box
              sx={{
                bgcolor: "#fff1f2",
                border: "1px solid",
                borderColor: "#f87171",
                color: "#b91c1c",
                px: 2.5,
                py: 2,
                borderRadius: 3,
                fontSize: 13,
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              Please don't add any contact details or information that identifies you.
            </Box>
            <TextField
              label="Headline"
              fullWidth
              value={pitchForm.headline}
              onChange={(event) => setPitchForm((prev) => ({ ...prev, headline: event.target.value }))}
            />
            <TextField
              label={isExplorer ? "What's on your mind?" : "Short Bio"}
              fullWidth
              multiline
              minRows={4}
              value={pitchForm.body}
              onChange={(event) => setPitchForm((prev) => ({ ...prev, body: event.target.value }))}
            />
          </Stack>
        )}

        {tabIndex === 1 && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="subtitle2">Location & Travel</Typography>
            {isMapsLoaded ? (
              <Autocomplete onLoad={(ref) => (pitchAutocompleteRef.current = ref)} onPlaceChanged={handlePitchPlaceChanged}>
                <TextField
                  label="Address"
                  fullWidth
                  value={pitchForm.streetAddress}
                  onChange={(event) => setPitchForm((prev) => ({ ...prev, streetAddress: event.target.value }))}
                />
              </Autocomplete>
            ) : (
              <TextField
                label="Address"
                fullWidth
                value={pitchForm.streetAddress}
                onChange={(event) => setPitchForm((prev) => ({ ...prev, streetAddress: event.target.value }))}
              />
            )}

            {isMapsLoaded && (
              <Box sx={{ height: 220, borderRadius: 2, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                <GoogleMap mapContainerStyle={{ width: "100%", height: "100%" }} center={pitchMapCenter} zoom={12}>
                  {pitchForm.latitude != null && pitchForm.longitude != null && (
                    <>
                      <Marker position={pitchMapCenter} />
                      <Circle
                        center={pitchMapCenter}
                        radius={(pitchForm.coverageRadiusKm || 0) * 1000}
                        options={{
                          fillColor: "#38a169",
                          fillOpacity: 0.2,
                          strokeColor: "#2f855a",
                          strokeOpacity: 0.5,
                        }}
                      />
                    </>
                  )}
                </GoogleMap>
              </Box>
            )}

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Suburb"
                fullWidth
                value={pitchForm.suburb}
                onChange={(event) => setPitchForm((prev) => ({ ...prev, suburb: event.target.value }))}
              />
              <TextField
                label="State"
                fullWidth
                value={pitchForm.state}
                onChange={(event) => setPitchForm((prev) => ({ ...prev, state: event.target.value }))}
              />
              <TextField
                label="Postcode"
                fullWidth
                value={pitchForm.postcode}
                onChange={(event) => setPitchForm((prev) => ({ ...prev, postcode: event.target.value }))}
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Work Travel Radius (km)</InputLabel>
                <Select
                  label="Work Travel Radius (km)"
                  value={pitchForm.coverageRadiusKm}
                  disabled={pitchForm.openToTravel}
                  onChange={(event) =>
                    setPitchForm((prev) => ({
                      ...prev,
                      coverageRadiusKm: Number(event.target.value),
                    }))
                  }
                >
                  {radiusOptions.map((value) => (
                    <MenuItem key={value} value={value}>
                      {value} km
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={pitchForm.openToTravel}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setPitchForm((prev) => ({
                        ...prev,
                        openToTravel: event.target.checked,
                        travelStates: event.target.checked ? prev.travelStates : [],
                      }))
                    }
                  />
                }
                label="Willing to travel/Regional"
              />
            </Stack>
            {pitchForm.openToTravel && (
              <FormControl fullWidth>
                <InputLabel>Travel States</InputLabel>
                <Select
                  label="Travel States"
                  multiple
                  value={pitchForm.travelStates}
                  onChange={(event) =>
                    setPitchForm((prev) => ({
                      ...prev,
                      travelStates: event.target.value as string[],
                    }))
                  }
                  renderValue={(selected) =>
                    Array.isArray(selected) ? selected.join(", ") : ""
                  }
                >
                  {stateOptions.map((state) => (
                    <MenuItem key={state} value={state}>
                      <Checkbox checked={pitchForm.travelStates.includes(state)} />
                      {state}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <FormControl fullWidth>
              <InputLabel>Engagement Type</InputLabel>
              <Select
                label="Engagement Type"
                multiple
                renderValue={(selected) =>
                  Array.isArray(selected) ? selected.map((value) => titleCase(value)).join(", ") : ""
                }
                value={pitchForm.workTypes}
                onChange={(event) =>
                  setPitchForm((prev) => ({
                    ...prev,
                    workTypes: event.target.value as string[],
                  }))
                }
              >
                {engagementOptions.map((value) => (
                  <MenuItem key={value} value={value}>
                    <Checkbox checked={pitchForm.workTypes.includes(value)} />
                    {titleCase(value)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        )}

        {tabIndex === 2 && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Availability Style</InputLabel>
              <Select
                label="Availability Style"
                value={pitchForm.postKind}
                onChange={(event) => {
                  setAvailabilityEntries([]);
                  setPitchForm((prev) => ({
                    ...prev,
                    postKind: event.target.value as "FULL_TIME_APPLICATION" | "AVAILABILITY",
                    workTypes:
                      event.target.value === "FULL_TIME_APPLICATION" && !prev.workTypes.includes("FULL_TIME")
                        ? [...prev.workTypes, "FULL_TIME"]
                        : prev.workTypes,
                    availabilitySlots:
                      event.target.value === "FULL_TIME_APPLICATION" ? [] : prev.availabilitySlots,
                  }));
                }}
              >
                <MenuItem value="FULL_TIME_APPLICATION">Open to Opportunities</MenuItem>
                <MenuItem value="AVAILABILITY">Posting Availability</MenuItem>
              </Select>
            </FormControl>
            {pitchForm.postKind === "FULL_TIME_APPLICATION" ? (
              <Box
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  px: 2,
                  py: 1.5,
                  bgcolor: "background.default",
                }}
              >
                <Typography variant="subtitle2">Open anytime</Typography>
                <Typography variant="body2" color="text.secondary">
                  Opportunity posts do not show dated availability on the talent board.
                </Typography>
              </Box>
            ) : (
              <>
            {availabilityError && (
              <Box sx={{ color: "error.main", fontSize: 14 }}>
                {availabilityError}
              </Box>
            )}
            <ToggleButtonGroup
              exclusive
              value={isRecurring ? "recurring" : "single"}
              onChange={(_, value) => {
                if (!value) return;
                setIsRecurring(value === "recurring");
                setRecurringDays([]);
                setRecurringEndDate(value === "recurring" ? selectedDates[selectedDates.length - 1] || "" : "");
              }}
              sx={{
                alignSelf: "center",
                flexWrap: "wrap",
                gap: 1,
                "& .MuiToggleButton-root": {
                  borderRadius: "12px !important",
                  px: 2,
                  minHeight: 44,
                  fontWeight: 800,
                },
              }}
            >
              <ToggleButton value="recurring">Recurring availability</ToggleButton>
              <ToggleButton value="single">Pick specific dates</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center", maxWidth: 520, textAlign: "center", fontWeight: 600 }}>
              {isRecurring
                ? "Select the start and end date on the calendar, then choose the weekdays you are available before publishing."
                : "Pick the dates you are available on the calendar. Click again to deselect, or drag across dates to select multiple days."}
            </Typography>
            <Box
              onMouseLeave={() => setDragSelecting(false)}
              onMouseUp={() => setDragSelecting(false)}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                p: 1.5,
                userSelect: "none",
                width: "100%",
                maxWidth: 520,
                alignSelf: "center",
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <IconButton size="small" onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                  <ChevronLeft fontSize="small" />
                </IconButton>
                <Typography variant="subtitle2">
                  {calendarMonth.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
                </Typography>
                <IconButton size="small" onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                  <ChevronRight fontSize="small" />
                </IconButton>
              </Stack>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.75, mb: 0.75 }}>
                {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                  <Typography key={`${day}-${index}`} variant="caption" color="text.secondary" textAlign="center" fontWeight={700}>
                    {day}
                  </Typography>
                ))}
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.75 }}>
                {monthCells.map((cell, index) => {
                  const selected = selectedDateSet.has(cell.iso);
                  const saved = savedAvailabilityDateSet.has(cell.iso);
                  const recurringPreview = recurringPreviewDateSet.has(cell.iso);
                  return (
                    <Button
                      key={`${cell.iso}-${index}`}
                      variant={selected ? "contained" : "outlined"}
                      size="small"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setDragSelecting(true);
                        toggleCalendarDate(cell.iso);
                      }}
                      onMouseEnter={() => {
                        if (dragSelecting) addCalendarDate(cell.iso);
                      }}
                      sx={{
                        minWidth: 0,
                        height: 36,
                        p: 0,
                        opacity: cell.inMonth ? 1 : 0.35,
                        borderColor: selected ? "primary.main" : saved ? "secondary.main" : undefined,
                        borderWidth: saved && !selected ? 2 : 1,
                        bgcolor: !selected && recurringPreview ? "success.light" : !selected && saved ? "secondary.light" : undefined,
                        color: !selected && recurringPreview ? "success.dark" : !selected && saved ? "secondary.dark" : undefined,
                        fontWeight: recurringPreview || saved ? 900 : 700,
                      }}
                    >
                      {cell.day}
                    </Button>
                  );
                })}
              </Box>
            </Box>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label={isRecurring ? "Start Date" : "Date"}
                type="date"
                value={currentEntry.date}
                onChange={(event) => syncSelectedDates(event.target.value ? [event.target.value] : [])}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              {isRecurring && (
                <TextField
                  label="End Date"
                  type="date"
                  value={recurringEndDate}
                  onChange={(event) => setRecurringEndDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              )}
            </Stack>
            {selectedDates.length > 0 && (
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                Selected dates: {selectedDates.join(", ")}
              </Typography>
            )}
            {isRecurring && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {recurringDayOptions.map(({ label, value }) => {
                  const selected = recurringDays.includes(value);
                  return (
                    <Chip
                      key={label}
                      label={label}
                      color={selected ? "primary" : "default"}
                      variant={selected ? "filled" : "outlined"}
                      onClick={() =>
                        setRecurringDays((prev) =>
                          prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value].sort()
                        )
                      }
                    />
                  );
                })}
              </Stack>
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={currentEntry.isAllDay}
                  onChange={(e) =>
                    setCurrentEntry({
                      ...currentEntry,
                      isAllDay: e.target.checked,
                      startTime: e.target.checked ? "00:00" : "09:00",
                      endTime: e.target.checked ? "23:59" : "17:00",
                    })
                  }
                />
              }
              label="All Day"
            />
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Start Time"
                type="time"
                value={currentEntry.startTime}
                onChange={(event) =>
                  setCurrentEntry((prev) => ({ ...prev, startTime: event.target.value }))
                }
                disabled={currentEntry.isAllDay}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="End Time"
                type="time"
                value={currentEntry.endTime}
                onChange={(event) =>
                  setCurrentEntry((prev) => ({ ...prev, endTime: event.target.value }))
                }
                disabled={currentEntry.isAllDay}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
            </Stack>
            <TextField
              label="Notes"
              multiline
              rows={3}
              value={currentEntry.notes ?? ""}
              onChange={(e) => setCurrentEntry({ ...currentEntry, notes: e.target.value })}
            />
            <Button variant="contained" onClick={handleAddAvailability}>
              Add Availability
            </Button>

            <Typography variant="subtitle2">Your Time Slots</Typography>
            {availabilityEntries.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No time slots added yet.
              </Typography>
            ) : (
              availabilityEntries.map((entry, index) => (
                <Box
                  key={`${entry.date}-${index}`}
                  sx={{
                    border: "1px solid",
                    borderColor: "grey.200",
                    borderRadius: 2,
                    px: 2,
                    py: 1.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {entry.date} - {entry.isAllDay ? "All Day" : `${entry.startTime}-${entry.endTime}`}
                    </Typography>
                    {entry.notes && (
                      <Typography variant="caption" color="text.secondary">
                        {entry.notes}
                      </Typography>
                    )}
                  </Box>
                  <Button color="error" size="small" onClick={() => handleDeleteAvailability(index)}>
                    Delete
                  </Button>
                </Box>
              ))
            )}
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {existingPostId && (
          <Button color="error" onClick={onDelete} disabled={pitchSaving}>
            Delete Pitch
          </Button>
        )}
        <Button onClick={handleBackTab} disabled={pitchSaving || tabIndex === 0}>
          Back
        </Button>
        <Button onClick={handleNextTab} disabled={pitchSaving} variant="contained">
          {pitchSaving ? "Saving..." : tabIndex === lastTabIndex ? (existingPostId ? "Update Availability" : "Post Availability") : "Next"}
        </Button>
        <Button onClick={onClose} disabled={pitchSaving}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
