// useShiftPersistence - Mobile AsyncStorage version
// Exact logic from web with AsyncStorage instead of localStorage

import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shift } from '@chemisttasker/shared-core';
import {
    APPLIED_SLOT_STORAGE_KEY,
    APPLIED_STORAGE_KEY,
    REJECTED_SHIFT_STORAGE_KEY,
    REJECTED_SLOT_STORAGE_KEY,
    SAVED_STORAGE_KEY,
    shiftStorageKey,
} from '../constants';

type UseShiftPersistenceParams = {
    shifts: Shift[];
    /** useShiftSurface().scopeKey: markers are stored per persona, workspace, pharmacy and user. */
    scopeKey: string;
    disableLocalPersistence?: boolean;
    savedFeatureEnabled: boolean;
    savedShiftIdsProp?: number[];
    initialAppliedShiftIds?: number[];
    initialAppliedSlotIds?: number[];
    initialRejectedShiftIds?: number[];
    initialRejectedSlotIds?: number[];
};

export const useShiftPersistence = ({
    shifts,
    scopeKey,
    disableLocalPersistence,
    savedFeatureEnabled,
    savedShiftIdsProp,
    initialAppliedShiftIds,
    initialAppliedSlotIds,
    initialRejectedShiftIds,
    initialRejectedSlotIds,
}: UseShiftPersistenceParams) => {
    const [savedShiftIds, setSavedShiftIds] = useState<Set<number>>(new Set(savedShiftIdsProp ?? []));
    const [appliedShiftIds, setAppliedShiftIds] = useState<Set<number>>(new Set(initialAppliedShiftIds ?? []));
    const [appliedSlotIds, setAppliedSlotIds] = useState<Set<number>>(new Set(initialAppliedSlotIds ?? []));
    const [rejectedShiftIds, setRejectedShiftIds] = useState<Set<number>>(new Set(initialRejectedShiftIds ?? []));
    const [rejectedSlotIds, setRejectedSlotIds] = useState<Set<number>>(new Set(initialRejectedSlotIds ?? []));
    const [isHydrated, setIsHydrated] = useState(false);
    // The board remounts per scope (ShiftsBoard keys on scopeKey), so the keys are fixed for this mount.
    const SAVED_KEY = shiftStorageKey(SAVED_STORAGE_KEY, scopeKey);
    const APPLIED_KEY = shiftStorageKey(APPLIED_STORAGE_KEY, scopeKey);
    const APPLIED_SLOT_KEY = shiftStorageKey(APPLIED_SLOT_STORAGE_KEY, scopeKey);
    const REJECTED_SHIFT_KEY = shiftStorageKey(REJECTED_SHIFT_STORAGE_KEY, scopeKey);
    const REJECTED_SLOT_KEY = shiftStorageKey(REJECTED_SLOT_STORAGE_KEY, scopeKey);

    const savedLoadRef = useRef(false);
    const markersLoadRef = useRef(false);

    const appliedShiftPropKey = useMemo(() => (initialAppliedShiftIds ?? []).join(','), [initialAppliedShiftIds]);
    const appliedSlotPropKey = useMemo(() => (initialAppliedSlotIds ?? []).join(','), [initialAppliedSlotIds]);
    const rejectedShiftPropKey = useMemo(() => (initialRejectedShiftIds ?? []).join(','), [initialRejectedShiftIds]);
    const rejectedSlotPropKey = useMemo(() => (initialRejectedSlotIds ?? []).join(','), [initialRejectedSlotIds]);

    useEffect(() => {
        if (savedShiftIdsProp && savedFeatureEnabled) {
            setSavedShiftIds(new Set(savedShiftIdsProp));
            savedLoadRef.current = true;
        }
    }, [savedShiftIdsProp, savedFeatureEnabled]);

    // hydrate persisted markers
    useEffect(() => {
        if (markersLoadRef.current) return;
        markersLoadRef.current = true;
        (async () => {
            if (!disableLocalPersistence && savedFeatureEnabled && !savedShiftIdsProp && !savedLoadRef.current) {
                const saved = await AsyncStorage.getItem(SAVED_KEY).catch(() => null);
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed)) {
                            setSavedShiftIds(new Set(parsed.filter((id) => Number.isFinite(id))));
                        }
                    } catch { }
                }
                savedLoadRef.current = true;
            }
            if (!disableLocalPersistence) {
                try {
                    const appliedShifts = await AsyncStorage.getItem(APPLIED_KEY);
                    if (appliedShifts) setAppliedShiftIds(new Set(JSON.parse(appliedShifts)));
                } catch { }
                try {
                    const appliedSlots = await AsyncStorage.getItem(APPLIED_SLOT_KEY);
                    if (appliedSlots) setAppliedSlotIds(new Set(JSON.parse(appliedSlots)));
                } catch { }
                try {
                    const rejShifts = await AsyncStorage.getItem(REJECTED_SHIFT_KEY);
                    if (rejShifts) setRejectedShiftIds(new Set(JSON.parse(rejShifts)));
                } catch { }
                try {
                    const rejSlots = await AsyncStorage.getItem(REJECTED_SLOT_KEY);
                    if (rejSlots) setRejectedSlotIds(new Set(JSON.parse(rejSlots)));
                } catch { }
            }
            setIsHydrated(true);
        })();
    }, [savedShiftIdsProp, savedFeatureEnabled, disableLocalPersistence, SAVED_KEY, APPLIED_KEY, APPLIED_SLOT_KEY, REJECTED_SHIFT_KEY, REJECTED_SLOT_KEY]);

    // persist saved markers
    useEffect(() => {
        if (disableLocalPersistence || savedShiftIdsProp || !savedFeatureEnabled) return;
        const list = Array.from(savedShiftIds);
        if (list.length === 0) {
            AsyncStorage.removeItem(SAVED_KEY).catch(() => null);
        } else {
            AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list)).catch(() => null);
        }
    }, [savedShiftIds, savedShiftIdsProp, disableLocalPersistence, savedFeatureEnabled, SAVED_KEY]);

    // keep in sync with parent props (backend interests)
    useEffect(() => {
        setAppliedShiftIds(new Set(initialAppliedShiftIds ?? []));
    }, [appliedShiftPropKey]);
    useEffect(() => {
        setAppliedSlotIds(new Set(initialAppliedSlotIds ?? []));
    }, [appliedSlotPropKey]);
    useEffect(() => {
        setRejectedShiftIds(new Set(initialRejectedShiftIds ?? []));
    }, [rejectedShiftPropKey]);
    useEffect(() => {
        setRejectedSlotIds(new Set(initialRejectedSlotIds ?? []));
    }, [rejectedSlotPropKey]);

    useEffect(() => {
        if (disableLocalPersistence) return;
        AsyncStorage.setItem(APPLIED_KEY, JSON.stringify(Array.from(appliedShiftIds))).catch(() => null);
    }, [appliedShiftIds, disableLocalPersistence, APPLIED_KEY]);
    useEffect(() => {
        if (disableLocalPersistence) return;
        AsyncStorage.setItem(APPLIED_SLOT_KEY, JSON.stringify(Array.from(appliedSlotIds))).catch(() => null);
    }, [appliedSlotIds, disableLocalPersistence, APPLIED_SLOT_KEY]);
    useEffect(() => {
        if (disableLocalPersistence) return;
        AsyncStorage.setItem(REJECTED_SHIFT_KEY, JSON.stringify(Array.from(rejectedShiftIds))).catch(() => null);
    }, [rejectedShiftIds, disableLocalPersistence, REJECTED_SHIFT_KEY]);
    useEffect(() => {
        if (disableLocalPersistence) return;
        AsyncStorage.setItem(REJECTED_SLOT_KEY, JSON.stringify(Array.from(rejectedSlotIds))).catch(() => null);
    }, [rejectedSlotIds, disableLocalPersistence, REJECTED_SLOT_KEY]);

    // Drop local caches for shifts that no longer exist in the latest list
    useEffect(() => {
        if (!isHydrated) return;
        const liveIds = new Set(shifts.map((s) => s.id));
        setAppliedShiftIds((prev) => new Set([...prev].filter((id) => liveIds.has(id))));
        setRejectedShiftIds((prev) => new Set([...prev].filter((id) => liveIds.has(id))));
        setSavedShiftIds((prev) => new Set([...prev].filter((id) => liveIds.has(id))));
    }, [shifts, isHydrated]);

    // Whenever shifts change (e.g., after server refetch), wipe any locally persisted state for IDs that disappeared.
    useEffect(() => {
        if (!isHydrated) return;
        const liveIds = new Set(shifts.map((s) => s.id));
        if (!disableLocalPersistence) {
            AsyncStorage.setItem(APPLIED_KEY, JSON.stringify([...appliedShiftIds].filter((id) => liveIds.has(id)))).catch(() => null);
            AsyncStorage.setItem(APPLIED_SLOT_KEY, JSON.stringify([...appliedSlotIds].filter((id) => liveIds.has(id)))).catch(() => null);
            AsyncStorage.setItem(REJECTED_SHIFT_KEY, JSON.stringify([...rejectedShiftIds].filter((id) => liveIds.has(id)))).catch(() => null);
            AsyncStorage.setItem(REJECTED_SLOT_KEY, JSON.stringify([...rejectedSlotIds].filter((id) => liveIds.has(id)))).catch(() => null);
        }
    }, [shifts, isHydrated, disableLocalPersistence, appliedShiftIds, appliedSlotIds, rejectedShiftIds, rejectedSlotIds, APPLIED_KEY, APPLIED_SLOT_KEY, REJECTED_SHIFT_KEY, REJECTED_SLOT_KEY]);

    return {
        savedShiftIds,
        setSavedShiftIds,
        appliedShiftIds,
        setAppliedShiftIds,
        appliedSlotIds,
        setAppliedSlotIds,
        rejectedShiftIds,
        setRejectedShiftIds,
        rejectedSlotIds,
        setRejectedSlotIds,
        isHydrated,
    };
};
