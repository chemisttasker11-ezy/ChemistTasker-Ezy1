import { buildShiftPostingPayload, buildShiftPostingPreview, validateShiftPostingDraft, haveShiftPostingSlotRatesChanged, getShiftPostingOwnerAdjustedRate, type ShiftPostingDraft } from '@chemisttasker/shared-core';
import NativeShiftBoardPreview from './NativeShiftBoardPreview';
import { expandShiftDraftSlots, reconcileShiftDraftRateRows } from '@chemisttasker/shared-core';
import { normalizeWorkloadTags, pharmacySoftwareDefaults, mergeSoftwareDefaults, type SupportEntry } from '@chemisttasker/shared-core';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import { normalizeShiftRequirements, canNotifyShiftChainMembers, isPrivateShiftBooking, automaticShiftEscalationDates, type ShiftEscalationPlan } from '@chemisttasker/shared-core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import {
    Text,
    Button,
    HelperText,
    Snackbar,
} from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { ContentState } from '@/components/ui';
import { useShiftSurface } from './useShiftSurface';
import {
    fetchPharmaciesService,
    fetchWorkerShiftDetailService,
    createOwnerShiftService,
    updateOwnerShiftService,
    calculateShiftRates,
} from '@chemisttasker/shared-core';
import { listShiftDescriptionTemplates, saveShiftDescriptionTemplate, updatePharmacy } from '@chemisttasker/shared-core';

import {
    BASE_STEP_ORDER,
    type StepKey,
    type RateType,
    type VisibilityTier,
    type VisibilityDates,
    toRateInputString,
    getSlotRateValue,
    firstPresent,
    type SlotEntry,
    type SlotTime,
    type PharmacyOption,
    type ShiftDescriptionTemplate,
    pharmacyHoursForDate,
    toIsoDate,
    toLocalIsoDate,
    normalizePrefillRole,
    parsePostShiftSearchParams,
    pickScopedPharmacyId,
    pickRetryPostShiftPharmacyId,
    canAccessPostShift,
    type PostShiftRawParams,
    AppliedPrefills,
    computePrefillPlan,
    computeResetFormPrefills,
    type PostShiftFormResetOptions,
    getStablePostShiftParamsKey,
    runPostShiftInitChain,
    shouldTriggerPostShiftInit,
    type PostShiftInitScope,
} from './PostShiftScreen.helpers';
import { styles } from './PostShiftScreen.styles';
import { useUnsavedChangesGuard } from '../forms/useUnsavedChangesGuard';
import PostShiftDetailsStep from './PostShiftDetailsStep';
import PostShiftSkillsStep from './PostShiftSkillsStep';
import PostShiftVisibilityStep from './PostShiftVisibilityStep';
import PostShiftProgress from './PostShiftProgress';
import PostShiftPayRateStep from './PostShiftPayRateStep';
import PostShiftTimetableStep from './PostShiftTimetableStep';

