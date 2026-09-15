import { useEffect, useMemo, useRef, useState } from 'react';
import { Shift, storageGetItem, storageRemoveItem, storageSetItem } from '@chemisttasker/shared-core';
import {
  APPLIED_SLOT_STORAGE_KEY,
  APPLIED_STORAGE_KEY,
  REJECTED_SHIFT_STORAGE_KEY,
  REJECTED_SLOT_STORAGE_KEY,
  SAVED_STORAGE_KEY,
} from '../constants';

type UseShiftPersistenceParams = {
  shifts: Shift[];
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
        const saved = await storageGetItem(SAVED_STORAGE_KEY).catch(() => null);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              setSavedShiftIds(new Set(parsed.filter((id) => Number.isFinite(id))));
            }
          } catch {}
        }
        savedLoadRef.current = true;
      }
      if (!disableLocalPersistence) {
        try {
          const appliedShifts = await storageGetItem(APPLIED_STORAGE_KEY);
          if (appliedShifts) setAppliedShiftIds(new Set(JSON.parse(appliedShifts)));
        } catch {}
        try {
          const appliedSlots = await storageGetItem(APPLIED_SLOT_STORAGE_KEY);
          if (appliedSlots) setAppliedSlotIds(new Set(JSON.parse(appliedSlots)));
        } catch {}
        try {
          const rejShifts = await storageGetItem(REJECTED_SHIFT_STORAGE_KEY);
          if (rejShifts) setRejectedShiftIds(new Set(JSON.parse(rejShifts)));
        } catch {}
        try {
          const rejSlots = await storageGetItem(REJECTED_SLOT_STORAGE_KEY);
          if (rejSlots) setRejectedSlotIds(new Set(JSON.parse(rejSlots)));
        } catch {}
      }
      setIsHydrated(true);
    })();
  }, [savedShiftIdsProp, savedFeatureEnabled, disableLocalPersistence]);

  // persist saved markers
  useEffect(() => {
    if (disableLocalPersistence || savedShiftIdsProp || !savedFeatureEnabled) return;
    const list = Array.from(savedShiftIds);
    if (list.length === 0) {
      storageRemoveItem(SAVED_STORAGE_KEY).catch(() => null);
    } else {
      storageSetItem(SAVED_STORAGE_KEY, JSON.stringify(list)).catch(() => null);
    }
  }, [savedShiftIds, savedShiftIdsProp, disableLocalPersistence, savedFeatureEnabled]);

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
    storageSetItem(APPLIED_STORAGE_KEY, JSON.stringify(Array.from(appliedShiftIds))).catch(() => null);
  }, [appliedShiftIds, disableLocalPersistence]);
  useEffect(() => {
    if (disableLocalPersistence) return;
    storageSetItem(APPLIED_SLOT_STORAGE_KEY, JSON.stringify(Array.from(appliedSlotIds))).catch(() => null);
  }, [appliedSlotIds, disableLocalPersistence]);
  useEffect(() => {
    if (disableLocalPersistence) return;
    storageSetItem(REJECTED_SHIFT_STORAGE_KEY, JSON.stringify(Array.from(rejectedShiftIds))).catch(() => null);
  }, [rejectedShiftIds, disableLocalPersistence]);
  useEffect(() => {
    if (disableLocalPersistence) return;
    storageSetItem(REJECTED_SLOT_STORAGE_KEY, JSON.stringify(Array.from(rejectedSlotIds))).catch(() => null);
  }, [rejectedSlotIds, disableLocalPersistence]);

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
      storageSetItem(APPLIED_STORAGE_KEY, JSON.stringify([...appliedShiftIds].filter((id) => liveIds.has(id)))).catch(() => null);
      storageSetItem(APPLIED_SLOT_STORAGE_KEY, JSON.stringify([...appliedSlotIds].filter((id) => liveIds.has(id)))).catch(() => null);
      storageSetItem(REJECTED_SHIFT_STORAGE_KEY, JSON.stringify([...rejectedShiftIds].filter((id) => liveIds.has(id)))).catch(() => null);
      storageSetItem(REJECTED_SLOT_STORAGE_KEY, JSON.stringify([...rejectedSlotIds].filter((id) => liveIds.has(id)))).catch(() => null);
    }
  }, [shifts, isHydrated, disableLocalPersistence, appliedShiftIds, appliedSlotIds, rejectedShiftIds, rejectedSlotIds]);

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
