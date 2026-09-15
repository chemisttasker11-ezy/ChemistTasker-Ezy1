import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  LogBox,
  Platform,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Button,
  Checkbox,
  Chip,
  HelperText,
  IconButton,
  Menu,
  Snackbar,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import {
  UserAvailability,
  UserAvailabilityPayload,
  fetchUserAvailabilityService,
  createUserAvailabilityService,
  deleteUserAvailabilityService,
  getOnboarding,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../context/AuthContext';
import { API_BASE_URL } from '@/constants/api';
import { Autocomplete as WebAutocomplete, Circle, GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import GooglePlacesInput from '../pharmacies/GooglePlacesInput';
import AvailabilityRadiusMap from './AvailabilityRadiusMap';

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

const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const GOOGLE_LIBRARIES: Array<'places'> = ['places'];

const DNA = {
  ink: '#06123A',
  muted: '#5E6B8D',
  line: '#E5ECF7',
  blue: '#063BDA',
  violet: '#6D28D9',
  magenta: '#EA0A8E',
  cyan: '#08BEEA',
  mint: '#00A878',
};

LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

type LocationFormState = {
  streetAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  openToTravel: boolean;
  travelStates: string[];
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string;
  coverageRadiusKm: number;
};

function AvailabilityWebLocationField({
  placesApiKey,
  locationForm,
  setLocationForm,
}: {
  placesApiKey: string;
  locationForm: LocationFormState;
  setLocationForm: React.Dispatch<React.SetStateAction<LocationFormState>>;
}) {
  const [webAddressInput, setWebAddressInput] = useState('');
  const webAutocompleteRef = useRef<any>(null);

  useEffect(() => {
    setWebAddressInput(locationForm.streetAddress || '');
  }, [locationForm.streetAddress]);

  const mapCenter = useMemo(() => {
    if (locationForm.latitude != null && locationForm.longitude != null) {
      return { lat: locationForm.latitude, lng: locationForm.longitude };
    }
    return { lat: -37.8136, lng: 144.9631 };
  }, [locationForm.latitude, locationForm.longitude]);

  const { isLoaded: isPlacesLoaded, loadError: placesLoadError } = useJsApiLoader({
    id: 'availability-places',
    googleMapsApiKey: placesApiKey || '',
    libraries: GOOGLE_LIBRARIES,
  });

  const handleWebPlaceChanged = () => {
    const place = webAutocompleteRef.current?.getPlace?.();
    if (!place) return;
    const components = place.address_components || [];
    const getLong = (type: string) => components.find((c: any) => c.types?.includes(type))?.long_name || '';
    const getShort = (type: string) => components.find((c: any) => c.types?.includes(type))?.short_name || '';
    const streetNumber = getLong('street_number');
    const route = getLong('route');
    const streetAddress = [streetNumber, route].filter(Boolean).join(' ').trim();
    setLocationForm((prev) => ({
      ...prev,
      streetAddress: streetAddress || place.formatted_address || prev.streetAddress,
      suburb: getLong('locality') || getLong('sublocality') || prev.suburb,
      state: getShort('administrative_area_level_1') || prev.state,
      postcode: getLong('postal_code') || prev.postcode,
      latitude: place.geometry?.location?.lat?.() ?? prev.latitude,
      longitude: place.geometry?.location?.lng?.() ?? prev.longitude,
      googlePlaceId: place.place_id || prev.googlePlaceId,
    }));
  };

  if (!placesApiKey) {
    return (
      <>
        <TextInput
          mode="outlined"
          label="Address"
          value={locationForm.streetAddress}
          onChangeText={(v) => setLocationForm((p) => ({ ...p, streetAddress: v }))}
          style={styles.input}
          outlineStyle={styles.inputOutline}
        />
        <HelperText type="info">Google Places key is missing for web.</HelperText>
      </>
    );
  }

  return (
    <>
      {!isPlacesLoaded ? (
        <TextInput mode="outlined" label="Address" value={webAddressInput} editable={false} style={styles.input} outlineStyle={styles.inputOutline} />
      ) : placesLoadError ? (
        <>
          <TextInput
            mode="outlined"
            label="Address"
            value={locationForm.streetAddress}
            onChangeText={(v) => setLocationForm((p) => ({ ...p, streetAddress: v }))}
            style={styles.input}
            outlineStyle={styles.inputOutline}
          />
          <HelperText type="error">
            Google Places failed to load. Check EXPO_PUBLIC_WEB_PLACES key and referrer restrictions.
          </HelperText>
        </>
      ) : (
        <WebAutocomplete
          onLoad={(ref) => {
            webAutocompleteRef.current = ref;
          }}
          onPlaceChanged={handleWebPlaceChanged}
          options={{
            componentRestrictions: { country: 'au' },
            fields: ['address_components', 'geometry', 'place_id', 'formatted_address', 'name'],
          }}
        >
          <input
            value={webAddressInput}
            onChange={(e) => {
              const next = e.target.value;
              setWebAddressInput(next);
              setLocationForm((p) => ({ ...p, streetAddress: next }));
            }}
            placeholder="Address"
            style={{
              width: '100%',
              height: 46,
              border: '1px solid #DCE5F4',
              borderRadius: 14,
              padding: '0 12px',
              fontSize: 16,
              color: DNA.ink,
              backgroundColor: '#FFFFFF',
              boxShadow: '0 10px 24px rgba(6, 18, 58, 0.05)',
            }}
          />
        </WebAutocomplete>
      )}

      <View style={styles.mapWrap}>
        {placesLoadError ? (
          <View style={styles.mapFallback}>
            <Text style={styles.hint}>
              Map failed to load. Check EXPO_PUBLIC_WEB_PLACES key and referrer restrictions.
            </Text>
          </View>
        ) : isPlacesLoaded ? (
          <GoogleMap
            center={mapCenter}
            zoom={locationForm.coverageRadiusKm >= 75 ? 9 : locationForm.coverageRadiusKm >= 40 ? 10 : 11}
            mapContainerStyle={{ width: '100%', height: '100%' }}
            options={{ disableDefaultUI: true, zoomControl: true }}
          >
            {locationForm.latitude != null && locationForm.longitude != null ? (
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
            ) : null}
          </GoogleMap>
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.hint}>Loading map...</Text>
          </View>
        )}
      </View>
    </>
  );
}

export default function SetAvailabilityScreen() {
  const { user, token } = useAuth();
  const [availabilityEntries, setAvailabilityEntries] = useState<AvailabilityEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<AvailabilityDraft>(createEmptyEntry());
  const [notifyNewShifts, setNotifyNewShifts] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [calendarMonthAnchor, setCalendarMonthAnchor] = useState<Date>(new Date());
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
  const [radiusMenuVisible, setRadiusMenuVisible] = useState(false);
  const [travelMenuVisible, setTravelMenuVisible] = useState(false);
  const placesApiKey = useMemo(
    () => {
      const byPlatform = Platform.select({
        web: process.env.EXPO_PUBLIC_WEB_PLACES,
        ios: process.env.EXPO_PUBLIC_IOS_PLACES,
        android: process.env.EXPO_PUBLIC_ANDROID_PLACES,
      });
      return (byPlatform ||
        process.env.EXPO_PUBLIC_PLACES_KEY ||
        process.env.EXPO_PUBLIC_MAPS_API_KEY ||
        '') as string;
    },
    []
  );
  const nativeMapsKeyConfigured = useMemo(
    () =>
      Boolean(
        Platform.select({
          ios: process.env.EXPO_PUBLIC_IOS_PLACES || process.env.EXPO_PUBLIC_PLACES_KEY || process.env.EXPO_PUBLIC_MAPS_API_KEY,
          android: process.env.EXPO_PUBLIC_ANDROID_PLACES || process.env.EXPO_PUBLIC_PLACES_KEY || process.env.EXPO_PUBLIC_MAPS_API_KEY,
          default: '',
        })
      ),
    []
  );
  const nativeMapPreviewEnabled = useMemo(
    () => !__DEV__ || process.env.EXPO_PUBLIC_ENABLE_NATIVE_MAP_PREVIEW === 'true',
    []
  );
  const nativeMapPreviewCoordinates =
    locationForm.latitude != null &&
    locationForm.longitude != null &&
    nativeMapsKeyConfigured &&
    nativeMapPreviewEnabled
      ? { latitude: locationForm.latitude, longitude: locationForm.longitude }
      : null;

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [calendarGridWidth, setCalendarGridWidth] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const showSnackbar = (msg: string, severity: 'success' | 'error') => {
    setSnackbarMsg(msg);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  const savedAvailabilityDateSet = useMemo(() => {
    const dates = new Set<string>();
    const maxOccurrences = 180;
    availabilityEntries.forEach((entry) => {
      if (!entry.date) return;
      dates.add(entry.date);
      if (!entry.isRecurring || !entry.recurringEndDate) return;
      const days = Array.isArray(entry.recurringDays) ? entry.recurringDays : [];
      if (!days.length) return;
      let cursor = new Date(`${entry.date}T00:00:00`);
      const end = new Date(`${entry.recurringEndDate}T00:00:00`);
      let count = 0;
      while (cursor <= end) {
        if (days.includes(cursor.getDay())) {
          dates.add(toLocalIsoDate(cursor));
          count += 1;
          if (count >= maxOccurrences) break;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return dates;
  }, [availabilityEntries]);

  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  const recurringPreviewDateSet = useMemo(() => {
    const dates = new Set<string>();
    if (!currentEntry.isRecurring || !currentEntry.date || !currentEntry.recurringEndDate || !currentEntry.recurringDays.length) return dates;
    let cursor = new Date(`${currentEntry.date}T00:00:00`);
    const end = new Date(`${currentEntry.recurringEndDate}T00:00:00`);
    let count = 0;
    while (cursor <= end && count < 366) {
      if (currentEntry.recurringDays.includes(cursor.getDay())) dates.add(toLocalIsoDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
      count += 1;
    }
    return dates;
  }, [currentEntry.date, currentEntry.isRecurring, currentEntry.recurringDays, currentEntry.recurringEndDate]);

  const monthCalendarCells = useMemo(() => {
    const year = calendarMonthAnchor.getFullYear();
    const month = calendarMonthAnchor.getMonth();
    const first = new Date(year, month, 1);
    const leading = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];
    for (let i = 0; i < leading; i += 1) cells.push({ iso: `pad-prev-${i}`, day: 0, inMonth: false });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ iso: toLocalIsoDate(new Date(year, month, day)), day, inMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ iso: `pad-next-${cells.length}`, day: 0, inMonth: false });
    return cells;
  }, [calendarMonthAnchor]);

  const monthLabel = useMemo(
    () => calendarMonthAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [calendarMonthAnchor]
  );

  const onboardingRole = useMemo(() => {
    if (!user?.role) return null;
    if (user.role === 'PHARMACIST') return 'pharmacist';
    if (user.role === 'OTHER_STAFF') return 'other_staff';
    if (user.role === 'EXPLORER') return 'explorer';
    return null;
  }, [user?.role]);

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
    void fetchAvailability();
  }, []);

  useEffect(() => {
    const fetchLocation = async () => {
      if (!onboardingRole) return;
      try {
        const onboarding: any = await getOnboarding(onboardingRole as any);
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
    void fetchLocation();
  }, [onboardingRole]);

  const handleNativePlaceSelected = (place: {
    address: string;
    name?: string;
    place_id?: string;
    street_address: string;
    suburb: string;
    state: string;
    postcode: string;
    latitude?: number;
    longitude?: number;
  }) => {
    setLocationForm((prev) => ({
      ...prev,
      streetAddress: place.street_address || place.address || prev.streetAddress,
      suburb: place.suburb || prev.suburb,
      state: place.state || prev.state,
      postcode: place.postcode || prev.postcode,
      latitude: place.latitude ?? prev.latitude,
      longitude: place.longitude ?? prev.longitude,
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
      form.append('coverage_radius_km', String(locationForm.coverageRadiusKm));

      const response = await fetch(`${API_BASE_URL}/client-profile/${safeRole}/onboarding/me/`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!response.ok) throw new Error('Failed to update location');
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
    if (!currentEntry.startTime || !currentEntry.endTime) return showSnackbar('Please set start and end times', 'error');
    if (!validateTimeRange(currentEntry.startTime, currentEntry.endTime)) return showSnackbar('End must be after start', 'error');
    if (currentEntry.isRecurring) {
      if (!currentEntry.recurringDays.length) return showSnackbar('Select days for repeat', 'error');
      if (!currentEntry.recurringEndDate) return showSnackbar('Set an end date for repeat', 'error');
      if (new Date(currentEntry.recurringEndDate) < new Date(currentEntry.date)) return showSnackbar('Repeat end must be after date', 'error');
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
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setAvailabilityEntries((prev) => [...prev, ...(createdEntries as AvailabilityEntry[])]);
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
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setAvailabilityEntries((prev) => prev.filter((e) => e.id !== id));
      showSnackbar('Slot deleted', 'success');
    } catch {
      showSnackbar('Failed to delete slot', 'error');
    }
  };

  const toggleRecurringDay = (day: number) => {
    setCurrentEntry((prev) => ({
      ...prev,
      recurringDays: prev.recurringDays.includes(day)
        ? prev.recurringDays.filter((d) => d !== day)
        : [...prev.recurringDays, day].sort(),
    }));
  };
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
    syncSelectedDates(selectedDates.includes(date) ? selectedDates.filter((item) => item !== date) : [...selectedDates, date]);
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
  const getCalendarDateFromTouch = (locationX: number, locationY: number) => {
    if (!calendarGridWidth) return null;
    const cellSize = calendarGridWidth / 7;
    const column = Math.max(0, Math.min(6, Math.floor(locationX / cellSize)));
    const row = Math.max(0, Math.floor(locationY / cellSize));
    const cell = monthCalendarCells[row * 7 + column];
    return cell?.inMonth ? cell.iso : null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="headlineMedium" style={styles.title}>Set Your Availability</Text>

        <Surface style={styles.notifyCard} elevation={1}>
          <View style={styles.checkboxRowPlain}>
            <Checkbox status={notifyNewShifts ? 'checked' : 'unchecked'} onPress={() => setNotifyNewShifts((v) => !v)} />
            <Text style={styles.rowText}>Notify me when new public shifts match my availability</Text>
          </View>
          <Text style={styles.notifyDescription}>
            By checking this box, you will get an instant notification when a public shift matches any availability dates and times you add.
          </Text>
        </Surface>

        <Surface style={styles.card} elevation={2}>
          <Text style={styles.sectionTitle}>Location & Travel</Text>

          <View style={{ minHeight: 56 }}>
            {Platform.OS !== 'web' ? (
              <GooglePlacesInput
                label="Address"
                value={locationForm.streetAddress}
                onPlaceSelected={handleNativePlaceSelected}
              />
            ) : (
              <AvailabilityWebLocationField
                placesApiKey={placesApiKey}
                locationForm={locationForm}
                setLocationForm={setLocationForm}
              />
            )}
          </View>

          {Platform.OS !== 'web' ? (
            <View style={styles.mapWrap}>
              {nativeMapPreviewCoordinates ? (
                <AvailabilityRadiusMap
                  latitude={nativeMapPreviewCoordinates.latitude}
                  longitude={nativeMapPreviewCoordinates.longitude}
                  radiusKm={locationForm.coverageRadiusKm}
                  style={styles.nativeMap}
                />
              ) : (
                <View style={styles.mapFallback}>
                  <Text style={styles.hint}>
                    {locationForm.latitude == null || locationForm.longitude == null
                      ? 'Select an address to preview the travel radius.'
                      : !nativeMapPreviewEnabled
                      ? 'Map preview is disabled in local development until the Android dev build is rebuilt with the native Google Maps key. You can still save your address and radius.'
                      : nativeMapsKeyConfigured
                      ? 'Select an address to preview the travel radius.'
                      : 'Native Google Maps key is not configured for this build yet. Save your address and rebuild the app to enable the map preview.'}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.row2}>
            <TextInput mode="outlined" label="Suburb" value={locationForm.suburb} onChangeText={(v) => setLocationForm((p) => ({ ...p, suburb: v }))} style={[styles.input, styles.flex]} outlineStyle={styles.inputOutline} />
            <TextInput mode="outlined" label="State" value={locationForm.state} onChangeText={(v) => setLocationForm((p) => ({ ...p, state: v }))} style={[styles.input, styles.flex]} outlineStyle={styles.inputOutline} />
            <TextInput mode="outlined" label="Postcode" value={locationForm.postcode} onChangeText={(v) => setLocationForm((p) => ({ ...p, postcode: v }))} style={[styles.input, styles.flex]} outlineStyle={styles.inputOutline} />
          </View>

          <Menu
            visible={radiusMenuVisible}
            onDismiss={() => setRadiusMenuVisible(false)}
            anchor={<Button mode="outlined" onPress={() => setRadiusMenuVisible(true)} disabled={locationForm.openToTravel} style={styles.outlineButton}>{`Work Travel Radius: ${locationForm.coverageRadiusKm} km`}</Button>}
          >
            {radiusOptions.map((km) => (
              <Menu.Item
                key={km}
                title={`${km} km`}
                onPress={() => {
                  setLocationForm((p) => ({ ...p, coverageRadiusKm: km }));
                  setRadiusMenuVisible(false);
                }}
              />
            ))}
          </Menu>

          <View style={styles.checkboxRow}>
            <Checkbox
              status={locationForm.openToTravel ? 'checked' : 'unchecked'}
              onPress={() => setLocationForm((p) => ({ ...p, openToTravel: !p.openToTravel, travelStates: !p.openToTravel ? p.travelStates : [] }))}
            />
            <Text style={styles.rowText}>Willing to travel/Regional</Text>
          </View>

          {locationForm.openToTravel ? (
            <Menu
              visible={travelMenuVisible}
              onDismiss={() => setTravelMenuVisible(false)}
              anchor={<Button mode="outlined" onPress={() => setTravelMenuVisible(true)} style={styles.outlineButton}>{`Travel States: ${locationForm.travelStates.join(', ') || 'Select'}`}</Button>}
            >
              {stateOptions.map((st) => {
                const selected = locationForm.travelStates.includes(st);
                return (
                  <Checkbox.Item
                    key={st}
                    label={st}
                    status={selected ? 'checked' : 'unchecked'}
                    onPress={() =>
                      setLocationForm((p) => ({
                        ...p,
                        travelStates: selected ? p.travelStates.filter((s) => s !== st) : [...p.travelStates, st],
                      }))
                    }
                    position="leading"
                    style={styles.checkboxItem}
                  />
                );
              })}
            </Menu>
          ) : null}

          <Button mode="contained" onPress={handleSaveLocation} disabled={savingLocation || !onboardingRole} loading={savingLocation} style={styles.primaryButton} labelStyle={styles.primaryButtonLabel}>
            Save Location
          </Button>
        </Surface>

        <Surface style={styles.card} elevation={2}>
          <Text style={styles.sectionTitle}>Add dates</Text>

          <View style={styles.modeRow}>
            <Button
              mode={currentEntry.isRecurring ? 'contained' : 'outlined'}
              onPress={() => setCurrentEntry((p) => ({ ...p, isRecurring: true, recurringDays: [], recurringEndDate: selectedDates[selectedDates.length - 1] || '' }))}
              style={styles.modeButton}
            >
              Recurring availability
            </Button>
            <Button
              mode={!currentEntry.isRecurring ? 'contained' : 'outlined'}
              onPress={() => setCurrentEntry((p) => ({ ...p, isRecurring: false, recurringDays: [], recurringEndDate: '' }))}
              style={styles.modeButton}
            >
              Pick specific dates
            </Button>
          </View>
          <Text style={styles.modeDescription}>
            {currentEntry.isRecurring
              ? 'Select the start and end date on the calendar, then choose the weekdays you are available. Matching recurring dates will be highlighted before you add them.'
              : 'Pick the dates you are available on the calendar. Tap a date again to deselect it, or drag across dates to select multiple days.'}
          </Text>

          <Surface style={styles.calendarPanel} elevation={0}>
            <View style={styles.calendarHeader}>
              <IconButton icon="chevron-left" size={18} onPress={() => setCalendarMonthAnchor((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))} />
              <Text style={styles.calendarTitle}>{monthLabel}</Text>
              <IconButton icon="chevron-right" size={18} onPress={() => setCalendarMonthAnchor((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))} />
            </View>
            <View style={styles.calendarWeekHead}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, idx) => (
                <Text key={`${d}-${idx}`} style={styles.calendarWeekText}>{d}</Text>
              ))}
            </View>
            <View
              style={styles.calendarGrid}
              onLayout={(event) => setCalendarGridWidth(event.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(event) => {
                const date = getCalendarDateFromTouch(event.nativeEvent.locationX, event.nativeEvent.locationY);
                if (date) toggleCalendarDate(date);
              }}
              onResponderMove={(event) => {
                const date = getCalendarDateFromTouch(event.nativeEvent.locationX, event.nativeEvent.locationY);
                if (date) addCalendarDate(date);
              }}
            >
              {monthCalendarCells.map((cell, idx) => {
                if (!cell.inMonth) return <View key={`${cell.iso}-${idx}`} style={[styles.calendarCell, styles.calendarCellPad]} />;
                const isSelected = selectedDateSet.has(cell.iso);
                const isSaved = savedAvailabilityDateSet.has(cell.iso);
                const recurringPreview = recurringPreviewDateSet.has(cell.iso);
                return (
                  <View
                    key={`${cell.iso}-${idx}`}
                    style={[
                      styles.calendarCell,
                      isSaved && styles.calendarCellSaved,
                      recurringPreview && styles.calendarCellRecurring,
                      isSelected && styles.calendarCellSelected,
                    ]}
                  >
                    <Text style={[styles.calendarCellText, recurringPreview && styles.calendarCellTextRecurring, isSelected && styles.calendarCellTextSelected]}>{cell.day}</Text>
                  </View>
                );
              })}
            </View>
          </Surface>

          {currentEntry.date ? (
            <Text style={styles.hint}>{`${currentEntry.isRecurring ? 'Start date' : 'Selected date'}: ${currentEntry.date}`}</Text>
          ) : null}
          {selectedDates.length > 0 ? <Text style={styles.hint}>{`Selected dates: ${selectedDates.join(', ')}`}</Text> : null}

          {currentEntry.isRecurring ? (
            <>
              <TextInput mode="outlined" label="End Date" value={currentEntry.recurringEndDate || ''} onChangeText={(v) => setCurrentEntry((p) => ({ ...p, recurringEndDate: v }))} placeholder="YYYY-MM-DD" style={styles.input} outlineStyle={styles.inputOutline} />
              <View style={styles.chipWrap}>
                {weekDays.map((d) => {
                  const selected = currentEntry.recurringDays.includes(d.value);
                  return (
                    <Chip key={d.value} selected={selected} onPress={() => toggleRecurringDay(d.value)} style={selected ? styles.chipSelected : styles.chip} textStyle={selected ? styles.chipSelectedText : styles.chipText}>
                      {d.label}
                    </Chip>
                  );
                })}
              </View>
            </>
          ) : null}

          <View style={styles.checkboxRow}>
            <Checkbox
              status={currentEntry.isAllDay ? 'checked' : 'unchecked'}
              onPress={() =>
                setCurrentEntry((prev) => ({
                  ...prev,
                  isAllDay: !prev.isAllDay,
                  startTime: !prev.isAllDay ? '00:00' : '09:00',
                  endTime: !prev.isAllDay ? '23:59' : '17:00',
                }))
              }
            />
            <Text style={styles.rowText}>All Day</Text>
          </View>

          <View style={styles.row2}>
            <TextInput mode="outlined" label="Start Time" value={currentEntry.startTime} disabled={currentEntry.isAllDay} onChangeText={(v) => setCurrentEntry((p) => ({ ...p, startTime: v }))} style={[styles.input, styles.flex]} outlineStyle={styles.inputOutline} />
            <TextInput mode="outlined" label="End Time" value={currentEntry.endTime} disabled={currentEntry.isAllDay} onChangeText={(v) => setCurrentEntry((p) => ({ ...p, endTime: v }))} style={[styles.input, styles.flex]} outlineStyle={styles.inputOutline} />
          </View>
          <HelperText type="info">Use HH:MM format, e.g. 09:00</HelperText>

          <TextInput mode="outlined" label="Notes" multiline numberOfLines={3} value={currentEntry.notes || ''} onChangeText={(v) => setCurrentEntry((p) => ({ ...p, notes: v }))} style={styles.input} outlineStyle={styles.inputOutline} />

          <Button mode="contained" onPress={handleAddEntry} disabled={loading} loading={loading} style={styles.primaryButton} labelStyle={styles.primaryButtonLabel}>
            Add Time Slot
          </Button>
        </Surface>

        <Text style={styles.sectionTitle}>Your Time Slots</Text>
        {availabilityEntries.length === 0 ? (
          <Text style={styles.empty}>No time slots added yet.</Text>
        ) : (
          availabilityEntries.map((item) => (
            <Surface key={item.id} style={styles.slotItem} elevation={1}>
              <View style={{ flex: 1 }}>
                <Text style={styles.slotTitle}>{`${item.date} - ${item.isAllDay ? 'All Day' : `${item.startTime}-${item.endTime}`}`}</Text>
                {item.isRecurring ? (
                  <Text style={styles.slotMeta}>{`Repeats on ${(item.recurringDays || []).map((d) => weekDays[d]?.label || '').filter(Boolean).join(', ')} until ${item.recurringEndDate}`}</Text>
                ) : null}
                {item.notifyNewShifts ? <Text style={[styles.slotMeta, styles.slotMetaSuccess]}>Notifications on for matching public shifts</Text> : null}
                {item.notes ? <Text style={styles.slotMeta}>{item.notes}</Text> : null}
              </View>
              <Button textColor="#DC2626" onPress={() => handleDeleteEntry(item.id)}>Delete</Button>
            </Surface>
          ))
        )}
      </ScrollView>

      <Snackbar visible={snackbarOpen} onDismiss={() => setSnackbarOpen(false)} duration={4000}>
        <Text style={{ color: snackbarSeverity === 'error' ? '#FCA5A5' : '#86EFAC' }}>{snackbarMsg}</Text>
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FF' },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  title: { fontWeight: '900', color: DNA.ink, letterSpacing: -0.4 },
  card: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E8EEF8',
    shadowColor: '#06123A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
  },
  sectionTitle: { fontWeight: '900', color: DNA.ink },
  notifyCard: {
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 4,
  },
  notifyDescription: { color: DNA.muted, fontSize: 12, fontWeight: '700', paddingLeft: 42 },
  row2: { flexDirection: 'row', gap: 8 },
  modeRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignSelf: 'center', maxWidth: 560 },
  modeButton: { flex: 1, borderRadius: 14 },
  modeDescription: { color: DNA.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', alignSelf: 'center', maxWidth: 560 },
  flex: { flex: 1 },
  input: { backgroundColor: '#FFFFFF' },
  inputOutline: { borderRadius: 14, borderColor: '#DCE5F4' },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: '#E5ECF7',
    borderRadius: 14,
    paddingRight: 10,
  },
  checkboxRowPlain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowText: { color: DNA.ink, flexShrink: 1, fontWeight: '700' },
  checkboxItem: { paddingVertical: 0 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F3F6FD' },
  chipSelected: { backgroundColor: '#EDE9FE' },
  chipText: { color: DNA.ink, fontWeight: '700' },
  chipSelectedText: { color: DNA.violet, fontWeight: '900' },
  empty: { color: DNA.muted, fontWeight: '700' },
  slotItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#06123A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  slotTitle: { color: DNA.ink, fontWeight: '800' },
  slotMeta: { color: DNA.muted, marginTop: 2, fontWeight: '700' },
  slotMetaSuccess: { color: DNA.mint },
  mapWrap: {
    height: 220,
    borderWidth: 1,
    borderColor: '#DDF1F8',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#08BEEA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
  },
  nativeMap: {
    width: '100%',
    height: '100%',
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  calendarPanel: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 6,
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    shadowColor: '#06123A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
  },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarTitle: { fontWeight: '800', color: DNA.ink },
  calendarWeekHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 4 },
  calendarWeekText: { width: `${100 / 7}%`, textAlign: 'center', color: DNA.muted, fontSize: 12, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: `${100 / 7}%`,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calendarCellPad: { opacity: 0 },
  calendarCellSaved: { borderColor: '#A5B4FC', borderWidth: 2 },
  calendarCellRecurring: { backgroundColor: '#DCFCE7' },
  calendarCellSelected: { backgroundColor: '#E8F0FF' },
  calendarCellText: { color: DNA.ink, fontWeight: '700' },
  calendarCellTextRecurring: { color: '#166534', fontWeight: '900' },
  calendarCellTextSelected: { color: DNA.blue, fontWeight: '900' },
  hint: { color: DNA.muted, fontSize: 12, fontWeight: '700' },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: DNA.blue,
    shadowColor: '#063BDA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  primaryButtonLabel: {
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  outlineButton: {
    borderRadius: 14,
    borderColor: '#DCE5F4',
    backgroundColor: '#FFFFFF',
  },
});
