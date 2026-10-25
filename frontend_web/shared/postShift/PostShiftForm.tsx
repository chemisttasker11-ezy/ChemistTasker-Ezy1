import { useShiftDescriptionTemplate } from './useShiftDescriptionTemplate';
import { buildShiftPostingPayload, buildShiftPostingPreview, validateShiftPostingDraft, haveShiftPostingSlotRatesChanged, type ShiftPostingDraft } from '@chemisttasker/shared-core';
import { useShiftPricing } from './useShiftPricing';
import { useShiftTimetable } from './useShiftTimetable';
import { normalizeWorkloadTags, pharmacySoftwareDefaults, mergeSoftwareDefaults, type SupportEntry } from '@chemisttasker/shared-core';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import { normalizeShiftRequirements, canNotifyShiftChainMembers, isPrivateShiftBooking, automaticShiftEscalationDates, type ShiftEscalationPlan } from '@chemisttasker/shared-core';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Container,
  Alert,
  Paper,
  Snackbar,
  useTheme,
  useMediaQuery,
  Stack,
  Typography,
} from '@mui/material';
import { BadgeCheck, CalendarClock, ClipboardList, Radar, ScanEye, Wallet } from 'lucide-react';
import type { AxiosInstance } from 'axios';
import dayjs from 'dayjs';
import {
  Shift,
  EscalationLevelKey,
  fetchPharmaciesService,
  fetchWorkerShiftDetailService,
  expandShiftDraftSlots,
  createOwnerShiftService,
  updateOwnerShiftService,
} from '@chemisttasker/shared-core';
import PostShiftWizardShell, { type PostShiftWizardStep } from './PostShiftWizardShell';
import PostShiftDetailsStep from './PostShiftDetailsStep';
import PostShiftSkillsStep from './PostShiftSkillsStep';
import PostShiftVisibilityStep from './PostShiftVisibilityStep';
import PostShiftPayStep from './PostShiftPayStep';
import PostShiftTimetableStep from './PostShiftTimetableStep';

import {
  type PharmacyOption,
  toRateInputString,
  getSlotRateValue,
  firstPresent,
  formatPostShiftError,
  toInputDateTimeLocal,
  normalizePrefillRole,
  ORG_ROLE_VALUES,
  readPostShiftPrefill,
} from './helpers';

export type PostShiftFormProps = {
  onCompleted?: () => void;
  /** Signed-in user from the host app's auth context. */
  user: { id?: number | string; memberships?: any[] } | null | undefined;
  activePersona?: string | null;
  activeAdminPharmacyId?: number | null;
  navigate: (to: string | number) => void;
  search: string;
  isDarkMode: boolean;
  apiClient: AxiosInstance;
  /** Page heading in the host app's style; omitted when embedded. */
  renderHeader: (title: string, subtitle: string) => React.ReactNode;
  /** Job board card for the draft; adds a Review step before posting. */
  renderPreview?: (draft: Shift) => React.ReactNode;
};

