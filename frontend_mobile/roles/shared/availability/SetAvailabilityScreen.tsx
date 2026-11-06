import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  LogBox,
  Platform,
  Pressable,
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
  fetchUserAvailabilityService,
  createUserAvailabilityService,
  deleteUserAvailabilityService,
  getOnboarding,
  updateOnboardingForm,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../context/AuthContext';
import { Autocomplete as WebAutocomplete, Circle, GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import GooglePlacesInput from '../pharmacies/GooglePlacesInput';
import AvailabilityRadiusMap from './AvailabilityRadiusMap';
import {
  type AvailabilityEntry,
  type AvailabilityDraft,
  createEmptyEntry,
  weekDays,
  radiusOptions,
  stateOptions,
  toLocalIsoDate,
  GOOGLE_LIBRARIES,
  DNA,
  type LocationFormState,
  normalizeOnboardingRole,
  computeMonthAvailabilityDates,
  computeMonthRecurringPreviewDates,
  isValidIsoDate,
  AvailabilityController,
} from './availabilityModel';
import { useUnsavedChangesGuard } from '../forms/useUnsavedChangesGuard';
import { BrandLoader, ConfirmDialog } from '@/components/ui';

export function formatSlotEnAuDate(iso: string): string {
  if (!iso) return '';
  const [y, m, dNum] = iso.split('-').map(Number);
  if (y && m && dNum) {
    const d = new Date(y, m - 1, dNum);
    return d.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return iso;
}

type PendingDeleteTarget = {
  token: number;
  id: number;
  generation: number;
  accountKey: string;
  slot: AvailabilityEntry;
};

LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

function manualAddressEdit(form: LocationFormState, field: 'streetAddress' | 'suburb' | 'state' | 'postcode', value: string): LocationFormState {
  return form[field] === value ? form : { ...form, [field]: value, latitude: null, longitude: null, googlePlaceId: '' };
}

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
      latitude: place.geometry?.location?.lat?.() ?? null,
      longitude: place.geometry?.location?.lng?.() ?? null,
      googlePlaceId: place.place_id || '',
    }));
  };

  if (!placesApiKey) {
    return (
      <>
        <TextInput
          mode="outlined"
          label="Address"
          value={locationForm.streetAddress}
          onChangeText={(v) => setLocationForm((p) => manualAddressEdit(p, 'streetAddress', v))}
          style={styles.input}
          outlineStyle={styles.inputOutline}
        />
        <HelperText type="info">Map unavailable. You can still type your address.</HelperText>
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
            onChangeText={(v) => setLocationForm((p) => manualAddressEdit(p, 'streetAddress', v))}
            style={styles.input}
            outlineStyle={styles.inputOutline}
          />
          <HelperText type="info">
            Map unavailable. You can still type your address.
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
              setLocationForm((p) => manualAddressEdit(p, 'streetAddress', next));
            }}
            placeholder="Address"
            aria-label="Address"
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
              Map unavailable. You can still type your address.
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
            <BrandLoader size={24} accessibilityLabel="Loading map…" />
          </View>
        )}
      </View>
    </>
  );
}

