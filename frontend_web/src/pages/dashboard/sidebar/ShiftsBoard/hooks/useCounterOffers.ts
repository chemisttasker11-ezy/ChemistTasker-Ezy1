import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
  Shift,
  ShiftCounterOfferPayload,
  calculateShiftRates,
  fetchShiftCounterOffersService,
  getOnboardingDetail,
  storageGetItem,
  storageSetItem,
} from '@chemisttasker/shared-core';
import {
  COUNTER_OFFER_STORAGE_KEY,
  COUNTER_OFFER_TRAVEL_AUTOCOMPLETE_ID,
  EMPTY_TRAVEL_LOCATION,
} from '../constants';
import {
  CounterOfferFormSlot,
  CounterOfferTrack,
  RatePreference,
  ShiftCounterOfferSlotPayloadWithDate,
  ShiftSlot,
  TravelLocation,
} from '../types';
import { normalizeCounterOffers } from '../utils/counterOffers';
import { formatDateLong } from '../utils/date';
import { formatTravelLocation, normalizeOnboardingLocation } from '../utils/location';
import { getSlotRate } from '../utils/rates';
import { getUpcomingSlotsForDisplay, getShiftNegotiable } from '../utils/shift';

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getOfferUserId = (offer: any): number | null => {
  const raw = typeof offer?.user === 'object' && offer.user !== null ? offer.user.id : offer?.user;
  return toFiniteNumber(raw ?? offer?.userId ?? offer?.user_id);
};

const getOfferSlotId = (slot: any): number | null =>
  toFiniteNumber(slot?.slotId ?? slot?.slot_id ?? slot?.slot?.id ?? slot?.slot);

const getOfferSlots = (offer: any): any[] =>
  Array.isArray(offer?.slots) ? offer.slots : [];

const offerHasValidSlots = (offer: any): boolean =>
  getOfferSlots(offer).some((slot) => getOfferSlotId(slot) != null);

type UseCounterOffersParams = {
  shifts: Shift[];
  userRole?: string | null;
  pharmacistRatePref?: RatePreference;
  hideCounterOffer?: boolean;
  onSubmitCounterOffer?: (payload: ShiftCounterOfferPayload) => Promise<void> | void;
  onPageChange?: (page: number) => void;
  page?: number;
  clearSelection: (shiftId: number) => void;
  setAppliedShiftIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setAppliedSlotIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  refreshShifts: () => Promise<void> | void;
  currentUserId: number | null;
  disableLocalPersistence?: boolean;
};