/** The whole Post shift wizard, shared by Vite and Next; the hosts only supply routing, auth, API and header. */
const PostShiftForm: React.FC<PostShiftFormProps> = ({
  onCompleted, user, activePersona, activeAdminPharmacyId, navigate, search, isDarkMode, renderHeader, renderPreview,
}) => {


  const scopedPharmacyId =
    activePersona === "admin" && typeof activeAdminPharmacyId === "number"
      ? activeAdminPharmacyId
      : null;

  const params = new URLSearchParams(search);
  const adminRedirectBase = scopedPharmacyId != null ? `/dashboard/admin/${scopedPharmacyId}` : null;
  const editingShiftId = params.get('edit');
  const isEmbedded = params.get('embedded') === '1';
  const {
    pharmacyId: prefillPharmacyId,
    roleNeeded: prefillRoleNeeded,
    date: prefillDate,
    dates: prefillDatesParam,
    startTime: prefillStartTime,
    endTime: prefillEndTime,
    visibility: prefillVisibility,
    employmentType: prefillEmploymentType,
    dedicatedUser: prefillDedicatedUser,
    hasPrefill,
  } = readPostShiftPrefill(search);

  const orgMembership = useMemo(() => {
    const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
    return memberships.find((membership: any) => {
      if (!membership || typeof membership !== 'object') return false;
      const role = membership.role;
      return typeof role === 'string' && ORG_ROLE_VALUES.includes(role);
    });
  }, [user?.memberships]);
  const isOrganizationUser = Boolean(orgMembership);

  // --- Form State ---
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
  const [pharmacyId, setPharmacyId] = useState<number | ''>(() =>
    scopedPharmacyId ?? ''
  );
  const [employmentType, setEmploymentType] = useState<string>('LOCUM');
  const [roleNeeded, setRoleNeeded] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [workloadTags, setWorkloadTags] = useState<string[]>([]);
  const [supportOnShift, setSupportOnShift] = useState<SupportEntry[]>([]);
  const [dedicatedUserId, setDedicatedUserId] = useState<number | null>(null);
  const isPrivateBooking = isPrivateShiftBooking(dedicatedUserId ?? prefillDedicatedUser);
  const presetInitializedScopes = useRef(new Set<string>());
  const [mustHave, setMustHave] = useState<string[]>([]);
  const [niceToHave, setNiceToHave] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<string>('');
  const [escalationDates, setEscalationDates] = useState<Record<string, string>>({});
  const [escalationPlan, setEscalationPlan] = useState<ShiftEscalationPlan>({ mode: 'off', everyHours: 24 });
  const [singleUserOnly, setSingleUserOnly] = useState(false);
  const [flexibleTiming, setFlexibleTiming] = useState(false);
  const [postAnonymously, setPostAnonymously] = useState(false);
  const [hasTravel, setHasTravel] = useState(false);
  const [hasAccommodation, setHasAccommodation] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [notifyPharmacyStaff, setNotifyPharmacyStaff] = useState(false);
  const [notifyFavoriteStaff, setNotifyFavoriteStaff] = useState(false);
  const [notifyChainMembers, setNotifyChainMembers] = useState(false);

  // --- UI State ---
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [activeStep, setActiveStep] = useState(0);
  const [prefillAppliedFor, setPrefillAppliedFor] = useState<string | null>(null);
  const initialSlotsJsonRef = useRef<string | null>(null);
  const initialRatesJsonRef = useRef<string | null>(null);

  const selectedPharmacy = useMemo(
    () => pharmacies.find((x) => x.id === pharmacyId),
    [pharmacyId, pharmacies]
  );
  const showSnackbar = (msg: string, severity: 'success' | 'error' = 'success') => setSnackbar({ open: true, message: msg, severity });
  const { slots, setSlots, slotDate, setSlotDate, slotStartTime, setSlotStartTime, slotEndTime, setSlotEndTime, isRecurring, setIsRecurring, recurringDays, setRecurringDays, recurringEndDate, setRecurringEndDate, selectedDates, setSelectedDates, selectedDateTimes, setSelectedDateTimes, calendarView, setCalendarView, timetableError, setTimetableError, todayStart, setCalendarDate, minCalendarDate, maxCalendarDate, safeCalendarDate, calendarTimeBounds, expandedSlots, calendarEvents, selectedDateSet, getDefaultTimesForDate, slotDateHours, closedSelectedDates, mergeSelectedDates, eventStyleGetter, dayPropGetter, handleAddManualSlot, handleAddSelectedDate, handleAddAllSelectedDates, handleEditSlot } = useShiftTimetable({ selectedPharmacy, editingShiftId, showSnackbar });

  const { rateType, setRateType, paymentPreference, setPaymentPreference, rateWeekday, setRateWeekday, rateSaturday, setRateSaturday, rateSunday, setRateSunday, ratePublicHoliday, setRatePublicHoliday, rateEarlyMorning, setRateEarlyMorning, rateLateNight, setRateLateNight, savingPharmacyRates, slotRateRows, setSlotRateRows, ownerBonus, setOwnerBonus, ftptPayMode, setFtptPayMode, minHourly, setMinHourly, maxHourly, setMaxHourly, minAnnual, setMinAnnual, maxAnnual, setMaxAnnual, superPercent, setSuperPercent, locumSuperIncluded, setLocumSuperIncluded, handleSlotRateChange, handleSavePharmacyRateDefaults } = useShiftPricing({ employmentType, pharmacyId, roleNeeded, expandedSlots, selectedPharmacy, editingShiftId, setPharmacies, showSnackbar });

  const { descriptionTemplate, descriptionTemplateLoading, descriptionTemplateSaving, handleUseDescriptionTemplate, handleSaveDescriptionTemplate } = useShiftDescriptionTemplate({ pharmacyId, roleNeeded, editingShiftId, description, setDescription, showSnackbar });

  // --- Data Loading ---
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let loadedPharmacies: PharmacyOption[] = [];
      try {
        const list = await fetchPharmaciesService({});
        loadedPharmacies = (
          scopedPharmacyId != null
            ? list.filter((item: PharmacyOption) => Number(item.id) === scopedPharmacyId)
            : list
        ) as PharmacyOption[];
        if (!cancelled) {
          setPharmacies(loadedPharmacies);
          if (!editingShiftId && !prefillPharmacyId && scopedPharmacyId == null && loadedPharmacies.length > 0) {
            setPharmacyId((current) => current || Number(loadedPharmacies[0].id));
          }
        }
      } catch {
        if (!cancelled) {
          showSnackbar('Failed to load pharmacies', 'error');
        }
      }

      if (editingShiftId) {
        try {
          const detail = await fetchWorkerShiftDetailService(Number(editingShiftId));
          const detailPharmacyId =
            detail.pharmacy ?? detail.pharmacyId ?? detail.pharmacyDetail?.id ?? null;
          if (scopedPharmacyId != null && detailPharmacyId !== scopedPharmacyId) {
            showSnackbar('You do not have access to this shift.', 'error');
            navigate(-1);
            return;
          }
          if (cancelled) {
            return;
          }
          setPharmacyId(scopedPharmacyId ?? detailPharmacyId ?? '');
          const pharmacyDefaults = loadedPharmacies.find((item: PharmacyOption) => Number(item.id) === Number(detailPharmacyId));
          setEmploymentType(detail.employmentType ?? '');
          setDedicatedUserId(typeof detail.dedicatedUser === 'number' ? detail.dedicatedUser : null);
          setRoleNeeded(detail.roleNeeded ?? '');
          setDescription(detail.description ?? '');
          setWorkloadTags(normalizeWorkloadTags(skillsRegistry as any, detail.workloadTags ?? []));
          setSupportOnShift(detail.supportOnShift ?? []);
          setMustHave(normalizeShiftRequirements(skillsRegistry as any, detail.mustHave ?? []));
          setNiceToHave(normalizeShiftRequirements(skillsRegistry as any, detail.niceToHave ?? []));
          setVisibility(detail.visibility ?? 'FULL_PART_TIME');
          const incomingRateType = detail.rateType ?? '';
          setRateType(incomingRateType || 'FLEXIBLE');
          const initWeekday = toRateInputString(firstPresent((detail as any).rateWeekday, (detail as any).rate_weekday, (pharmacyDefaults as any)?.rateWeekday, (pharmacyDefaults as any)?.rate_weekday));
          setRateWeekday(initWeekday);
          const initSaturday = toRateInputString(firstPresent((detail as any).rateSaturday, (detail as any).rate_saturday, (pharmacyDefaults as any)?.rateSaturday, (pharmacyDefaults as any)?.rate_saturday));
          setRateSaturday(initSaturday);
          const initSunday = toRateInputString(firstPresent((detail as any).rateSunday, (detail as any).rate_sunday, (pharmacyDefaults as any)?.rateSunday, (pharmacyDefaults as any)?.rate_sunday));
          setRateSunday(initSunday);
          const initPublicHoliday = toRateInputString(firstPresent((detail as any).ratePublicHoliday, (detail as any).rate_public_holiday, (pharmacyDefaults as any)?.ratePublicHoliday, (pharmacyDefaults as any)?.rate_public_holiday));
          setRatePublicHoliday(initPublicHoliday);
          const initEarlyMorning = toRateInputString(firstPresent((detail as any).rateEarlyMorning, (detail as any).rate_early_morning, (pharmacyDefaults as any)?.rateEarlyMorning, (pharmacyDefaults as any)?.rate_early_morning));
          setRateEarlyMorning(initEarlyMorning);
          const initLateNight = toRateInputString(firstPresent((detail as any).rateLateNight, (detail as any).rate_late_night, (pharmacyDefaults as any)?.rateLateNight, (pharmacyDefaults as any)?.rate_late_night));
          setRateLateNight(initLateNight);
          const initOwnerBonus = toRateInputString((detail as any).ownerAdjustedRate ?? (detail as any).owner_adjusted_rate ?? (detail as any).ownerBonus ?? (detail as any).owner_bonus);
          setOwnerBonus(initOwnerBonus);
          setMinHourly(toRateInputString((detail as any).minHourlyRate ?? (detail as any).min_hourly_rate));
          setMaxHourly(toRateInputString((detail as any).maxHourlyRate ?? (detail as any).max_hourly_rate));
          setMinAnnual(toRateInputString((detail as any).minAnnualSalary ?? (detail as any).min_annual_salary));
          setMaxAnnual(toRateInputString((detail as any).maxAnnualSalary ?? (detail as any).max_annual_salary));
          setPaymentPreference(detail.paymentPreference ?? (detail as any).payment_preference ?? '');
          setFlexibleTiming(Boolean((detail as any).flexibleTiming ?? (detail as any).flexible_timing));
          setSingleUserOnly(Boolean(detail.singleUserOnly));
          setPostAnonymously(Boolean(detail.postAnonymously));
          setHasTravel(Boolean((detail as any).hasTravel ?? (detail as any).has_travel));
          setHasAccommodation(Boolean((detail as any).hasAccommodation ?? (detail as any).has_accommodation));
          setIsUrgent(Boolean((detail as any).isUrgent ?? (detail as any).is_urgent));
          const detailSuper = (detail as any).superPercent ?? (detail as any).super_percent;
          if (detailSuper === null || detailSuper === undefined) {
            setLocumSuperIncluded(true);
          } else {
            setLocumSuperIncluded(Number(detailSuper) > 0);
          }
          setEscalationDates({
            LOCUM_CASUAL: toInputDateTimeLocal(detail.escalateToLocumCasual),
            OWNER_CHAIN: toInputDateTimeLocal(detail.escalateToOwnerChain),
            ORG_CHAIN: toInputDateTimeLocal(detail.escalateToOrgChain),
            PLATFORM: toInputDateTimeLocal(detail.escalateToPlatform),
          });
          setEscalationPlan({ mode: [detail.escalateToLocumCasual, detail.escalateToOwnerChain, detail.escalateToOrgChain, detail.escalateToPlatform].some(Boolean) ? 'custom' : 'off', everyHours: 24 });
          const parsedSlots = (detail.slots ?? []).map((slot: NonNullable<Shift['slots']>[number]) => ({
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isRecurring: Boolean(slot.isRecurring),
            recurringDays: slot.recurringDays ?? [],
            recurringEndDate: slot.recurringEndDate ?? '',
          }));

          setSlots(parsedSlots);
          const expanded = expandShiftDraftSlots(parsedSlots);
          const rawSlots = detail.slots ?? [];
          const initialSlotRateRows = expanded.map((slot) => {
            const raw = rawSlots[slot.sourceIndex];
            const rate = toRateInputString(getSlotRateValue(raw));
            return { rate, status: rate ? 'success' as const : 'idle' as const, dirty: Boolean(rate) };
          });
          setSlotRateRows(initialSlotRateRows);
          initialSlotsJsonRef.current = JSON.stringify(parsedSlots);
          initialRatesJsonRef.current = JSON.stringify({
            rateType: incomingRateType || 'FLEXIBLE',
            rateWeekday: initWeekday,
            rateSaturday: initSaturday,
            rateSunday: initSunday,
            ratePublicHoliday: initPublicHoliday,
            rateEarlyMorning: initEarlyMorning,
            rateLateNight: initLateNight,
            ownerBonus: initOwnerBonus,
            slotRates: initialSlotRateRows.map((r) => r.rate),
          });



        } catch {
          if (!cancelled) {
            showSnackbar('Failed to load shift for editing', 'error');
          }
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [editingShiftId, scopedPharmacyId, navigate]);

  useEffect(() => {
    const prefillSignature = [
      prefillPharmacyId,
      prefillRoleNeeded,
      prefillDate,
      prefillDatesParam,
      prefillStartTime,
      prefillEndTime,
      prefillVisibility,
      prefillEmploymentType,
      prefillDedicatedUser,
      scopedPharmacyId,
    ].join('|');

    if (!hasPrefill || editingShiftId || prefillAppliedFor === prefillSignature) {
      return;
    }

    const parsedPrefillDates = (prefillDatesParam || '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0 && dayjs(d, 'YYYY-MM-DD', true).isValid());

    const parsedPharmacyId = prefillPharmacyId ? Number(prefillPharmacyId) : null;
    if (parsedPharmacyId && scopedPharmacyId == null) {
      setPharmacyId(parsedPharmacyId);
    }
    const normalizedPrefillRole = normalizePrefillRole(prefillRoleNeeded);
    if (normalizedPrefillRole) {
      setRoleNeeded(normalizedPrefillRole);
    }
    if (prefillEmploymentType) {
      setEmploymentType(prefillEmploymentType);
    }
    if (prefillVisibility) {
      setVisibility(prefillVisibility);
    }

    const startTime = prefillStartTime || slotStartTime;
    const endTime = prefillEndTime || slotEndTime;
    if (prefillStartTime) {
      setSlotStartTime(prefillStartTime);
    }
    if (prefillEndTime) {
      setSlotEndTime(prefillEndTime);
    }

    if (parsedPrefillDates.length > 0) {
      setSelectedDates(parsedPrefillDates);
      setSlotDate(parsedPrefillDates[0]);
      setSlots(
        parsedPrefillDates.map((date) => ({
          date,
          startTime,
          endTime,
          isRecurring: false,
          recurringDays: [],
          recurringEndDate: '',
        }))
      );
      const parsedDate = dayjs(parsedPrefillDates[0]);
      if (parsedDate.isValid()) {
        setCalendarDate(parsedDate.toDate());
      }
      setSelectedDateTimes((prev) => {
        const next = { ...prev };
        parsedPrefillDates.forEach((date) => {
          next[date] = { startTime, endTime };
        });
        return next;
      });
    } else if (prefillDate) {
      setSlotDate(prefillDate);
      setSelectedDates([prefillDate]);
      setSlots([
        {
          date: prefillDate,
          startTime,
          endTime,
          isRecurring: false,
          recurringDays: [],
          recurringEndDate: '',
        },
      ]);
      const parsedDate = dayjs(prefillDate);
      if (parsedDate.isValid()) {
        setCalendarDate(parsedDate.toDate());
      }
      setSelectedDateTimes((prev) => ({
        ...prev,
        [prefillDate]: { startTime, endTime },
      }));
    }

    if (prefillDedicatedUser) {
      const parsedDedicated = Number(prefillDedicatedUser);
      if (!Number.isNaN(parsedDedicated)) {
        setDedicatedUserId(parsedDedicated);
      }
    }

    setPrefillAppliedFor(prefillSignature);
  }, [hasPrefill, editingShiftId, prefillAppliedFor, prefillPharmacyId, prefillRoleNeeded, prefillDate, prefillDatesParam, prefillStartTime, prefillEndTime, prefillVisibility, prefillEmploymentType, prefillDedicatedUser, scopedPharmacyId, slotStartTime, slotEndTime]);

  useEffect(() => {
    if (scopedPharmacyId != null) {
      setPharmacyId(scopedPharmacyId);
    }
  }, [scopedPharmacyId]);
  const allowedVis = useMemo<EscalationLevelKey[]>(() => {
    const p = pharmacies.find(x => x.id === pharmacyId);
    if (!p) return [];

    const tiers: EscalationLevelKey[] = ['FULL_PART_TIME', 'LOCUM_CASUAL'];
    if (p.hasChain) {
      tiers.push('OWNER_CHAIN');
    }
    if (p.claimed) {
      tiers.push('ORG_CHAIN');
    }
    tiers.push('PLATFORM');
    return tiers;
  }, [pharmacyId, pharmacies]);

  useEffect(() => {
    if (allowedVis.length === 0) return;
    if (isPrivateBooking && allowedVis.includes('LOCUM_CASUAL')) {
      if (visibility !== 'LOCUM_CASUAL') {
        setVisibility('LOCUM_CASUAL');
      }
      return;
    }
    if (!allowedVis.includes(visibility)) {
      setVisibility(allowedVis[0]);
    }
  }, [allowedVis, visibility, isPrivateBooking]);

  const escalationTierKey = allowedVis.join(',');
  useEffect(() => {
    if (escalationPlan.mode === 'auto' && !isPrivateBooking) {
      setEscalationDates(automaticShiftEscalationDates(allowedVis, visibility, escalationPlan.everyHours));
    }
  }, [escalationTierKey, visibility, escalationPlan.mode, escalationPlan.everyHours, isPrivateBooking]); // eslint-disable-line react-hooks/exhaustive-deps

  const showNotifyPharmacyStaff = !isPrivateBooking && !editingShiftId && ['FULL_PART_TIME', 'LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'].includes(visibility);
  const showNotifyFavoriteStaff = !isPrivateBooking && !editingShiftId && ['LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'].includes(visibility);
  const showNotifyChainMembers = !isPrivateBooking && !editingShiftId && canNotifyShiftChainMembers(allowedVis, visibility);
  const canPostAnonymously = !isPrivateBooking && ['ORG_CHAIN', 'PLATFORM'].includes(visibility);

  useEffect(() => {
    if (!showNotifyPharmacyStaff) setNotifyPharmacyStaff(false);
    if (!showNotifyFavoriteStaff) setNotifyFavoriteStaff(false);
    if (!showNotifyChainMembers) setNotifyChainMembers(false);
  }, [showNotifyPharmacyStaff, showNotifyFavoriteStaff, showNotifyChainMembers]);

  useEffect(() => {
    if (!canPostAnonymously) setPostAnonymously(false);
  }, [canPostAnonymously]);

  // New shifts start with the pharmacy's own software (one per category) as preferred experience, by registry ID.
  // Switching pharmacy or role swaps those defaults; other preferred skills stay selected.
  const softwareDefaults = useRef<string[]>([]);
  useEffect(() => {
    if (editingShiftId || !selectedPharmacy || !roleNeeded) return;
    const next = pharmacySoftwareDefaults(skillsRegistry as any, roleNeeded as any, (selectedPharmacy as any).software || []);
    const previous = softwareDefaults.current;
    softwareDefaults.current = next;
    setNiceToHave(current => mergeSoftwareDefaults(current, mustHave, previous, next));
  }, [selectedPharmacy, roleNeeded, editingShiftId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLocumLike = useMemo(
    () => employmentType === 'LOCUM' || employmentType === 'CASUAL',
    [employmentType]
  );

  const steps = useMemo<PostShiftWizardStep[]>(() => [
    { key: 'details', label: 'Details', icon: ClipboardList, tone: 'violet' },
    { key: 'skills', label: 'Skills', icon: BadgeCheck, tone: 'blue' },
    { key: 'visibility', label: 'Who sees it', icon: Radar, tone: 'cyan' },
    ...(isLocumLike ? [{ key: 'timetable', label: 'Dates', icon: CalendarClock, tone: 'magenta' as const }] : []),
    { key: 'pay', label: 'Pay', icon: Wallet, tone: 'blue' },
    ...(renderPreview ? [{ key: 'review', label: 'Review', icon: ScanEye, tone: 'violet' as const }] : []),
  ], [isLocumLike, renderPreview]);

  const areSlotsModified = () => {
    if (!editingShiftId || initialSlotsJsonRef.current === null) return true;
    return JSON.stringify(slots) !== initialSlotsJsonRef.current;
  };
  const areRatesModified = () => {
    if (!editingShiftId || initialRatesJsonRef.current === null) return true;
    const { slotRates: initialSlotRates, ...initialRates } = JSON.parse(initialRatesJsonRef.current);
    const currentRatesJson = JSON.stringify({
      rateType,
      rateWeekday,
      rateSaturday,
      rateSunday,
      ratePublicHoliday,
      rateEarlyMorning,
      rateLateNight,
      ownerBonus,
    });
    return currentRatesJson !== JSON.stringify(initialRates) || haveShiftPostingSlotRatesChanged(initialSlotRates, slotRateRows);
  };

  const postingDraft = (): ShiftPostingDraft => ({ pharmacyId, roleNeeded, employmentType, description, workloadTags, supportOnShift, mustHave, niceToHave, dedicatedUserId, singleUserOnly, rateType, ownerBonus, paymentPreference, locumSuperIncluded, rateWeekday, rateSaturday, rateSunday, ratePublicHoliday, rateEarlyMorning, rateLateNight, ftptPayMode, minHourly, maxHourly, minAnnual, maxAnnual, superPercent, slots, expandedSlots, slotRateRows, canPostAnonymously, showNotifyPharmacyStaff, showNotifyFavoriteStaff, showNotifyChainMembers, notifyPharmacyStaff, notifyFavoriteStaff, notifyChainMembers, hasTravel, hasAccommodation, isUrgent, flexibleTiming, visibility, escalationDates, editingShiftId, postAnonymously, slotsModified: areSlotsModified(), ratesModified: areRatesModified() });
  const buildPayload = () => buildShiftPostingPayload(postingDraft());

  // shortcut: the preview leaves out server-computed fields (distance, ratings); fine for a pre-post check.
  const previewShift = (): Shift => buildShiftPostingPreview(postingDraft(), selectedPharmacy) as Shift;

  const handleSubmit = async () => {
    const validation = validateShiftPostingDraft(postingDraft());
    if (validation) return showSnackbar(validation, 'error');

    setSubmitting(true);
    const payload = buildPayload();

    try {
      if (editingShiftId) {
        await updateOwnerShiftService(Number(editingShiftId), payload);
        showSnackbar('Shift updated successfully!');
      } else {
        await createOwnerShiftService(payload);
        showSnackbar('Shift posted successfully!');
      }
      if (onCompleted) {
        onCompleted();
        return;
      }

      const targetPath = adminRedirectBase
        ? `${adminRedirectBase}/shift-center`
        : isOrganizationUser
          ? '/dashboard/organization/shift-center/active'
          : '/dashboard/owner/shift-center';

      setTimeout(() => navigate(targetPath), 1500);
    } catch (err: any) {
      console.error('Post shift failed', err);
      showSnackbar(formatPostShiftError(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };
  useEffect(() => {
    if (activeStep > steps.length - 1) {
      setActiveStep(steps.length - 1);
    }
  }, [steps.length, activeStep]);

  const renderStepContent = (step: number) => {
    const stepKey = steps[step]?.key;
    switch (stepKey) {
      case 'details':
        return (
          <PostShiftDetailsStep
            isDarkMode={isDarkMode}
            isEmbedded={isEmbedded}
            pharmacies={pharmacies}
            pharmacyId={pharmacyId}
            setPharmacyId={setPharmacyId}
            scopedPharmacyId={scopedPharmacyId}
            roleNeeded={roleNeeded}
            setRoleNeeded={setRoleNeeded}
            employmentType={employmentType}
            setEmploymentType={setEmploymentType}
            descriptionTemplateLoading={descriptionTemplateLoading}
            descriptionTemplate={descriptionTemplate}
            descriptionTemplateSaving={descriptionTemplateSaving}
            handleUseDescriptionTemplate={handleUseDescriptionTemplate}
            handleSaveDescriptionTemplate={handleSaveDescriptionTemplate}
            description={description}
            setDescription={setDescription}
            hasTravel={hasTravel}
            setHasTravel={setHasTravel}
            hasAccommodation={hasAccommodation}
            setHasAccommodation={setHasAccommodation}
            isUrgent={isUrgent}
            setIsUrgent={setIsUrgent}
            workloadTags={workloadTags}
            setWorkloadTags={setWorkloadTags}
            supportOnShift={supportOnShift}
            setSupportOnShift={setSupportOnShift}
          />
        );
      case 'skills':
        return (
          <PostShiftSkillsStep
            initializedScopes={presetInitializedScopes.current}
            userId={user?.id}
            editing={Boolean(editingShiftId)}
            defaultPreferred={pharmacySoftwareDefaults(skillsRegistry as any, roleNeeded as any, selectedPharmacy?.software || [])}
            roleNeeded={roleNeeded}
            mustHave={mustHave}
            setMustHave={setMustHave}
            niceToHave={niceToHave}
            setNiceToHave={setNiceToHave}
            isDarkMode={isDarkMode}
          />
        );
      case 'visibility':
        return (
          <PostShiftVisibilityStep
            isEmbedded={isPrivateBooking}
            escalationPlan={escalationPlan}
            setEscalationPlan={setEscalationPlan}
            isDarkMode={isDarkMode}
            visibility={visibility}
            setVisibility={setVisibility}
            allowedVis={allowedVis}
            canPostAnonymously={canPostAnonymously}
            postAnonymously={postAnonymously}
            setPostAnonymously={setPostAnonymously}
            showNotifyPharmacyStaff={showNotifyPharmacyStaff}
            showNotifyFavoriteStaff={showNotifyFavoriteStaff}
            showNotifyChainMembers={showNotifyChainMembers}
            notifyPharmacyStaff={notifyPharmacyStaff}
            setNotifyPharmacyStaff={setNotifyPharmacyStaff}
            notifyFavoriteStaff={notifyFavoriteStaff}
            setNotifyFavoriteStaff={setNotifyFavoriteStaff}
            notifyChainMembers={notifyChainMembers}
            setNotifyChainMembers={setNotifyChainMembers}
            escalationDates={escalationDates}
            setEscalationDates={setEscalationDates}
          />
        );
      case 'timetable':
        return (
          <PostShiftTimetableStep
            isDarkMode={isDarkMode}
            isEmbedded={isEmbedded}
            flexibleTiming={flexibleTiming}
            setFlexibleTiming={setFlexibleTiming}
            slotDate={slotDate}
            setSlotDate={setSlotDate}
            slotStartTime={slotStartTime}
            setSlotStartTime={setSlotStartTime}
            slotEndTime={slotEndTime}
            setSlotEndTime={setSlotEndTime}
            slotDateHours={slotDateHours}
            selectedDates={selectedDates}
            setSelectedDates={setSelectedDates}
            selectedDateTimes={selectedDateTimes}
            setSelectedDateTimes={setSelectedDateTimes}
            selectedDateSet={selectedDateSet}
            closedSelectedDates={closedSelectedDates}
            getDefaultTimesForDate={getDefaultTimesForDate}
            mergeSelectedDates={mergeSelectedDates}
            isRecurring={isRecurring}
            setIsRecurring={setIsRecurring}
            recurringDays={recurringDays}
            setRecurringDays={setRecurringDays}
            recurringEndDate={recurringEndDate}
            setRecurringEndDate={setRecurringEndDate}
            singleUserOnly={singleUserOnly}
            setSingleUserOnly={setSingleUserOnly}
            slots={slots}
            setSlots={setSlots}
            handleAddManualSlot={handleAddManualSlot}
            handleAddSelectedDate={handleAddSelectedDate}
            handleAddAllSelectedDates={handleAddAllSelectedDates}
            handleEditSlot={handleEditSlot}
            calendarEvents={calendarEvents}
            safeCalendarDate={safeCalendarDate}
            calendarView={calendarView}
            setCalendarView={setCalendarView}
            setCalendarDate={setCalendarDate}
            dayPropGetter={dayPropGetter}
            eventStyleGetter={eventStyleGetter}
            calendarTimeBounds={calendarTimeBounds}
            minCalendarDate={minCalendarDate}
            maxCalendarDate={maxCalendarDate}
            todayStart={todayStart}
            error={timetableError}
            showError={setTimetableError}
          />
        );
      case 'pay':
        return (
          <PostShiftPayStep
            isDarkMode={isDarkMode}
            isEmbedded={isEmbedded}
            isLocumLike={isLocumLike}
            roleNeeded={roleNeeded}
            rateType={rateType}
            setRateType={setRateType}
            paymentPreference={paymentPreference}
            setPaymentPreference={setPaymentPreference}
            locumSuperIncluded={locumSuperIncluded}
            setLocumSuperIncluded={setLocumSuperIncluded}
            ftptPayMode={ftptPayMode}
            setFtptPayMode={setFtptPayMode}
            minHourly={minHourly}
            setMinHourly={setMinHourly}
            maxHourly={maxHourly}
            setMaxHourly={setMaxHourly}
            minAnnual={minAnnual}
            setMinAnnual={setMinAnnual}
            maxAnnual={maxAnnual}
            setMaxAnnual={setMaxAnnual}
            superPercent={superPercent}
            setSuperPercent={setSuperPercent}
            visibility={visibility}
            escalationDates={escalationDates}
            rateWeekday={rateWeekday}
            setRateWeekday={setRateWeekday}
            rateSaturday={rateSaturday}
            setRateSaturday={setRateSaturday}
            rateSunday={rateSunday}
            setRateSunday={setRateSunday}
            ratePublicHoliday={ratePublicHoliday}
            setRatePublicHoliday={setRatePublicHoliday}
            rateEarlyMorning={rateEarlyMorning}
            setRateEarlyMorning={setRateEarlyMorning}
            rateLateNight={rateLateNight}
            setRateLateNight={setRateLateNight}
            handleSavePharmacyRateDefaults={handleSavePharmacyRateDefaults}
            savingPharmacyRates={savingPharmacyRates}
            pharmacyId={pharmacyId}
            expandedSlots={expandedSlots}
            slotRateRows={slotRateRows}
            ownerBonus={ownerBonus}
            setOwnerBonus={setOwnerBonus}
            handleSlotRateChange={handleSlotRateChange}
          />
        );
      case 'review':
        return renderPreview ? (
          <Stack spacing={2}>
            <Typography color="text.secondary">This is how your shift appears on the job board. Go back to change anything.</Typography>
            {renderPreview(previewShift())}
          </Stack>
        ) : null;
      default: return null;
    }
  };

  // Post Shift follows the shared dashboard theme (it used to build its own off-brand theme here).
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (!user) return null;

  return (
      <Container
        maxWidth={false}
        sx={{
          px: isEmbedded ? { xs: 1, sm: 2, md: 3 } : 0,
          py: isEmbedded ? { xs: 1, sm: 1.5 } : 0,
          bgcolor: 'transparent',
          minHeight: 'auto',
          maxWidth: isEmbedded ? '100%' : { xs: '100%', lg: 1200, xl: 1400 },
        }}
      >
        {!isEmbedded && (
          renderHeader(editingShiftId ? 'Edit Shift' : 'Create a New Shift', 'Follow the steps to post a new shift opportunity.')
        )}
        <Paper
          variant={isEmbedded ? undefined : 'outlined'}
          sx={{
            // One flat card for the wizard (stepper + current step), like every other dashboard card.
            p: isEmbedded ? 0 : { xs: 2, md: 3.5 },
            border: isEmbedded ? 'none' : undefined,
            borderRadius: isEmbedded ? 0 : 'var(--ct-card-radius)',
            boxShadow: 'none',
            bgcolor: isEmbedded ? 'transparent' : 'var(--ct-surface-bg)',
            width: '100%',
          }}
        >

          <PostShiftWizardShell
            steps={steps}
            activeStep={activeStep}
            setActiveStep={setActiveStep}
            isMobile={isMobile}
            isEmbedded={isEmbedded}
            isEditing={Boolean(editingShiftId)}
            slotsLength={slots.length}
            onSubmit={handleSubmit}
            submitting={submitting}
          >
            {renderStepContent(activeStep)}
          </PostShiftWizardShell>
        </Paper>
        <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
        </Snackbar>
      </Container>
  );
};

export default PostShiftForm;
