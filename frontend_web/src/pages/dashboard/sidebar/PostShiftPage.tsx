import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Container,
  Alert,
  Paper,
  Snackbar,
  Typography,
  createTheme,
  ThemeProvider,
  useMediaQuery,
  // Switch,
  // Divider,
} from '@mui/material';
import {
  Work as WorkIcon,
  Visibility as VisibilityIcon,
  VerifiedUser as SkillsIcon,
  AttachMoney as RateIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import Grid from '@mui/material/Grid';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import dayjs from 'dayjs';
import {
  Shift,
  EscalationLevelKey,
  fetchPharmaciesService,
  fetchActiveShiftDetailService,
  calculateShiftRates,
  createOwnerShiftService,
  updateOwnerShiftService,
} from '@chemisttasker/shared-core';
import { useColorMode } from '../../../theme/sleekTheme';
import apiClient from '../../../utils/apiClient';
import PostShiftWizardShell from './PostShiftWizardShell';
import PostShiftDetailsStep from './PostShiftDetailsStep';
import PostShiftSkillsStep from './PostShiftSkillsStep';
import PostShiftVisibilityStep from './PostShiftVisibilityStep';
import PostShiftPayStep from './PostShiftPayStep';
import PostShiftTimetableStep from './PostShiftTimetableStep';

import {
  type PharmacyOption,
  type ShiftDescriptionTemplate,
  type SlotEntry,
  type CalendarEvent,
  type CalendarViewOption,
  toRateInputString,
  getSlotRateValue,
  firstPresent,
  DEFAULT_SUPER_PERCENT,
  toIsoDate,
  isValidDate,
  applyTimeToDate,
  formatSlotTime,
  toInputDateTimeLocal,
  normalizePrefillRole,
  pharmacyHoursForDate,
  ORG_ROLE_VALUES,
  readPostShiftPrefill,
} from './PostShiftPage.helpers';

type PostShiftPageProps = {
  onCompleted?: () => void;
};

const PostShiftPage: React.FC<PostShiftPageProps> = ({ onCompleted }) => {
  const { user, activePersona, activeAdminPharmacyId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { mode } = useColorMode();
  const isDarkMode = mode === 'dark';

  if (!user) return null; // FIX: Added null check for user

  const scopedPharmacyId =
    activePersona === "admin" && typeof activeAdminPharmacyId === "number"
      ? activeAdminPharmacyId
      : null;

  const params = new URLSearchParams(location.search);
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
  } = readPostShiftPrefill(location.search);

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
  const [descriptionTemplate, setDescriptionTemplate] = useState<ShiftDescriptionTemplate | null>(null);
  const [descriptionTemplateLoading, setDescriptionTemplateLoading] = useState(false);
  const [descriptionTemplateSaving, setDescriptionTemplateSaving] = useState(false);
  const [descriptionTemplateAutoAppliedKey, setDescriptionTemplateAutoAppliedKey] = useState<string | null>(null);
  const [workloadTags, setWorkloadTags] = useState<string[]>([]);
  const [dedicatedUserId, setDedicatedUserId] = useState<number | null>(null);
  const [mustHave, setMustHave] = useState<string[]>([]);
  const [niceToHave, setNiceToHave] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<string>('');
  const [escalationDates, setEscalationDates] = useState<Record<string, string>>({});
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
  const [singleUserOnly, setSingleUserOnly] = useState(false);
  const [flexibleTiming, setFlexibleTiming] = useState(false);
  const [postAnonymously, setPostAnonymously] = useState(false);
  const [hasTravel, setHasTravel] = useState(false);
  const [hasAccommodation, setHasAccommodation] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [notifyPharmacyStaff, setNotifyPharmacyStaff] = useState(false);
  const [notifyFavoriteStaff, setNotifyFavoriteStaff] = useState(false);
  const [notifyChainMembers, setNotifyChainMembers] = useState(false);
  const [locumSuperIncluded, setLocumSuperIncluded] = useState(true);

  // --- Timetable State ---
  const [slots, setSlots] = useState<SlotEntry[]>([]);
  const [slotDate, setSlotDate] = useState<string>('');
  const [slotStartTime, setSlotStartTime] = useState<string>('09:00');
  const [slotEndTime, setSlotEndTime] = useState<string>('17:00');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedDateTimes, setSelectedDateTimes] = useState<Record<string, { startTime: string; endTime: string }>>({});
  const [calendarView, setCalendarView] = useState<CalendarViewOption>('month');

  // --- UI State ---
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [activeStep, setActiveStep] = useState(0);
  const [prefillAppliedFor, setPrefillAppliedFor] = useState<string | null>(null);

  // --- Calendar Control State ---
  const todayStart = useMemo(() => dayjs().startOf('day'), []);
  const [calendarDate, setCalendarDate] = useState(todayStart.toDate());
  const minCalendarDate = useMemo(() => todayStart.toDate(), [todayStart]);
  const maxCalendarDate = useMemo(() => todayStart.add(4, 'month').endOf('month').toDate(), [todayStart]);
  const minDateInputValue = useMemo(() => todayStart.format('YYYY-MM-DD'), [todayStart]);
  const safeCalendarDate = useMemo(
    () => (isValidDate(calendarDate) ? calendarDate : todayStart.toDate()),
    [calendarDate, todayStart]
  );

  const calendarTimeBounds = useMemo(() => {
    const base = dayjs(safeCalendarDate);
    if (!base.isValid()) {
      const fallback = todayStart;
      return {
        min: fallback.startOf('day').toDate(),
        max: fallback.endOf('day').toDate(),
      };
    }

    let minBound = base.startOf('day');
    let maxBound = base.endOf('day');

    return {
      min: minBound.toDate(),
      max: maxBound.toDate(),
    };
  }, [safeCalendarDate, todayStart]);

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
          const detail = await fetchActiveShiftDetailService(Number(editingShiftId));
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
          setRoleNeeded(detail.roleNeeded ?? '');
          setDescription(detail.description ?? '');
          setWorkloadTags(detail.workloadTags ?? []);
          setMustHave(detail.mustHave ?? []);
          setNiceToHave(detail.niceToHave ?? []);
          setVisibility(detail.visibility ?? 'FULL_PART_TIME');
          const incomingRateType = detail.rateType ?? '';
          setRateType(incomingRateType || 'FLEXIBLE');
          setRateWeekday(toRateInputString(firstPresent((detail as any).rateWeekday, (detail as any).rate_weekday, (pharmacyDefaults as any)?.rateWeekday, (pharmacyDefaults as any)?.rate_weekday)));
          setRateSaturday(toRateInputString(firstPresent((detail as any).rateSaturday, (detail as any).rate_saturday, (pharmacyDefaults as any)?.rateSaturday, (pharmacyDefaults as any)?.rate_saturday)));
          setRateSunday(toRateInputString(firstPresent((detail as any).rateSunday, (detail as any).rate_sunday, (pharmacyDefaults as any)?.rateSunday, (pharmacyDefaults as any)?.rate_sunday)));
          setRatePublicHoliday(toRateInputString(firstPresent((detail as any).ratePublicHoliday, (detail as any).rate_public_holiday, (pharmacyDefaults as any)?.ratePublicHoliday, (pharmacyDefaults as any)?.rate_public_holiday)));
          setRateEarlyMorning(toRateInputString(firstPresent((detail as any).rateEarlyMorning, (detail as any).rate_early_morning, (pharmacyDefaults as any)?.rateEarlyMorning, (pharmacyDefaults as any)?.rate_early_morning)));
          setRateLateNight(toRateInputString(firstPresent((detail as any).rateLateNight, (detail as any).rate_late_night, (pharmacyDefaults as any)?.rateLateNight, (pharmacyDefaults as any)?.rate_late_night)));
          setOwnerBonus(toRateInputString((detail as any).ownerAdjustedRate ?? (detail as any).owner_adjusted_rate ?? (detail as any).ownerBonus ?? (detail as any).owner_bonus));
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
          const parsedSlots = (detail.slots ?? []).map((slot: NonNullable<Shift['slots']>[number]) => ({
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isRecurring: Boolean(slot.isRecurring),
            recurringDays: slot.recurringDays ?? [],
            recurringEndDate: slot.recurringEndDate ?? '',
          }));
          setSlots(parsedSlots);
          setSlotRateRows((detail.slots ?? []).map((slot: NonNullable<Shift['slots']>[number]) => {
            const rate = toRateInputString(getSlotRateValue(slot));
            return { rate, status: rate ? 'success' as const : 'idle' as const, dirty: false };
          }));
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
    if (!pharmacyId || !roleNeeded) {
      setDescriptionTemplate(null);
      setDescriptionTemplateAutoAppliedKey(null);
      return;
    }

    let cancelled = false;
    const templateKey = `${pharmacyId}:${roleNeeded}`;

    const loadDescriptionTemplate = async () => {
      setDescriptionTemplateLoading(true);
      try {
        const { data } = await apiClient.get('/client-profile/shift-description-templates/', {
          params: { pharmacy: pharmacyId, role_needed: roleNeeded },
        });
        if (cancelled) {
          return;
        }
        const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
        const template = (list[0] ?? null) as ShiftDescriptionTemplate | null;
        setDescriptionTemplate(template);
        if (
          template?.description &&
          !editingShiftId &&
          !description.trim() &&
          descriptionTemplateAutoAppliedKey !== templateKey
        ) {
          setDescription(template.description);
          setDescriptionTemplateAutoAppliedKey(templateKey);
        }
      } catch {
        if (!cancelled) {
          setDescriptionTemplate(null);
        }
      } finally {
        if (!cancelled) {
          setDescriptionTemplateLoading(false);
        }
      }
    };

    loadDescriptionTemplate();

    return () => {
      cancelled = true;
    };
  }, [pharmacyId, roleNeeded, editingShiftId, description, descriptionTemplateAutoAppliedKey]);

  const handleUseDescriptionTemplate = () => {
    if (!descriptionTemplate?.description) return;
    setDescription(descriptionTemplate.description);
  };

  const handleSaveDescriptionTemplate = async () => {
    if (!pharmacyId || !roleNeeded) {
      showSnackbar('Select a pharmacy and role before saving a description template', 'error');
      return;
    }
    if (!description.trim()) {
      showSnackbar('Enter a description before saving it as a template', 'error');
      return;
    }
    setDescriptionTemplateSaving(true);
    try {
      const { data } = await apiClient.post('/client-profile/shift-description-templates/', {
        pharmacy: pharmacyId,
        role_needed: roleNeeded,
        description,
      });
      setDescriptionTemplate(data as ShiftDescriptionTemplate);
      setDescriptionTemplateAutoAppliedKey(`${pharmacyId}:${roleNeeded}`);
      showSnackbar('Description template saved for this role', 'success');
    } catch {
      showSnackbar('Unable to save description template', 'error');
    } finally {
      setDescriptionTemplateSaving(false);
    }
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
      const { data } = await apiClient.patch(`/client-profile/pharmacies/${pharmacyId}/`, payload);
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
  const selectedPharmacy = useMemo(
    () => pharmacies.find((x) => x.id === pharmacyId),
    [pharmacyId, pharmacies]
  );
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
    if (isEmbedded && allowedVis.includes('LOCUM_CASUAL')) {
      if (visibility !== 'LOCUM_CASUAL') {
        setVisibility('LOCUM_CASUAL');
      }
      return;
    }
    if (!allowedVis.includes(visibility)) {
      setVisibility(allowedVis[0]);
    }
  }, [allowedVis, visibility, isEmbedded]);

  const showNotifyPharmacyStaff = !isEmbedded && !editingShiftId && ['FULL_PART_TIME', 'LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'].includes(visibility);
  const showNotifyFavoriteStaff = !isEmbedded && !editingShiftId && ['LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'].includes(visibility);
  const showNotifyChainMembers = !isEmbedded && !editingShiftId && ['OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'].includes(visibility);
  const canPostAnonymously = !isEmbedded && ['ORG_CHAIN', 'PLATFORM'].includes(visibility);

  useEffect(() => {
    if (!showNotifyPharmacyStaff) setNotifyPharmacyStaff(false);
    if (!showNotifyFavoriteStaff) setNotifyFavoriteStaff(false);
    if (!showNotifyChainMembers) setNotifyChainMembers(false);
  }, [showNotifyPharmacyStaff, showNotifyFavoriteStaff, showNotifyChainMembers]);

  useEffect(() => {
    if (!canPostAnonymously) setPostAnonymously(false);
  }, [canPostAnonymously]);

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

  const showSnackbar = (msg: string, severity: 'success' | 'error' = 'success') => setSnackbar({ open: true, message: msg, severity });
  const formatErrorMessage = (err: any): string => {
    const fallback = err?.message || 'An error occurred.';
    const data = err?.response?.data;
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.join('; ');
    if (typeof data === 'object') {
      const parts: string[] = [];
      Object.entries(data).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          parts.push(`${key}: ${value.join(', ')}`);
        } else if (typeof value === 'string') {
          parts.push(`${key}: ${value}`);
        }
      });
      return parts.length ? parts.join('; ') : fallback;
    }
    return fallback;
  };
  const isLocumLike = useMemo(
    () => employmentType === 'LOCUM' || employmentType === 'CASUAL',
    [employmentType]
  );

  const steps = useMemo(() => {
    const base = [
      { key: 'details', label: 'Shift Details', icon: WorkIcon },
      { key: 'skills', label: 'Skills', icon: SkillsIcon },
      { key: 'visibility', label: 'Visibility', icon: VisibilityIcon },
    ];
    const tail = [
      ...(isLocumLike ? [{ key: 'timetable', label: 'Timetable', icon: ScheduleIcon }] : []),
      { key: 'pay', label: 'Pay Rate', icon: RateIcon },
    ];
    return [...base, ...tail];
  }, [isLocumLike]);

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = [];

    slots.forEach((slot, slotIndex) => {
      const addOccurrence = (date: Date, occurrenceIndex: number) => {
        if (!isValidDate(date)) {
          console.warn('Skipping slot with invalid date', slot, date);
          return;
        }
        const start = applyTimeToDate(date, slot.startTime);
        const end = applyTimeToDate(date, slot.endTime);
        if (!isValidDate(start) || !isValidDate(end)) {
          console.warn('Skipping slot with invalid start/end time', slot, { start, end });
          return;
        }
        events.push({
          id: `${slotIndex}-${occurrenceIndex}-${start.toISOString()}`,
          title: `${formatSlotTime(slot.startTime)} — ${formatSlotTime(slot.endTime)}`,
          start,
          end,
          resource: { slotIndex, occurrenceIndex },
        });
      };

      const baseDate = toIsoDate(slot.date);
      if (!isValidDate(baseDate)) {
        console.warn('Ignoring slot with unparsable date value', slot.date);
        return;
      }

      if (slot.isRecurring && slot.recurringEndDate && slot.recurringDays.length) {
        const endBoundary = toIsoDate(slot.recurringEndDate);
        if (!isValidDate(endBoundary)) {
          console.warn('Recurring slot has invalid end date. Falling back to single occurrence.', slot);
          addOccurrence(baseDate, 0);
          return;
        }
        let cursor: Date = baseDate;
        let occurrenceIndex = 0;
        while (cursor <= endBoundary) {
          if (slot.recurringDays.includes(cursor.getDay())) {
            addOccurrence(cursor, occurrenceIndex);
            occurrenceIndex += 1;
          }
          cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
        }
      } else {
        addOccurrence(baseDate, 0);
      }
    });

    return events.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [slots]);

  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const getDefaultTimesForDate = useCallback(
    (date: string, fallback: SlotTime = { startTime: slotStartTime, endTime: slotEndTime }) =>
      pharmacyHoursForDate(selectedPharmacy, date, fallback),
    [selectedPharmacy, slotEndTime, slotStartTime]
  );
  const slotDateHours = useMemo(
    () => (slotDate ? getDefaultTimesForDate(slotDate) : null),
    [getDefaultTimesForDate, slotDate]
  );
  const closedSelectedDates = useMemo(
    () => selectedDates.map((date) => ({ date, hours: getDefaultTimesForDate(date) })).filter((item) => item.hours.closed),
    [getDefaultTimesForDate, selectedDates]
  );
  useEffect(() => {
    if (editingShiftId || !selectedPharmacy || !slotDate || selectedDates.length > 0 || slots.length > 0) return;
    const hours = getDefaultTimesForDate(slotDate);
    setSlotStartTime(hours.startTime);
    setSlotEndTime(hours.endTime);
  }, [editingShiftId, getDefaultTimesForDate, selectedDates.length, selectedPharmacy, slotDate, slots.length]);
  const mergeSelectedDates = useCallback(
    (incomingDates: string[], timeOverride?: { startTime: string; endTime: string }) => {
      if (!incomingDates.length) return;

      const normalizedIncoming = incomingDates.filter((date) => !dayjs(date).isBefore(todayStart, 'day'));
      if (!normalizedIncoming.length) return;

      setSelectedDates((prev) => {
        const merged = Array.from(new Set([...prev, ...normalizedIncoming])).sort();
        return merged;
      });

      setSelectedDateTimes((prev) => {
        const next = { ...prev };
        normalizedIncoming.forEach((date) => {
          if (timeOverride) {
            next[date] = timeOverride;
          } else if (!next[date]) {
            const hours = getDefaultTimesForDate(date);
            next[date] = { startTime: hours.startTime, endTime: hours.endTime };
          }
        });
        return next;
      });

      const latest = normalizedIncoming[normalizedIncoming.length - 1];
      if (latest) {
        const latestHours = timeOverride ?? getDefaultTimesForDate(latest);
        setSlotDate(latest);
        setSlotStartTime(latestHours.startTime);
        setSlotEndTime(latestHours.endTime);
      }
    },
    [getDefaultTimesForDate, todayStart]
  );

  const expandedSlots = useMemo(() => {
    const occurrences: Array<{ date: string; startTime: string; endTime: string }> = [];

    slots.forEach((slot) => {
      const addOccurrence = (date: Date) => {
        if (!isValidDate(date)) return;
        occurrences.push({
          date: dayjs(date).format('YYYY-MM-DD'),
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
      };

      const baseDate = toIsoDate(slot.date);
      if (!isValidDate(baseDate)) {
        return;
      }

      if (slot.isRecurring && slot.recurringEndDate && slot.recurringDays.length) {
        const endBoundary = toIsoDate(slot.recurringEndDate);
        if (!isValidDate(endBoundary)) {
          addOccurrence(baseDate);
          return;
        }
        let cursor: Date = baseDate;
        while (cursor <= endBoundary) {
          if (slot.recurringDays.includes(cursor.getDay())) {
            addOccurrence(cursor);
          }
          cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
        }
      } else {
        addOccurrence(baseDate);
      }
    });

    return occurrences.sort(
      (a, b) => dayjs(`${a.date}T${a.startTime}`).valueOf() - dayjs(`${b.date}T${b.startTime}`).valueOf()
    );
  }, [slots]);

  useEffect(() => {
    if (slots.length === 0) return;
    const firstValidEvent = calendarEvents.find((event) => !Number.isNaN(event.start.getTime()));
    if (firstValidEvent && isValidDate(firstValidEvent.start)) {
      setCalendarDate(firstValidEvent.start);
    }
  }, [calendarEvents, slots.length]);

  useEffect(() => {
    setSlotRateRows((prev) =>
      expandedSlots.map((_, idx) => prev[idx] ?? { rate: '', status: 'idle' as const })
    );
  }, [expandedSlots]);

  const eventStyleGetter = useCallback((_event: CalendarEvent, _start: Date, _end: Date, _isSelected: boolean) => {
    const backgroundColor = '#8B5CF6'; // A slightly lighter purple
    const style = {
      backgroundColor,
      borderRadius: '6px',
      color: 'white',
      border: '1px solid #6D28D9',
      boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
      padding: '2px 5px',
    };
    return { style };
  }, []);

  const dayPropGetter = useCallback(
    (date: Date) => {
      const iso = dayjs(date).format('YYYY-MM-DD');
      const hours = getDefaultTimesForDate(iso);
      if (hours.closed) {
        return {
          style: {
            backgroundColor: selectedDateSet.has(iso) ? 'rgba(239, 68, 68, 0.14)' : 'rgba(254, 242, 242, 0.95)',
            boxShadow: selectedDateSet.has(iso)
              ? 'inset 0 0 0 2px rgba(220, 38, 38, 0.55)'
              : 'inset 0 0 0 1px rgba(220, 38, 38, 0.35)',
          },
        };
      }
      if (selectedDateSet.has(iso)) {
        return {
          style: {
            backgroundColor: 'rgba(109, 40, 217, 0.12)',
            boxShadow: 'inset 0 0 0 2px rgba(109, 40, 217, 0.35)',
          },
        };
      }
      return {};
    },
    [getDefaultTimesForDate, selectedDateSet]
  );

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
              prior.dirty && prior.rate !== undefined && prior.rate !== null && prior.rate !== ''
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
        showSnackbar(formatErrorMessage(err), 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [
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

  const addSlotEntries = (
    entries: SlotEntry[],
    options?: { clearDates?: string[]; clearAllSelected?: boolean; resetRecurring?: boolean }
  ): boolean => {
    const existingKeys = new Set(slots.map((s) => `${s.date}-${s.startTime}-${s.endTime}-${s.isRecurring}-${s.recurringDays.join(',')}`));
    const filtered = entries.filter(
      (entry) => !existingKeys.has(`${entry.date}-${entry.startTime}-${entry.endTime}-${entry.isRecurring}-${entry.recurringDays.join(',')}`)
    );

    if (!filtered.length) {
      showSnackbar('Those timetable entries already exist.', 'error');
      return false;
    }

    setSlots((prev) => [...prev, ...filtered]);
    showSnackbar(`${filtered.length} timetable entr${filtered.length > 1 ? 'ies' : 'y'} added.`);

    if (options?.clearAllSelected) {
      setSelectedDates([]);
      setSelectedDateTimes({});
    } else if (options?.clearDates?.length) {
      setSelectedDates((prev) => prev.filter((date) => !options.clearDates?.includes(date)));
      setSelectedDateTimes((prev) => {
        const next = { ...prev };
        options.clearDates?.forEach((date) => {
          delete next[date];
        });
        return next;
      });
    }

    if (options?.resetRecurring) {
      setIsRecurring(false);
      setRecurringDays([]);
      setRecurringEndDate('');
    }

    return true;
  };

  const handleAddManualSlot = (): boolean => {
    if (!slotStartTime || !slotEndTime) {
      showSnackbar('Please select a start and end time.', 'error');
      return false;
    }
    if (new Date(`1970-01-01T${slotEndTime}`) <= new Date(`1970-01-01T${slotStartTime}`)) {
      showSnackbar('End time must be after start time.', 'error');
      return false;
    }

    if (!slotDate) {
      showSnackbar('Select a date to add a manual schedule entry.', 'error');
      return false;
    }

    if (isRecurring && (!recurringEndDate || recurringDays.length === 0)) {
      showSnackbar('Please complete the recurrence details.', 'error');
      return false;
    }

    if (dayjs(slotDate).isBefore(todayStart, 'day')) {
      showSnackbar('Cannot schedule entries in the past.', 'error');
      return false;
    }

    const newEntries: SlotEntry[] = [{
      date: slotDate,
      startTime: slotStartTime,
      endTime: slotEndTime,
      isRecurring,
      recurringDays: isRecurring ? recurringDays : [],
      recurringEndDate: isRecurring ? recurringEndDate : '',
    }];

    return addSlotEntries(newEntries, { resetRecurring: true });
  };

  const handleAddSelectedDate = (date: string): boolean => {
    const custom = selectedDateTimes[date] || { startTime: slotStartTime, endTime: slotEndTime };
    if (!custom.startTime || !custom.endTime) {
      showSnackbar('Please select a start and end time.', 'error');
      return false;
    }
    if (new Date(`1970-01-01T${custom.endTime}`) <= new Date(`1970-01-01T${custom.startTime}`)) {
      showSnackbar('End time must be after start time.', 'error');
      return false;
    }
    if (dayjs(date).isBefore(todayStart, 'day')) {
      showSnackbar('Cannot schedule entries in the past.', 'error');
      return false;
    }
    return addSlotEntries([{
      date,
      startTime: custom.startTime,
      endTime: custom.endTime,
      isRecurring: false,
      recurringDays: [],
      recurringEndDate: '',
    }], { clearDates: [date] });
  };

  const handleAddAllSelectedDates = (): boolean => {
    if (!selectedDates.length) {
      showSnackbar('Select at least one date from the calendar.', 'error');
      return false;
    }

    const validDates = selectedDates.filter((date) => !dayjs(date).isBefore(todayStart, 'day'));
    if (!validDates.length) {
      showSnackbar('Cannot schedule entries in the past.', 'error');
      return false;
    }
    if (validDates.length < selectedDates.length) {
      showSnackbar('Past dates were ignored.', 'error');
    }

    const newEntries: SlotEntry[] = [];
    for (const date of validDates) {
      const custom = selectedDateTimes[date] || { startTime: slotStartTime, endTime: slotEndTime };
      if (!custom.startTime || !custom.endTime) {
        showSnackbar('Please select a start and end time.', 'error');
        return false;
      }
      if (new Date(`1970-01-01T${custom.endTime}`) <= new Date(`1970-01-01T${custom.startTime}`)) {
        showSnackbar('Each selected day must have an end time after its start time.', 'error');
        return false;
      }
      newEntries.push({
        date,
        startTime: custom.startTime,
        endTime: custom.endTime,
        isRecurring: false,
        recurringDays: [],
        recurringEndDate: '',
      });
    }

    return addSlotEntries(newEntries, { clearAllSelected: true });
  };

  const handleEditSlot = (index: number) => {
    const slot = slots[index];
    if (!slot) return;

    setSlotDate(slot.date);
    setSlotStartTime(slot.startTime);
    setSlotEndTime(slot.endTime);
    setIsRecurring(slot.isRecurring);
    setRecurringDays(slot.recurringDays || []);
    setRecurringEndDate(slot.recurringEndDate || '');
    setSelectedDates((current) =>
      current.includes(slot.date) ? current : [...current, slot.date].sort()
    );
    setSelectedDateTimes((current) => ({
      ...current,
      [slot.date]: { startTime: slot.startTime, endTime: slot.endTime },
    }));
    setCalendarDate(dayjs(slot.date).toDate());
    setSlots((current) => current.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async () => {
    if (!pharmacyId || !roleNeeded || !employmentType) return showSnackbar('Please fill all required fields in Step 1.', 'error');
    if (isLocumLike && slots.length === 0) return showSnackbar('Please add at least one schedule entry.', 'error');
    if (!isLocumLike) {
      if (ftptPayMode === 'HOURLY') {
        if (!minHourly || !maxHourly) return showSnackbar('Enter min and max hourly rates.', 'error');
      } else {
        if (!minAnnual || !maxAnnual || !superPercent) return showSnackbar('Enter min/max annual and super %.', 'error');
      }
    }

    setSubmitting(true);
    const slotRateForEntry = (entry: SlotEntry) => {
      const idx = expandedSlots.findIndex(
        (slot) => slot.date === entry.date && slot.startTime === entry.startTime && slot.endTime === entry.endTime
      );
      if (idx < 0) return null;
      const raw = slotRateRows[idx]?.rate;
      if (raw === undefined || raw === null || raw === '') return null;
      const num = Number(raw);
      return Number.isFinite(num) ? num.toFixed(2) : null;
    };

    const payload: any = {
      pharmacy: pharmacyId, role_needed: roleNeeded, description, employment_type: employmentType,
      workload_tags: workloadTags, must_have: mustHave, nice_to_have: niceToHave,
      visibility: isEmbedded ? 'LOCUM_CASUAL' : visibility,
      escalate_to_locum_casual: isEmbedded ? null : (escalationDates['LOCUM_CASUAL'] || null),
      escalate_to_owner_chain: isEmbedded ? null : (escalationDates['OWNER_CHAIN'] || null),
      escalate_to_org_chain: isEmbedded ? null : (escalationDates['ORG_CHAIN'] || null),
      escalate_to_platform: isEmbedded ? null : (escalationDates['PLATFORM'] || null),
      flexible_timing: flexibleTiming,
      rate_type: roleNeeded === 'PHARMACIST' ? rateType : null,
      owner_adjusted_rate: (roleNeeded !== 'PHARMACIST' && ownerBonus) ? Number(ownerBonus) : null,
      payment_preference: (employmentType === 'LOCUM' || employmentType === 'CASUAL') ? (paymentPreference || null) : null,
      single_user_only: singleUserOnly,
      post_anonymously: canPostAnonymously ? postAnonymously : false,
      has_travel: hasTravel,
      has_accommodation: hasAccommodation,
      is_urgent: isUrgent,
      slots: slots.map(s => ({
        date: s.date, start_time: s.startTime, end_time: s.endTime,
        is_recurring: s.isRecurring, recurring_days: s.recurringDays,
        recurring_end_date: s.recurringEndDate || null,
        rate: slotRateForEntry(s),
      })),
    };
    if (dedicatedUserId) {
      payload.dedicated_user = dedicatedUserId;
    }
    if (isLocumLike) {
      payload.super_percent = locumSuperIncluded ? DEFAULT_SUPER_PERCENT : 0;
    }
    if (roleNeeded === 'PHARMACIST') {
      payload.rate_weekday = rateWeekday || null;
      payload.rate_saturday = rateSaturday || null;
      payload.rate_sunday = rateSunday || null;
      payload.rate_public_holiday = ratePublicHoliday || null;
      payload.rate_early_morning = rateEarlyMorning || null;
      payload.rate_late_night = rateLateNight || null;
    }
    if (!editingShiftId) {
      payload.notify_pharmacy_staff = isEmbedded ? false : notifyPharmacyStaff;
      payload.notify_favorite_staff = isEmbedded ? false : notifyFavoriteStaff;
      payload.notify_chain_members = isEmbedded ? false : notifyChainMembers;
    }

    if (!isLocumLike) {
      if (ftptPayMode === 'HOURLY') {
        payload.min_hourly_rate = minHourly || null;
        payload.max_hourly_rate = maxHourly || null;
        payload.min_annual_salary = null;
        payload.max_annual_salary = null;
        payload.super_percent = null;
      } else {
        payload.min_hourly_rate = null;
        payload.max_hourly_rate = null;
        payload.min_annual_salary = minAnnual || null;
        payload.max_annual_salary = maxAnnual || null;
        payload.super_percent = superPercent || null;
      }
    }

    let success = false;
    try {
      if (editingShiftId) {
        await updateOwnerShiftService(Number(editingShiftId), payload);
        showSnackbar('Shift updated successfully!');
      } else {
        await createOwnerShiftService(payload);
        showSnackbar('Shift posted successfully!');
      }
      success = true;
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
      showSnackbar(formatErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
      if (success && onCompleted) {
        onCompleted();
      }
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
          />
        );
      case 'skills':
        return (
          <PostShiftSkillsStep
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
            isEmbedded={isEmbedded}
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
            showSnackbar={showSnackbar}
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
      default: return null;
    }
  };

  const theme = createTheme({
    palette: {
      mode,
      primary: { main: '#6D28D9', light: '#8B5CF6', dark: '#5B21B6' },
      secondary: { main: '#10B981', light: '#6EE7B7', dark: '#047857' },
      background: {
        default: isDarkMode ? '#07111f' : '#F9FAFB',
        paper: isDarkMode ? '#101b2f' : '#FFFFFF',
      },
      text: {
        primary: isDarkMode ? '#F8FAFC' : '#111827',
        secondary: isDarkMode ? '#CBD5E1' : '#64748B',
      },
      divider: isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(15, 23, 42, 0.12)',
    },
    typography: {
      fontFamily: "'Inter', sans-serif",
      h4: { fontWeight: 700 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: ({ theme }) => ({
            boxShadow: theme.palette.mode === 'dark'
              ? '0 18px 46px rgba(0,0,0,0.34)'
              : '0 8px 32px 0 rgba(0,0,0,0.07)',
            backgroundImage: 'none',
            borderColor: theme.palette.divider,
          }),
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.78)' : theme.palette.background.paper,
            color: theme.palette.text.primary,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.32)' : 'rgba(15, 23, 42, 0.18)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.primary.light,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.primary.main,
            },
          }),
          input: ({ theme }) => ({
            color: theme.palette.text.primary,
            '&::placeholder': {
              color: theme.palette.text.secondary,
              opacity: 0.85,
            },
          }),
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.text.secondary,
            '&.Mui-focused': {
              color: theme.palette.primary.light,
            },
          }),
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.text.secondary,
          }),
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          label: ({ theme }) => ({
            color: theme.palette.text.primary,
          }),
        },
      },
      MuiSelect: {
        styleOverrides: {
          icon: ({ theme }) => ({
            color: theme.palette.text.secondary,
          }),
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            border: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.text.primary,
            '&:hover': {
              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(109, 40, 217, 0.18)' : 'rgba(109, 40, 217, 0.08)',
            },
          }),
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            borderColor: theme.palette.divider,
            backgroundImage: 'none',
          }),
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.84)' : '#F8FAFC',
            color: theme.palette.text.primary,
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.text.primary,
            borderColor: theme.palette.divider,
            fontWeight: 500,
          }),
          outlined: ({ theme }) => ({
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.72)' : '#FFFFFF',
          }),
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.mode === 'dark' ? '#94A3B8' : undefined,
          }),
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.text.secondary,
            borderColor: theme.palette.divider,
            '&.Mui-selected': {
              color: `${theme.palette.common.white} !important`,
            },
          }),
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.92)' : undefined,
            color: theme.palette.text.primary,
          }),
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 8,
          },
        },
      },
    },
  });
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <ThemeProvider theme={theme}>
      <Container
        maxWidth={false}
        sx={{
          px: isEmbedded ? { xs: 1, sm: 2, md: 3 } : { xs: 1.5, sm: 2.5, md: 4 },
          py: isEmbedded ? { xs: 1, sm: 1.5 } : 4,
          bgcolor: isEmbedded ? 'transparent' : 'background.default',
          minHeight: isEmbedded ? 'auto' : '100vh',
          maxWidth: isEmbedded ? '100%' : { xs: '100%', lg: 1200, xl: 1400 },
        }}
      >
        <Paper
          sx={{
            p: isEmbedded ? 0 : { xs: 2, md: 4 },
            borderRadius: isEmbedded ? 0 : 4,
            boxShadow: isEmbedded ? 'none' : '0 8px 32px 0 rgba(0,0,0,0.1)',
            bgcolor: isEmbedded ? 'transparent' : 'background.paper',
            width: '100%',
          }}
        >
          {!isEmbedded && (
            <>
              <Typography variant="h4" gutterBottom align="center" fontWeight={600}>
                {editingShiftId ? 'Edit Shift' : 'Create a New Shift'}
              </Typography>
              <Typography variant="body1" color="text.secondary" align="center" mb={4}>
                Follow the steps to post a new shift opportunity.
              </Typography>
            </>
          )}

          <PostShiftWizardShell
            steps={steps}
            activeStep={activeStep}
            setActiveStep={setActiveStep}
            isMobile={isMobile}
            isEmbedded={isEmbedded}
            isEditing={Boolean(editingShiftId)}
            slotsLength={slots.length}
            showError={(message) => showSnackbar(message, 'error')}
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
    </ThemeProvider>
  );
};

export default PostShiftPage;
