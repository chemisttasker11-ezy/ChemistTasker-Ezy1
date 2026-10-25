import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { calculateShiftRates, reconcileShiftDraftRateRows, updatePharmacy, type ShiftDraftOccurrence } from '@chemisttasker/shared-core';
import { type PharmacyOption, formatPostShiftError } from './helpers';
interface PricingOptions {
  employmentType: string; pharmacyId: number | ''; roleNeeded: string;
  expandedSlots: ShiftDraftOccurrence[]; selectedPharmacy: PharmacyOption | undefined; editingShiftId: string | null;
  setPharmacies: Dispatch<SetStateAction<PharmacyOption[]>>;
  showSnackbar: (message: string, severity?: 'success' | 'error') => void;
}
/** Financial draft state, authoritative date-rate requests and explicit saving of pharmacy guides. */
export function useShiftPricing({ employmentType, pharmacyId, roleNeeded, expandedSlots, selectedPharmacy, editingShiftId, setPharmacies, showSnackbar }: PricingOptions) {
  const [rateType, setRateType] = useState<string>('FLEXIBLE');
  const [paymentPreference, setPaymentPreference] = useState<string>('ABN');
  const [rateWeekday, setRateWeekday] = useState<string>('');
  const [rateSaturday, setRateSaturday] = useState<string>('');
  const [rateSunday, setRateSunday] = useState<string>('');
  const [ratePublicHoliday, setRatePublicHoliday] = useState<string>('');
  const [rateEarlyMorning, setRateEarlyMorning] = useState<string>('');
  const [rateLateNight, setRateLateNight] = useState<string>('');
  const [savingPharmacyRates, setSavingPharmacyRates] = useState(false);
  const [slotRateRows, setSlotRateRows] = useState<Array<{ rate: string; status: 'idle' | 'loading' | 'success' | 'error'; error?: string; dirty?: boolean }>>([]);
  const [ownerBonus, setOwnerBonus] = useState<string>('');
  const [ftptPayMode, setFtptPayMode] = useState<'HOURLY' | 'ANNUAL'>('HOURLY');
  const [minHourly, setMinHourly] = useState<string>('');
  const [maxHourly, setMaxHourly] = useState<string>('');
  const [minAnnual, setMinAnnual] = useState<string>('');
  const [maxAnnual, setMaxAnnual] = useState<string>('');
  const [superPercent, setSuperPercent] = useState<string>('');
  const [locumSuperIncluded, setLocumSuperIncluded] = useState(true);
  const isLocumLike = employmentType === "LOCUM" || employmentType === "CASUAL";
  useEffect(() => {
    if (!selectedPharmacy || editingShiftId) return;
    const normalize = (val: any) =>
      val === undefined || val === null || val === '' ? '' : String(val);

    const defaultRateType = (selectedPharmacy as any).default_rate_type || (selectedPharmacy as any).defaultRateType || 'FLEXIBLE';
    setRateType(defaultRateType);
    setRateWeekday(normalize((selectedPharmacy as any).rate_weekday ?? (selectedPharmacy as any).rateWeekday));
    setRateSaturday(normalize((selectedPharmacy as any).rate_saturday ?? (selectedPharmacy as any).rateSaturday));
    setRateSunday(normalize((selectedPharmacy as any).rate_sunday ?? (selectedPharmacy as any).rateSunday));
    setRatePublicHoliday(normalize((selectedPharmacy as any).rate_public_holiday ?? (selectedPharmacy as any).ratePublicHoliday));
    setRateEarlyMorning(normalize((selectedPharmacy as any).rate_early_morning ?? (selectedPharmacy as any).rateEarlyMorning));
    setRateLateNight(normalize((selectedPharmacy as any).rate_late_night ?? (selectedPharmacy as any).rateLateNight));
  }, [selectedPharmacy, editingShiftId]);

  const previousRateOccurrences = useRef<typeof expandedSlots>([]);
  useEffect(() => {
    const previous = previousRateOccurrences.current;
    setSlotRateRows(rows => reconcileShiftDraftRateRows(previous, expandedSlots, rows, () => ({ rate: '', status: 'idle' as const })));
    previousRateOccurrences.current = expandedSlots;
  }, [expandedSlots]);

  useEffect(() => {
    const pharmacistProvided = roleNeeded === 'PHARMACIST' && rateType === 'PHARMACIST_PROVIDED';
    const shouldCalculate = isLocumLike && pharmacyId && roleNeeded && expandedSlots.length > 0 && !pharmacistProvided;

    if (!shouldCalculate) {
      setSlotRateRows((prev) =>
        expandedSlots.map((_, idx) => prev[idx] ?? { rate: '', status: 'idle' as const })
      );
      return;
    }

    let cancelled = false;
    setSlotRateRows((prev) =>
      expandedSlots.map((_, idx) => ({
        rate: prev[idx]?.rate ?? '',
        status: 'loading' as const,
        dirty: prev[idx]?.dirty,
      }))
    );

    const payload: any = {
      pharmacyId: Number(pharmacyId),
      role: roleNeeded,
      employmentType,
      slots: expandedSlots.map((slot) => ({
        date: slot.date,
        // Normalize to HH:MM to match backend parser
        startTime: (slot.startTime || '').slice(0, 5),
        endTime: (slot.endTime || '').slice(0, 5),
      })),
    };

    if (roleNeeded === 'PHARMACIST') {
      payload.rateType = rateType || 'FLEXIBLE';
      payload.rateWeekday = rateWeekday || undefined;
      payload.rateSaturday = rateSaturday || undefined;
      payload.rateSunday = rateSunday || undefined;
      payload.ratePublicHoliday = ratePublicHoliday || undefined;
      payload.rateEarlyMorning = rateEarlyMorning || undefined;
      payload.rateLateNight = rateLateNight || undefined;
    }

    calculateShiftRates(payload)
      .then((resp) => {
        if (cancelled) return;
        const list: any[] = Array.isArray(resp) ? resp : [];
        setSlotRateRows((prev) =>
          expandedSlots.map((_slot, idx) => {
            const entry: any = list[idx] ?? {};
            const prior = prev[idx] ?? {};
            if (entry.error) return { ...prior, status: 'error' as const, error: String(entry.error) };
            const rateVal = entry.rate ?? entry.rate_per_hour ?? entry.value;
            const nextRate =
              (prior.dirty || (editingShiftId && Boolean(prior.rate))) && prior.rate !== undefined && prior.rate !== null && prior.rate !== ''
                ? prior.rate
                : rateVal != null
                  ? String(rateVal)
                  : '';
            return { ...prior, rate: nextRate, status: 'success' as const, error: undefined };
          })
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setSlotRateRows((prev) =>
          expandedSlots.map((_slot, idx) => ({
            ...(prev[idx] ?? { rate: '' }),
            status: 'error' as const,
            error: 'Unable to calculate rates',
          }))
        );
        showSnackbar(formatPostShiftError(err), 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [
    editingShiftId,
    employmentType,
    expandedSlots,
    pharmacyId,
    rateEarlyMorning,
    rateLateNight,
    ratePublicHoliday,
    rateSaturday,
    rateSunday,
    rateType,
    rateWeekday,
    roleNeeded,
  ]);

  const handleSlotRateChange = (index: number, value: string) => {
    setSlotRateRows((rows) =>
      rows.map((row, idx) =>
        idx === index ? { ...row, rate: value, status: 'success', error: undefined, dirty: true } : row
      )
    );
  };

  const handleSavePharmacyRateDefaults = async () => {
    if (!pharmacyId) {
      showSnackbar('Select a pharmacy before updating default rates', 'error');
      return;
    }
    if (roleNeeded !== 'PHARMACIST' || rateType === 'PHARMACIST_PROVIDED') {
      showSnackbar('Default pharmacy rates can only be updated from fixed or flexible pharmacist rates', 'error');
      return;
    }

    setSavingPharmacyRates(true);
    try {
      const payload = {
        default_rate_type: rateType,
        rate_weekday: rateWeekday || null,
        rate_saturday: rateSaturday || null,
        rate_sunday: rateSunday || null,
        rate_public_holiday: ratePublicHoliday || null,
        rate_early_morning: rateEarlyMorning || null,
        rate_late_night: rateLateNight || null,
      };
      const data = await updatePharmacy(pharmacyId, payload);
      setPharmacies(current =>
        current.map(pharmacy =>
          Number(pharmacy.id) === Number(pharmacyId)
            ? ({ ...pharmacy, ...data } as PharmacyOption)
            : pharmacy
        )
      );
      showSnackbar('Pharmacy default rates updated', 'success');
    } catch {
      showSnackbar('Unable to update pharmacy default rates', 'error');
    } finally {
      setSavingPharmacyRates(false);
    }
  };


  return { rateType, setRateType, paymentPreference, setPaymentPreference, rateWeekday, setRateWeekday, rateSaturday, setRateSaturday, rateSunday, setRateSunday, ratePublicHoliday, setRatePublicHoliday, rateEarlyMorning, setRateEarlyMorning, rateLateNight, setRateLateNight, savingPharmacyRates, setSavingPharmacyRates, slotRateRows, setSlotRateRows, ownerBonus, setOwnerBonus, ftptPayMode, setFtptPayMode, minHourly, setMinHourly, maxHourly, setMaxHourly, minAnnual, setMinAnnual, maxAnnual, setMaxAnnual, superPercent, setSuperPercent, locumSuperIncluded, setLocumSuperIncluded, handleSlotRateChange, handleSavePharmacyRateDefaults };
}