export const useCounterOffers = ({
  shifts,
  userRole,
  pharmacistRatePref,
  hideCounterOffer,
  onSubmitCounterOffer,
  onPageChange,
  page,
  clearSelection,
  setAppliedShiftIds,
  setAppliedSlotIds,
  refreshShifts,
  currentUserId,
  disableLocalPersistence,
}: UseCounterOffersParams) => {
  const [counterOffers, setCounterOffers] = useState<Record<number, CounterOfferTrack>>({});
  const [counterSubmitting, setCounterSubmitting] = useState(false);
  const [reviewOfferShiftId, setReviewOfferShiftId] = useState<number | null>(null);
  const [reviewOffers, setReviewOffers] = useState<any[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const travelAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [counterOfferOpen, setCounterOfferOpen] = useState(false);
  const [counterOfferShift, setCounterOfferShift] = useState<Shift | null>(null);
  const [counterOfferSlots, setCounterOfferSlots] = useState<CounterOfferFormSlot[]>([]);
  const [counterOfferTravel, setCounterOfferTravel] = useState(false);
  const [counterOfferTravelLocation, setCounterOfferTravelLocation] = useState<TravelLocation>(EMPTY_TRAVEL_LOCATION);
  const [counterOfferError, setCounterOfferError] = useState<string | null>(null);

  const persistCounterOffers = (data: Record<number, CounterOfferTrack>) =>
    storageSetItem(COUNTER_OFFER_STORAGE_KEY, JSON.stringify(data)).catch(() => null);

  const hasCounterOfferTravelLocation = useMemo(() => {
    const { googlePlaceId, streetAddress, suburb, state, postcode } = counterOfferTravelLocation;
    return Boolean(googlePlaceId || streetAddress || suburb || state || postcode);
  }, [counterOfferTravelLocation]);

  // hydrate counter offers
  useEffect(() => {
    (async () => {
      try {
        const counters = await storageGetItem(COUNTER_OFFER_STORAGE_KEY);
        if (counters) {
          const normalized = normalizeCounterOffers(JSON.parse(counters));
          setCounterOffers(normalized);
          persistCounterOffers(normalized); // rewrite malformed payloads in normalized form
        }
      } catch {}
      setIsHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    // Persist counter offers regardless of disableLocalPersistence so badges stay after refresh.
    persistCounterOffers(counterOffers);
  }, [counterOffers, isHydrated]);

  // Drop local caches for shifts that no longer exist in the latest list
  useEffect(() => {
    if (!isHydrated) return;
    const liveIds = new Set(shifts.map((s) => s.id));
    setCounterOffers((prev) => {
      const next: Record<number, CounterOfferTrack> = {};
      Object.entries(prev).forEach(([idStr, data]) => {
        const id = Number(idStr);
        if (liveIds.has(id)) {
          next[id] = data;
        }
      });
      persistCounterOffers(next);
      return next;
    });
  }, [shifts, isHydrated]);

  // Whenever shifts change (e.g., after server refetch), wipe any locally persisted state for IDs that disappeared.
  useEffect(() => {
    if (!isHydrated) return;
    const liveIds = new Set(shifts.map((s) => s.id));
    if (!disableLocalPersistence) {
      const nextCounters: Record<number, CounterOfferTrack> = {};
      Object.entries(counterOffers).forEach(([idStr, data]) => {
        const id = Number(idStr);
        if (liveIds.has(id)) nextCounters[id] = data;
      });
      persistCounterOffers(nextCounters);
    }
  }, [shifts, isHydrated, disableLocalPersistence, counterOffers]);

  // Fetch fresh offers when opening review dialog so we show full slot details and multiple offers.
  useEffect(() => {
    const load = async () => {
      if (reviewOfferShiftId == null) {
        setReviewOffers([]);
        return;
      }
      setReviewOffers([]); // clear stale data while loading another shift
      setReviewLoading(true);
      try {
        const remote = await fetchShiftCounterOffersService(reviewOfferShiftId);
        let offers = Array.isArray(remote) ? remote : [];
        // Candidates should only see their own offers; filter defensively.
        if (currentUserId != null) {
          offers = offers.filter((o: any) => getOfferUserId(o) === currentUserId);
        }
        offers = offers.filter(offerHasValidSlots);
        // Show latest first
        offers.sort((a: any, b: any) => {
          const aT = new Date(a.createdAt || a.created_at || a.updatedAt || a.updated_at || 0).getTime();
          const bT = new Date(b.createdAt || b.created_at || b.updatedAt || b.updated_at || 0).getTime();
          return bT - aT;
        });
        setReviewOffers(offers);
        if (offers.length === 0) {
          setCounterOffers((prev) => {
            if (!prev[reviewOfferShiftId]) return prev;
            const next = { ...prev };
            delete next[reviewOfferShiftId];
            persistCounterOffers(next);
            return next;
          });
        }
      } catch (err) {
        console.warn('Failed to load counter offers for review', err);
        setReviewOffers([]);
      } finally {
        setReviewLoading(false);
      }
    };
    load();
  }, [reviewOfferShiftId, currentUserId]);

  // Reconcile local counter offers with backend data to avoid stale badges when offers are removed server-side.
  useEffect(() => {
    if (!isHydrated) return;
    const shiftIds = shifts.map((s) => s.id).filter((id) => Number.isFinite(id));
    const toFetch = shiftIds;
    if (toFetch.length === 0) return;

    const fetchCounters = async () => {
      const updates: Record<number, CounterOfferTrack> = {};
      for (const shiftId of toFetch) {
        try {
          const remote = await fetchShiftCounterOffersService(shiftId);
          const offers = currentUserId != null
            ? (remote || []).filter((offer: any) => getOfferUserId(offer) === currentUserId)
            : (remote || []);
          const validOffers = offers.filter(offerHasValidSlots);
          const slotsMap: Record<number, { rate: string; start: string; end: string }> = {};
          validOffers.forEach((offer: any) => {
            getOfferSlots(offer).forEach((slot: any) => {
              const slotId = getOfferSlotId(slot);
              if (slotId == null) return;
              slotsMap[slotId] = {
                rate: slot.proposedRate != null ? String(slot.proposedRate) : '',
                start: slot.proposedStartTime || slot.proposed_start_time || '',
                end: slot.proposedEndTime || slot.proposed_end_time || '',
              };
            });
          });
          const sentCount = Object.keys(slotsMap).length;
          if (sentCount > 0) {
            updates[shiftId] = {
              slots: { ...slotsMap },
              summary: `Counter offer sent (${sentCount} slot${sentCount > 1 ? 's' : ''})`,
            };
          }
        } catch (err) {
          console.warn('Failed to fetch counter offers for shift', shiftId, err);
        }
      }

      setCounterOffers((prev) => {
        const next = { ...prev };
        // Remove entries for shifts we fetched that have no remote offers
        toFetch.forEach((id) => {
          if (!updates[id]) {
            delete next[id];
          }
        });
        // Apply fresh data
        Object.entries(updates).forEach(([idStr, data]) => {
          next[Number(idStr)] = data;
        });
        persistCounterOffers(next);
        return next;
      });
    };

    fetchCounters();
  }, [shifts, isHydrated, currentUserId]);

  const openCounterOffer = async (shift: Shift, selectedSlots?: Set<number>) => {
    if (!onSubmitCounterOffer || hideCounterOffer) return;
    let ratePref = pharmacistRatePref;
    setCounterOfferTravelLocation(EMPTY_TRAVEL_LOCATION);
    if (userRole?.toUpperCase() === 'PHARMACIST') {
      try {
        const onboarding: any = await getOnboardingDetail('pharmacist');
        const fromOnboarding =
          onboarding?.rate_preference ||
          onboarding?.ratePreference ||
          (onboarding?.data ? onboarding.data.rate_preference || onboarding.data.ratePreference : undefined);
        if (!ratePref && fromOnboarding) {
          ratePref = fromOnboarding;
          console.log('Counter offer fetched rate preference from onboarding', fromOnboarding);
        }
        setCounterOfferTravelLocation(normalizeOnboardingLocation(onboarding));
      } catch (err) {
        console.warn('Failed to fetch onboarding details on counter-offer open', err);
      }
    }
    const baseSlots = shift.slots ?? [];
    const normalizedSlots = getUpcomingSlotsForDisplay(baseSlots as ShiftSlot[]);
    const slotIds = selectedSlots && selectedSlots.size > 0 ? selectedSlots : null;
    const slotsToUse = slotIds ? normalizedSlots.filter((slot) => slotIds.has(slot.id)) : normalizedSlots;

    const fallbackSlots: CounterOfferFormSlot[] =
      slotsToUse.length === 0
        ? [
            {
              slotId: undefined,
              dateLabel: shift.employmentType === 'FULL_TIME' ? 'Full-time schedule' : 'Part-time schedule',
              startTime: '',
              endTime: '',
              rate: '',
            },
          ]
        : [];

    setCounterOfferShift(shift);
    setCounterOfferTravel(false);
    setCounterOfferError(null);
    let calculatorRates: string[] | null = null;
    if (shift.rateType === 'PHARMACIST_PROVIDED' && ratePref) {
      try {
        const pharmacyId = (shift as any)?.pharmacyDetail?.id || (shift as any)?.pharmacy_detail?.id || (shift as any)?.pharmacy?.id;
        if (pharmacyId) {
          const payload = {
            pharmacyId,
            role: shift.roleNeeded || (shift as any).role_needed || (shift as any).roleLabel || 'PHARMACIST',
            employmentType: shift.employmentType || (shift as any).employment_type || 'LOCUM',
            rateType: shift.rateType || (shift as any).rate_type || 'PHARMACIST_PROVIDED',
            rate_weekday: ratePref.weekday,
            rate_saturday: ratePref.saturday,
            rate_sunday: ratePref.sunday,
            rate_public_holiday: ratePref.public_holiday,
            rate_early_morning: ratePref.early_morning,
            rate_late_night: ratePref.late_night,
            rate_early_morning_same_as_day: ratePref.early_morning_same_as_day,
            rate_late_night_same_as_day: ratePref.late_night_same_as_day,
            slots: slotsToUse.map((slot) => ({
              date: slot.date,
              startTime: (slot.startTime || '').slice(0, 5), // backend expects HH:MM
              endTime: (slot.endTime || '').slice(0, 5),
            })),
          };
          const calcResults: any[] = await calculateShiftRates(payload);
          if (Array.isArray(calcResults) && calcResults.length === slotsToUse.length) {
            calculatorRates = calcResults.map((r) => (r?.rate ? String(r.rate) : '0'));
            console.log('Counter offer calculator rates', calculatorRates);
          }
        }
      } catch (err) {
        console.warn('Counter offer calculateShiftRates failed', err);
      }
    }

    const mapped: CounterOfferFormSlot[] = slotsToUse.map((slot, idx) => {
      const derivedRate = calculatorRates
        ? Number(calculatorRates[idx] || 0)
        : getSlotRate(slot, shift, ratePref);
      console.log('Counter offer prefill', {
        slotId: slot.id,
        date: slot.date,
        start: slot.startTime,
        end: slot.endTime,
        rate_pref: ratePref,
        derivedRate,
      });
      return {
        slotId: slot.id,
        dateLabel: slot.date ? formatDateLong(slot.date) : `Slot ${slot.id ?? idx + 1}`,
        dateValue: slot.date,
        startTime: (slot.startTime || '').slice(0, 5),
        endTime: (slot.endTime || '').slice(0, 5),
        rate: derivedRate != null && Number.isFinite(derivedRate) ? String(derivedRate) : '',
      };
    });
    setCounterOfferSlots([...mapped, ...fallbackSlots]);
    setCounterOfferOpen(true);
  };

  const closeCounterOffer = () => {
    setCounterOfferOpen(false);
    if (counterOfferShift?.id != null) {
      clearSelection(counterOfferShift.id);
    }
    setCounterOfferShift(null);
    setCounterOfferSlots([]);
    setCounterOfferTravelLocation(EMPTY_TRAVEL_LOCATION);
    // Reload shifts on close to reflect any changes (e.g., new offer)
    onPageChange?.(page ?? 1);
  };

  const clearCounterOfferTravelLocation = () => {
    setCounterOfferTravelLocation(EMPTY_TRAVEL_LOCATION);
    const input = document.getElementById(COUNTER_OFFER_TRAVEL_AUTOCOMPLETE_ID) as HTMLInputElement | null;
    if (input) input.value = '';
  };

  const handleCounterOfferTravelPlaceChanged = () => {
    if (!travelAutocompleteRef.current) return;
    const place = travelAutocompleteRef.current.getPlace();
    if (!place || !place.address_components) return;

    let streetNumber = '';
    let route = '';
    let locality = '';
    let postalCode = '';
    let stateShort = '';

    place.address_components.forEach((component) => {
      const types = component.types;
      if (types.includes('street_number')) streetNumber = component.long_name;
      if (types.includes('route')) route = component.short_name;
      if (types.includes('locality')) locality = component.long_name;
      if (types.includes('postal_code')) postalCode = component.long_name;
      if (types.includes('administrative_area_level_1')) stateShort = component.short_name;
    });

    setCounterOfferTravelLocation({
      streetAddress: `${streetNumber} ${route}`.trim(),
      suburb: locality,
      postcode: postalCode,
      state: stateShort,
      googlePlaceId: place.place_id || '',
      latitude: place.geometry?.location ? place.geometry.location.lat() : null,
      longitude: place.geometry?.location ? place.geometry.location.lng() : null,
    });
  };

  const handleCounterSlotChange = (index: number, key: keyof CounterOfferFormSlot, value: string) => {
    setCounterOfferSlots((prev) =>
      prev.map((slot, idx) => (idx === index ? { ...slot, [key]: value } : slot))
    );
  };

  const handleSubmitCounterOffer = async () => {
    if (!counterOfferShift || !onSubmitCounterOffer) return;
    const canNegotiateRate = getShiftNegotiable(counterOfferShift);
    const slotOfferMap: Record<number, { rate: string; start: string; end: string }> = {};
    const hasRealSlots = (counterOfferShift.slots?.length ?? 0) > 0;
    const slotsToSendRaw = hasRealSlots
      ? counterOfferSlots.filter((slot) => slot.slotId != null)
      : counterOfferSlots;
    // Send every occurrence we collected (per slot/date); backend guards duplicates.
    const slotsToSend = slotsToSendRaw;

    if (slotsToSend.length === 0) {
      setCounterOfferError('This shift has no slots to attach a counter offer. Please contact the poster.');
      return;
    }

    // Deduplicate (slotId, slotDate) pairs to avoid backend duplicate validation errors.
    const dedupedSlots: CounterOfferFormSlot[] = [];
    const seenPairs = new Set<string>();
    slotsToSend.forEach((slot) => {
      const normalizedDate = slot.dateValue ? dayjs(slot.dateValue).format('YYYY-MM-DD') : '';
      const key = `${slot.slotId ?? 'none'}|${normalizedDate}`;
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      dedupedSlots.push({ ...slot, dateValue: normalizedDate || undefined });
    });

    if (slotsToSend.some((s) => !s.startTime || !s.endTime)) {
      setCounterOfferError('Start and end time are required.');
      return;
    }
    const payload: ShiftCounterOfferPayload = {
      shiftId: counterOfferShift.id,
      requestTravel: counterOfferTravel,
      travelOrigin: counterOfferTravel ? formatTravelLocation(counterOfferTravelLocation) : undefined,
      slots: dedupedSlots.map(
        (slot): ShiftCounterOfferSlotPayloadWithDate => ({
          slotId: slot.slotId != null ? (slot.slotId as number) : undefined,
          // Normalize to an ISO date string so recurring instances do not collapse into duplicates.
          slotDate: slot.dateValue ? dayjs(slot.dateValue).format('YYYY-MM-DD') : undefined,
          proposedStartTime: slot.startTime,
          proposedEndTime: slot.endTime,
          proposedRate: canNegotiateRate && slot.rate ? Number(slot.rate) : null,
        })
      ),
    };
    console.log('[ShiftsBoard] submit counter offer payload', payload);

    setCounterOfferError(null);
    setCounterSubmitting(true);
    try {
      await onSubmitCounterOffer(payload);
    } catch (err) {
      setCounterOfferError(err instanceof Error && err.message.trim().length > 0 ? err.message : 'Failed to submit counter offer.');
      setCounterSubmitting(false);
      return;
    }

    slotsToSend.forEach((slot) => {
      if (slot.slotId != null) {
        slotOfferMap[slot.slotId] = { rate: slot.rate, start: slot.startTime, end: slot.endTime };
      }
    });
    const sentCount = Object.keys(slotOfferMap).length;
    const updated = {
      ...counterOffers,
      [counterOfferShift.id]: {
        slots: slotOfferMap,
        summary: sentCount > 0 ? `Counter offer sent (${sentCount} slot${sentCount > 1 ? 's' : ''})` : 'Counter offer sent',
      },
    };
    setCounterOffers(updated);
    // Persist immediately so a full refresh keeps the slots locked and reviewable.
    persistCounterOffers(updated);

    // Treat countered slots as applied locally so they stay disabled and show chips immediately.
    // The backend now creates ShiftInterest records from the counter-offer endpoint, so we don't call onApplySlot/onApplyAll here to avoid duplicate interest emails.
    const targetedSlotIds = slotsToSend
      .map((slot) => slot.slotId)
      .filter((id): id is number => id != null);
    if (targetedSlotIds.length > 0) {
      setAppliedSlotIds((prev) => {
        const next = new Set(prev);
        targetedSlotIds.forEach((id) => next.add(id));
        return next;
      });
    } else {
      setAppliedShiftIds((prev) => {
        const next = new Set(prev);
        next.add(counterOfferShift.id);
        return next;
      });
    }

    closeCounterOffer();
    await refreshShifts();
    setCounterSubmitting(false);
  };

  return {
    counterOffers,
    setCounterOffers,
    counterSubmitting,
    counterOfferOpen,
    counterOfferShift,
    counterOfferSlots,
    counterOfferTravel,
    counterOfferTravelLocation,
    counterOfferError,
    hasCounterOfferTravelLocation,
    travelAutocompleteRef,
    setCounterOfferTravel,
    setCounterOfferTravelLocation,
    openCounterOffer,
    closeCounterOffer,
    clearCounterOfferTravelLocation,
    handleCounterOfferTravelPlaceChanged,
    handleCounterSlotChange,
    handleSubmitCounterOffer,
    reviewOfferShiftId,
    setReviewOfferShiftId,
    reviewOffers,
    reviewLoading,
  };
};