export default function PostShiftScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<PostShiftRawParams>();
    const surface = useShiftSurface();
    const { hasCapability } = useAuth();
    const paramsKey = useMemo(() => getStablePostShiftParamsKey(params), [
        params?.edit,
        params?.pharmacyId,
        params?.pharmacy_id,
        params?.dates,
        params?.date,
        params?.role_needed,
        params?.role,
        params?.start_time,
        params?.end_time,
        params?.dedicated_user,
        params?.embedded,
    ]);
    const parsedParams = useMemo(() => parsePostShiftSearchParams(params), [paramsKey]);
    const { editingId, routePharmacyId, isEmbedded } = parsedParams;
    const hasAccess = canAccessPostShift(surface, routePharmacyId, hasCapability);

    const loadedVisibilityRef = React.useRef<string | null>(null);
    const loadGenRef = React.useRef(0);
    const appliedPrefillsRef = React.useRef<AppliedPrefills>({});

    useEffect(() => {
        return () => {
            loadGenRef.current += 1;
        };
    }, [editingId, surface.scopedPharmacyId]);
    const [loadError, setLoadError] = useState<{ kind: 'pharmacies' | 'shift'; message: string } | null>(null);

    const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
    const [pharmacyId, setPharmacyId] = useState<number | ''>('');
    const [pharmaciesLoaded, setPharmaciesLoaded] = useState(false);
    const [roleNeeded, setRoleNeeded] = useState<string>('PHARMACIST');
    const [employmentType, setEmploymentType] = useState<string>('LOCUM');
    const [workloadTags, setWorkloadTags] = useState<string[]>([]);
    const [supportOnShift, setSupportOnShift] = useState<SupportEntry[]>([]);
    const [mustHave, setMustHave] = useState<string[]>([]);
    const [niceToHave, setNiceToHave] = useState<string[]>([]);
    const [hasTravel, setHasTravel] = useState(false);
    const [hasAccommodation, setHasAccommodation] = useState(false);
    const [isUrgent, setIsUrgent] = useState(false);
    const [flexibleTiming, setFlexibleTiming] = useState(false);
    const [singleUserOnly, setSingleUserOnly] = useState(false);
    const [hideName, setHideName] = useState(false);
    const [initialAudience, setInitialAudience] = useState<string>('');
    const [rateType, setRateType] = useState<RateType>('FLEXIBLE');
    const [ownerBonus, setOwnerBonus] = useState('');
    const [slots, setSlots] = useState<SlotEntry[]>([]);
    const [slotDate, setSlotDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [selectedDateTimes, setSelectedDateTimes] = useState<Record<string, { startTime: string; endTime: string }>>({});
    const [slotStart, setSlotStart] = useState('09:00');
    const [slotEnd, setSlotEnd] = useState('17:00');
    const liveTimesRef = React.useRef({ startTime: '09:00', endTime: '17:00' });
    liveTimesRef.current = { startTime: slotStart, endTime: slotEnd };
    const [slotRecurring, setSlotRecurring] = useState(false);
    const [slotRecurringDays, setSlotRecurringDays] = useState<number[]>([]);
    const [slotRecurringEnd, setSlotRecurringEnd] = useState<string>(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    const [slotDatePickerOpen, setSlotDatePickerOpen] = useState(false);
    const [recurringEndPickerOpen, setRecurringEndPickerOpen] = useState(false);
    const [escalationPicker, setEscalationPicker] = useState<{ key: keyof VisibilityDates | null; open: boolean }>({ key: null, open: false });
    const [escalationDates, setEscalationDates] = useState<VisibilityDates>({});
    const [description, setDescription] = useState('');
    const [descriptionTemplate, setDescriptionTemplate] = useState<ShiftDescriptionTemplate | null>(null);
    const [descriptionTemplateLoading, setDescriptionTemplateLoading] = useState(false);
    const [descriptionTemplateSaving, setDescriptionTemplateSaving] = useState(false);
    const [descriptionTemplateAutoAppliedKey, setDescriptionTemplateAutoAppliedKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');
    const [pharmacyMenuVisible, setPharmacyMenuVisible] = useState(false);
    const [activeStep, setActiveStep] = useState<StepKey>('details');
    const [calendarMonthAnchor, setCalendarMonthAnchor] = useState<Date>(new Date());

    // Rate calculation
    const [slotRateRows, setSlotRateRows] = useState<Array<{ rate: string; status: 'idle' | 'loading' | 'success' | 'error'; error?: string; dirty?: boolean }>>([]);

    // Notification preferences
    const [notifyPharmacyStaff, setNotifyPharmacyStaff] = useState(false);
    const [notifyFavoriteStaff, setNotifyFavoriteStaff] = useState(false);
    const [notifyChainMembers, setNotifyChainMembers] = useState(false);

    // Payment & super
    const [paymentPreference, setPaymentPreference] = useState<'ABN' | 'TFN'>('ABN');
    const [locumSuperIncluded, setLocumSuperIncluded] = useState(true);
    const [superPercent, setSuperPercent] = useState('');
    const [rateWeekday, setRateWeekday] = useState('');
    const [rateSaturday, setRateSaturday] = useState('');
    const [rateSunday, setRateSunday] = useState('');
    const [ratePublicHoliday, setRatePublicHoliday] = useState('');
    const [rateEarlyMorning, setRateEarlyMorning] = useState('');
    const [rateLateNight, setRateLateNight] = useState('');

    // FT/PT specific
    const [ftptPayMode, setFtptPayMode] = useState<'HOURLY' | 'ANNUAL'>('HOURLY');
    const [minHourly, setMinHourly] = useState('');
    const [maxHourly, setMaxHourly] = useState('');
    const [minAnnual, setMinAnnual] = useState('');
    const [maxAnnual, setMaxAnnual] = useState('');

    // Other
    const [savingPharmacyRates, setSavingPharmacyRates] = useState(false);
    const [dedicatedUserId, setDedicatedUserId] = useState<number | null>(null);
    const isPrivateBooking = isPrivateShiftBooking(dedicatedUserId ?? params.dedicated_user);
    const [escalationPlan, setEscalationPlan] = useState<ShiftEscalationPlan>({ mode: 'off', everyHours: 24 });

    const isLocumLike = useMemo(
        () => employmentType === 'LOCUM' || employmentType === 'CASUAL',
        [employmentType]
    );
    const canPostAnonymously = useMemo(
        () => !isPrivateBooking && ['ORG_CHAIN', 'PLATFORM'].includes(initialAudience),
        [initialAudience, isPrivateBooking]
    );
    const hasOutsidePharmacyMemberAudience = useMemo(
        () => !isPrivateBooking && (initialAudience !== 'FULL_PART_TIME' || Object.values(escalationDates).some(Boolean)),
        [escalationDates, initialAudience, isPrivateBooking]
    );
    const getEmploymentLabel = useCallback(
        (value: string) => {
            if (value === 'LOCUM') return roleNeeded === 'PHARMACIST' ? 'Locum' : 'Casual';
            if (value === 'FULL_TIME') return 'Full-Time';
            if (value === 'PART_TIME') return 'Part-Time';
            return value.replace('_', ' ');
        },
        [roleNeeded]
    );
    const stepOrder = useMemo<StepKey[]>(
        () => [...BASE_STEP_ORDER, ...(isLocumLike ? (['timetable'] as StepKey[]) : []), 'payrate', 'review'],
        [isLocumLike]
    );
    const canSubmit = useMemo(() => Boolean(pharmacyId && (!isLocumLike || slots.length > 0)), [pharmacyId, isLocumLike, slots.length]);
    const initialSlotsJsonRef = React.useRef<string | null>(null);
    const initialRatesJsonRef = React.useRef<string | null>(null);

    const resetForm = useCallback((options?: PostShiftFormResetOptions) => {
        const resetTimes = options?.times ?? liveTimesRef.current;
        const prefillState = computeResetFormPrefills(parsedParams, options, resetTimes);
        const todayIso = new Date().toISOString().split('T')[0];
        setCalendarMonthAnchor(new Date(`${prefillState.slotDate || todayIso}T00:00:00`));
        setPharmacyId('');
        setRoleNeeded(prefillState.roleNeeded);
        setEmploymentType('LOCUM');
        setWorkloadTags([]);
        setSupportOnShift([]);
        setMustHave([]);
        setNiceToHave([]);
        setHideName(false);
        setSingleUserOnly(false);
        setHasTravel(false); setHasAccommodation(false); setIsUrgent(false); setFlexibleTiming(false);
        setInitialAudience('');
        setRateType('FLEXIBLE');
        setOwnerBonus('');
        setDescription('');
        setDescriptionTemplate(null);
        setDescriptionTemplateAutoAppliedKey(null);
        setDescriptionTemplateLoading(false);
        setDescriptionTemplateSaving(false);
        setSlots(prefillState.slots);
        setSlotDate(prefillState.slotDate);
        setSelectedDates(prefillState.selectedDates);
        setSelectedDateTimes(prefillState.selectedDateTimes);
        setSlotStart(prefillState.slotStart);
        setSlotEnd(prefillState.slotEnd);
        setSlotRecurring(false);
        setSlotRecurringDays([]);
        setSlotRecurringEnd(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
        setEscalationDates({});
        setEscalationPlan({ mode: 'off', everyHours: 24 });
        setToast('');
        setError('');
        // Reset new fields
        setSlotRateRows([]);
        setNotifyPharmacyStaff(false);
        setNotifyFavoriteStaff(false);
        setNotifyChainMembers(false);
        setPaymentPreference('ABN');
        setLocumSuperIncluded(true);
        setSuperPercent('');
        setRateWeekday('');
        setRateSaturday('');
        setRateSunday('');
        setRatePublicHoliday('');
        setRateEarlyMorning('');
        setRateLateNight('');
        setFtptPayMode('HOURLY');
        setMinHourly('');
        setMaxHourly('');
        setMinAnnual('');
        setMaxAnnual('');
        setSavingPharmacyRates(false);
        setDedicatedUserId(prefillState.dedicatedUserId);
        initialSlotsJsonRef.current = null;
        initialRatesJsonRef.current = null;
    }, [parsedParams]);

    // Reset escalation dates when the initial audience changes, mirroring web behaviour
    const hasInitialAudienceRun = React.useRef(false);
    useEffect(() => {
        // Skip the first run so preloaded escalation dates are kept when editing
        if (!hasInitialAudienceRun.current) {
            hasInitialAudienceRun.current = true;
            return;
        }
        setEscalationDates({});
    }, [initialAudience]);

    // Allowed visibility tiers per selected pharmacy (mirrors web logic)
    const allowedVis = useMemo<VisibilityTier[]>(() => {
        const p = pharmacies.find((x) => x.id === pharmacyId);
        if (!p) return [];

        // Prefer backend-provided tiers if present (matches web)
        const fromApi = (p.allowed_escalation_levels || p.allowedEscalationLevels) as VisibilityTier[] | undefined;
        if (fromApi && fromApi.length) {
            return fromApi as VisibilityTier[];
        }

        // Fallback heuristic (chain/org flags)
        const tiers: VisibilityTier[] = ['FULL_PART_TIME', 'LOCUM_CASUAL'];
        const hasChain = Boolean(p.has_chain ?? p.hasChain);
        const claimed = Boolean(p.claimed || p.organization_id || p.organizationId);
        if (hasChain) tiers.push('OWNER_CHAIN');
        if (claimed) tiers.push('ORG_CHAIN');
        tiers.push('PLATFORM');
        return tiers;
    }, [pharmacyId, pharmacies]);
    const selectedPharmacy = useMemo(
        () => pharmacies.find((x) => x.id === pharmacyId),
        [pharmacyId, pharmacies]
    );
    const getDefaultTimesForDate = useCallback(
        (date: string, fallback?: SlotTime) =>
            pharmacyHoursForDate(
                selectedPharmacy,
                date,
                fallback ?? { startTime: liveTimesRef.current.startTime, endTime: liveTimesRef.current.endTime }
            ),
        [selectedPharmacy]
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
        if (editingId || !selectedPharmacy || !slotDate || selectedDates.length > 0 || slots.length > 0) return;
        const hours = getDefaultTimesForDate(slotDate);
        setSlotStart(hours.startTime);
        setSlotEnd(hours.endTime);
    }, [editingId, getDefaultTimesForDate, selectedDates.length, selectedPharmacy, slotDate, slots.length]);

    useEffect(() => {
        if (!selectedPharmacy || editingId) return;
        const normalize = (val: any) => (val === undefined || val === null || val === '' ? '' : String(val));
        const defaultRateType = (selectedPharmacy as any).default_rate_type || (selectedPharmacy as any).defaultRateType || 'FLEXIBLE';

        setRateType(defaultRateType);
        setRateWeekday(normalize((selectedPharmacy as any).rate_weekday ?? (selectedPharmacy as any).rateWeekday));
        setRateSaturday(normalize((selectedPharmacy as any).rate_saturday ?? (selectedPharmacy as any).rateSaturday));
        setRateSunday(normalize((selectedPharmacy as any).rate_sunday ?? (selectedPharmacy as any).rateSunday));
        setRatePublicHoliday(normalize((selectedPharmacy as any).rate_public_holiday ?? (selectedPharmacy as any).ratePublicHoliday));
        setRateEarlyMorning(normalize((selectedPharmacy as any).rate_early_morning ?? (selectedPharmacy as any).rateEarlyMorning));
        setRateLateNight(normalize((selectedPharmacy as any).rate_late_night ?? (selectedPharmacy as any).rateLateNight));
    }, [selectedPharmacy, editingId]);

    // New shifts start with the pharmacy's own software (one per category) as preferred experience, by registry ID.
    const softwareDefaults = React.useRef<string[]>([]);
    useEffect(() => {
        if (editingId || !selectedPharmacy || !roleNeeded) return;
        const next = pharmacySoftwareDefaults(skillsRegistry as any, roleNeeded as any, (selectedPharmacy as any).software || []);
        const previous = softwareDefaults.current;
        softwareDefaults.current = next;
        setNiceToHave(current => mergeSoftwareDefaults(current, mustHave, previous, next));
    }, [selectedPharmacy, roleNeeded, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

    const showNotifyChainMembers = !isPrivateBooking && !editingId && canNotifyShiftChainMembers(allowedVis, initialAudience);
    const escalationTierKey = allowedVis.join(',');
    useEffect(() => {
        if (escalationPlan.mode === 'auto' && !isPrivateBooking) {
            const dates = automaticShiftEscalationDates(allowedVis, initialAudience, escalationPlan.everyHours);
            setEscalationDates(Object.fromEntries(Object.entries(dates).map(([tier, value]) => [tier.toLowerCase(), value])) as VisibilityDates);
        }
    }, [escalationTierKey, initialAudience, escalationPlan.mode, escalationPlan.everyHours, isPrivateBooking]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!showNotifyChainMembers) setNotifyChainMembers(false);
    }, [showNotifyChainMembers]);

    // Ensure initial audience stays within allowed tiers
    useEffect(() => {
        if (allowedVis.length && !allowedVis.includes(initialAudience as VisibilityTier)) {
            setInitialAudience(allowedVis[0]);
        }
    }, [allowedVis, initialAudience]);

    useEffect(() => {
        if (!allowedVis.length || !isPrivateBooking) return;
        if (allowedVis.includes('LOCUM_CASUAL')) {
            setInitialAudience('LOCUM_CASUAL');
        }
    }, [allowedVis, isPrivateBooking]);

    useEffect(() => {
        if (!canPostAnonymously) setHideName(false);
    }, [canPostAnonymously]);

    // When pharmacy changes, align initial audience to first allowed tier
    useEffect(() => {
        if (allowedVis.length) {
            setInitialAudience((prev) => {
                if (editingId && loadedVisibilityRef.current && allowedVis.includes(loadedVisibilityRef.current as VisibilityTier)) {
                    return loadedVisibilityRef.current;
                }
                return prev && allowedVis.includes(prev as VisibilityTier) ? prev : allowedVis[0];
            });
        }
    }, [allowedVis, pharmacyId, editingId]);

    const hydrateShift = useCallback((data: any, currentPharmacies: PharmacyOption[], gen: number) => {
        if (gen !== loadGenRef.current) return;
        const pharmacyValue =
            data.pharmacy_detail?.id ??
            data.pharmacyDetail?.id ??
            data.pharmacy ??
            data.pharmacy_id ??
            '';
        const pharmacyDefaults = currentPharmacies.find((item: any) => Number(item.id) === Number(pharmacyValue));
        if (data.pharmacy_detail || data.pharmacyDetail) {
            const detail = data.pharmacy_detail ?? data.pharmacyDetail;
            setPharmacies((prev) => {
                const exists = prev.some((p) => p.id === detail.id);
                return exists ? prev : [...prev, detail];
            });
        }
        if (gen !== loadGenRef.current) return;
        setPharmacyId(pharmacyValue);
        setRoleNeeded(data.role_needed ?? data.roleNeeded ?? data.role ?? 'PHARMACIST');
        setEmploymentType(data.employment_type ?? data.employmentType ?? 'LOCUM');
        const vis = data.visibility ?? '';
        setInitialAudience(vis);
        loadedVisibilityRef.current = vis;
        setWorkloadTags(normalizeWorkloadTags(skillsRegistry as any, Array.isArray(data.workload_tags ?? data.workloadTags) ? (data.workload_tags ?? data.workloadTags) : []));
        setSupportOnShift(data.support_on_shift ?? data.supportOnShift ?? []);
        setDescription(data.description ?? '');
        setHideName(Boolean(data.post_anonymously ?? data.postAnonymously));
        setSingleUserOnly(Boolean(data.single_user_only ?? data.singleUserOnly));
        setHasTravel(Boolean(data.hasTravel ?? data.has_travel));
        setHasAccommodation(Boolean(data.hasAccommodation ?? data.has_accommodation));
        setIsUrgent(Boolean(data.isUrgent ?? data.is_urgent));
        setFlexibleTiming(Boolean(data.flexibleTiming ?? data.flexible_timing));
        setMustHave(normalizeShiftRequirements(skillsRegistry as any, Array.isArray(data.must_have ?? data.mustHave) ? (data.must_have ?? data.mustHave) : []));
        setNiceToHave(normalizeShiftRequirements(skillsRegistry as any, Array.isArray(data.nice_to_have ?? data.niceToHave) ? (data.nice_to_have ?? data.niceToHave) : []));
        const escalations =
            typeof (data.escalation_dates ?? data.escalationDates) === 'object' && (data.escalation_dates ?? data.escalationDates)
                ? (data.escalation_dates ?? data.escalationDates)
                : {
                    locum_casual: data.escalate_to_locum_casual ?? data.escalateToLocumCasual,
                    owner_chain: data.escalate_to_owner_chain ?? data.escalateToOwnerChain,
                    org_chain: data.escalate_to_org_chain ?? data.escalateToOrgChain,
                    platform: data.escalate_to_platform ?? data.escalateToPlatform,
                };
        setEscalationDates(escalations);
        setEscalationPlan({ mode: Object.values(escalations).some(Boolean) ? 'custom' : 'off', everyHours: 24 });
        setDedicatedUserId(typeof data.dedicatedUser === 'number' ? data.dedicatedUser : typeof data.dedicated_user === 'number' ? data.dedicated_user : null);
        const initOwnerBonus = toRateInputString(getShiftPostingOwnerAdjustedRate(data));
        setOwnerBonus(initOwnerBonus);
        const rateTypeValue = data.rate_type ?? data.rateType;
        if (rateTypeValue === 'PHARMACIST_PROVIDED') {
            setRateType('PHARMACIST_PROVIDED');
        } else if (rateTypeValue === 'FIXED') {
            setRateType('FIXED');
        } else {
            setRateType('FLEXIBLE');
        }
        const initWeekday = toRateInputString(firstPresent(data.rate_weekday, data.rateWeekday, (pharmacyDefaults as any)?.rate_weekday, (pharmacyDefaults as any)?.rateWeekday));
        setRateWeekday(initWeekday);
        const initSaturday = toRateInputString(firstPresent(data.rate_saturday, data.rateSaturday, (pharmacyDefaults as any)?.rate_saturday, (pharmacyDefaults as any)?.rate_saturday));
        setRateSaturday(initSaturday);
        const initSunday = toRateInputString(firstPresent(data.rate_sunday, data.rateSunday, (pharmacyDefaults as any)?.rate_sunday, (pharmacyDefaults as any)?.rateSunday));
        setRateSunday(initSunday);
        const initPublicHoliday = toRateInputString(firstPresent(data.rate_public_holiday, data.ratePublicHoliday, (pharmacyDefaults as any)?.rate_public_holiday, (pharmacyDefaults as any)?.ratePublicHoliday));
        setRatePublicHoliday(initPublicHoliday);
        const initEarlyMorning = toRateInputString(firstPresent(data.rate_early_morning, data.rateEarlyMorning, (pharmacyDefaults as any)?.rate_early_morning, (pharmacyDefaults as any)?.rateEarlyMorning));
        setRateEarlyMorning(initEarlyMorning);
        const initLateNight = toRateInputString(firstPresent(data.rate_late_night, data.rateLateNight, (pharmacyDefaults as any)?.rate_late_night, (pharmacyDefaults as any)?.rateLateNight));
        setRateLateNight(initLateNight);
        setPaymentPreference((data.payment_preference ?? data.paymentPreference ?? 'ABN') === 'TFN' ? 'TFN' : 'ABN');
        const detailSuper = data.super_percent ?? data.superPercent;
        if (detailSuper === null || detailSuper === undefined || detailSuper === '') {
            setLocumSuperIncluded(true);
            setSuperPercent('');
        } else {
            const superNumber = Number(detailSuper);
            setLocumSuperIncluded(superNumber > 0);
            setSuperPercent(String(detailSuper));
        }
        const parsedSlots = Array.isArray(data.slots)
            ? data.slots.map((s: any) => ({
                date: s.date ?? s.slot_date ?? s.shift_date ?? '',
                startTime: s.startTime ?? s.start_time ?? '',
                endTime: s.endTime ?? s.end_time ?? '',
                isRecurring: Boolean(s.is_recurring ?? s.isRecurring),
                recurringDays: Array.isArray(s.recurring_days ?? s.recurringDays) ? s.recurring_days ?? s.recurringDays : [],
                recurringEndDate: s.recurringEndDate ?? s.recurring_end_date ?? '',
            }))
            : [];
        if (gen !== loadGenRef.current) return;
        setSlots(parsedSlots);
        const expanded = expandShiftDraftSlots(parsedSlots);
        const rawSlots = Array.isArray(data.slots) ? data.slots : [];
        const initialSlotRateRows = expanded.map((s) => {
            const source = rawSlots[s.sourceIndex];
            const rate = toRateInputString(getSlotRateValue(source));
            return { rate, status: rate ? 'success' as const : 'idle' as const, dirty: Boolean(rate) };
        });
        setSlotRateRows(initialSlotRateRows);
        initialSlotsJsonRef.current = JSON.stringify(parsedSlots);
        initialRatesJsonRef.current = JSON.stringify({
            rateType: rateTypeValue || 'FLEXIBLE',
            rateWeekday: initWeekday,
            rateSaturday: initSaturday,
            rateSunday: initSunday,
            ratePublicHoliday: initPublicHoliday,
            rateEarlyMorning: initEarlyMorning,
            rateLateNight: initLateNight,
            ownerBonus: initOwnerBonus,
            slotRates: initialSlotRateRows.map((r) => r.rate),
        });
    }, []);

    const applyBookingPrefillFromParams = useCallback(() => {
        const plan = computePrefillPlan(appliedPrefillsRef.current, parsedParams, Boolean(editingId));
        appliedPrefillsRef.current = plan.nextApplied;

        if (plan.applyTimes) {
            if (parsedParams.hasStartTime) setSlotStart(parsedParams.startTime);
            if (parsedParams.hasEndTime) setSlotEnd(parsedParams.endTime);
        }

        if (plan.applyDates) {
            const uniqueDates = parsedParams.dates;
            const startParam = parsedParams.hasStartTime ? parsedParams.startTime : liveTimesRef.current.startTime;
            const endParam = parsedParams.hasEndTime ? parsedParams.endTime : liveTimesRef.current.endTime;
            setSlotDate(uniqueDates[0]);
            setCalendarMonthAnchor(new Date(`${uniqueDates[0]}T00:00:00`));
            setSelectedDates(uniqueDates);
            setSelectedDateTimes(
                uniqueDates.reduce<Record<string, { startTime: string; endTime: string }>>((acc, date) => {
                    acc[date] = { startTime: startParam, endTime: endParam };
                    return acc;
                }, {})
            );
            setSlots(
                uniqueDates.map((date) => ({
                    date,
                    startTime: startParam,
                    endTime: endParam,
                    isRecurring: false,
                    recurringDays: [],
                    recurringEndDate: '',
                }))
            );
            setActiveStep('details');
        }

        if (plan.applyRole && parsedParams.roleNeeded) {
            setRoleNeeded(parsedParams.roleNeeded);
        }
        if (plan.applyDedicatedUser && parsedParams.dedicatedUserId != null) {
            setDedicatedUserId(parsedParams.dedicatedUserId);
        }
    }, [editingId, parsedParams]);

    useEffect(() => {
        applyBookingPrefillFromParams();
    }, [applyBookingPrefillFromParams]);

    const runInitLoad = useCallback(async (preserveDraft = false) => {
        const gen = ++loadGenRef.current;
        setLoadError(null);
        setLoading(true);
        if (!editingId && !preserveDraft) {
            resetForm({ preservePrefills: true });
        }

        const result = await runPostShiftInitChain({
            isCurrent: () => gen === loadGenRef.current,
            loadPharmacies: async () => {
                const data = await fetchPharmaciesService({});
                const list = Array.isArray((data as any)?.results)
                    ? (data as any).results
                    : Array.isArray(data)
                        ? data
                        : [];
                return list as PharmacyOption[];
            },
            shouldLoadShift: Boolean(editingId),
            loadShift: editingId
                ? async () => {
                    return await fetchWorkerShiftDetailService(editingId);
                }
                : undefined,
        });

        if (gen !== loadGenRef.current || result.status === 'aborted') {
            return;
        }

        if (result.status === 'pharmacies_failed') {
            setLoadError({ kind: 'pharmacies', message: 'Unable to load pharmacies' });
            setError('Unable to load pharmacies');
            setLoading(false);
            return;
        }

        const pharmacyList = result.pharmacies;
        setPharmacies(pharmacyList);
        setPharmaciesLoaded(true);

        if (result.status === 'shift_failed') {
            setLoadError({ kind: 'shift', message: 'Unable to load shift details' });
            setError('Unable to load shift details');
            setLoading(false);
            return;
        }

        if (result.status === 'pharmacies_loaded') {
            const nextPharmacy = pickScopedPharmacyId({
                routePharmacyId,
                scopedPharmacyId: surface.scopedPharmacyId,
                pharmacies: pharmacyList,
            });
            setPharmacyId(current => preserveDraft
                ? pickRetryPostShiftPharmacyId(current, nextPharmacy, pharmacyList)
                : nextPharmacy);
            applyBookingPrefillFromParams();
            setLoading(false);
            return;
        }

        if (result.status === 'success' && result.shift) {
            hydrateShift(result.shift, pharmacyList, gen);
            setLoading(false);
        }
    }, [applyBookingPrefillFromParams, editingId, hydrateShift, resetForm, routePharmacyId, surface.scopedPharmacyId]);

    const currentInitScope = useMemo<PostShiftInitScope>(() => ({
        editingId,
        routePharmacyId,
        scopedPharmacyId: surface.scopedPharmacyId,
    }), [editingId, routePharmacyId, surface.scopedPharmacyId]);

    const prevInitScopeRef = React.useRef<PostShiftInitScope | null>(null);

    useEffect(() => {
        if (shouldTriggerPostShiftInit(prevInitScopeRef.current, currentInitScope)) {
            prevInitScopeRef.current = currentInitScope;
            void runInitLoad();
        }
    }, [currentInitScope, runInitLoad]);

    const retryInitialLoad = useCallback(() => {
        // Retrying the same scope must not erase the user's unsaved form edits or replay URL prefills.
        prevInitScopeRef.current = currentInitScope;
        void runInitLoad(true);
    }, [currentInitScope, runInitLoad]);


    useFocusEffect(
        useCallback(() => {
            applyBookingPrefillFromParams();
        }, [applyBookingPrefillFromParams])
    );

    // Do not refetch the role template on each description keystroke.
    // Read the newest user draft when an in-flight role-template request resolves.
    const latestDescriptionRef = React.useRef(description);
    latestDescriptionRef.current = description;
    const latestTemplateAppliedKeyRef = React.useRef(descriptionTemplateAutoAppliedKey);
    latestTemplateAppliedKeyRef.current = descriptionTemplateAutoAppliedKey;

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
                const data = await listShiftDescriptionTemplates(Number(pharmacyId), roleNeeded);
                if (cancelled) return;
                const list = data;
                const template = (list[0] ?? null) as ShiftDescriptionTemplate | null;
                setDescriptionTemplate(template);
                if (
                    template?.description &&
                    !editingId &&
                    !latestDescriptionRef.current.trim() &&
                    latestTemplateAppliedKeyRef.current !== templateKey
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
    }, [pharmacyId, roleNeeded, editingId]);

    const handleUseDescriptionTemplate = useCallback(() => {
        if (!descriptionTemplate?.description) return;
        setDescription(descriptionTemplate.description);
    }, [descriptionTemplate]);

    const handleSaveDescriptionTemplate = useCallback(async () => {
        if (!pharmacyId || !roleNeeded) {
            setToast('Select a pharmacy and role before saving a template');
            return;
        }
        if (!description.trim()) {
            setToast('Enter a description before saving it as a template');
            return;
        }
        setDescriptionTemplateSaving(true);
        try {
            const data = await saveShiftDescriptionTemplate(Number(pharmacyId), roleNeeded, description);
            setDescriptionTemplate(data as ShiftDescriptionTemplate);
            setDescriptionTemplateAutoAppliedKey(`${pharmacyId}:${roleNeeded}`);
            setToast('Description template saved for this role');
        } catch {
            setToast('Unable to save description template');
        } finally {
            setDescriptionTemplateSaving(false);
        }
    }, [description, pharmacyId, roleNeeded]);

    const handleSavePharmacyRateDefaults = useCallback(async () => {
        if (!pharmacyId) {
            setToast('Select a pharmacy before updating default rates');
            return;
        }
        if (roleNeeded !== 'PHARMACIST' || rateType === 'PHARMACIST_PROVIDED') {
            setToast('Default pharmacy rates can only be updated from fixed or flexible pharmacist rates');
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
            const data = await updatePharmacy(Number(pharmacyId), payload);
            setPharmacies((current) =>
                current.map((pharmacy) =>
                    Number(pharmacy.id) === Number(pharmacyId)
                        ? ({ ...pharmacy, ...data } as PharmacyOption)
                        : pharmacy
                )
            );
            setToast('Pharmacy default rates updated');
        } catch {
            setToast('Unable to update pharmacy default rates');
        } finally {
            setSavingPharmacyRates(false);
        }
    }, [
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

    const mergeSelectedDates = useCallback((incomingDates: string[]) => {
        const todayIso = new Date().toISOString().split('T')[0];
        const valid = incomingDates.filter((d) => d && d >= todayIso);
        if (!valid.length) return;
        setSelectedDates((prev) => Array.from(new Set([...prev, ...valid])).sort());
        setSelectedDateTimes((prev) => {
            const next = { ...prev };
            valid.forEach((date) => {
                if (!next[date]) {
                    const hours = getDefaultTimesForDate(date);
                    next[date] = { startTime: hours.startTime, endTime: hours.endTime };
                }
            });
            return next;
        });
        const latest = valid[valid.length - 1];
        if (latest) {
            const latestHours = getDefaultTimesForDate(latest);
            setSlotDate(latest);
            setSlotStart(latestHours.startTime);
            setSlotEnd(latestHours.endTime);
        }
    }, [getDefaultTimesForDate]);

    const selectedDateObjects = useMemo(
        () => selectedDates.map((d) => new Date(`${d}T00:00:00`)),
        [selectedDates]
    );
    const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
    const slotDateSet = useMemo(() => new Set(slots.map((s) => s.date)), [slots]);
    const monthCalendarCells = useMemo(() => {
        const year = calendarMonthAnchor.getFullYear();
        const month = calendarMonthAnchor.getMonth();
        const first = new Date(year, month, 1);
        const leading = first.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];
        for (let i = 0; i < leading; i += 1) {
            cells.push({ iso: `pad-prev-${i}`, day: 0, inMonth: false });
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            const iso = toLocalIsoDate(new Date(year, month, day));
            cells.push({ iso, day, inMonth: true });
        }
        while (cells.length % 7 !== 0) {
            cells.push({ iso: `pad-next-${cells.length}`, day: 0, inMonth: false });
        }
        return cells;
    }, [calendarMonthAnchor]);
    const monthLabel = useMemo(
        () => calendarMonthAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        [calendarMonthAnchor]
    );

    const expandedSlots = useMemo(() => expandShiftDraftSlots(slots), [slots]);
    const previousRateOccurrences = React.useRef<typeof expandedSlots>([]);

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
                            (prior.dirty || (editingId && Boolean(prior.rate))) && prior.rate !== undefined && prior.rate !== null && prior.rate !== ''
                                ? prior.rate
                                : rateVal != null
                                    ? String(rateVal)
                                    : '';
                        return { ...prior, rate: nextRate, status: 'success' as const, error: undefined };
                    })
                );
            })
            .catch(() => {
                if (cancelled) return;
                setSlotRateRows((prev) =>
                    expandedSlots.map((_slot, idx) => ({
                        ...(prev[idx] ?? { rate: '' }),
                        status: 'error' as const,
                        error: 'Unable to calculate rates',
                    }))
                );
            });

        return () => {
            cancelled = true;
        };
    }, [
        employmentType,
        expandedSlots,
        isLocumLike,
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

    const addSlotEntries = (
        entries: SlotEntry[],
        options?: { clearDates?: string[]; clearAllSelected?: boolean; resetRecurring?: boolean }
    ) => {
        const existingKeys = new Set(slots.map((s) => `${s.date}-${s.startTime}-${s.endTime}-${s.isRecurring}-${s.recurringDays.join(',')}`));
        const filtered = entries.filter(
            (entry) => !existingKeys.has(`${entry.date}-${entry.startTime}-${entry.endTime}-${entry.isRecurring}-${entry.recurringDays.join(',')}`)
        );

        if (!filtered.length) {
            setError('Those dates are already in your list.');
            return false;
        }

        setSlots((prev) => [...prev, ...filtered]);
        setError('');
        setToast(`${filtered.length} date${filtered.length > 1 ? 's' : ''} added.`);

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
            setSlotRecurring(false);
            setSlotRecurringDays([]);
            setSlotRecurringEnd(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
        }

        return true;
    };

    const addManualSlot = () => {
        if (!slotStart || !slotEnd) {
            setError('Set a start and finish time.');
            return false;
        }
        if (new Date(`1970-01-01T${slotEnd}:00`).getTime() <= new Date(`1970-01-01T${slotStart}:00`).getTime()) {
            setError('The finish time must be after the start time.');
            return false;
        }
        if (!slotDate) {
            setError('Pick a date first.');
            return false;
        }
        if (slotRecurring && (!slotRecurringEnd || slotRecurringDays.length === 0)) {
            setError('Pick the weekdays and the date it repeats until.');
            return false;
        }

        return addSlotEntries([{
            date: slotDate,
            startTime: slotStart,
            endTime: slotEnd,
            isRecurring: slotRecurring,
            recurringDays: slotRecurring ? slotRecurringDays : [],
            recurringEndDate: slotRecurring ? slotRecurringEnd : '',
        }], { resetRecurring: true });
    };

    const addSelectedDateSlot = (date: string) => {
        const entry = {
            date,
            ...(selectedDateTimes[date] || { startTime: slotStart, endTime: slotEnd }),
        };
        if (new Date(`1970-01-01T${entry.endTime}:00`).getTime() <= new Date(`1970-01-01T${entry.startTime}:00`).getTime()) {
            setError('The finish time must be after the start time.');
            return false;
        }
        return addSlotEntries([{
            ...entry,
            isRecurring: false,
            recurringDays: [],
            recurringEndDate: '',
        }], { clearDates: [date] });
    };

    const addAllSelectedSlots = () => {
        if (!selectedDates.length) {
            setError('Select at least one date from the calendar.');
            return false;
        }
        if (new Date(`1970-01-01T${slotEnd}:00`).getTime() <= new Date(`1970-01-01T${slotStart}:00`).getTime()) {
            setError('The finish time must be after the start time.');
            return false;
        }
        return addSlotEntries(
            selectedDates.map((date) => ({
                date,
                ...(selectedDateTimes[date] || { startTime: slotStart, endTime: slotEnd }),
                isRecurring: false,
                recurringDays: [],
                recurringEndDate: '',
            })),
            { clearAllSelected: true }
        );
    };

    const removeSlot = (index: number) => setSlots((prev) => prev.filter((_, i) => i !== index));
    const editSlot = (index: number) => {
        const slot = slots[index];
        if (!slot) return;

        setSlotDate(slot.date);
        setSlotStart(slot.startTime);
        setSlotEnd(slot.endTime);
        setSlotRecurring(slot.isRecurring);
        setSlotRecurringDays(slot.recurringDays || []);
        setSlotRecurringEnd(slot.recurringEndDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
        setSelectedDates((prev) => (prev.includes(slot.date) ? prev : [...prev, slot.date].sort()));
        setSelectedDateTimes((prev) => ({
            ...prev,
            [slot.date]: { startTime: slot.startTime, endTime: slot.endTime },
        }));
        setCalendarMonthAnchor(new Date(`${slot.date}T00:00:00`));
        setSlots((prev) => prev.filter((_, i) => i !== index));
    };
    const toggleRecurringDay = (day: number) => setSlotRecurringDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    const setEscalation = (key: keyof VisibilityDates, value: string) => setEscalationDates((prev) => ({ ...prev, [key]: value }));
    const handleSlotRateChange = (index: number, value: string) => {
        setSlotRateRows((rows) =>
            rows.map((row, idx) =>
                idx === index ? { ...row, rate: value, status: 'success', error: undefined, dirty: true } : row
            )
        );
    };

    const areSlotsModified = () => {
        if (!editingId || initialSlotsJsonRef.current === null) return true;
        return JSON.stringify(slots) !== initialSlotsJsonRef.current;
    };
    const areRatesModified = () => {
        if (!editingId || initialRatesJsonRef.current === null) return true;
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

    // No dialog Save: posting validates and navigates on its own, so the prompt offers Keep editing / Discard only.
    const draftSnapshot = {
        pharmacyId, roleNeeded, employmentType, workloadTags, supportOnShift, mustHave, niceToHave, hasTravel, hasAccommodation,
        isUrgent, flexibleTiming, singleUserOnly, hideName, initialAudience, rateType, ownerBonus, slots, selectedDates,
        selectedDateTimes, slotStart, slotEnd, slotRecurring, slotRecurringDays, slotRecurringEnd, escalationDates, escalationPlan,
        description, notifyPharmacyStaff, notifyFavoriteStaff, notifyChainMembers, paymentPreference, locumSuperIncluded,
        superPercent, rateWeekday, rateSaturday, rateSunday, ratePublicHoliday, rateEarlyMorning, rateLateNight, ftptPayMode,
        minHourly, maxHourly, minAnnual, maxAnnual, dedicatedUserId,
        // Server-calculated slot rates are not edits; only rates the user typed count.
        slotRates: slotRateRows.map((row) => (row.dirty ? row.rate : '')),
    };
    const unsaved = useUnsavedChangesGuard(draftSnapshot, { saving: loading });
    // Loads, prefills and pharmacy defaults fill the form in a cascade of effects; until the user's first edit after
    // loading, the baseline follows them, so only the user's own edits make the draft dirty.
    const touchedRef = React.useRef(false);
    // Never during a save: markClean there is the save's success signal and would release the leave lock early.
    useEffect(() => {
        if (!touchedRef.current && !loading) unsaved.markClean(draftSnapshot);
    });
    // While hydrating the form takes no input, so an edit can never be absorbed into the baseline.
    const hydrating = !loadError && (!pharmaciesLoaded || (Boolean(editingId) && initialSlotsJsonRef.current === null));
    const markTouched = () => {
        if (!hydrating) touchedRef.current = true;
    };
    // Wraps a data-change handler handed to a step so the user's edit freezes the baseline (UI-only setters stay unwrapped).
    const edited = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => {
        markTouched();
        return fn(...args);
    };

    const postingDraft = (): ShiftPostingDraft => ({ pharmacyId, roleNeeded, employmentType, description, workloadTags, supportOnShift, mustHave, niceToHave, dedicatedUserId, singleUserOnly, rateType, ownerBonus, paymentPreference, locumSuperIncluded, rateWeekday, rateSaturday, rateSunday, ratePublicHoliday, rateEarlyMorning, rateLateNight, ftptPayMode, minHourly, maxHourly, minAnnual, maxAnnual, superPercent, slots, expandedSlots, slotRateRows, canPostAnonymously, showNotifyPharmacyStaff: !isPrivateBooking, showNotifyFavoriteStaff: !isPrivateBooking, showNotifyChainMembers, notifyPharmacyStaff, notifyFavoriteStaff, notifyChainMembers, hasTravel, hasAccommodation, isUrgent, flexibleTiming, visibility: initialAudience, editingShiftId: editingId, postAnonymously: hideName, escalationDates: { LOCUM_CASUAL: escalationDates.locum_casual, OWNER_CHAIN: escalationDates.owner_chain, ORG_CHAIN: escalationDates.org_chain, PLATFORM: escalationDates.platform }, slotsModified: areSlotsModified(), ratesModified: areRatesModified() });

    const handleSubmit = async () => {
        setError('');
        const validation = validateShiftPostingDraft(postingDraft());
        if (validation) { setError(validation); return; }
        setLoading(true);
        try {
            const payload = buildShiftPostingPayload(postingDraft());
            if (editingId) {
                await updateOwnerShiftService(editingId, payload);
                setToast('Shift updated');
            } else {
                await createOwnerShiftService(payload);
                resetForm();
                setToast('Shift posted');
                // The retained tab starts a fresh draft: the baseline follows the reset and its defaults again.
                touchedRef.current = false;
            }
            // Lets this save's own navigation pass the unsaved-changes guard.
            unsaved.markClean();
            // Go back to the owner shift center (active tab is managed in-screen)
            router.back();
        } catch (e: any) {
            const msg = e?.response?.data?.detail || 'Unable to save shift';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const chipStyle = (selected: boolean) => [styles.chip, selected ? styles.chipSelected : styles.chipUnselected];
    const chipTextStyle = (selected: boolean) => (selected ? styles.chipTextSelected : styles.chipText);

    const renderStep = (step: StepKey) => {
        switch (step) {
            case 'details':
                return (
                    <PostShiftDetailsStep
                        hasTravel={hasTravel} setHasTravel={edited(setHasTravel)} hasAccommodation={hasAccommodation} setHasAccommodation={edited(setHasAccommodation)} isUrgent={isUrgent} setIsUrgent={edited(setIsUrgent)}
                        pharmacyMenuVisible={pharmacyMenuVisible}
                        setPharmacyMenuVisible={setPharmacyMenuVisible}
                        pharmacies={pharmacies}
                        pharmacyId={pharmacyId}
                        setPharmacyId={edited(setPharmacyId)}
                        roleNeeded={roleNeeded}
                        setRoleNeeded={edited(setRoleNeeded)}
                        employmentType={employmentType}
                        setEmploymentType={edited(setEmploymentType)}
                        getEmploymentLabel={getEmploymentLabel}
                        descriptionTemplateLoading={descriptionTemplateLoading}
                        descriptionTemplate={descriptionTemplate}
                        descriptionTemplateSaving={descriptionTemplateSaving}
                        handleUseDescriptionTemplate={edited(handleUseDescriptionTemplate)}
                        handleSaveDescriptionTemplate={handleSaveDescriptionTemplate}
                        description={description}
                        setDescription={edited(setDescription)}
                        workloadTags={workloadTags}
                        setWorkloadTags={edited(setWorkloadTags)}
            supportOnShift={supportOnShift}
            setSupportOnShift={edited(setSupportOnShift)}
                    />
                );
            case 'skills':
                return (
                    <PostShiftSkillsStep
                        pharmacySoftware={pharmacySoftwareDefaults(skillsRegistry as any, roleNeeded as any, (selectedPharmacy as any)?.software || [])}
                        roleNeeded={roleNeeded}
                        mustHave={mustHave}
                        setMustHave={edited(setMustHave)}
                        niceToHave={niceToHave}
                        setNiceToHave={edited(setNiceToHave)}
                    />
                );
            case 'visibility':
                return (
                    <PostShiftVisibilityStep
                        isEmbedded={isPrivateBooking}
                        escalationPlan={escalationPlan}
                        setEscalationPlan={edited(setEscalationPlan)}
                        canPostAnonymously={canPostAnonymously}
                        hideName={hideName}
                        setHideName={edited(setHideName)}
                        allowedVis={allowedVis}
                        initialAudience={initialAudience}
                        setInitialAudience={edited(setInitialAudience)}
                        notifyPharmacyStaff={notifyPharmacyStaff}
                        setNotifyPharmacyStaff={edited(setNotifyPharmacyStaff)}
                        notifyFavoriteStaff={notifyFavoriteStaff}
                        setNotifyFavoriteStaff={edited(setNotifyFavoriteStaff)}
                        notifyChainMembers={notifyChainMembers}
                        showNotifyChainMembers={showNotifyChainMembers}
                        setNotifyChainMembers={edited(setNotifyChainMembers)}
                        escalationDates={escalationDates}
                        setEscalationDates={edited(setEscalationDates)}
                        setEscalationPicker={setEscalationPicker}
                    />
                );
            case 'timetable':
                return (
                    <PostShiftTimetableStep
                        flexibleTiming={flexibleTiming} setFlexibleTiming={edited(setFlexibleTiming)}
                        selectedDates={selectedDates}
                        setSelectedDates={edited(setSelectedDates)}
                        slotDate={slotDate}
                        setSlotDate={edited(setSlotDate)}
                        slotStart={slotStart}
                        setSlotStart={edited(setSlotStart)}
                        slotEnd={slotEnd}
                        setSlotEnd={edited(setSlotEnd)}
                        setSlotDatePickerOpen={setSlotDatePickerOpen}
                        slotDateHours={slotDateHours}
                        calendarMonthAnchor={calendarMonthAnchor}
                        setCalendarMonthAnchor={setCalendarMonthAnchor}
                        monthLabel={monthLabel}
                        monthCalendarCells={monthCalendarCells}
                        selectedDateSet={selectedDateSet}
                        slotDateSet={slotDateSet}
                        getDefaultTimesForDate={getDefaultTimesForDate}
                        selectedDateTimes={selectedDateTimes}
                        setSelectedDateTimes={edited(setSelectedDateTimes)}
                        slotRecurring={slotRecurring}
                        setSlotRecurring={edited(setSlotRecurring)}
                        slotRecurringDays={slotRecurringDays}
                        toggleRecurringDay={edited(toggleRecurringDay)}
                        slotRecurringEnd={slotRecurringEnd}
                        setRecurringEndPickerOpen={setRecurringEndPickerOpen}
                        singleUserOnly={singleUserOnly}
                        setSingleUserOnly={edited(setSingleUserOnly)}
                        closedSelectedDates={closedSelectedDates}
                        addAllSelectedSlots={edited(addAllSelectedSlots)}
                        addSelectedDateSlot={edited(addSelectedDateSlot)}
                        slots={slots}
                        addManualSlot={edited(addManualSlot)}
                        editSlot={edited(editSlot)}
                        removeSlot={edited(removeSlot)}
                    />
                );
            case 'payrate':
                return (
                    <PostShiftPayRateStep
                        isLocumLike={isLocumLike}
                        roleNeeded={roleNeeded}
                        ftptPayMode={ftptPayMode}
                        setFtptPayMode={edited(setFtptPayMode)}
                        minHourly={minHourly}
                        setMinHourly={edited(setMinHourly)}
                        maxHourly={maxHourly}
                        setMaxHourly={edited(setMaxHourly)}
                        minAnnual={minAnnual}
                        setMinAnnual={edited(setMinAnnual)}
                        maxAnnual={maxAnnual}
                        setMaxAnnual={edited(setMaxAnnual)}
                        superPercent={superPercent}
                        setSuperPercent={edited(setSuperPercent)}
                        rateType={rateType}
                        setRateType={edited(setRateType)}
                        paymentPreference={paymentPreference}
                        setPaymentPreference={edited(setPaymentPreference)}
                        locumSuperIncluded={locumSuperIncluded}
                        setLocumSuperIncluded={edited(setLocumSuperIncluded)}
                        hasOutsidePharmacyMemberAudience={hasOutsidePharmacyMemberAudience}
                        rateWeekday={rateWeekday}
                        setRateWeekday={edited(setRateWeekday)}
                        rateSaturday={rateSaturday}
                        setRateSaturday={edited(setRateSaturday)}
                        rateSunday={rateSunday}
                        setRateSunday={edited(setRateSunday)}
                        ratePublicHoliday={ratePublicHoliday}
                        setRatePublicHoliday={edited(setRatePublicHoliday)}
                        rateEarlyMorning={rateEarlyMorning}
                        setRateEarlyMorning={edited(setRateEarlyMorning)}
                        rateLateNight={rateLateNight}
                        setRateLateNight={edited(setRateLateNight)}
                        handleSavePharmacyRateDefaults={handleSavePharmacyRateDefaults}
                        savingPharmacyRates={savingPharmacyRates}
                        pharmacyId={pharmacyId}
                        expandedSlots={expandedSlots}
                        slotRateRows={slotRateRows}
                        ownerBonus={ownerBonus}
                        setOwnerBonus={edited(setOwnerBonus)}
                        handleSlotRateChange={edited(handleSlotRateChange)}
                    />
                );
            case 'review':
                return <NativeShiftBoardPreview shift={buildShiftPostingPreview(postingDraft(), selectedPharmacy) as any} />;
            default: return null;
        }
    };

    useEffect(() => {
        if (!stepOrder.includes(activeStep)) {
            setActiveStep(stepOrder[stepOrder.length - 1]);
        }
    }, [activeStep, stepOrder]);

    const stepIndex = stepOrder.indexOf(activeStep);
    const goNext = () => {
        if (stepIndex < stepOrder.length - 1) setActiveStep(stepOrder[stepIndex + 1]);
    };
    const goBack = () => {
        if (stepIndex > 0) setActiveStep(stepOrder[stepIndex - 1]);
    };

    if (surface.ready && !hasAccess) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <ContentState
                    kind="forbidden"
                    title="No access"
                    description="You don't have permission to post shifts in this workspace."
                    actionLabel="Go back"
                    onAction={() => router.back()}
                />
            </SafeAreaView>
        );
    }

    if (loadError) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <ContentState
                    kind="error"
                    title={loadError.kind === 'shift' ? 'Could not load shift' : 'Could not load pharmacies'}
                    description="Check your connection, then try again."
                    actionLabel="Try again"
                    onAction={retryInitialLoad}
                />
            </SafeAreaView>
        );
    }

    if (pharmaciesLoaded && pharmacies.length === 0) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <ContentState
                    kind="empty"
                    title="No pharmacies available"
                    description="You need to add or claim a pharmacy before posting a shift."
                    actionLabel="Go back"
                    onAction={() => router.back()}
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <ScrollView contentContainerStyle={[styles.content, isEmbedded && styles.contentEmbedded]} style={{ flex: 1 }} pointerEvents={hydrating ? 'none' : 'auto'}>
                {!isEmbedded ? (
                    <>
                        <Text variant="headlineMedium" style={styles.title}>
                            {editingId ? 'Edit Shift' : 'Create a New Shift'}
                        </Text>
                        <Text variant="bodyMedium" style={styles.subtitle}>
                            Follow the steps to post a new shift opportunity.
                        </Text>
                    </>
                ) : null}

                <PostShiftProgress steps={stepOrder} active={activeStep}
                    onSelect={(step) => { if (editingId || stepOrder.indexOf(step) < stepOrder.indexOf(activeStep)) setActiveStep(step); }} />

                {renderStep(activeStep)}

                {error ? <HelperText type="error" accessibilityLiveRegion="polite" style={{ fontSize: 14, fontWeight: '600' }}>{error}</HelperText> : null}

                <View style={styles.navRow}>
                    <Button
                        mode="outlined"
                        onPress={goBack}
                        disabled={stepIndex === 0}
                        style={styles.navBtnOutlined}
                        contentStyle={styles.navBtnContent}
                    >
                        Back
                    </Button>
                    {stepIndex < stepOrder.length - 1 ? (
                        <Button
                            mode="contained"
                            onPress={() => {
                                if (activeStep === 'timetable' && slots.length === 0) {
                                    setError('Add at least one date before you continue.');
                                    return;
                                }
                                goNext();
                            }}
                            style={[styles.primaryBtn, styles.navBtnPrimary]}
                            contentStyle={styles.navBtnContent}
                            labelStyle={styles.primaryBtnText}
                        >
                            Next
                        </Button>
                    ) : (
                        <Button
                            mode="contained"
                            onPress={handleSubmit}
                            disabled={!canSubmit || loading}
                            loading={loading}
                            style={[styles.primaryBtn, styles.navBtnPrimary]}
                            contentStyle={styles.navBtnContent}
                            labelStyle={styles.primaryBtnText}
                        >
                            {editingId ? 'Update Shift' : (isEmbedded ? 'Send Booking Request' : 'Post Shift')}
                        </Button>
                    )}
                </View>
            </ScrollView>

            <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={2500}>
                {toast}
            </Snackbar>

            <DatePickerModal
                mode="multiple"
                locale="en"
                visible={slotDatePickerOpen}
                onDismiss={() => setSlotDatePickerOpen(false)}
                dates={selectedDateObjects}
                onConfirm={(params: any) => {
                    const pickedDates: Date[] = Array.isArray(params?.dates)
                        ? params.dates
                        : params?.date
                            ? [params.date]
                            : [];
                    const pickedIsos = pickedDates
                        .filter(Boolean)
                        .map((d) => d.toISOString().split('T')[0]);
                    // mergeSelectedDates only adds today-or-later dates, so the draft changes only for a new one.
                    const todayIso = new Date().toISOString().split('T')[0];
                    if (pickedIsos.some((d) => d >= todayIso && !selectedDateSet.has(d))) markTouched();
                    mergeSelectedDates(pickedIsos);
                    setSlotDatePickerOpen(false);
                }}
            />
            <DatePickerModal
                mode="single"
                locale="en"
                visible={recurringEndPickerOpen}
                onDismiss={() => setRecurringEndPickerOpen(false)}
                date={new Date(slotRecurringEnd)}
                onConfirm={({ date }) => {
                    const iso = date?.toISOString().split('T')[0];
                    if (iso && iso !== slotRecurringEnd) {
                        markTouched();
                        setSlotRecurringEnd(iso);
                    }
                    setRecurringEndPickerOpen(false);
                }}
            />
            <DatePickerModal
                mode="single"
                locale="en"
                visible={escalationPicker.open}
                onDismiss={() => setEscalationPicker({ key: null, open: false })}
                date={escalationPicker.key && escalationDates[escalationPicker.key] ? new Date(escalationDates[escalationPicker.key] as string) : new Date()}
                onConfirm={({ date }) => {
                    const iso = date?.toISOString().split('T')[0];
                    if (iso && escalationPicker.key && iso !== escalationDates[escalationPicker.key]) {
                        markTouched();
                        setEscalation(escalationPicker.key, iso);
                    }
                    setEscalationPicker({ key: null, open: false });
                }}
            />
        </SafeAreaView>
    );
}
