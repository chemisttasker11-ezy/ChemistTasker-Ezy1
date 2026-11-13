// useCounterOffers - Complete counter offer state management
// Exact logic from web with AsyncStorage adaptation for mobile

import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiConfig } from '@chemisttasker/shared-core';
import { mobilePendingIntentStore } from '../../../talent-board/pendingPitch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    Shift,
    ShiftCounterOfferPayload,
    calculateShiftRates,
    fetchShiftCounterOffersService,
    getOnboardingDetail,
} from '@chemisttasker/shared-core';
import {
    COUNTER_OFFER_STORAGE_KEY,
    EMPTY_TRAVEL_LOCATION,
    shiftStorageKey,
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
    /** useShiftSurface().scopeKey: sent-offer badges are stored per persona, workspace, pharmacy and user. */
    scopeKey: string;
    userRole?: string | null;
    pharmacistRatePref?: RatePreference;
    hideCounterOffer?: boolean;
    onSubmitCounterOffer?: (payload: ShiftCounterOfferPayload, key?: string) => Promise<{ id: number }> | { id: number };
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
    scopeKey,
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
    const pendingCounterOffers = useRef<Set<number>>(new Set());
    const pendingIntentKeys = useRef<Set<string>>(new Set());
    const lastOfferShiftId = useRef<number | null>(null);
    const [reviewOfferShiftId, setReviewOfferShiftId] = useState<number | null>(null);
    const [reviewOffers, setReviewOffers] = useState<any[]>([]);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewError, setReviewError] = useState(false);
    const [reviewAttempt, setReviewAttempt] = useState(0);
    const [isHydrated, setIsHydrated] = useState(false);

    const [counterOfferOpen, setCounterOfferOpen] = useState(false);
    const [counterOfferShift, setCounterOfferShift] = useState<Shift | null>(null);
    const [counterOfferSlots, setCounterOfferSlots] = useState<CounterOfferFormSlot[]>([]);
    const [counterOfferTravel, setCounterOfferTravel] = useState(false);
    const [counterOfferTravelLocation, setCounterOfferTravelLocation] = useState<TravelLocation>(EMPTY_TRAVEL_LOCATION);
    const [counterOfferError, setCounterOfferError] = useState<string | null>(null);

    // Fixed for this mount: ShiftsBoard remounts per scope.
    const storageKey = shiftStorageKey(COUNTER_OFFER_STORAGE_KEY, scopeKey);
    const persistCounterOffers = (data: Record<number, CounterOfferTrack>) =>
        AsyncStorage.setItem(storageKey, JSON.stringify(data)).catch(() => null);

    const hasCounterOfferTravelLocation = useMemo(() => {
        const { googlePlaceId, streetAddress, suburb, state, postcode } = counterOfferTravelLocation;
        return Boolean(googlePlaceId || streetAddress || suburb || state || postcode);
    }, [counterOfferTravelLocation]);

    // hydrate counter offers
    useEffect(() => {
        (async () => {
            try {
                const counters = await AsyncStorage.getItem(storageKey);
                if (counters) {
                    const normalized = normalizeCounterOffers(JSON.parse(counters));
                    setCounterOffers(normalized);
                    persistCounterOffers(normalized); // rewrite malformed payloads in normalized form
                }
            } catch { }
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
        // Set by cleanup when the dialog closes or opens another shift: a late reply never writes.
        let stale = false;
        const load = async () => {
            setReviewError(false);
            if (reviewOfferShiftId == null) {
                setReviewOffers([]);
                setReviewLoading(false);
                return;
            }
            setReviewOffers([]); // clear stale data while loading another shift
            setReviewLoading(true);
            try {
                const remote = await fetchShiftCounterOffersService(reviewOfferShiftId);
                if (stale) return;
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
                if (stale) return;
                console.warn('Failed to load counter offers for review', err);
                setReviewOffers([]);
                setReviewError(true);
            } finally {
                if (!stale) setReviewLoading(false);
            }
        };
        load();
        return () => {
            stale = true;
        };
    }, [reviewOfferShiftId, currentUserId, reviewAttempt]);

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
        lastOfferShiftId.current = shift.id;
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
                    if (__DEV__) {
                        console.log('Counter offer fetched rate preference from onboarding', fromOnboarding);
                    }
                }
                setCounterOfferTravelLocation(normalizeOnboardingLocation(onboarding));
            } catch (err) {
                console.warn('Failed to fetch onboarding details on counter-offer open', err);
            }
        }
        const baseSlots = shift.slots ?? [];
        const normalizedSlots = getUpcomingSlotsForDisplay(baseSlots as ShiftSlot[], shift.pharmacyDetail);
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
                        if (__DEV__) {
                            console.log('Counter offer calculator rates', calculatorRates);
                        }
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
    };

    const handleCounterSlotChange = (index: number, key: keyof CounterOfferFormSlot, value: string) => {
        setCounterOfferSlots((prev) =>
            prev.map((slot, idx) => (idx === index ? { ...slot, [key]: value } : slot))
        );
    };

    const scopeRef = useRef(`${scopeKey}:${currentUserId}`);
    scopeRef.current = `${scopeKey}:${currentUserId}`;
    useEffect(() => () => { scopeRef.current = 'disposed'; }, []);
    const anotherCounterOffer = async () => {
        if (currentUserId == null || lastOfferShiftId.current == null) return;
        const store = mobilePendingIntentStore(getApiConfig?.()?.baseURL ?? '', currentUserId, `shift.counter_offer.create:${lastOfferShiftId.current}`);
        const intent = await store.load();
        if (intent?.resultId) { await store.clear(intent.key); setCounterOfferError(null); }
        else if (intent) setCounterOfferError('Recover the previous offer before starting another.');
    };
    const handleSubmitCounterOffer = async () => {
        const callbackScope = `${scopeKey}:${currentUserId}`;
        if (scopeRef.current !== callbackScope || currentUserId == null) return;
        if (!counterOfferShift || !onSubmitCounterOffer) return;
        if (pendingCounterOffers.current.has(counterOfferShift.id)) return;
        pendingCounterOffers.current.add(counterOfferShift.id);
        setCounterSubmitting(true);
        try {
            const store = mobilePendingIntentStore(getApiConfig?.()?.baseURL ?? '', currentUserId, `shift.counter_offer.create:${counterOfferShift.id}`);
            const existingIntent = await store.load();
            if (scopeRef.current !== callbackScope) return;
            const canNegotiateRate = getShiftNegotiable(counterOfferShift);
            const slotOfferMap: Record<number, { rate: string; start: string; end: string }> = {};
            const hasRealSlots = (counterOfferShift.slots?.length ?? 0) > 0;
            const slotsToSendRaw = hasRealSlots
                ? counterOfferSlots.filter((slot) => slot.slotId != null)
                : counterOfferSlots;
            const slotsToSend = slotsToSendRaw;

            if (!existingIntent && slotsToSend.length === 0) {
                setCounterOfferError('This shift has no slots to attach a counter offer. Please contact the poster.');
                return;
            }

            // Deduplicate (slotId, slotDate) pairs to avoid backend duplicate validation errors.
            const dedupedSlots: CounterOfferFormSlot[] = [];
            const seenPairs = new Set<string>();
            slotsToSend.forEach((slot) => {
                const normalizedDate = slot.dateValue || '';
                const key = `${slot.slotId ?? 'none'}|${normalizedDate}`;
                if (seenPairs.has(key)) return;
                seenPairs.add(key);
                dedupedSlots.push({ ...slot, dateValue: normalizedDate || undefined });
            });

            if (!existingIntent && slotsToSend.some((s) => !s.startTime || !s.endTime)) {
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
                        slotDate: slot.dateValue || undefined,
                        proposedStartTime: slot.startTime,
                        proposedEndTime: slot.endTime,
                        proposedRate: canNegotiateRate && slot.rate ? Number(slot.rate) : null,
                    })
                ),
            };
            if (__DEV__) {
                console.log('[ShiftsBoard] submit counter offer payload', payload);
            }

            setCounterOfferError(null);
            let sentPayload = payload;
            const intent = existingIntent ?? await store.acquire(payload as unknown as Record<string, unknown>);
            if (scopeRef.current !== callbackScope) return;
            if (intent.resultId) {
                setCounterOfferError('Start another offer before sending again.');
                setCounterSubmitting(false);
                return;
            }
            if (pendingIntentKeys.current.has(intent.key)) {
                setCounterOfferError('A previous offer is still being submitted.');
                return;
            }
            pendingIntentKeys.current.add(intent.key);
            sentPayload = intent.exactPayload as unknown as ShiftCounterOfferPayload;
            try {
                const result = await onSubmitCounterOffer(intent.exactPayload as unknown as ShiftCounterOfferPayload, intent.key);
                if (scopeRef.current !== callbackScope) return;
                await store.settle(intent.key, result.id);
            } finally {
                pendingIntentKeys.current.delete(intent.key);
            }
            if (scopeRef.current !== callbackScope) return;

            sentPayload.slots.forEach((slot) => {
                if (slot.slotId != null) {
                    slotOfferMap[slot.slotId] = { rate: String(slot.proposedRate ?? ''), start: slot.proposedStartTime, end: slot.proposedEndTime };
                }
            });
            const sentCount = Object.keys(slotOfferMap).length;
            const updated = {
                ...counterOffers,
                [sentPayload.shiftId]: {
                    slots: slotOfferMap,
                    summary: sentCount > 0 ? `Counter offer sent (${sentCount} slot${sentCount > 1 ? 's' : ''})` : 'Counter offer sent',
                },
            };
            setCounterOffers(updated);
            persistCounterOffers(updated);

            // Treat countered slots as applied locally so they stay disabled and show chips immediately.
            const targetedSlotIds = sentPayload.slots
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
                    next.add(sentPayload.shiftId);
                    return next;
                });
            }

            closeCounterOffer();
            await refreshShifts();
        } catch (err) {
            if (scopeRef.current === callbackScope) setCounterOfferError(err instanceof Error && err.message.trim().length > 0 ? err.message : 'Failed to submit counter offer.');
        } finally {
            pendingCounterOffers.current.delete(counterOfferShift.id);
            if (scopeRef.current === callbackScope) setCounterSubmitting(false);
        }
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
        setCounterOfferTravel,
        setCounterOfferTravelLocation,
        openCounterOffer,
        closeCounterOffer,
        clearCounterOfferTravelLocation,
        handleCounterSlotChange,
        handleSubmitCounterOffer,
        anotherCounterOffer,
        reviewOfferShiftId,
        setReviewOfferShiftId,
        reviewOffers,
        reviewLoading,
        reviewError,
        retryReview: () => setReviewAttempt((attempt) => attempt + 1),
    };
};
