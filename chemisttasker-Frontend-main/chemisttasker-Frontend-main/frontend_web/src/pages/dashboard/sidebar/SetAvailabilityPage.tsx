import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  ToggleButton,
  ToggleButtonGroup,
  Snackbar,
  IconButton,
  Typography,
  Container,
  Paper,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  alpha,
} from '@mui/material';
import { keyframes } from '@mui/system';
import { ChevronLeft, ChevronRight, Close as CloseIcon } from '@mui/icons-material';
import {
  UserAvailability,
  UserAvailabilityPayload,
  fetchUserAvailabilityService,
  createUserAvailabilityService,
  deleteUserAvailabilityService,
  getOnboarding,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../contexts/AuthContext';
import { API_BASE_URL } from '../../../constants/api';
import { GoogleMap, Marker, Circle, Autocomplete, useJsApiLoader } from '@react-google-maps/api';

type AvailabilityEntry = UserAvailability & { notifyNewShifts?: boolean };
type AvailabilityDraft = Omit<AvailabilityEntry, 'id'>;
type AvailabilityPayload = UserAvailabilityPayload & { notify_new_shifts?: boolean };

const createEmptyEntry = (): AvailabilityDraft => ({
  date: '',
  startTime: '09:00',
  endTime: '17:00',
  isAllDay: false,
  isRecurring: false,
  recurringDays: [],
  recurringEndDate: '',
  notifyNewShifts: false,
  notes: '',
});

const DNA = {
  ink: '#06123A',
  muted: '#5E6B8D',
  line: '#E5ECF7',
  blue: '#063BDA',
  violet: '#6D28D9',
  magenta: '#EA0A8E',
  cyan: '#08BEEA',
  mint: '#00A878',
  surface: '#FFFFFF',
  soft: '#F7F9FF',
};

const DASHBOARD_FONT_FAMILY = '"DM Sans Variable", "DM Sans", "Barlow", Arial, sans-serif';

const fadeUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const cardSx = {
  p: 3,
  mb: 4,
  borderRadius: '24px',
  border: `1px solid ${alpha(DNA.blue, 0.08)}`,
  background: `linear-gradient(180deg, ${DNA.surface} 0%, ${DNA.soft} 100%)`,
  boxShadow: '0 24px 56px rgba(6, 18, 58, 0.08)',
  animation: `${fadeUp} 420ms ease`,
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '16px',
    backgroundColor: '#fff',
    boxShadow: '0 10px 24px rgba(6, 18, 58, 0.04)',
    transition: 'box-shadow 180ms ease, transform 180ms ease',
    '&:hover': {
      boxShadow: '0 14px 30px rgba(6, 18, 58, 0.08)',
    },
    '&.Mui-focused': {
      boxShadow: `0 0 0 4px ${alpha(DNA.blue, 0.10)}, 0 16px 32px rgba(6, 18, 58, 0.10)`,
    },
  },
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export default function SetAvailabilityPage() {
  const { user, token } = useAuth();
  const [availabilityEntries, setAvailabilityEntries] = useState<AvailabilityEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<AvailabilityDraft>(createEmptyEntry());
  const [notifyNewShifts, setNotifyNewShifts] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dragSelecting, setDragSelecting] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationForm, setLocationForm] = useState({
    streetAddress: '',
    suburb: '',
    state: '',
    postcode: '',
    openToTravel: false,
    travelStates: [] as string[],
    latitude: null as number | null,
    longitude: null as number | null,
    googlePlaceId: '',
    coverageRadiusKm: 30,
  });
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const weekDays = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
  ];
  const radiusOptions = [5, 10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 300, 500, 1000];
  const stateOptions = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
  const monthCells = useMemo(() => buildMonthCells(calendarMonth), [calendarMonth]);
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const savedAvailabilityDateSet = useMemo(() => {
    const dates = new Set<string>();
    availabilityEntries.forEach((entry) => {
      if (!entry.date) return;
      if (!entry.isRecurring || !entry.recurringEndDate || !entry.recurringDays?.length) {
        dates.add(entry.date);
        return;
      }
      const end = new Date(`${entry.recurringEndDate}T00:00:00`);
      for (let cursor = new Date(`${entry.date}T00:00:00`), count = 0; cursor <= end && count < 366; cursor.setDate(cursor.getDate() + 1), count += 1) {
        if (entry.recurringDays.includes(cursor.getDay())) dates.add(toIsoDate(cursor));
      }
    });
    return dates;
  }, [availabilityEntries]);
  const recurringPreviewDateSet = useMemo(() => {
    if (!currentEntry.isRecurring || !currentEntry.date || !currentEntry.recurringEndDate || !currentEntry.recurringDays.length) {
      return new Set<string>();
    }
    const dates = new Set<string>();
    const end = new Date(`${currentEntry.recurringEndDate}T00:00:00`);
    for (let cursor = new Date(`${currentEntry.date}T00:00:00`), count = 0; cursor <= end && count < 366; cursor.setDate(cursor.getDate() + 1), count += 1) {
      if (currentEntry.recurringDays.includes(cursor.getDay())) dates.add(toIsoDate(cursor));
    }
    return dates;
  }, [currentEntry.date, currentEntry.isRecurring, currentEntry.recurringDays, currentEntry.recurringEndDate]);
  const syncSelectedDates = (dates: string[]) => {
    const sorted = [...new Set(dates)].sort();
    setSelectedDates(sorted);
    setCurrentEntry((prev) => ({
      ...prev,
      date: sorted[0] || '',
      recurringEndDate: prev.isRecurring ? sorted[sorted.length - 1] || '' : prev.recurringEndDate,
    }));
  };
  const toggleCalendarDate = (date: string) => {
    syncSelectedDates(selectedDateSet.has(date) ? selectedDates.filter((item) => item !== date) : [...selectedDates, date]);
  };
  const addCalendarDate = (date: string) => {
    setSelectedDates((prevDates) => {
      if (prevDates.includes(date)) return prevDates;
      const sorted = [...prevDates, date].sort();
      setCurrentEntry((prev) => ({
        ...prev,
        date: sorted[0] || '',
        recurringEndDate: prev.isRecurring ? sorted[sorted.length - 1] || '' : prev.recurringEndDate,
      }));
      return sorted;
    });
  };
  const mapCenter = useMemo(() => {
    if (locationForm.latitude != null && locationForm.longitude != null) {
      return { lat: locationForm.latitude, lng: locationForm.longitude };
    }
    return { lat: -37.8136, lng: 144.9631 };
  }, [locationForm.latitude, locationForm.longitude]);

  const { isLoaded: isMapsLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY || '',
    libraries: ['places'],
  });

  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        const entries = await fetchUserAvailabilityService();
        setAvailabilityEntries(entries as AvailabilityEntry[]);
        setNotifyNewShifts(
          (entries as any[]).some((entry) => Boolean(entry?.notifyNewShifts ?? entry?.notify_new_shifts))
        );
      } catch {
        showSnackbar('Failed to load availability', 'error');
      }
    };

    fetchAvailability();
  }, []);

  const onboardingRole = useMemo(() => {
    if (!user?.role) return null;
    if (user.role === 'PHARMACIST') return 'pharmacist';
    if (user.role === 'OTHER_STAFF') return 'other_staff';
    if (user.role === 'EXPLORER') return 'explorer';
    return null;
  }, [user?.role]);

  useEffect(() => {
    const fetchLocation = async () => {
      if (!onboardingRole) return;
      try {
        const onboarding: any = await getOnboarding(onboardingRole);
        setLocationForm({
          streetAddress: onboarding?.street_address || '',
          suburb: onboarding?.suburb || '',
          state: onboarding?.state || '',
          postcode: onboarding?.postcode || '',
          openToTravel: Boolean(onboarding?.open_to_travel),
          travelStates: Array.isArray(onboarding?.travel_states) ? onboarding.travel_states : [],
          latitude: onboarding?.latitude ? Number(onboarding.latitude) : null,
          longitude: onboarding?.longitude ? Number(onboarding.longitude) : null,
          googlePlaceId: onboarding?.google_place_id || '',
          coverageRadiusKm: onboarding?.coverage_radius_km || 30,
        });
      } catch {
        showSnackbar('Failed to load location from onboarding', 'error');
      }
    };
    fetchLocation();
  }, [onboardingRole]);

  const showSnackbar = (msg: string, severity: 'success' | 'error') => {
    setSnackbarMsg(msg);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };
  const handleCloseSnackbar = () => setSnackbarOpen(false);

  const handlePlaceChanged = () => {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();
    if (!place || !place.geometry || !place.geometry.location) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    const components = place.address_components || [];

    const getComponent = (types: string[]) =>
      components.find((c) => types.every((t) => c.types.includes(t)))?.long_name || '';

    setLocationForm((prev) => ({
      ...prev,
      streetAddress: place.formatted_address || prev.streetAddress,
      suburb: getComponent(['locality']) || getComponent(['sublocality', 'sublocality_level_1']) || prev.suburb,
      state: getComponent(['administrative_area_level_1']) || prev.state,
      postcode: getComponent(['postal_code']) || prev.postcode,
      latitude: lat,
      longitude: lng,
      googlePlaceId: place.place_id || prev.googlePlaceId,
    }));
  };

  const handleSaveLocation = async () => {
    if (!onboardingRole) return;
    setSavingLocation(true);
    try {
      const safeRole = onboardingRole === 'other_staff' ? 'otherstaff' : onboardingRole;
      const form = new FormData();
      form.append('street_address', locationForm.streetAddress || '');
      form.append('suburb', locationForm.suburb || '');
      form.append('state', locationForm.state || '');
      form.append('postcode', locationForm.postcode || '');
      form.append('open_to_travel', locationForm.openToTravel ? 'true' : 'false');
      form.append('travel_states', JSON.stringify(locationForm.travelStates || []));
      if (locationForm.latitude != null) form.append('latitude', String(locationForm.latitude));
      if (locationForm.longitude != null) form.append('longitude', String(locationForm.longitude));
      if (locationForm.googlePlaceId) form.append('google_place_id', locationForm.googlePlaceId);
      if (locationForm.coverageRadiusKm != null) {
        form.append('coverage_radius_km', String(locationForm.coverageRadiusKm));
      }

      const response = await fetch(`${API_BASE_URL}/client-profile/${safeRole}/onboarding/me/`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Failed to update location' }));
        throw new Error(err.detail || 'Failed to update location');
      }
      showSnackbar('Location updated', 'success');
    } catch {
      showSnackbar('Failed to update location', 'error');
    } finally {
      setSavingLocation(false);
    }
  };

  const validateTimeRange = (start: string, end: string) =>
    new Date(`2025-01-01T${end}`) > new Date(`2025-01-01T${start}`);

  const handleAddEntry = async () => {
    const datesToAdd = currentEntry.isRecurring
      ? [currentEntry.date].filter(Boolean)
      : (selectedDates.length ? selectedDates : [currentEntry.date].filter(Boolean));

    if (!datesToAdd.length) return showSnackbar('Please select a date', 'error');
    if (!currentEntry.startTime || !currentEntry.endTime)
      return showSnackbar('Please set start and end times', 'error');
    if (!validateTimeRange(currentEntry.startTime, currentEntry.endTime))
      return showSnackbar('End must be after start', 'error');
    if (currentEntry.isRecurring) {
      if (!currentEntry.recurringDays.length)
        return showSnackbar('Select days for repeat', 'error');
      if (!currentEntry.recurringEndDate)
        return showSnackbar('Set an end date for repeat', 'error');
      if (new Date(currentEntry.recurringEndDate) < new Date(currentEntry.date))
        return showSnackbar('Repeat end must be after date', 'error');
    }

    setLoading(true);
    try {
      const payloads: AvailabilityPayload[] = datesToAdd.map((date) => ({
        date,
        start_time: currentEntry.startTime,
        end_time: currentEntry.endTime,
        is_all_day: currentEntry.isAllDay,
        is_recurring: currentEntry.isRecurring,
        recurring_days: currentEntry.isRecurring ? currentEntry.recurringDays : [],
        recurring_end_date: currentEntry.isRecurring ? currentEntry.recurringEndDate || null : null,
        notify_new_shifts: notifyNewShifts,
        notes: currentEntry.notes,
      }));

      const createdEntries = await Promise.all(payloads.map(createUserAvailabilityService));
      setAvailabilityEntries(prev => [...prev, ...(createdEntries as AvailabilityEntry[])]);
      setCurrentEntry(createEmptyEntry());
      setSelectedDates([]);
      showSnackbar('Time slot added', 'success');
    } catch {
      showSnackbar('Failed to save slot', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (id: number) => {
    try {
      await deleteUserAvailabilityService(id);
      setAvailabilityEntries(prev => prev.filter(e => e.id !== id));
      showSnackbar('Slot deleted', 'success');
    } catch {
      showSnackbar('Failed to delete slot', 'error');
    }
  };

  return (
    <Container
      maxWidth="lg"
      sx={{
        py: 4,
        color: DNA.ink,
        fontFamily: DASHBOARD_FONT_FAMILY,
      }}
    >
      <Typography
        variant="h4"
        gutterBottom
        sx={{
          fontWeight: 950,
          color: DNA.ink,
          letterSpacing: '-0.03em',
          animation: `${fadeUp} 360ms ease`,
        }}
      >
        Set Your Availability
      </Typography>

      <Paper
        sx={{
          ...cardSx,
          mb: 3,
          p: 2.5,
          background: `linear-gradient(180deg, ${alpha(DNA.mint, 0.10)} 0%, ${DNA.surface} 100%)`,
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              checked={notifyNewShifts}
              onChange={(e) => setNotifyNewShifts(e.target.checked)}
            />
          }
          label="Notify me when new public shifts match my availability"
          sx={{
            alignItems: 'flex-start',
            m: 0,
            '& .MuiFormControlLabel-label': { fontWeight: 900, color: DNA.ink },
          }}
        />
        <Typography variant="body2" sx={{ mt: 0.75, ml: 4, color: DNA.muted, fontWeight: 700 }}>
          By checking this box, you will get an instant notification when a public shift matches any availability dates and times you add.
        </Typography>
      </Paper>

      <Paper sx={cardSx}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 900, color: DNA.ink }}>
          Location & Travel
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          {isMapsLoaded ? (
            <Autocomplete onLoad={(ref) => (autocompleteRef.current = ref)} onPlaceChanged={handlePlaceChanged}>
              <TextField
                label="Address"
                value={locationForm.streetAddress}
                onChange={(e) => setLocationForm({ ...locationForm, streetAddress: e.target.value })}
                sx={inputSx}
              />
            </Autocomplete>
          ) : (
            <TextField
              label="Address"
              value={locationForm.streetAddress}
              onChange={(e) => setLocationForm({ ...locationForm, streetAddress: e.target.value })}
              sx={inputSx}
            />
          )}
          <Box
            sx={{
              height: 240,
              borderRadius: 3,
              overflow: 'hidden',
              border: `1px solid ${alpha(DNA.cyan, 0.18)}`,
              boxShadow: '0 22px 46px rgba(8, 190, 234, 0.14)',
              transition: 'transform 180ms ease, box-shadow 180ms ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 28px 54px rgba(8, 190, 234, 0.18)',
              },
            }}
          >
            {isMapsLoaded && (
              <GoogleMap
                center={mapCenter}
                zoom={locationForm.coverageRadiusKm >= 75 ? 9 : locationForm.coverageRadiusKm >= 40 ? 10 : 11}
                mapContainerStyle={{ width: '100%', height: '100%' }}
                options={{ disableDefaultUI: true, zoomControl: true }}
              >
                {locationForm.latitude != null && locationForm.longitude != null && (
                  <>
                    <Marker position={mapCenter} />
                    <Circle
                      center={mapCenter}
                      radius={locationForm.coverageRadiusKm * 1000}
                      options={{
                        fillColor: '#08BEEA',
                        fillOpacity: 0.16,
                        strokeColor: '#063BDA',
                        strokeOpacity: 0.55,
                        strokeWeight: 2,
                      }}
                    />
                  </>
                )}
              </GoogleMap>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              label="Suburb"
              value={locationForm.suburb}
              onChange={(e) => setLocationForm({ ...locationForm, suburb: e.target.value })}
              sx={{ ...inputSx, flex: 1 }}
            />
            <TextField
              label="State"
              value={locationForm.state}
              onChange={(e) => setLocationForm({ ...locationForm, state: e.target.value })}
              sx={{ ...inputSx, flex: 1 }}
            />
            <TextField
              label="Postcode"
              value={locationForm.postcode}
              onChange={(e) => setLocationForm({ ...locationForm, postcode: e.target.value })}
              sx={{ ...inputSx, flex: 1 }}
            />
          </Box>
          <FormControl fullWidth sx={inputSx}>
            <InputLabel>Work Travel Radius</InputLabel>
            <Select
              label="Work Travel Radius"
              value={locationForm.coverageRadiusKm}
              disabled={locationForm.openToTravel}
              onChange={(e) => setLocationForm({ ...locationForm, coverageRadiusKm: Number(e.target.value) })}
            >
              {radiusOptions.map((km) => (
                <MenuItem key={km} value={km}>{km} km</MenuItem>
              ))}
            </Select>
          </FormControl>
          {locationForm.openToTravel && (
            <FormControl fullWidth sx={inputSx}>
              <InputLabel>Travel States</InputLabel>
              <Select
                label="Travel States"
                multiple
                value={locationForm.travelStates}
                onChange={(e) =>
                  setLocationForm({ ...locationForm, travelStates: e.target.value as string[] })
                }
                renderValue={(selected) => (selected as string[]).join(', ')}
              >
                {stateOptions.map((state) => (
                  <MenuItem key={state} value={state}>
                    <Checkbox checked={locationForm.travelStates.includes(state)} />
                    {state}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={locationForm.openToTravel}
                onChange={(e) =>
                  setLocationForm((prev) => ({
                    ...prev,
                    openToTravel: e.target.checked,
                    travelStates: e.target.checked ? prev.travelStates : [],
                  }))
                }
              />
            }
            label="Willing to travel/Regional"
            sx={{
              borderRadius: '14px',
              px: 1,
              py: 0.5,
              backgroundColor: alpha(DNA.violet, 0.05),
              '& .MuiFormControlLabel-label': { fontWeight: 700, color: DNA.ink },
            }}
          />
          <Button
            variant="contained"
            onClick={handleSaveLocation}
            disabled={savingLocation || !onboardingRole}
            sx={{
              alignSelf: 'flex-start',
              px: 3,
              minHeight: 48,
              borderRadius: '14px',
              fontWeight: 900,
              backgroundImage: 'linear-gradient(90deg, #063BDA 0%, #6D28D9 100%)',
              boxShadow: '0 16px 30px rgba(6, 59, 218, 0.20)',
              '&:hover': {
                boxShadow: '0 20px 34px rgba(6, 59, 218, 0.26)',
              },
            }}
          >
            {savingLocation ? 'Saving...' : 'Save Location'}
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ ...cardSx, animationDelay: '80ms' }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 900, color: DNA.ink }}>
          Add dates
        </Typography>
        <Box component="form" noValidate autoComplete="off" sx={{ display: 'grid', gap: 2 }}>
          <ToggleButtonGroup
            exclusive
            value={currentEntry.isRecurring ? 'recurring' : 'single'}
            onChange={(_, value) => {
              if (!value) return;
              setCurrentEntry((prev) => ({
                ...prev,
                isRecurring: value === 'recurring',
                recurringDays: [],
                recurringEndDate: value === 'recurring' ? selectedDates[selectedDates.length - 1] || '' : '',
              }));
            }}
            sx={{
              justifySelf: 'center',
              flexWrap: 'wrap',
              gap: 1,
              '& .MuiToggleButton-root': {
                borderRadius: '12px !important',
                border: `1px solid ${alpha(DNA.blue, 0.12)} !important`,
                px: 2.5,
                minHeight: 48,
                fontWeight: 900,
                color: DNA.ink,
              },
              '& .Mui-selected': {
                bgcolor: `${alpha(DNA.blue, 0.10)} !important`,
                color: `${DNA.blue} !important`,
              },
            }}
          >
            <ToggleButton value="recurring">Recurring availability</ToggleButton>
            <ToggleButton value="single">Pick specific dates</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ justifySelf: 'center', maxWidth: 640, textAlign: 'center', color: DNA.muted, fontWeight: 700 }}>
            {currentEntry.isRecurring
              ? 'Select the start and end date on the calendar, then choose the weekdays you are available. Matching recurring dates will be highlighted before you add them.'
              : 'Pick the dates you are available on the calendar. Click a date again to deselect it, or drag across dates to select multiple days.'}
          </Typography>

          <Box
            onMouseLeave={() => setDragSelecting(false)}
            onMouseUp={() => setDragSelecting(false)}
            sx={{
              border: `1px solid ${alpha(DNA.blue, 0.10)}`,
              borderRadius: 3,
              p: 1.5,
              backgroundColor: '#fff',
              userSelect: 'none',
              width: '100%',
              maxWidth: 560,
              justifySelf: 'center',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <IconButton size="small" onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                <ChevronLeft fontSize="small" />
              </IconButton>
              <Typography variant="subtitle2" sx={{ fontWeight: 900, color: DNA.ink }}>
                {calendarMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
              </Typography>
              <IconButton size="small" onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                <ChevronRight fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75, mb: 0.75 }}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                <Typography key={`${day}-${index}`} variant="caption" sx={{ textAlign: 'center', color: DNA.muted, fontWeight: 900 }}>
                  {day}
                </Typography>
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75 }}>
              {monthCells.map((cell, index) => {
                const selected = selectedDateSet.has(cell.iso);
                const saved = savedAvailabilityDateSet.has(cell.iso);
                const recurringPreview = recurringPreviewDateSet.has(cell.iso);
                return (
                  <Button
                    key={`${cell.iso}-${index}`}
                    variant={selected ? 'contained' : 'outlined'}
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
                      height: 38,
                      p: 0,
                      opacity: cell.inMonth ? 1 : 0.35,
                      borderColor: selected ? DNA.blue : saved ? DNA.violet : alpha(DNA.blue, 0.14),
                      borderWidth: saved && !selected ? 2 : 1,
                      bgcolor: selected
                        ? undefined
                        : recurringPreview
                          ? alpha(DNA.mint, 0.14)
                          : saved
                            ? alpha(DNA.violet, 0.10)
                            : undefined,
                      color: !selected && recurringPreview ? DNA.mint : !selected && saved ? DNA.violet : undefined,
                      fontWeight: recurringPreview || saved ? 900 : 700,
                    }}
                  >
                    {cell.day}
                  </Button>
                );
              })}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              label={currentEntry.isRecurring ? 'Start date' : 'Date'}
              type="date"
              value={currentEntry.date}
              onChange={(event) => syncSelectedDates(event.target.value ? [event.target.value] : [])}
              InputLabelProps={{ shrink: true }}
              sx={{ ...inputSx, flex: 1 }}
            />
            {currentEntry.isRecurring && (
              <TextField
                label="End date"
                type="date"
                value={currentEntry.recurringEndDate}
                onChange={e => setCurrentEntry({ ...currentEntry, recurringEndDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ ...inputSx, flex: 1 }}
              />
            )}
          </Box>
          {currentEntry.isRecurring && (
            <ToggleButtonGroup
              value={currentEntry.recurringDays}
              onChange={(_, days) =>
                setCurrentEntry({ ...currentEntry, recurringDays: days as number[] })
              }
              aria-label="weekday selection"
              sx={{
                flexWrap: 'wrap',
                gap: 1,
                '& .MuiToggleButton-root': {
                  borderRadius: '12px !important',
                  border: `1px solid ${alpha(DNA.blue, 0.12)} !important`,
                  px: 1.6,
                  fontWeight: 800,
                  color: DNA.ink,
                  backgroundColor: '#fff',
                },
                '& .Mui-selected': {
                  bgcolor: `${alpha(DNA.blue, 0.10)} !important`,
                  color: `${DNA.blue} !important`,
                },
              }}
            >
              {weekDays.map(d => (
                <ToggleButton key={d.value} value={d.value} aria-label={d.label}>
                  {d.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
          {selectedDates.length > 0 && (
            <Typography variant="caption" sx={{ color: DNA.muted, fontWeight: 700 }}>
              Selected dates: {selectedDates.join(', ')}
            </Typography>
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={currentEntry.isAllDay}
                onChange={e =>
                  setCurrentEntry({
                    ...currentEntry,
                    isAllDay: e.target.checked,
                    startTime: e.target.checked ? '00:00' : '09:00',
                    endTime: e.target.checked ? '23:59' : '17:00',
                  })
                }
              />
            }
            label="All Day"
            sx={{
              borderRadius: '14px',
              px: 1,
              py: 0.5,
              backgroundColor: alpha(DNA.cyan, 0.06),
              '& .MuiFormControlLabel-label': { fontWeight: 700, color: DNA.ink },
            }}
          />
          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              label="Start Time"
              type="time"
              disabled={currentEntry.isAllDay}
              value={currentEntry.startTime}
              onChange={e => setCurrentEntry({ ...currentEntry, startTime: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ ...inputSx, flex: 1 }}
            />
            <TextField
              label="End Time"
              type="time"
              disabled={currentEntry.isAllDay}
              value={currentEntry.endTime}
              onChange={e => setCurrentEntry({ ...currentEntry, endTime: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ ...inputSx, flex: 1 }}
            />
          </Box>
          <TextField
            label="Notes"
            multiline
            rows={3}
            value={currentEntry.notes ?? ''}
            onChange={e => setCurrentEntry({ ...currentEntry, notes: e.target.value })}
            sx={inputSx}
          />
          <Button
            variant="contained"
            onClick={handleAddEntry}
            disabled={loading}
            sx={{
              alignSelf: 'flex-start',
              px: 3,
              minHeight: 48,
              borderRadius: '14px',
              fontWeight: 900,
              backgroundImage: 'linear-gradient(90deg, #063BDA 0%, #6D28D9 100%)',
              boxShadow: '0 16px 30px rgba(6, 59, 218, 0.20)',
              '&:hover': {
                boxShadow: '0 20px 34px rgba(6, 59, 218, 0.26)',
              },
            }}
          >
            {loading ? 'Adding...' : 'Add Time Slot'}
          </Button>
        </Box>
      </Paper>

      <Typography variant="h6" gutterBottom sx={{ fontWeight: 900, color: DNA.ink }}>
        Your Time Slots
      </Typography>
      {availabilityEntries.length === 0 ? (
        <Typography sx={{ color: DNA.muted, fontWeight: 700 }}>No time slots added yet.</Typography>
      ) : (
        availabilityEntries.map((e, index) => (
          <Paper
            key={e.id}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
              mb: 2,
              borderRadius: '20px',
              border: `1px solid ${alpha(DNA.blue, 0.08)}`,
              background: `linear-gradient(180deg, ${DNA.surface} 0%, ${DNA.soft} 100%)`,
              boxShadow: '0 18px 42px rgba(6, 18, 58, 0.06)',
              animation: `${fadeUp} ${420 + index * 60}ms ease`,
              transition: 'transform 180ms ease, box-shadow 180ms ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 22px 48px rgba(6, 18, 58, 0.10)',
              },
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 900, color: DNA.ink }}>
                {e.date} - {e.isAllDay ? 'All Day' : `${e.startTime}-${e.endTime}`}
              </Typography>
              {e.isRecurring && (
                <Typography variant="caption" sx={{ color: DNA.violet, fontWeight: 700 }}>
                  Repeats on {e.recurringDays.map(d => weekDays[d].label).join(', ')} until{' '}
                  {e.recurringEndDate}
                </Typography>
              )}
              {e.notifyNewShifts && (
                <Typography variant="caption" sx={{ display: 'block', color: DNA.mint, fontWeight: 800 }}>
                  Notifications on for matching public shifts
                </Typography>
              )}
              {e.notes && <Typography variant="body2" sx={{ color: DNA.muted, fontWeight: 600 }}>{e.notes}</Typography>}
            </Box>
            <Button
              color="error"
              onClick={() => handleDeleteEntry(e.id)}
              sx={{ fontWeight: 900 }}
            >
              Delete
            </Button>
          </Paper>
        ))
      )}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbarSeverity}
          sx={{ width: '100%', borderRadius: '14px' }}
          action={
            <IconButton size="small" color="inherit" onClick={handleCloseSnackbar}>
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Container>
  );
}
