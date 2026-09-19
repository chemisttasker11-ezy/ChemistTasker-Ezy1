import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import {
    Text,
    TextInput,
    Button,
    HelperText,
    Surface,
    IconButton,
    Chip,
    Menu,
    Snackbar,
    Checkbox,
} from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
    fetchPharmaciesService,
    fetchActiveShiftDetailService,
    createOwnerShiftService,
    updateOwnerShiftService,
    calculateShiftRates,
} from '@chemisttasker/shared-core';
import apiClient from '@/utils/apiClient';

import {
    VISIBILITY_LABELS,
    VISIBILITY_META,
    RATE_TYPE_DESCRIPTIONS,
    GOVERNMENT_AWARD_GUIDE_URL,
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
    formatAuDate,
    formatLongSlotDate,
    formatClockTime,
    getSlotDurationHours,
    formatDateLabel,
    normalizePrefillRole,
} from './PostShiftScreen.helpers';
import { styles } from './PostShiftScreen.styles';
import PostShiftDetailsStep from './PostShiftDetailsStep';
import PostShiftSkillsStep from './PostShiftSkillsStep';
import PostShiftVisibilityStep from './PostShiftVisibilityStep';

export default function PostShiftScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ edit?: string; dates?: string; date?: string; role?: string; role_needed?: string; start_time?: string; end_time?: string; dedicated_user?: string; embedded?: string }>();
    const editingId = params?.edit ? Number(params.edit) : null;
    const loadedVisibilityRef = React.useRef<string | null>(null);
    const isEmbedded = params?.embedded === '1';

    const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
    const [pharmacyId, setPharmacyId] = useState<number | ''>('');
    const [pharmaciesLoaded, setPharmaciesLoaded] = useState(false);
    const [roleNeeded, setRoleNeeded] = useState<string>('PHARMACIST');
    const [employmentType, setEmploymentType] = useState<string>('LOCUM');
    const [workloadTags, setWorkloadTags] = useState<string[]>([]);
    const [mustHave, setMustHave] = useState<string[]>([]);
    const [niceToHave, setNiceToHave] = useState<string[]>([]);
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
    const [audienceMenuVisible, setAudienceMenuVisible] = useState(false);
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

    const isLocumLike = useMemo(
        () => employmentType === 'LOCUM' || employmentType === 'CASUAL',
        [employmentType]
    );
    const canPostAnonymously = useMemo(
        () => !isEmbedded && ['ORG_CHAIN', 'PLATFORM'].includes(initialAudience),
        [initialAudience, isEmbedded]
    );
    const hasOutsidePharmacyMemberAudience = useMemo(
        () => !isEmbedded && (initialAudience !== 'FULL_PART_TIME' || Object.values(escalationDates).some(Boolean)),
        [escalationDates, initialAudience, isEmbedded]
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
        () => [...BASE_STEP_ORDER, ...(isLocumLike ? (['timetable'] as StepKey[]) : []), 'payrate'],
        [isLocumLike]
    );
    const canSubmit = useMemo(() => Boolean(pharmacyId && (!isLocumLike || slots.length > 0)), [pharmacyId, isLocumLike, slots.length]);

    const resetForm = useCallback(() => {
        const todayIso = new Date().toISOString().split('T')[0];
        setCalendarMonthAnchor(new Date(`${todayIso}T00:00:00`));
        setPharmacyId('');
        setRoleNeeded('PHARMACIST');
        setEmploymentType('LOCUM');
        setWorkloadTags([]);
        setMustHave([]);
        setNiceToHave([]);
        setHideName(false);
        setSingleUserOnly(false);
        setInitialAudience('');
        setRateType('FLEXIBLE');
        setOwnerBonus('');
        setDescription('');
        setDescriptionTemplate(null);
        setDescriptionTemplateAutoAppliedKey(null);
        setDescriptionTemplateLoading(false);
        setDescriptionTemplateSaving(false);
        setSlots([]);
        setSlotDate(todayIso);
        setSelectedDates([]);
        setSelectedDateTimes({});
        setSlotStart('09:00');
        setSlotEnd('17:00');
        setSlotRecurring(false);
        setSlotRecurringDays([]);
        setSlotRecurringEnd(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
        setEscalationDates({});
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
        setDedicatedUserId(null);
    }, []);

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
        (date: string, fallback: SlotTime = { startTime: slotStart, endTime: slotEnd }) =>
            pharmacyHoursForDate(selectedPharmacy, date, fallback),
        [selectedPharmacy, slotEnd, slotStart]
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

    // Ensure initial audience stays within allowed tiers
    useEffect(() => {
        if (allowedVis.length && !allowedVis.includes(initialAudience as VisibilityTier)) {
            setInitialAudience(allowedVis[0]);
        }
    }, [allowedVis, initialAudience]);

    useEffect(() => {
        if (!allowedVis.length || !isEmbedded) return;
        if (allowedVis.includes('LOCUM_CASUAL')) {
            setInitialAudience('LOCUM_CASUAL');
        }
    }, [allowedVis, isEmbedded]);

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

    const loadPharmacies = useCallback(async () => {
        try {
            const data = await fetchPharmaciesService({});
            const list = Array.isArray((data as any)?.results)
                ? (data as any).results
                : Array.isArray(data)
                    ? data
                    : [];
            // Keep full objects so allowed_escalation_levels/chain/org flags flow through
            setPharmacies(list as PharmacyOption[]);
            if (!editingId && list.length > 0) {
                setPharmacyId((current) => current || Number(list[0].id));
            }
            setPharmaciesLoaded(true);
        } catch {
            setError('Unable to load pharmacies');
        }
    }, []);

    const loadShift = useCallback(async () => {
        if (!editingId) return;
        try {
            const data: any = await fetchActiveShiftDetailService(editingId);
            setPharmacyId(
                data.pharmacy_detail?.id ??
                data.pharmacyDetail?.id ??
                data.pharmacy ??
                data.pharmacy_id ??
                ''
            );
            const pharmacyValue =
                data.pharmacy_detail?.id ??
                data.pharmacyDetail?.id ??
                data.pharmacy ??
                data.pharmacy_id ??
                '';
            const pharmacyDefaults = pharmacies.find((item: any) => Number(item.id) === Number(pharmacyValue));
            // Ensure the pharmacy from the shift exists in the options list (matches web behavior of showing current pharmacy)
            if (data.pharmacy_detail || data.pharmacyDetail) {
                const detail = data.pharmacy_detail ?? data.pharmacyDetail;
                setPharmacies((prev) => {
                    const exists = prev.some((p) => p.id === detail.id);
                    return exists ? prev : [...prev, detail];
                });
            }
            setRoleNeeded(data.role_needed ?? data.roleNeeded ?? data.role ?? 'PHARMACIST');
            setEmploymentType(data.employment_type ?? data.employmentType ?? 'LOCUM');
            const vis = data.visibility ?? '';
            setInitialAudience(vis);
            loadedVisibilityRef.current = vis;
            setWorkloadTags(Array.isArray(data.workload_tags ?? data.workloadTags) ? (data.workload_tags ?? data.workloadTags) : []);
            setDescription(data.description ?? '');
            setHideName(Boolean(data.post_anonymously ?? data.postAnonymously));
            setSingleUserOnly(Boolean(data.single_user_only ?? data.singleUserOnly));
            setMustHave(Array.isArray(data.must_have ?? data.mustHave) ? (data.must_have ?? data.mustHave) : []);
            setNiceToHave(Array.isArray(data.nice_to_have ?? data.niceToHave) ? (data.nice_to_have ?? data.niceToHave) : []);
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
            setOwnerBonus(
                data.owner_bonus != null
                    ? String(data.owner_bonus)
                    : data.ownerBonus != null
                        ? String(data.ownerBonus)
                        : ''
            );
            const rateTypeValue = data.rate_type ?? data.rateType;
            if (rateTypeValue === 'PHARMACIST_PROVIDED') {
                setRateType('PHARMACIST_PROVIDED');
            } else if (rateTypeValue === 'FIXED') {
                setRateType('FIXED');
            } else {
                setRateType('FLEXIBLE');
            }
            setRateWeekday(toRateInputString(firstPresent(data.rate_weekday, data.rateWeekday, (pharmacyDefaults as any)?.rate_weekday, (pharmacyDefaults as any)?.rateWeekday)));
            setRateSaturday(toRateInputString(firstPresent(data.rate_saturday, data.rateSaturday, (pharmacyDefaults as any)?.rate_saturday, (pharmacyDefaults as any)?.rateSaturday)));
            setRateSunday(toRateInputString(firstPresent(data.rate_sunday, data.rateSunday, (pharmacyDefaults as any)?.rate_sunday, (pharmacyDefaults as any)?.rateSunday)));
            setRatePublicHoliday(toRateInputString(firstPresent(data.rate_public_holiday, data.ratePublicHoliday, (pharmacyDefaults as any)?.rate_public_holiday, (pharmacyDefaults as any)?.ratePublicHoliday)));
            setRateEarlyMorning(toRateInputString(firstPresent(data.rate_early_morning, data.rateEarlyMorning, (pharmacyDefaults as any)?.rate_early_morning, (pharmacyDefaults as any)?.rateEarlyMorning)));
            setRateLateNight(toRateInputString(firstPresent(data.rate_late_night, data.rateLateNight, (pharmacyDefaults as any)?.rate_late_night, (pharmacyDefaults as any)?.rateLateNight)));
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
            setSlots(parsedSlots);
            setSlotRateRows((Array.isArray(data.slots) ? data.slots : []).map((s: any) => {
                const rate = toRateInputString(getSlotRateValue(s));
                return { rate, status: rate ? 'success' as const : 'idle' as const, dirty: false };
            }));
        } catch {
            setError('Unable to load shift details');
        }
    }, [editingId, pharmacies]);

    useEffect(() => {
        const initialize = async () => {
            if (!editingId) {
                resetForm();
            }
            await loadPharmacies(); // This will set pharmaciesLoaded to true
            if (editingId) {
                // We need to wait for pharmacies to be loaded before loading the shift
                // to ensure all dependencies like `allowedVis` are ready.
                // The `pharmaciesLoaded` state change will trigger the next effect.
            }
        };
        void initialize();
    }, [editingId, loadPharmacies, resetForm]);

    useEffect(() => { if (editingId && pharmaciesLoaded) { void loadShift(); } }, [editingId, pharmaciesLoaded, loadShift]);

    const applyBookingPrefillFromParams = useCallback(() => {
        if (editingId) return;

        const datesParam = params?.dates as unknown;
        const singleDate = params?.date;
        let parsedDates: string[] = [];
        if (typeof datesParam === 'string') {
            parsedDates = datesParam.split(',').map((d: string) => d.trim()).filter(Boolean);
        } else if (Array.isArray(datesParam)) {
            parsedDates = (datesParam as Array<string | number>)
                .reduce<string[]>((acc, value) => [...acc, ...String(value).split(',')], [])
                .map((d: string) => d.trim())
                .filter(Boolean);
        }
        const uniqueDates = Array.from(new Set(parsedDates.length ? parsedDates : (singleDate ? [singleDate] : []))).sort();
        const startParam = typeof params?.start_time === 'string' && params.start_time ? params.start_time.slice(0, 5) : slotStart;
        const endParam = typeof params?.end_time === 'string' && params.end_time ? params.end_time.slice(0, 5) : slotEnd;

        if (params?.start_time) {
            setSlotStart(startParam);
        }
        if (params?.end_time) {
            setSlotEnd(endParam);
        }

        if (uniqueDates.length > 0) {
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

        const roleParam = params?.role_needed || params?.role;
        const normalizedRole = typeof roleParam === 'string' ? normalizePrefillRole(roleParam) : '';
        if (normalizedRole) {
            setRoleNeeded(normalizedRole);
        }
        const dedicated = params?.dedicated_user;
        if (dedicated && typeof dedicated === 'string') {
            const parsed = Number(dedicated);
            if (!Number.isNaN(parsed)) {
                setDedicatedUserId(parsed);
            }
        }
    }, [editingId, params?.date, params?.dates, params?.dedicated_user, params?.end_time, params?.role, params?.role_needed, params?.start_time, slotEnd, slotStart]);

    useEffect(() => {
        applyBookingPrefillFromParams();
    }, [applyBookingPrefillFromParams]);

    useFocusEffect(
        useCallback(() => {
            applyBookingPrefillFromParams();
        }, [applyBookingPrefillFromParams])
    );

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
                if (cancelled) return;
                const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
                const template = (list[0] ?? null) as ShiftDescriptionTemplate | null;
                setDescriptionTemplate(template);
                if (
                    template?.description &&
                    !editingId &&
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
    }, [pharmacyId, roleNeeded, editingId, description, descriptionTemplateAutoAppliedKey]);

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
            const { data } = await apiClient.post('/client-profile/shift-description-templates/', {
                pharmacy: pharmacyId,
                role_needed: roleNeeded,
                description,
            });
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
            const { data } = await apiClient.patch(`/client-profile/pharmacies/${pharmacyId}/`, payload);
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

    const expandedSlots = useMemo(() => {
        const occurrences: Array<{ date: string; startTime: string; endTime: string }> = [];
        slots.forEach((slot) => {
            const addOccurrence = (date: Date) => {
                occurrences.push({
                    date: date.toISOString().split('T')[0],
                    startTime: (slot.startTime || '').slice(0, 5),
                    endTime: (slot.endTime || '').slice(0, 5),
                });
            };

            const baseDate = toIsoDate(slot.date);
            if (!baseDate) return;

            if (slot.isRecurring && slot.recurringEndDate && slot.recurringDays.length) {
                const endBoundary = toIsoDate(slot.recurringEndDate);
                if (!endBoundary) {
                    addOccurrence(baseDate);
                    return;
                }
                let cursor = new Date(baseDate);
                while (cursor <= endBoundary) {
                    if (slot.recurringDays.includes(cursor.getDay())) {
                        addOccurrence(cursor);
                    }
                    cursor.setDate(cursor.getDate() + 1);
                }
            } else {
                addOccurrence(baseDate);
            }
        });

        return occurrences.sort((a, b) => {
            const left = new Date(`${a.date}T${a.startTime}:00`).getTime();
            const right = new Date(`${b.date}T${b.startTime}:00`).getTime();
            return left - right;
        });
    }, [slots]);

    useEffect(() => {
        setSlotRateRows((prev) =>
            expandedSlots.map((_, idx) => prev[idx] ?? { rate: '', status: 'idle' as const })
        );
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
                            prior.dirty && prior.rate !== undefined && prior.rate !== null && prior.rate !== ''
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
            setError('Those timetable entries already exist.');
            return false;
        }

        setSlots((prev) => [...prev, ...filtered]);
        setError('');
        setToast(`${filtered.length} timetable entr${filtered.length > 1 ? 'ies' : 'y'} added.`);

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
            setError('Please select a start and end time.');
            return false;
        }
        if (new Date(`1970-01-01T${slotEnd}:00`).getTime() <= new Date(`1970-01-01T${slotStart}:00`).getTime()) {
            setError('End time must be after start time.');
            return false;
        }
        if (!slotDate) {
            setError('Select a date to add a manual schedule entry.');
            return false;
        }
        if (slotRecurring && (!slotRecurringEnd || slotRecurringDays.length === 0)) {
            setError('Please complete the recurrence details.');
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
            setError('End time must be after start time.');
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
            setError('End time must be after start time.');
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

    const handleSubmit = async () => {
        setError('');
        if (!pharmacyId || !roleNeeded || !employmentType) {
            setError('Please fill all required fields in Shift Details.');
            return;
        }
        if (isLocumLike && slots.length === 0) {
            setError('Please add at least one timetable entry.');
            return;
        }
        if (!isLocumLike && ftptPayMode === 'HOURLY' && (!minHourly || !maxHourly)) {
            setError('Please enter min and max hourly rates.');
            return;
        }
        if (!isLocumLike && ftptPayMode === 'ANNUAL' && (!minAnnual || !maxAnnual || !superPercent)) {
            setError('Please enter min/max annual and super %.');
            return;
        }
        setLoading(true);
        try {
            const slotRateForEntry = (entry: SlotEntry) => {
                const idx = expandedSlots.findIndex(
                    (slot) => slot.date === entry.date && slot.startTime === entry.startTime && slot.endTime === entry.endTime
                );
                if (idx < 0) return null;
                const raw = slotRateRows[idx]?.rate;
                if (raw === undefined || raw === null || raw === '') return null;
                const num = Number(raw);
                return Number.isFinite(num) ? num : null;
            };
            const payload: any = {
                pharmacy: pharmacyId,
                role_needed: roleNeeded,
                employment_type: employmentType,
                workload_tags: workloadTags,
                description,
                must_have: mustHave,
                nice_to_have: niceToHave,
                post_anonymously: canPostAnonymously ? hideName : false,
                single_user_only: singleUserOnly,
                visibility: isEmbedded ? 'LOCUM_CASUAL' : initialAudience,
                escalate_to_locum_casual: isEmbedded ? null : escalationDates.locum_casual,
                escalate_to_owner_chain: isEmbedded ? null : escalationDates.owner_chain,
                escalate_to_org_chain: isEmbedded ? null : escalationDates.org_chain,
                escalate_to_platform: isEmbedded ? null : escalationDates.platform,
                slots: slots.map((s) => ({
                    date: s.date,
                    start_time: s.startTime,
                    end_time: s.endTime,
                    is_recurring: s.isRecurring,
                    recurring_days: s.isRecurring ? s.recurringDays : [],
                    recurring_end_date: s.isRecurring && s.recurringEndDate ? s.recurringEndDate : undefined,
                    rate: slotRateForEntry(s),
                })),
                // New fields
                notify_pharmacy_staff: isEmbedded ? false : notifyPharmacyStaff,
                notify_favorite_staff: isEmbedded ? false : notifyFavoriteStaff,
                notify_chain_members: isEmbedded ? false : notifyChainMembers,
                payment_preference: isLocumLike ? paymentPreference : null,
                super_percent: isLocumLike ? (locumSuperIncluded ? 11.5 : 0) : null,
            };
            if (dedicatedUserId) {
                payload.dedicated_user = dedicatedUserId;
            }

            if (roleNeeded === 'PHARMACIST') {
                payload.rate_type = rateType;
                payload.rate_weekday = rateWeekday || null;
                payload.rate_saturday = rateSaturday || null;
                payload.rate_sunday = rateSunday || null;
                payload.rate_public_holiday = ratePublicHoliday || null;
                payload.rate_early_morning = rateEarlyMorning || null;
                payload.rate_late_night = rateLateNight || null;
            } else {
                if (ownerBonus) {
                    payload.owner_adjusted_rate = Number(ownerBonus);
                }
            }

            // Add FT/PT specific fields
            if (!isLocumLike) {
                if (ftptPayMode === 'HOURLY') {
                    if (minHourly) payload.min_hourly_rate = Number(minHourly);
                    if (maxHourly) payload.max_hourly_rate = Number(maxHourly);
                    payload.min_annual_salary = null;
                    payload.max_annual_salary = null;
                    payload.super_percent = null;
                } else {
                    if (minAnnual) payload.min_annual_salary = Number(minAnnual);
                    if (maxAnnual) payload.max_annual_salary = Number(maxAnnual);
                    payload.min_hourly_rate = null;
                    payload.max_hourly_rate = null;
                    payload.super_percent = Number(superPercent);
                }
            }

            if (editingId) {
                await updateOwnerShiftService(editingId, payload);
                setToast('Shift updated');
            } else {
                await createOwnerShiftService(payload);
                setToast('Shift posted');
                resetForm();
            }
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

    const renderPayRate = () => {
        const showSlotPreview = isLocumLike && !(roleNeeded === 'PHARMACIST' && rateType === 'PHARMACIST_PROVIDED');
        const renderSlotPreviewList = () => {
            if (!showSlotPreview || expandedSlots.length === 0) return null;
            return (
                <View style={styles.slotRatePreviewPanel}>
                    <Text style={styles.label}>Slot rate preview</Text>
                    {expandedSlots.map((slot, idx) => {
                        const row = slotRateRows[idx] ?? { rate: '', status: 'idle' as const };
                        const baseNum = Number(row.rate);
                        const rateValid = Number.isFinite(baseNum);
                        const bonusNum = Number(ownerBonus);
                        const bonusValid = Number.isFinite(bonusNum);
                        const finalNum = roleNeeded === 'PHARMACIST'
                            ? (rateValid ? baseNum : null)
                            : (rateValid ? baseNum : 0) + (bonusValid ? bonusNum : 0);
                        const durationHours = getSlotDurationHours(slot.startTime, slot.endTime);
                        const totalNum =
                            finalNum != null && Number.isFinite(finalNum) && durationHours > 0
                                ? finalNum * durationHours
                                : null;
                        const totalLabel =
                            totalNum != null && Number.isFinite(totalNum)
                                ? `$${totalNum.toFixed(2)}`
                                : '$0.00';
                        return (
                            <View key={`${slot.date}-${slot.startTime}-${idx}`} style={styles.slotRatePreviewCard}>
                                <View style={styles.slotRatePreviewInfo}>
                                    <Text style={styles.slotText}>{formatLongSlotDate(slot.date)}</Text>
                                    <Text style={styles.helper}>{`${formatClockTime(slot.startTime)} - ${formatClockTime(slot.endTime)}`}</Text>
                                </View>
                                <View style={styles.slotRatePreviewControls}>
                                    <TextInput
                                        mode="outlined"
                                        label="Rate"
                                        value={row.rate}
                                        onChangeText={(value) => handleSlotRateChange(idx, value)}
                                        keyboardType="numeric"
                                        left={<TextInput.Affix text="$" />}
                                        right={<TextInput.Affix text="/hr" />}
                                        style={styles.slotRateInput}
                                        dense
                                    />
                                    <Text style={styles.slotRateBadge}>
                                        {row.status === 'loading' ? '...' : totalLabel.replace('.00', '')}
                                    </Text>
                                </View>
                                {row.status === 'error' && row.error ? (
                                    <Text style={{ color: '#B91C1C', fontSize: 12 }}>{row.error}</Text>
                                ) : null}
                            </View>
                        );
                    })}
                </View>
            );
        };

        return (
            <Surface style={styles.card} elevation={1}>
                <Text style={styles.label}>Pay Rate</Text>
                {!isLocumLike ? (
                    <>
                        <Text style={[styles.label, { marginTop: 16 }]}>Salary Range</Text>
                        <View style={styles.pills}>
                            {['HOURLY', 'ANNUAL'].map((mode) => {
                                const selected = ftptPayMode === mode;
                                return (
                                    <Chip
                                        key={mode}
                                        selected={selected}
                                        onPress={() => setFtptPayMode(mode as 'HOURLY' | 'ANNUAL')}
                                        style={chipStyle(selected)}
                                        textStyle={chipTextStyle(selected)}
                                    >
                                        {mode === 'HOURLY' ? 'Hourly' : 'Annual Package'}
                                    </Chip>
                                );
                            })}
                        </View>
                        {ftptPayMode === 'HOURLY' ? (
                            <>
                                <TextInput mode="outlined" label="Min Hourly Rate ($/hr)" value={minHourly} onChangeText={setMinHourly} keyboardType="numeric" style={styles.input} />
                                <TextInput mode="outlined" label="Max Hourly Rate ($/hr)" value={maxHourly} onChangeText={setMaxHourly} keyboardType="numeric" style={styles.input} />
                            </>
                        ) : (
                            <>
                                <TextInput mode="outlined" label="Min Annual Package ($)" value={minAnnual} onChangeText={setMinAnnual} keyboardType="numeric" style={styles.input} />
                                <TextInput mode="outlined" label="Max Annual Package ($)" value={maxAnnual} onChangeText={setMaxAnnual} keyboardType="numeric" style={styles.input} />
                                <TextInput mode="outlined" label="Super (%)" value={superPercent} onChangeText={setSuperPercent} keyboardType="numeric" style={styles.input} />
                            </>
                        )}
                    </>
                ) : roleNeeded === 'PHARMACIST' ? (
                    <>
                        <View style={styles.pills}>
                            {(['FLEXIBLE', 'FIXED', 'PHARMACIST_PROVIDED'] as RateType[]).map((mode) => {
                                const selected = rateType === mode;
                                return (
                                    <Chip key={mode} selected={selected} onPress={() => setRateType(mode)} style={chipStyle(selected)} textStyle={chipTextStyle(selected)}>
                                        {mode === 'FLEXIBLE' ? 'Flexible Rate' : mode === 'FIXED' ? 'Fixed Rate' : 'Pharmacist Provided'}
                                    </Chip>
                                );
                            })}
                        </View>
                        <Text style={styles.helper}>{RATE_TYPE_DESCRIPTIONS[rateType]}</Text>
                        <Text style={[styles.label, { marginTop: 16 }]}>Payment Type</Text>
                        <View style={styles.pills}>
                            {(['ABN', 'TFN'] as const).map((pref) => {
                                const selected = paymentPreference === pref;
                                return (
                                    <Chip
                                        key={pref}
                                        selected={selected}
                                        onPress={() => setPaymentPreference(pref)}
                                        style={chipStyle(selected)}
                                        textStyle={chipTextStyle(selected)}
                                    >
                                        {pref}
                                    </Chip>
                                );
                            })}
                        </View>
                        <TouchableOpacity style={styles.checkboxRow} onPress={() => setLocumSuperIncluded((v) => !v)}>
                            <Checkbox status={locumSuperIncluded ? 'checked' : 'unchecked'} />
                            <Text style={styles.rowText}>+ superannuation </Text>
                        </TouchableOpacity>

                        {rateType !== 'PHARMACIST_PROVIDED' ? (
                            <>
                                <Text style={[styles.label, { marginTop: 16 }]}>
                                    Base rates ($/hr){hasOutsidePharmacyMemberAudience ? '' : ' (optional)'}
                                </Text>
                                {!hasOutsidePharmacyMemberAudience ? (
                                    <Text style={styles.helper}>
                                        These pay rates will be displayed whenever the shift is visible outside Pharmacy Members.
                                    </Text>
                                ) : null}
                                <TextInput mode="outlined" label="Weekday" value={rateWeekday} onChangeText={setRateWeekday} keyboardType="numeric" style={styles.input} />
                                <TextInput mode="outlined" label="Saturday" value={rateSaturday} onChangeText={setRateSaturday} keyboardType="numeric" style={styles.input} />
                                <TextInput mode="outlined" label="Sunday" value={rateSunday} onChangeText={setRateSunday} keyboardType="numeric" style={styles.input} />
                                <TextInput mode="outlined" label="Public Holiday" value={ratePublicHoliday} onChangeText={setRatePublicHoliday} keyboardType="numeric" style={styles.input} />
                                <TextInput mode="outlined" label="Early Morning" value={rateEarlyMorning} onChangeText={setRateEarlyMorning} keyboardType="numeric" style={styles.input} />
                                <TextInput mode="outlined" label="Late Night" value={rateLateNight} onChangeText={setRateLateNight} keyboardType="numeric" style={styles.input} />
                                <Button
                                    mode="outlined"
                                    onPress={handleSavePharmacyRateDefaults}
                                    loading={savingPharmacyRates}
                                    disabled={savingPharmacyRates || !pharmacyId}
                                    style={styles.defaultRatesButton}
                                >
                                    Update Pharmacy Default Rates
                                </Button>
                            </>
                        ) : null}
                        {renderSlotPreviewList()}
                    </>
                ) : (
                    <>
                        <TouchableOpacity onPress={() => Linking.openURL(GOVERNMENT_AWARD_GUIDE_URL)}>
                            <Text style={styles.helper}>Rate is set by government award</Text>
                            <Text style={styles.helper}>published 6 February 2026</Text>
                        </TouchableOpacity>
                        <Text style={[styles.label, { marginTop: 16 }]}>Payment Type</Text>
                        <View style={styles.pills}>
                            {(['ABN', 'TFN'] as const).map((pref) => {
                                const selected = paymentPreference === pref;
                                return (
                                    <Chip key={pref} selected={selected} onPress={() => setPaymentPreference(pref)} style={chipStyle(selected)} textStyle={chipTextStyle(selected)}>
                                        {pref}
                                    </Chip>
                                );
                            })}
                        </View>
                        <TouchableOpacity style={styles.checkboxRow} onPress={() => setLocumSuperIncluded((v) => !v)}>
                            <Checkbox status={locumSuperIncluded ? 'checked' : 'unchecked'} />
                            <Text style={styles.rowText}>+ superannuation </Text>
                        </TouchableOpacity>
                        <TextInput mode="outlined" label="Owner Bonus ($/hr, optional)" value={ownerBonus} onChangeText={setOwnerBonus} keyboardType="numeric" style={styles.input} />
                        {renderSlotPreviewList()}
                    </>
                )}
            </Surface>
        );
    };

    const renderTimetable = () => (
        <Surface style={styles.card} elevation={1}>
            <View style={styles.slotHeader}>
                <Text style={styles.label}>Timetable</Text>
                <Button mode="contained" onPress={addManualSlot} icon="plus" style={styles.primaryBtn} labelStyle={styles.primaryBtnText}>
                    Add slot
                </Button>
            </View>

            <View style={styles.slotRow}>
                <TextInput
                    mode="outlined"
                    label="Date"
                    value={selectedDates.length > 0 ? `${selectedDates.length} dates selected` : formatAuDate(slotDate)}
                    style={styles.slotInput}
                    placeholder="Select date(s)"
                    right={<TextInput.Icon icon="calendar" onPress={() => setSlotDatePickerOpen(true)} />}
                    editable={false}
                />
                <TextInput
                    mode="outlined"
                    label="Start"
                    value={slotStart}
                    onChangeText={setSlotStart}
                    style={styles.slotInput}
                    placeholder="09:00"
                />
                <TextInput
                    mode="outlined"
                    label="End"
                    value={slotEnd}
                    onChangeText={setSlotEnd}
                    style={styles.slotInput}
                    placeholder="17:00"
                />
            </View>
            {slotDateHours?.closed ? (
                <View style={styles.closedNotice}>
                    <Text style={styles.closedNoticeText}>
                        This pharmacy is marked closed on this {slotDateHours.label}. You can still edit the times and add the shift.
                    </Text>
                </View>
            ) : null}

            <Surface style={styles.calendarPanel} elevation={0}>
                <View style={styles.calendarHeader}>
                    <IconButton
                        icon="chevron-left"
                        size={18}
                        onPress={() => setCalendarMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    />
                    <Text style={styles.calendarTitle}>{monthLabel}</Text>
                    <IconButton
                        icon="chevron-right"
                        size={18}
                        onPress={() => setCalendarMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    />
                </View>
                <View style={styles.calendarWeekHead}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
                        <Text key={`${d}-${idx}`} style={styles.calendarWeekText}>{d}</Text>
                    ))}
                </View>
                <View style={styles.calendarGrid}>
                    {monthCalendarCells.map((cell, idx) => {
                        if (!cell.inMonth) {
                            return <View key={`${cell.iso}-${idx}`} style={[styles.calendarCell, styles.calendarCellPad]} />;
                        }
                        const isSelected = selectedDateSet.has(cell.iso);
                        const hasSlot = slotDateSet.has(cell.iso);
                        const hours = getDefaultTimesForDate(cell.iso);
                        return (
                            <TouchableOpacity
                                key={`${cell.iso}-${idx}`}
                                style={[
                                    styles.calendarCell,
                                    hours.closed && styles.calendarCellClosed,
                                    isSelected && styles.calendarCellSelected,
                                    hours.closed && isSelected && styles.calendarCellClosedSelected,
                                    hasSlot && styles.calendarCellWithSlot,
                                ]}
                                onPress={() => {
                                    setSlotDate(cell.iso);
                                    setSlotStart(hours.startTime);
                                    setSlotEnd(hours.endTime);
                                    setSelectedDates((prev) =>
                                        prev.includes(cell.iso)
                                            ? prev.filter((d) => d !== cell.iso)
                                            : [...prev, cell.iso].sort()
                                    );
                                    setSelectedDateTimes((prev) => {
                                        const next = { ...prev };
                                        if (selectedDateSet.has(cell.iso)) {
                                            delete next[cell.iso];
                                        } else if (!next[cell.iso]) {
                                            next[cell.iso] = { startTime: hours.startTime, endTime: hours.endTime };
                                        }
                                        return next;
                                    });
                                }}
                            >
                                <Text style={[styles.calendarCellText, isSelected && styles.calendarCellTextSelected]}>
                                    {cell.day}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <Text style={styles.hint}>Blue: selected dates, purple border: dates already added to timetable.</Text>
            </Surface>

            <View style={styles.row}>
                <Checkbox status={slotRecurring ? 'checked' : 'unchecked'} onPress={() => setSlotRecurring((v) => !v)} />
                <Text style={styles.rowText}>Recurring</Text>
            </View>

            {slotRecurring ? (
                <>
                    <View style={styles.recurringRow}>
                        {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                            <Chip
                                key={day}
                                selected={slotRecurringDays.includes(day)}
                                onPress={() => toggleRecurringDay(day)}
                                style={chipStyle(slotRecurringDays.includes(day))}
                                textStyle={chipTextStyle(slotRecurringDays.includes(day))}
                            >
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}
                            </Chip>
                        ))}
                    </View>
                    <TextInput
                        mode="outlined"
                        label="Recurring end date"
                        value={formatAuDate(slotRecurringEnd)}
                        style={styles.input}
                        placeholder="DD/MM/YYYY"
                        right={<TextInput.Icon icon="calendar" onPress={() => setRecurringEndPickerOpen(true)} />}
                        editable={false}
                    />
                </>
            ) : null}

            <View style={styles.row}>
                <Checkbox status={singleUserOnly ? 'checked' : 'unchecked'} onPress={() => setSingleUserOnly((v) => !v)} />
                <Text style={styles.rowText}>Single user only</Text>
            </View>

            {selectedDates.length > 0 ? (
                <View style={styles.selectedDaysPanel}>
                    <View style={styles.selectedDaysHeader}>
                        <Text style={styles.label}>Selected calendar days</Text>
                        <View style={styles.selectedDaysActions}>
                            <Button mode="contained" onPress={addAllSelectedSlots} icon="plus" style={styles.primaryBtn} labelStyle={styles.primaryBtnText}>
                                Add all
                            </Button>
                            <Button mode="text" onPress={() => { setSelectedDates([]); setSelectedDateTimes({}); }}>
                                Clear
                            </Button>
                        </View>
                    </View>
                    {closedSelectedDates.length > 0 ? (
                        <View style={styles.closedNotice}>
                            <Text style={styles.closedNoticeText}>
                                {closedSelectedDates.length} selected date{closedSelectedDates.length > 1 ? 's are' : ' is'} marked closed for this pharmacy. They stay selected and the times remain editable.
                            </Text>
                        </View>
                    ) : null}
                    <View style={{ gap: 10 }}>
                        {selectedDates.map((date) => {
                            const times = selectedDateTimes[date] || { startTime: slotStart, endTime: slotEnd };
                            const hours = getDefaultTimesForDate(date, times);
                            return (
                                <Surface key={date} style={[styles.selectedDayCard, hours.closed && styles.selectedDayCardClosed]} elevation={0}>
                                    <View style={styles.selectedDayHeader}>
                                        <View style={styles.selectedDayChipRow}>
                                            <Chip
                                                onClose={() => {
                                                    setSelectedDates((prev) => prev.filter((d) => d !== date));
                                                    setSelectedDateTimes((prev) => {
                                                        const next = { ...prev };
                                                        delete next[date];
                                                        return next;
                                                    });
                                                }}
                                                style={styles.chipUnselected}
                                                textStyle={styles.chipText}
                                            >
                                                {formatAuDate(date)}
                                            </Chip>
                                            {hours.closed ? (
                                                <Chip icon="block-helper" style={styles.closedChip} textStyle={styles.closedChipText}>
                                                    Closed {hours.label}
                                                </Chip>
                                            ) : null}
                                        </View>
                                        <TouchableOpacity style={styles.selectedDayAddBtn} onPress={() => addSelectedDateSlot(date)}>
                                            <IconButton icon="plus" size={18} iconColor="#FFFFFF" />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.slotRow}>
                                        <TextInput
                                            mode="outlined"
                                            label="Start"
                                            value={times.startTime}
                                            onChangeText={(value) => setSelectedDateTimes((prev) => ({ ...prev, [date]: { startTime: value, endTime: times.endTime } }))}
                                            style={styles.slotInput}
                                            placeholder="09:00"
                                        />
                                        <TextInput
                                            mode="outlined"
                                            label="End"
                                            value={times.endTime}
                                            onChangeText={(value) => setSelectedDateTimes((prev) => ({ ...prev, [date]: { startTime: times.startTime, endTime: value } }))}
                                            style={styles.slotInput}
                                            placeholder="17:00"
                                        />
                                    </View>
                                </Surface>
                            );
                        })}
                    </View>
                    <Text style={styles.hint}>Adjust times per day, then use the purple plus to add one day or Add all to add everything at once.</Text>
                </View>
            ) : null}

            <View style={{ gap: 8, marginTop: 8 }}>
                {slots.map((slot, idx) => (
                    <Surface key={`${slot.date}-${idx}`} style={styles.slotItem} elevation={0}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.slotText}>
                                {formatLongSlotDate(slot.date)} — {slot.startTime} to {slot.endTime}
                            </Text>
                            {slot.isRecurring ? (
                                <Text style={styles.slotRecurringText}>
                                    Recurring: {slot.recurringDays.join(', ')} until {slot.recurringEndDate ? formatLongSlotDate(slot.recurringEndDate) : 'N/A'}
                                </Text>
                            ) : null}
                        </View>
                        <View style={styles.slotActions}>
                            <IconButton icon="pencil" size={18} onPress={() => editSlot(idx)} />
                            <IconButton icon="delete" size={18} onPress={() => removeSlot(idx)} />
                        </View>
                    </Surface>
                ))}
                {slots.length === 0 && <Text style={styles.hint}>Add at least one slot (date + start/end time).</Text>}
            </View>
        </Surface>
    );

    const renderStep = (step: StepKey) => {
        switch (step) {
            case 'details':
                return (
                    <PostShiftDetailsStep
                        pharmacyMenuVisible={pharmacyMenuVisible}
                        setPharmacyMenuVisible={setPharmacyMenuVisible}
                        pharmacies={pharmacies}
                        pharmacyId={pharmacyId}
                        setPharmacyId={setPharmacyId}
                        roleNeeded={roleNeeded}
                        setRoleNeeded={setRoleNeeded}
                        employmentType={employmentType}
                        setEmploymentType={setEmploymentType}
                        getEmploymentLabel={getEmploymentLabel}
                        descriptionTemplateLoading={descriptionTemplateLoading}
                        descriptionTemplate={descriptionTemplate}
                        descriptionTemplateSaving={descriptionTemplateSaving}
                        handleUseDescriptionTemplate={handleUseDescriptionTemplate}
                        handleSaveDescriptionTemplate={handleSaveDescriptionTemplate}
                        description={description}
                        setDescription={setDescription}
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
                    />
                );
            case 'visibility':
                return (
                    <PostShiftVisibilityStep
                        isEmbedded={isEmbedded}
                        canPostAnonymously={canPostAnonymously}
                        hideName={hideName}
                        setHideName={setHideName}
                        allowedVis={allowedVis}
                        initialAudience={initialAudience}
                        setInitialAudience={setInitialAudience}
                        audienceMenuVisible={audienceMenuVisible}
                        setAudienceMenuVisible={setAudienceMenuVisible}
                        notifyPharmacyStaff={notifyPharmacyStaff}
                        setNotifyPharmacyStaff={setNotifyPharmacyStaff}
                        notifyFavoriteStaff={notifyFavoriteStaff}
                        setNotifyFavoriteStaff={setNotifyFavoriteStaff}
                        notifyChainMembers={notifyChainMembers}
                        setNotifyChainMembers={setNotifyChainMembers}
                        escalationDates={escalationDates}
                        setEscalationPicker={setEscalationPicker}
                    />
                );
            case 'timetable': return renderTimetable();
            case 'payrate': return renderPayRate();
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

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <ScrollView contentContainerStyle={[styles.content, isEmbedded && styles.contentEmbedded]} style={{ flex: 1 }}>
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

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.stepper, isEmbedded && styles.stepperEmbedded]}
                >
                    {stepOrder.map((step) => (
                        <TouchableOpacity
                            key={step}
                            style={[styles.stepPill, isEmbedded && styles.stepPillEmbedded, activeStep === step && styles.stepPillActive]}
                            onPress={() => setActiveStep(step)}
                        >
                            <Text style={[styles.stepPillText, activeStep === step && styles.stepPillTextActive]}>
                                {step.replace('-', ' ')}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {error ? <HelperText type="error">{error}</HelperText> : null}

                {renderStep(activeStep)}

                <View style={styles.navRow}>
                    <Button mode="outlined" onPress={goBack} disabled={stepIndex === 0}>Back</Button>
                    {stepIndex < stepOrder.length - 1 ? (
                        <Button
                            mode="contained"
                            onPress={() => {
                                if (activeStep === 'timetable' && slots.length === 0) {
                                    setError('Please add at least one timetable entry.');
                                    return;
                                }
                                goNext();
                            }}
                            style={styles.primaryBtn}
                            labelStyle={styles.primaryBtnText}
                        >
                            Next
                        </Button>
                    ) : (
                        <Button mode="contained" onPress={handleSubmit} disabled={!canSubmit || loading} loading={loading} style={styles.primaryBtn} labelStyle={styles.primaryBtnText}>
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
                    mergeSelectedDates(
                        pickedDates
                            .filter(Boolean)
                            .map((d) => d.toISOString().split('T')[0])
                    );
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
                    if (date) setSlotRecurringEnd(date.toISOString().split('T')[0]);
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
                    if (date && escalationPicker.key) {
                        setEscalation(escalationPicker.key, date.toISOString().split('T')[0]);
                    }
                    setEscalationPicker({ key: null, open: false });
                }}
            />
        </SafeAreaView>
    );
}