export function SetAvailabilityInner() {
  const { user } = useAuth();
  const accountKey = `${user?.id ?? 'anon'}:${user?.role ?? 'norole'}`;
  const [controller] = useState(() => new AvailabilityController(accountKey));

  const [availabilityEntries, setAvailabilityEntries] = useState<AvailabilityEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<AvailabilityDraft>(createEmptyEntry());
  const [notifyNewShifts, setNotifyNewShifts] = useState(false);
  const notificationEditedRef = useRef(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<PendingDeleteTarget | null>(null);
  const confirmingRef = useRef(false);
  const nextDeleteTokenRef = useRef(1);
  const consumedDeleteTokensRef = useRef<Set<number>>(new Set());
  const isBusy = loading || savingLocation || deleting;

  useEffect(() => {
    setPendingDeleteTarget(null);
    consumedDeleteTokensRef.current.clear();
  }, [user?.id, accountKey]);
  const [calendarMonthAnchor, setCalendarMonthAnchor] = useState<Date>(new Date());
  const calendarGridSize = useRef({ width: 0, height: 0 });
  const calendarDrag = useRef<{ date: string; pageX: number; pageY: number; x: number; y: number } | null>(null);
  const [locationForm, setRawLocationForm] = useState<LocationFormState>({
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
  const locationEditRevision = useRef(0);
  const setLocationForm: React.Dispatch<React.SetStateAction<LocationFormState>> = (action) => {
    locationEditRevision.current += 1;
    controller.markLocationDirty();
    setRawLocationForm(action);
  };

  const isWriteBusy = loading || savingLocation || deleting;

  const baselineSlotDraftRef = useRef({
    currentEntry: createEmptyEntry(),
    selectedDates: [] as string[],
    notifyNewShifts: false,
  });
  const baselineLocationRef = useRef<LocationFormState>({
    streetAddress: '',
    suburb: '',
    state: '',
    postcode: '',
    openToTravel: false,
    travelStates: [],
    latitude: null,
    longitude: null,
    googlePlaceId: '',
    coverageRadiusKm: 30,
  });

  const guardedValue = useMemo(() => ({
    slotDraft: {
      currentEntry,
      selectedDates,
      notifyNewShifts,
    },
    location: locationForm,
  }), [currentEntry, selectedDates, notifyNewShifts, locationForm]);

  const unsaved = useUnsavedChangesGuard(guardedValue, {
    saving: isWriteBusy,
    title: 'Discard changes?',
    message: 'You have unsaved changes. If you leave now, your edits will be discarded.',
    onDiscard: () => {
      setRawLocationForm(baselineLocationRef.current);
      controller.clearLocationDirty();
      const cleanEntry = createEmptyEntry();
      setCurrentEntry(cleanEntry);
      setSelectedDates([]);
      setNotifyNewShifts(baselineSlotDraftRef.current.notifyNewShifts);
      notificationEditedRef.current = false;
      baselineSlotDraftRef.current = {
        currentEntry: cleanEntry,
        selectedDates: [],
        notifyNewShifts: baselineSlotDraftRef.current.notifyNewShifts,
      };
    },
  });
  const markCleanRef = useRef(unsaved.markClean);
  markCleanRef.current = unsaved.markClean;
  const locationSaveInFlightRef = useRef(false);
  const pendingAvailabilityBaselineRef = useRef(false);

  useEffect(() => {
    if (!isWriteBusy && pendingAvailabilityBaselineRef.current) {
      pendingAvailabilityBaselineRef.current = false;
      markCleanRef.current({
        slotDraft: baselineSlotDraftRef.current,
        location: baselineLocationRef.current,
      });
    }
  }, [isWriteBusy]);

  useEffect(() => {
    markCleanRef.current({
      slotDraft: baselineSlotDraftRef.current,
      location: baselineLocationRef.current,
    });
  }, []);
  const [locationLoaded, setLocationLoaded] = useState(false);
  const [locationLoadError, setLocationLoadError] = useState(false);
  const [locationReloadKey, setLocationReloadKey] = useState(0);
  const [radiusMenuVisible, setRadiusMenuVisible] = useState(false);
  const [travelMenuVisible, setTravelMenuVisible] = useState(false);
  const [locationExpanded, setLocationExpanded] = useState(false);
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

  useEffect(() => {
    return () => {
      controller.invalidate();
    };
  }, [controller]);

  const savedAvailabilityDateSet = useMemo(
    () => computeMonthAvailabilityDates(availabilityEntries, calendarMonthAnchor),
    [availabilityEntries, calendarMonthAnchor]
  );

  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  const recurringPreviewDateSet = useMemo(
    () => computeMonthRecurringPreviewDates(currentEntry, calendarMonthAnchor),
    [currentEntry, calendarMonthAnchor]
  );

  const monthCalendarCells = useMemo(() => {
    const year = calendarMonthAnchor.getFullYear();
    const month = calendarMonthAnchor.getMonth();
    const first = new Date(year, month, 1);
    const leading = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { iso: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < leading; i += 1) cells.push({ iso: `pad-prev-${i}`, day: 0, inMonth: false });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ iso: toLocalIsoDate(new Date(year, month, day)), day, inMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ iso: `pad-next-${cells.length}`, day: 0, inMonth: false });
    return cells;
  }, [calendarMonthAnchor]);

  const monthLabel = useMemo(
    () => calendarMonthAnchor.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
    [calendarMonthAnchor]
  );

  const onboardingRole = useMemo(() => normalizeOnboardingRole(user?.role), [user?.role]);

  const getCellA11y = (iso: string, isSel: boolean, isSav: boolean, isRep: boolean) => {
    const parts = iso.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const dateStr = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      const tags = [isSel && 'selected', isSav && 'saved', isRep && 'repeats'].filter(Boolean);
      return tags.length ? `${dateStr}, ${tags.join(', ')}` : dateStr;
    }
    return iso;
  };
  const locationSummary = !locationLoaded
    ? (locationLoadError ? 'Failed to load location' : 'Loading saved location...')
    : `${locationForm.suburb || locationForm.streetAddress || 'No address set'} · ${locationForm.openToTravel ? 'Open to travel' : `${locationForm.coverageRadiusKm} km radius`}${controller.isLocationDirty ? ' (Unsaved)' : ''}`;

  const [availabilityLoadError, setAvailabilityLoadError] = useState(false);
  const [availabilityReloadKey, setAvailabilityReloadKey] = useState(0);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const availabilityAccountRef = useRef(user?.id);

  useEffect(() => {
    let current = true;
    // A different signed-in worker must never see the previous worker's availability.
    setPendingDeleteTarget(null);
    setAvailabilityEntries([]);
    if (availabilityAccountRef.current !== user?.id) {
      availabilityAccountRef.current = user?.id;
      setNotifyNewShifts(false);
    }
    setAvailabilityLoading(true);
    setAvailabilityLoadError(false);
    const fetchAvailability = async () => {
      try {
        const entries = await fetchUserAvailabilityService();
        if (!current) return;
        setAvailabilityEntries(entries as AvailabilityEntry[]);
        const serverNotify = (entries as any[]).some((entry) => Boolean(entry?.notifyNewShifts ?? entry?.notify_new_shifts));
        if (!notificationEditedRef.current) setNotifyNewShifts(serverNotify);
        if (selectedDates.length === 0 && !currentEntry.date && !currentEntry.isRecurring) {
          baselineSlotDraftRef.current = {
            ...baselineSlotDraftRef.current,
            notifyNewShifts: serverNotify,
          };
          if (locationSaveInFlightRef.current) pendingAvailabilityBaselineRef.current = true;
          else markCleanRef.current({
            slotDraft: baselineSlotDraftRef.current,
            location: baselineLocationRef.current,
          });
        }
      } catch {
        if (current) setAvailabilityLoadError(true);
      } finally {
        if (current) setAvailabilityLoading(false);
      }
    };
    if (user?.id) void fetchAvailability();
    else setAvailabilityLoading(false);
    return () => { current = false; };
  }, [user?.id, availabilityReloadKey]);

  useEffect(() => {
    let current = true;
    setLocationLoadError(false);
    // Clear personal travel details before loading a different account.
    setRawLocationForm({
      streetAddress: '', suburb: '', state: '', postcode: '', openToTravel: false,
      travelStates: [], latitude: null, longitude: null, googlePlaceId: '', coverageRadiusKm: 30,
    });
    const fetchLocation = async () => {
      if (!onboardingRole || !user?.id) return;
      await controller.loadInitialLocation({
        onboardingRole,
        fetchService: getOnboarding as any,
        onLoaded: (onboarding) => {
          if (!current) return;
          setLocationLoaded(true);
          setLocationLoadError(false);
          const loadedLocation: LocationFormState = {
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
          };
          setRawLocationForm(loadedLocation);
          baselineLocationRef.current = loadedLocation;
          markCleanRef.current({
            slotDraft: baselineSlotDraftRef.current,
            location: loadedLocation,
          });
        },
        onError: () => {
          if (current) {
            setLocationLoadError(true);
            showSnackbar('Failed to load location from onboarding', 'error');
          }
        },
      });
    };
    void fetchLocation();
    return () => { current = false; };
  }, [onboardingRole, user?.id, locationReloadKey, controller]);

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
      latitude: place.latitude ?? null,
      longitude: place.longitude ?? null,
      googlePlaceId: place.place_id || '',
    }));
  };

  const handleSaveLocation = async () => {
    if (!onboardingRole || controller.isBusy) return;
    locationSaveInFlightRef.current = true;
    setSavingLocation(true);
    const savedRevision = locationEditRevision.current;
    await controller.saveLocation({
      form: locationForm,
      onboardingRole,
      updateService: updateOnboardingForm as any,
      onSuccess: () => {
        showSnackbar('Location updated', 'success');
        baselineLocationRef.current = locationForm;
        if (locationEditRevision.current !== savedRevision) controller.markLocationDirty();
        else controller.clearLocationDirty();
        markCleanRef.current({
          slotDraft: baselineSlotDraftRef.current,
          location: locationForm,
        });
      },
      onError: (msg) => {
        showSnackbar(msg || 'Failed to update location', 'error');
      },
    });
    locationSaveInFlightRef.current = false;
    setSavingLocation(false);
  };

  const handleAddEntry = async () => {
    if (controller.isBusy) return;
    setLoading(true);
    await controller.addSlots({
      draft: currentEntry,
      selectedDates,
      notifyNewShifts,
      currentEntries: availabilityEntries,
      createService: createUserAvailabilityService as any,
      refreshService: fetchUserAvailabilityService as any,
      onSuccess: (_saved, authoritative) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setAvailabilityEntries(authoritative);
        const cleanEntry = createEmptyEntry();
        setCurrentEntry(cleanEntry);
        setSelectedDates([]);
        showSnackbar('Time slots saved', 'success');
        const cleanSlot = {
          currentEntry: cleanEntry,
          selectedDates: [],
          notifyNewShifts,
        };
        baselineSlotDraftRef.current = cleanSlot;
        notificationEditedRef.current = false;
        markCleanRef.current({
          slotDraft: cleanSlot,
          location: baselineLocationRef.current,
        });
      },
      onPartialRetry: (remainingDates, authoritative, savedCount, totalCount) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setAvailabilityEntries(authoritative);
        setSelectedDates(remainingDates);
        setCurrentEntry((previous) => ({ ...previous, date: remainingDates[0] || '' }));
        showSnackbar(`${savedCount} of ${totalCount} time slots saved. Review remaining dates and retry.`, 'error');
      },
      onReconcileFailure: () => {
        setAvailabilityLoadError(true);
        showSnackbar('Reconciliation failed. Please reload before adding slots.', 'error');
      },
      onAlreadySaved: () => {
        const cleanEntry = createEmptyEntry();
        setCurrentEntry(cleanEntry);
        setSelectedDates([]);
        showSnackbar('These time slots are already saved', 'success');
        const cleanSlot = {
          currentEntry: cleanEntry,
          selectedDates: [],
          notifyNewShifts,
        };
        baselineSlotDraftRef.current = cleanSlot;
        notificationEditedRef.current = false;
        markCleanRef.current({
          slotDraft: cleanSlot,
          location: baselineLocationRef.current,
        });
      },
      onError: (msg) => {
        showSnackbar(msg, 'error');
      },
    });
    setLoading(false);
  };

  const handleRequestDelete = (item: AvailabilityEntry) => {
    if (deleting || isBusy || controller.isBusy) return;
    const token = nextDeleteTokenRef.current++;
    setPendingDeleteTarget({
      token,
      id: item.id,
      generation: controller.currentGeneration,
      accountKey,
      slot: item,
    });
  };

  const handleCancelDelete = () => {
    if (deleting || controller.isBusy || confirmingRef.current) return;
    setPendingDeleteTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteTarget || deleting || isBusy || controller.isBusy || confirmingRef.current) return;
    if (consumedDeleteTokensRef.current.has(pendingDeleteTarget.token)) return;
    confirmingRef.current = true;
    consumedDeleteTokensRef.current.add(pendingDeleteTarget.token);
    const target = pendingDeleteTarget;

    // Safety checks:
    // 1. Account generation and account key match captured values
    if (target.accountKey !== accountKey || target.generation !== controller.currentGeneration) {
      setPendingDeleteTarget(null);
      confirmingRef.current = false;
      return;
    }

    // 2. Target slot ID must still exist in current rows (never delete by list index or a substituted row)
    const targetStillExists = availabilityEntries.some((e) => e.id === target.id);
    if (!targetStillExists) {
      setPendingDeleteTarget(null);
      confirmingRef.current = false;
      return;
    }

    const generation = controller.currentGeneration;
    setDeleting(true);
    try {
      await controller.deleteSlot({
        id: target.id,
        deleteService: deleteUserAvailabilityService as any,
        onSuccess: () => {
          if (controller.currentAccountKey !== accountKey || controller.currentGeneration !== generation) return;
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setAvailabilityEntries((prev) => prev.filter((e) => e.id !== target.id));
          showSnackbar('Slot deleted', 'success');
        },
        onError: () => {
          if (controller.currentAccountKey !== accountKey || controller.currentGeneration !== generation) return;
          showSnackbar('Failed to delete slot', 'error');
          setAvailabilityReloadKey((v) => v + 1);
        },
      });
    } finally {
      confirmingRef.current = false;
      if (controller.currentGeneration === generation && controller.currentAccountKey === accountKey) {
        setDeleting(false);
        setPendingDeleteTarget(null);
      }
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
      recurringEndDate: prev.isRecurring ? prev.recurringEndDate || sorted[sorted.length - 1] || '' : prev.recurringEndDate,
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
        recurringEndDate: prev.isRecurring ? prev.recurringEndDate || sorted[sorted.length - 1] || '' : prev.recurringEndDate,
      }));
      return sorted;
    });
  };
  const getCalendarDateFromTouch = (pageX: number, pageY: number) => {
    const start = calendarDrag.current;
    const { width, height } = calendarGridSize.current;
    if (!start || !width || !height) return null;
    const x = start.x + pageX - start.pageX;
    const y = start.y + pageY - start.pageY;
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    const column = Math.floor(x / (width / 7));
    const row = Math.floor(y / (height / (monthCalendarCells.length / 7)));
    const cell = monthCalendarCells[row * 7 + column];
    return cell?.inMonth ? cell.iso : null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="headlineMedium" style={styles.title}>Set Your Availability</Text>
        <Text style={styles.scopeDescription}>Availability dates are managed here; public Talent posts are published separately.</Text>
        {availabilityLoading ? <BrandLoader size={24} accessibilityLabel="Loading your saved availability…" /> : null}
        {availabilityLoadError ? (
          <Surface style={styles.card} elevation={0}>
            <Text style={styles.hint}>Saved availability could not be loaded. Please retry before making changes.</Text>
            <Button mode="outlined" onPress={() => setAvailabilityReloadKey((v) => v + 1)}>Retry availability</Button>
          </Surface>
        ) : null}

        <Surface style={styles.card} elevation={2}>
          <Text style={styles.sectionTitle}>Add dates</Text>

          <View style={styles.modeRow}>
            <Button
              mode={!currentEntry.isRecurring ? 'contained' : 'outlined'}
              disabled={loading}
              onPress={() => setCurrentEntry((p) => ({ ...p, isRecurring: false, recurringDays: [], recurringEndDate: '' }))}
              style={styles.modeButton}
            >
              Specific dates
            </Button>
            <Button
              mode={currentEntry.isRecurring ? 'contained' : 'outlined'}
              disabled={loading}
              onPress={() => setCurrentEntry((p) => ({ ...p, isRecurring: true, recurringDays: [], recurringEndDate: p.recurringEndDate || selectedDates[selectedDates.length - 1] || '' }))}
              style={styles.modeButton}
            >
              Repeating
            </Button>
          </View>
          <Text style={styles.modeDescription}>
            {currentEntry.isRecurring
              ? 'Select a start date on the calendar or type below, set the end date below, then choose repeating weekdays.'
              : 'Select dates on the calendar or type below. Tap again to deselect, or drag across dates to select multiple days.'}
          </Text>

          <Surface style={styles.calendarPanel} elevation={0}>
            <View style={styles.calendarHeader}>
              <IconButton icon="chevron-left" size={22} style={styles.iconButton44} disabled={loading} accessibilityLabel="Previous month" onPress={() => setCalendarMonthAnchor((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))} />
              <Text style={styles.calendarTitle}>{monthLabel}</Text>
              <IconButton icon="chevron-right" size={22} style={styles.iconButton44} disabled={loading} accessibilityLabel="Next month" onPress={() => setCalendarMonthAnchor((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))} />
            </View>
            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}><View style={[styles.legendBox, styles.calendarCellSelected]} /><Text style={styles.legendText}>Selected</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendBox, styles.calendarCellSaved]} /><Text style={styles.legendText}>Saved</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendBox, styles.calendarCellRecurring]} /><Text style={styles.legendText}>Repeats</Text></View>
            </View>
            <View style={styles.calendarWeekHead}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, idx) => (
                <Text key={`${d}-${idx}`} style={styles.calendarWeekText}>{d}</Text>
              ))}
            </View>
            <View
              style={styles.calendarGrid}
              onLayout={(event) => { calendarGridSize.current = event.nativeEvent.layout; }}
              onStartShouldSetResponder={() => false}
              onMoveShouldSetResponderCapture={(event) => {
                const start = calendarDrag.current;
                if (loading || !start) return false;
                const dx = Math.abs(event.nativeEvent.pageX - start.pageX);
                const dy = Math.abs(event.nativeEvent.pageY - start.pageY);
                // Claim a sideways drag; leave ordinary vertical swipes to the ScrollView.
                return dx > 8 && dx > dy;
              }}
              onResponderGrant={(event) => {
                if (loading || !calendarDrag.current) return;
                addCalendarDate(calendarDrag.current.date);
                const date = getCalendarDateFromTouch(event.nativeEvent.pageX, event.nativeEvent.pageY);
                if (date) addCalendarDate(date);
              }}
              onResponderMove={(event) => {
                if (loading) return;
                const date = getCalendarDateFromTouch(event.nativeEvent.pageX, event.nativeEvent.pageY);
                if (date) addCalendarDate(date);
              }}
              onResponderRelease={() => { calendarDrag.current = null; }}
              onResponderTerminate={() => { calendarDrag.current = null; }}
              onTouchEnd={() => { calendarDrag.current = null; }}
              onTouchCancel={() => { calendarDrag.current = null; }}
            >
              {monthCalendarCells.map((cell, idx) => {
                if (!cell.inMonth) return <View key={`${cell.iso}-${idx}`} style={[styles.calendarCell, styles.calendarCellPad]} />;
                const isSelected = selectedDateSet.has(cell.iso);
                const isSaved = savedAvailabilityDateSet.has(cell.iso);
                const recurringPreview = recurringPreviewDateSet.has(cell.iso);
                return (
                  <Pressable
                    key={`${cell.iso}-${idx}`}
                    disabled={loading}
                    onPress={() => { calendarDrag.current = null; toggleCalendarDate(cell.iso); }}
                    onPressIn={(event) => {
                      const { pageX, pageY, locationX, locationY } = event.nativeEvent;
                      const { width, height } = calendarGridSize.current;
                      calendarDrag.current = {
                        date: cell.iso, pageX, pageY,
                        x: (idx % 7) * width / 7 + locationX,
                        y: Math.floor(idx / 7) * height / (monthCalendarCells.length / 7) + locationY,
                      };
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={getCellA11y(cell.iso, isSelected, isSaved, recurringPreview)}
                    style={[
                      styles.calendarCell,
                      isSaved && styles.calendarCellSaved,
                      recurringPreview && styles.calendarCellRecurring,
                      isSelected && styles.calendarCellSelected,
                    ]}
                  >
                    <Text style={[styles.calendarCellText, recurringPreview && styles.calendarCellTextRecurring, isSelected && styles.calendarCellTextSelected]}>{cell.day}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Surface>

          <View style={styles.row2}>
            <TextInput
              mode="outlined"
              label={currentEntry.isRecurring ? 'Start date' : 'Date'}
              value={currentEntry.date || ''}
              editable={!loading}
              onChangeText={(text) => {
                const trimmed = text.trim();
                setCurrentEntry((p) => ({ ...p, date: trimmed }));
                if (isValidIsoDate(trimmed)) {
                  setSelectedDates([trimmed]);
                } else {
                  setSelectedDates([]);
                }
              }}
              placeholder="YYYY-MM-DD"
              style={[styles.input, styles.flex]}
              outlineStyle={styles.inputOutline}
            />
            {currentEntry.isRecurring ? (
              <TextInput
                mode="outlined"
                label="End Date"
                editable={!loading}
                value={currentEntry.recurringEndDate || ''}
                onChangeText={(v) => setCurrentEntry((p) => ({ ...p, recurringEndDate: v.trim() }))}
                placeholder="YYYY-MM-DD"
                style={[styles.input, styles.flex]}
                outlineStyle={styles.inputOutline}
              />
            ) : null}
          </View>
          {currentEntry.isRecurring && isValidIsoDate(currentEntry.date) && isValidIsoDate(currentEntry.recurringEndDate || '') && currentEntry.recurringEndDate! < currentEntry.date ? (
            <HelperText type="error" visible>Repeat end must be on or after the start date</HelperText>
          ) : null}
          {selectedDates.length > 0 ? (
            <View style={styles.selectionSummaryRow}>
              <Text style={styles.hint}>{selectedDates.length === 1 ? '1 date selected' : `${selectedDates.length} dates selected`}</Text>
              <Button compact mode="text" disabled={loading} onPress={() => syncSelectedDates([])} accessibilityLabel="Clear selected dates">Clear</Button>
            </View>
          ) : null}
          {currentEntry.isRecurring && (currentEntry.date || currentEntry.recurringEndDate) ? (
            <Text style={styles.hint}>{`Repeating from ${currentEntry.date || 'start'} to ${currentEntry.recurringEndDate || 'end'}`}</Text>
          ) : null}

          {currentEntry.isRecurring ? (
            <View style={styles.chipWrap}>
              {weekDays.map((d) => {
                const selected = currentEntry.recurringDays.includes(d.value);
                return (
                  <Chip key={d.value} selected={selected} disabled={loading} onPress={() => toggleRecurringDay(d.value)} style={selected ? styles.chipSelected : styles.chip} textStyle={selected ? styles.chipSelectedText : styles.chipText}>
                    {d.label}
                  </Chip>
                );
              })}
            </View>
          ) : null}

          <Pressable
            style={styles.checkboxRow}
            disabled={loading || isBusy}
            onPress={() =>
              setCurrentEntry((prev) => ({
                ...prev,
                isAllDay: !prev.isAllDay,
                startTime: !prev.isAllDay ? '00:00' : '09:00',
                endTime: !prev.isAllDay ? '23:59' : '17:00',
              }))
            }
            accessibilityRole="checkbox"
            accessibilityState={{ checked: currentEntry.isAllDay, disabled: loading || isBusy }}
            accessibilityLabel="All Day"
          >
            <View pointerEvents="none">
              <Checkbox status={currentEntry.isAllDay ? 'checked' : 'unchecked'} disabled={loading || isBusy} />
            </View>
            <Text style={styles.rowText}>All Day</Text>
          </Pressable>

          <View style={styles.row2}>
            <TextInput mode="outlined" label="Start Time" value={currentEntry.startTime} editable={!loading && !currentEntry.isAllDay} disabled={currentEntry.isAllDay} onChangeText={(v) => setCurrentEntry((p) => ({ ...p, startTime: v }))} style={[styles.input, styles.flex]} outlineStyle={styles.inputOutline} />
            <TextInput mode="outlined" label="End Time" value={currentEntry.endTime} editable={!loading && !currentEntry.isAllDay} disabled={currentEntry.isAllDay} onChangeText={(v) => setCurrentEntry((p) => ({ ...p, endTime: v }))} style={[styles.input, styles.flex]} outlineStyle={styles.inputOutline} />
          </View>
          <HelperText type="info" style={styles.helperText}>Use HH:MM format, e.g. 09:00</HelperText>

          <TextInput mode="outlined" label="Notes" multiline numberOfLines={3} value={currentEntry.notes || ''} editable={!loading} onChangeText={(v) => setCurrentEntry((p) => ({ ...p, notes: v }))} style={styles.input} outlineStyle={styles.inputOutline} />

          <Button mode="contained" onPress={handleAddEntry} disabled={isBusy || availabilityLoading || availabilityLoadError} loading={loading} style={styles.primaryButton} labelStyle={styles.primaryButtonLabel}>
            Add Time Slot
          </Button>
        </Surface>

        <Surface style={styles.notifyCard} elevation={1}>
          <Pressable
            style={styles.checkboxRowPlain}
            disabled={loading || isBusy}
            onPress={() => {
              notificationEditedRef.current = true;
              setNotifyNewShifts((v) => !v);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: notifyNewShifts, disabled: loading || isBusy }}
            accessibilityLabel="Notify me when new public shifts match my availability"
          >
            <View pointerEvents="none">
              <Checkbox status={notifyNewShifts ? 'checked' : 'unchecked'} disabled={loading || isBusy} />
            </View>
            <Text style={styles.rowText}>Notify me when new public shifts match my availability</Text>
          </Pressable>
          <Text style={styles.notifyDescription}>
            By checking this box, you will get an instant notification when a public shift matches any availability dates and times you add.
          </Text>
        </Surface>

        <Text style={styles.sectionTitle}>Your Time Slots</Text>
        {availabilityLoading ? (
          <BrandLoader size={24} accessibilityLabel="Loading saved time slots…" />
        ) : availabilityLoadError ? (
          <Text style={styles.empty}>Unable to show saved time slots until the request succeeds.</Text>
        ) : availabilityEntries.length === 0 ? (
          <Text style={styles.empty}>No time slots added yet.</Text>
        ) : (
          availabilityEntries.map((item) => (
            <Surface key={item.id} style={styles.slotItem} elevation={1}>
              <View style={styles.flex}>
                <Text style={styles.slotTitle}>{`${item.date} - ${item.isAllDay ? 'All Day' : `${item.startTime}-${item.endTime}`}`}</Text>
                {item.isRecurring ? (
                  <Text style={styles.slotMeta}>{`Repeats on ${(item.recurringDays || []).map((d) => weekDays[d]?.label || '').filter(Boolean).join(', ')} until ${item.recurringEndDate}`}</Text>
                ) : null}
                {item.notifyNewShifts ? <Text style={[styles.slotMeta, styles.slotMetaSuccess]}>Notifications on for matching public shifts</Text> : null}
                {item.notes ? <Text style={styles.slotMeta}>{item.notes}</Text> : null}
              </View>
              <Button
                testID={`availability-slot-delete-${item.id}`}
                textColor="#DC2626"
                disabled={isBusy || controller.isBusy || Boolean(pendingDeleteTarget)}
                accessibilityLabel={`Delete ${item.isRecurring ? 'repeating ' : ''}slot ${item.date || ''} ${item.isAllDay ? 'All Day' : `${item.startTime}-${item.endTime}`}`}
                onPress={() => handleRequestDelete(item)}
              >
                Delete
              </Button>
            </Surface>
          ))
        )}

        <Surface style={styles.card} elevation={2}>
          <Pressable
            onPress={() => setLocationExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={`Location and travel settings: ${locationSummary}. Tap to ${locationExpanded ? 'collapse' : 'expand'}`}
            style={styles.locationHeaderRow}
          >
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>Location & Travel</Text>
              <Text style={styles.hint}>{locationSummary}</Text>
            </View>
            <IconButton icon={locationExpanded ? 'chevron-up' : 'chevron-down'} size={24} style={styles.iconButton44} disabled accessible={false} pointerEvents="none" />
          </Pressable>

          {locationExpanded ? (
            !locationLoaded ? (
              locationLoadError ? (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.hint, { color: '#DC2626' }]}>Failed to load location.</Text>
                  <Button mode="outlined" onPress={() => setLocationReloadKey((k) => k + 1)}>Retry location load</Button>
                </View>
              ) : (
                <BrandLoader size={24} accessibilityLabel="Loading saved location…" />
              )
            ) : (
              <>
                <View style={{ minHeight: 56 }}>
                  {Platform.OS !== 'web' ? (
                    <GooglePlacesInput
                      label="Address"
                      value={locationForm.streetAddress}
                      onPlaceSelected={handleNativePlaceSelected}
                      onChangeText={(streetAddress) => setLocationForm((p) => manualAddressEdit(p, 'streetAddress', streetAddress))}
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
                            : 'Map unavailable. You can still type your address.'}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : null}

                <TextInput
                  mode="outlined"
                  label="Suburb"
                  editable={!savingLocation && !isBusy}
                  value={locationForm.suburb}
                  onChangeText={(v) => setLocationForm((p) => manualAddressEdit(p, 'suburb', v))}
                  style={styles.input}
                  outlineStyle={styles.inputOutline}
                />
                <View style={styles.row2}>
                  <TextInput
                    mode="outlined"
                    label="State"
                    editable={!savingLocation && !isBusy}
                    value={locationForm.state}
                    onChangeText={(v) => setLocationForm((p) => manualAddressEdit(p, 'state', v))}
                    style={[styles.input, styles.flex]}
                    outlineStyle={styles.inputOutline}
                  />
                  <TextInput
                    mode="outlined"
                    label="Postcode"
                    editable={!savingLocation && !isBusy}
                    value={locationForm.postcode}
                    onChangeText={(v) => setLocationForm((p) => manualAddressEdit(p, 'postcode', v))}
                    style={[styles.input, styles.flex]}
                    outlineStyle={styles.inputOutline}
                  />
                </View>

                <Menu
                  visible={radiusMenuVisible}
                  onDismiss={() => setRadiusMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setRadiusMenuVisible(true)}
                      disabled={locationForm.openToTravel || savingLocation || isBusy}
                      style={styles.outlineButton}
                    >
                      {`Work Travel Radius: ${locationForm.coverageRadiusKm} km`}
                    </Button>
                  }
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

                <Pressable
                  style={styles.checkboxRow}
                  disabled={savingLocation || isBusy}
                  onPress={() =>
                    setLocationForm((p) => ({
                      ...p,
                      openToTravel: !p.openToTravel,
                      travelStates: !p.openToTravel ? p.travelStates : [],
                    }))
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: locationForm.openToTravel, disabled: savingLocation || isBusy }}
                  accessibilityLabel="Willing to travel or regional"
                >
                  <View pointerEvents="none">
                    <Checkbox
                      status={locationForm.openToTravel ? 'checked' : 'unchecked'}
                      disabled={savingLocation || isBusy}
                    />
                  </View>
                  <Text style={styles.rowText}>Willing to travel/Regional</Text>
                </Pressable>

                {locationForm.openToTravel ? (
                  <Menu
                    visible={travelMenuVisible}
                    onDismiss={() => setTravelMenuVisible(false)}
                    anchor={
                      <Button
                        mode="outlined"
                        onPress={() => setTravelMenuVisible(true)}
                        disabled={savingLocation || isBusy}
                        style={styles.outlineButton}
                      >
                        {`Travel States: ${locationForm.travelStates.join(', ') || 'Select'}`}
                      </Button>
                    }
                  >
                    {stateOptions.map((st) => {
                      const selected = locationForm.travelStates.includes(st);
                      return (
                        <Checkbox.Item
                          key={st}
                          label={st}
                          status={selected ? 'checked' : 'unchecked'}
                          disabled={savingLocation || isBusy}
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

                <Button
                  mode="outlined"
                  onPress={handleSaveLocation}
                  disabled={savingLocation || !onboardingRole || !locationLoaded || locationLoadError || isBusy}
                  loading={savingLocation}
                  style={styles.outlineButton}
                >
                  Save Location
                </Button>
              </>
            )
          ) : null}
        </Surface>
      </ScrollView>

      <ConfirmDialog
        open={Boolean(pendingDeleteTarget)}
        title="Delete availability slot?"
        body={
          pendingDeleteTarget?.slot
            ? `Are you sure you want to delete this availability slot?\n\n${formatSlotEnAuDate(pendingDeleteTarget.slot.date)} · ${
                pendingDeleteTarget.slot.isAllDay
                  ? 'All Day'
                  : `${pendingDeleteTarget.slot.startTime} – ${pendingDeleteTarget.slot.endTime}`
              }${
                pendingDeleteTarget.slot.isRecurring
                  ? `\nRepeats on ${(pendingDeleteTarget.slot.recurringDays || []).map((d) => weekDays[d]?.label || '').filter(Boolean).join(', ')}${
                      pendingDeleteTarget.slot.recurringEndDate ? ` until ${formatSlotEnAuDate(pendingDeleteTarget.slot.recurringEndDate)}` : ''
                    }`
                  : ''
              }`
            : ''
        }
        confirmLabel="Delete this slot"
        confirmTestID="availability-delete-confirm"
        busyLabel="Deleting…"
        busy={deleting || controller.isBusy}
        destructive
        onConfirm={handleConfirmDelete}
        onClose={handleCancelDelete}
      />

      <Snackbar visible={snackbarOpen} onDismiss={() => setSnackbarOpen(false)} duration={4000}>
        <Text style={{ color: snackbarSeverity === 'error' ? '#FCA5A5' : '#86EFAC' }}>{snackbarMsg}</Text>
      </Snackbar>
    </SafeAreaView>
  );
}

export default function SetAvailabilityScreen() {
  const { user } = useAuth();
  const accountKey = `${user?.id ?? 'anon'}:${user?.role ?? 'norole'}`;
  return <SetAvailabilityInner key={accountKey} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FF' },
  content: { paddingHorizontal: 16, paddingVertical: 14, gap: 14, paddingBottom: 32 },
  title: { fontWeight: '900', color: DNA.ink, letterSpacing: -0.4 },
  scopeDescription: { color: DNA.muted, fontSize: 14, fontWeight: '400', lineHeight: 20 },
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
  locationHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  notifyCard: {
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 4,
  },
  notifyDescription: { color: DNA.muted, fontSize: 14, fontWeight: '400', paddingLeft: 42 },
  row2: { flexDirection: 'row', gap: 8 },
  modeRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignSelf: 'center', maxWidth: 560 },
  modeButton: { flex: 1, borderRadius: 14 },
  modeDescription: { color: DNA.muted, fontSize: 14, fontWeight: '400', textAlign: 'center', alignSelf: 'center', maxWidth: 560 },
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
    minHeight: 44,
  },
  checkboxRowPlain: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  rowText: { color: DNA.ink, flexShrink: 1, fontWeight: '700' },
  checkboxItem: { paddingVertical: 0 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F3F6FD', minHeight: 44, justifyContent: 'center' },
  chipSelected: { backgroundColor: '#EDE9FE', minHeight: 44, justifyContent: 'center' },
  chipText: { color: DNA.ink, fontWeight: '700' },
  chipSelectedText: { color: DNA.violet, fontWeight: '900' },
  empty: { color: DNA.muted, fontWeight: '700', fontSize: 14 },
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
    padding: 12,
  },
  calendarPanel: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 0,
    minWidth: 310,
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    shadowColor: '#06123A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
  },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  calendarTitle: { fontWeight: '800', color: DNA.ink },
  calendarLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingVertical: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBox: { width: 14, height: 14, borderRadius: 4 },
  legendText: { fontSize: 14, color: DNA.muted, fontWeight: '400' },
  calendarWeekHead: { flexDirection: 'row', paddingHorizontal: 0, marginBottom: 4 },
  calendarWeekText: { width: `${100 / 7}%`, textAlign: 'center', color: DNA.muted, fontSize: 12, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: `${100 / 7}%`,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calendarCellPad: { opacity: 0 },
  calendarCellSaved: { borderColor: '#A5B4FC', borderWidth: 2 },
  calendarCellRecurring: { backgroundColor: '#DCFCE7' },
  calendarCellSelected: { backgroundColor: DNA.blue },
  calendarCellText: { color: DNA.ink, fontWeight: '700' },
  calendarCellTextRecurring: { color: '#166534', fontWeight: '900' },
  calendarCellTextSelected: { color: '#FFFFFF', fontWeight: '900' },
  hint: { color: DNA.muted, fontSize: 14, fontWeight: '400' },
  helperText: { fontSize: 14, fontWeight: '400' },
  selectionSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  iconButton44: { minWidth: 44, minHeight: 44, margin: 0, justifyContent: 'center', alignItems: 'center' },
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
