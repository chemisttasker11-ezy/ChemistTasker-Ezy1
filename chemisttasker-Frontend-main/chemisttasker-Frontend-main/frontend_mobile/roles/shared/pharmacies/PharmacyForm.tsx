// Pharmacy Form - Create/Edit Pharmacy
// Full Parity with Web Dashboard
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    View,
    TouchableOpacity,
    Alert,
    Linking,
} from 'react-native';
import {
    ActivityIndicator,
    Button,
    RadioButton,
    Surface,
    Text,
    TextInput,
    Switch,
    Chip,
    Checkbox,
    Divider,
    HelperText,
    Menu,
    Portal,
} from 'react-native-paper';
import { TimePickerModal } from 'react-native-paper-dates';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
    createPharmacy,
    updatePharmacy,
    getPharmacyById,
    lookupPharmacyAbn,
    type PharmacyDTO,
} from '@chemisttasker/shared-core';
import { surfaceTokens } from './types';
import GooglePlacesInput from './GooglePlacesInput';
import { useUnsavedChangesGuard } from '../forms/useUnsavedChangesGuard';

type Mode = 'create' | 'edit';

type Props = {
    mode: Mode;
    pharmacyId?: string;
    onSuccess?: () => void;
    onCancel?: () => void;
    onContinueLater?: () => void | Promise<void>;
    showSetupHero?: boolean;
};

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
const EMPLOYMENT_TYPES = ["PART_TIME", "FULL_TIME", "LOCUMS"];
const ROLE_OPTIONS = ["PHARMACIST", "INTERN", "ASSISTANT", "TECHNICIAN", "STUDENT", "ADMIN", "DRIVER"];
const prettifyOptionLabel = (value: string) =>
    value
        .split('_')
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
const RATE_TYPES = [
    { value: 'FIXED', label: 'Fixed (Hourly)' },
    { value: 'FLEXIBLE', label: 'Flexible' },
    { value: 'PHARMACIST_PROVIDED', label: 'Pharmacist Provided' },
];
const RATE_MINIMUM_EXAMPLE = '55';
const GOVERNMENT_AWARD_GUIDE_URL = 'https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf';

const TABS = [
    { label: 'Basic', shortLabel: 'Basic', icon: 'domain' },
    { label: 'Regulatory', shortLabel: 'Reg', icon: 'check-decagram' },
    { label: 'Docs', shortLabel: 'Docs', icon: 'file-document' },
    { label: 'Employment', shortLabel: 'Staff', icon: 'account-group' },
    { label: 'Hours', shortLabel: 'Hours', icon: 'clock-outline' },
    { label: 'Rate', shortLabel: 'Rate', icon: 'cash' },
    { label: 'About', shortLabel: 'About', icon: 'message' },
];

const parseTimeValue = (value?: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
    if (!match) {
        return { hours: 9, minutes: 0 };
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return { hours: 9, minutes: 0 };
    }
    return { hours: Math.min(23, Math.max(0, hours)), minutes: Math.min(59, Math.max(0, minutes)) };
};

const formatTimeValue = (hours: number, minutes: number) =>
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

export default function PharmacyForm({
    mode,
    pharmacyId,
    onSuccess,
    onCancel,
    onContinueLater,
    showSetupHero = false,
}: Props) {
    const router = useRouter();
    const initialPharmacyId = pharmacyId ? String(pharmacyId) : null;
    const initialStateRef = useRef({
        employmentTypes: [] as string[],
        existingFiles: { approval: null, sops: null, induction: null, sump: null } as {
            approval: string | null;
            sops: string | null;
            induction: string | null;
            sump: string | null;
        },
        form: {
            name: '',
            email: '',
            street_address: '',
            suburb: '',
            state: 'NSW',
            postcode: '',
            abn: '',
            google_place_id: '',
            latitude: null as number | null,
            longitude: null as number | null,
            auto_publish_worker_requests: false,
            about: '',
            default_rate_type: '' as '' | 'FIXED' | 'FLEXIBLE' | 'PHARMACIST_PROVIDED',
            default_fixed_rate: '',
            rate_weekday: '',
            rate_saturday: '',
            rate_sunday: '',
            rate_public_holiday: '',
            rate_early_morning: '',
            rate_late_night: '',
            weekdays_start: '',
            weekdays_end: '',
            monday_start: '',
            monday_end: '',
            monday_closed: false,
            tuesday_start: '',
            tuesday_end: '',
            tuesday_closed: false,
            wednesday_start: '',
            wednesday_end: '',
            wednesday_closed: false,
            thursday_start: '',
            thursday_end: '',
            thursday_closed: false,
            friday_start: '',
            friday_end: '',
            friday_closed: false,
            saturdays_start: '',
            saturdays_end: '',
            saturdays_closed: false,
            sundays_start: '',
            sundays_end: '',
            sundays_closed: false,
            public_holidays_start: '',
            public_holidays_end: '',
            public_holidays_closed: false,
        },
        rolesNeeded: [] as string[],
    });
    const [loading, setLoading] = useState(mode === 'edit');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [currentPharmacyId, setCurrentPharmacyId] = useState<string | null>(initialPharmacyId);
    const [activeTab, setActiveTab] = useState(0); // 0 to 6
    const lastTabIndex = TABS.length - 1;

    // Form State
    const [form, setForm] = useState({
        name: '',
        email: '',
        street_address: '',
        suburb: '',
        state: 'NSW',
        postcode: '',
        abn: '',
        google_place_id: '',
        latitude: null as number | null,
        longitude: null as number | null,
        auto_publish_worker_requests: false,
        about: '',
        // Rate
        default_rate_type: '' as '' | 'FIXED' | 'FLEXIBLE' | 'PHARMACIST_PROVIDED',
        default_fixed_rate: '',
        rate_weekday: '',
        rate_saturday: '',
        rate_sunday: '',
        rate_public_holiday: '',
        rate_early_morning: '',
        rate_late_night: '',
        // Hours
        weekdays_start: '', weekdays_end: '',
        monday_start: '', monday_end: '',
        monday_closed: false,
        tuesday_start: '', tuesday_end: '',
        tuesday_closed: false,
        wednesday_start: '', wednesday_end: '',
        wednesday_closed: false,
        thursday_start: '', thursday_end: '',
        thursday_closed: false,
        friday_start: '', friday_end: '',
        friday_closed: false,
        saturdays_start: '', saturdays_end: '',
        saturdays_closed: false,
        sundays_start: '', sundays_end: '',
        sundays_closed: false,
        public_holidays_start: '', public_holidays_end: '',
        public_holidays_closed: false,
    });

    // Lists logic
    const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
    const [rolesNeeded, setRolesNeeded] = useState<string[]>([]);

    // Files
    const [files, setFiles] = useState<{
        approval: any;
        sops: any;
        induction: any;
        sump: any;
    }>({ approval: null, sops: null, induction: null, sump: null });

    // Existing files (URLs)
    const [existingFiles, setExistingFiles] = useState<{
        approval: string | null;
        sops: string | null;
        induction: string | null;
        sump: string | null;
    }>({ approval: null, sops: null, induction: null, sump: null });

    // UI Menus
    const [rateMenuVisible, setRateMenuVisible] = useState(false);
    const [stateMenuVisible, setStateMenuVisible] = useState(false);
    const [activeTimeField, setActiveTimeField] = useState<null | { key: string; label: string }>(null);
    const [abnLocked, setAbnLocked] = useState(false);
    const [abnEntityName, setAbnEntityName] = useState<string | null>(null);
    const [abnEntityType, setAbnEntityType] = useState<string | null>(null);
    const [abnStatus, setAbnStatus] = useState<string | null>(null);
    const [abnGstRegistered, setAbnGstRegistered] = useState<boolean | null>(null);
    const [abnGstFrom, setAbnGstFrom] = useState<string | null>(null);
    const [abnGstTo, setAbnGstTo] = useState<string | null>(null);
    const [abnLastChecked, setAbnLastChecked] = useState<string | null>(null);
    const [abnVerificationNote, setAbnVerificationNote] = useState<string | null>(null);
    const [checkingABN, setCheckingABN] = useState(false);
    const [abnConfirmedLocal, setAbnConfirmedLocal] = useState(false);
    const resetToSavedState = async () => {
        const initial = initialStateRef.current;
        setForm(initial.form);
        setEmploymentTypes(initial.employmentTypes);
        setRolesNeeded(initial.rolesNeeded);
        setExistingFiles(initial.existingFiles);
        setFiles({ approval: null, sops: null, induction: null, sump: null });
        unsaved.markClean({
            employmentTypes: initial.employmentTypes,
            files: { approval: null, sops: null, induction: null, sump: null },
            form: initial.form,
            rolesNeeded: initial.rolesNeeded,
        });
    };
    const unsaved = useUnsavedChangesGuard(
        { form, employmentTypes, rolesNeeded, files },
        { enabled: !loading, onDiscard: resetToSavedState, saving }
    );

    const normalizeCoord = (value: number | null) => {
        if (value === null || value === undefined) return value;
        const rounded = Number(value.toFixed(6));
        return Number.isFinite(rounded) ? rounded : value;
    };

    const formatApiError = (data: any) => {
        if (!data) return '';
        if (typeof data === 'string') return data;
        if (data.detail && typeof data.detail === 'string') return data.detail;
        if (Array.isArray(data)) return data.join('\n');
        if (typeof data === 'object') {
            return Object.entries(data)
                .map(([key, value]) => {
                    if (Array.isArray(value)) return `${key}: ${value.join(' ')}`;
                    if (typeof value === 'string') return `${key}: ${value}`;
                    return `${key}: ${JSON.stringify(value)}`;
                })
                .join('\n');
        }
        return String(data);
    };

    const formatDate = (value?: string | null) => {
        if (!value) return '-';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
    };

    const formatDateTime = (value?: string | null) => {
        if (!value) return '-';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    };

    const applyAbnMeta = (data?: any) => {
        setAbnEntityName(data?.abn_entity_name ?? null);
        setAbnEntityType(data?.abn_entity_type ?? null);
        setAbnStatus(data?.abn_status ?? null);
        setAbnGstRegistered(data?.abn_gst_registered ?? null);
        setAbnGstFrom(data?.abn_gst_from ?? null);
        setAbnGstTo(data?.abn_gst_to ?? null);
        setAbnLastChecked(data?.abn_last_checked ?? null);
        setAbnVerificationNote(data?.abn_verification_note ?? null);
        setAbnLocked(Boolean(data?.abn_verified && data?.abn_entity_confirmed));
        setAbnConfirmedLocal(Boolean(data?.abn_entity_confirmed));
    };

    const abnDigits = form.abn.replace(/\D/g, '');
    const abnInvalid = abnDigits.length > 0 && abnDigits.length !== 11;
    const abnIsLocked = abnLocked || abnConfirmedLocal;

    // Initial Load
    useEffect(() => {
        if (mode !== 'edit' || !pharmacyId) return;
        let cancelled = false;
        (async () => {
            try {
                const data = (await getPharmacyById(pharmacyId)) as any;
                if (cancelled || !data) return;

                const nextForm = {
                    name: data.name || '',
                    email: data.email || '',
                    street_address: data.street_address || '',
                    suburb: data.suburb || '',
                    state: data.state || 'NSW',
                    postcode: String(data.postcode || ''),
                    abn: data.abn || '',
                    google_place_id: data.google_place_id || '',
                    latitude: data.latitude || null,
                    longitude: data.longitude || null,
                    auto_publish_worker_requests: data.auto_publish_worker_requests || false,
                    about: data.about || '',
                    default_rate_type: data.default_rate_type || '',
                    default_fixed_rate: String(data.default_fixed_rate || ''),
                    rate_weekday: String(data.rate_weekday || ''),
                    rate_saturday: String(data.rate_saturday || ''),
                    rate_sunday: String(data.rate_sunday || ''),
                    rate_public_holiday: String(data.rate_public_holiday || ''),
                    rate_early_morning: String(data.rate_early_morning || ''),
                    rate_late_night: String(data.rate_late_night || ''),
                    weekdays_start: data.weekdays_start || data.monday_start || '',
                    weekdays_end: data.weekdays_end || data.monday_end || '',
                    monday_start: data.monday_start || data.weekdays_start || '',
                    monday_end: data.monday_end || data.weekdays_end || '',
                    monday_closed: Boolean(data.monday_closed),
                    tuesday_start: data.tuesday_start || data.weekdays_start || '',
                    tuesday_end: data.tuesday_end || data.weekdays_end || '',
                    tuesday_closed: Boolean(data.tuesday_closed),
                    wednesday_start: data.wednesday_start || data.weekdays_start || '',
                    wednesday_end: data.wednesday_end || data.weekdays_end || '',
                    wednesday_closed: Boolean(data.wednesday_closed),
                    thursday_start: data.thursday_start || data.weekdays_start || '',
                    thursday_end: data.thursday_end || data.weekdays_end || '',
                    thursday_closed: Boolean(data.thursday_closed),
                    friday_start: data.friday_start || data.weekdays_start || '',
                    friday_end: data.friday_end || data.weekdays_end || '',
                    friday_closed: Boolean(data.friday_closed),
                    saturdays_start: data.saturdays_start || '',
                    saturdays_end: data.saturdays_end || '',
                    saturdays_closed: Boolean(data.saturdays_closed),
                    sundays_start: data.sundays_start || '',
                    sundays_end: data.sundays_end || '',
                    sundays_closed: Boolean(data.sundays_closed),
                    public_holidays_start: data.public_holidays_start || '',
                    public_holidays_end: data.public_holidays_end || '',
                    public_holidays_closed: Boolean(data.public_holidays_closed),
                };

                const nextEmploymentTypes = data.employment_types || [];
                const nextRolesNeeded = data.roles_needed || [];
                const nextExistingFiles = {
                    approval: data.approval_certificate || null,
                    sops: data.sops || null,
                    induction: data.induction_guides || null,
                    sump: data.qld_sump_docs || null,
                };

                setForm(nextForm);
                applyAbnMeta(data);
                setEmploymentTypes(nextEmploymentTypes);
                setRolesNeeded(nextRolesNeeded);
                setExistingFiles(nextExistingFiles);
                initialStateRef.current = {
                    employmentTypes: nextEmploymentTypes,
                    existingFiles: nextExistingFiles,
                    form: nextForm,
                    rolesNeeded: nextRolesNeeded,
                };
                unsaved.markClean({
                    form: nextForm,
                    employmentTypes: nextEmploymentTypes,
                    rolesNeeded: nextRolesNeeded,
                    files: { approval: null, sops: null, induction: null, sump: null },
                });

            } catch (err: any) {
                if (!cancelled) setError(err?.message || 'Failed to load pharmacy');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [mode, pharmacyId]);

    useEffect(() => {
        if (mode !== 'create') return;
        initialStateRef.current = {
            employmentTypes,
            existingFiles,
            form,
            rolesNeeded,
        };
        applyAbnMeta(null);
        unsaved.markClean({ form, employmentTypes, rolesNeeded, files });
    }, []);

    const handlePickFile = async (key: keyof typeof files) => {
        try {
            const res = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });

            if (!res.canceled && res.assets && res.assets.length > 0) {
                const asset = res.assets[0];
                setFiles(prev => ({ ...prev, [key]: asset }));
            }
        } catch (e) {
            if (__DEV__) {
                console.log('File picker error', e);
            }
        }
    };

    const handlePlaceSelected = (place: {
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
        setForm(prev => ({
            ...prev,
            name: prev.name ? prev.name : (place.name || prev.name),
            google_place_id: place.place_id || prev.google_place_id,
            street_address: place.street_address || prev.street_address,
            suburb: place.suburb || prev.suburb,
            state: place.state || prev.state,
            postcode: place.postcode || prev.postcode,
            latitude: place.latitude ?? prev.latitude,
            longitude: place.longitude ?? prev.longitude,
        }));
    };

    const handleClearPlace = () => {
        setForm(prev => ({
            ...prev,
            google_place_id: '',
            street_address: '',
            suburb: '',
            state: 'NSW',
            postcode: '',
            latitude: null,
            longitude: null,
        }));
    };

    const toggleList = (list: string[], setList: (l: string[]) => void, item: string) => {
        if (list.includes(item)) {
            setList(list.filter(i => i !== item));
        } else {
            setList([...list, item]);
        }
    };

    const validate = () => {
        if (!form.name || !form.street_address || !form.suburb || !form.state || !form.postcode) {
            setError('Please fill in all required fields (Name, Address, Suburb, State, Postcode).');
            setActiveTab(0); // Jump to General
            return false;
        }
        if (!form.abn) {
            setError('ABN is required.');
            setActiveTab(1); // Jump to Approval
            return false;
        }
        const abnDigits = form.abn.replace(/\D/g, '');
        if (abnDigits.length !== 11) {
            setError('ABN must be exactly 11 digits.');
            setActiveTab(1);
            return false;
        }
        return true;
    };

    const buildPharmacyPayload = ({ submittedForVerification = false }: { submittedForVerification?: boolean } = {}) => {
        const payload: Record<string, any> = {};
        Object.entries(form).forEach(([k, v]) => {
            if (v === null || v === undefined) return;
            if (typeof v === 'string' && v.trim() === '') return;
            if (k === 'abn' && typeof v === 'string') {
                payload[k] = v.replace(/\D/g, '');
                return;
            }
            if (k === 'latitude' && typeof v === 'number') {
                payload[k] = normalizeCoord(v);
                return;
            }
            if (k === 'longitude' && typeof v === 'number') {
                payload[k] = normalizeCoord(v);
                return;
            }
            payload[k] = v;
        });
        payload.employment_types = employmentTypes;
        payload.roles_needed = rolesNeeded;
        if (submittedForVerification) {
            payload.submitted_for_verification = true;
        }
        if (abnConfirmedLocal) {
            payload.abn_entity_confirmed = true;
            payload.submitted_for_verification = true;
        }
        return payload;
    };

    const checkABN = async () => {
        if (!form.name || !form.street_address || !form.suburb || !form.state || !form.postcode) {
            setError('Enter the pharmacy basic details first so the ABN check can run during onboarding.');
            setActiveTab(0);
            return;
        }
        if (abnDigits.length !== 11) {
            setError('ABN must be exactly 11 digits.');
            setActiveTab(1);
            return;
        }
        setCheckingABN(true);
        setError('');
        try {
            const res = await lookupPharmacyAbn({ abn: abnDigits });
            setAbnConfirmedLocal(false);
            setForm((prev) => ({ ...prev, abn: res?.abn || prev.abn }));
            applyAbnMeta(res);
        } catch (err: any) {
            const apiMessage = formatApiError(err?.response?.data);
            setError(apiMessage || err?.message || 'ABN check failed');
        } finally {
            setCheckingABN(false);
        }
    };

    const confirmABN = async () => {
        if (!abnEntityName) {
            setError('Run the ABN check first, then confirm the ABN details.');
            return;
        }
        if (!currentPharmacyId) {
            setAbnConfirmedLocal(true);
            return;
        }
        setSaving(true);
        setError('');
        try {
            const res = await updatePharmacy(currentPharmacyId, {
                abn: abnDigits,
                submitted_for_verification: true,
                abn_entity_confirmed: true,
            } as any);
            setForm((prev) => ({ ...prev, abn: res?.abn || prev.abn }));
            applyAbnMeta(res);
        } catch (err: any) {
            const apiMessage = formatApiError(err?.response?.data);
            setError(apiMessage || err?.message || 'ABN confirmation failed');
        } finally {
            setSaving(false);
        }
    };

    const hasDraftContent = useMemo(() => {
        if (employmentTypes.length > 0 || rolesNeeded.length > 0) return true;
        if (files.approval || files.sops || files.induction || files.sump) return true;
        return Object.entries(form).some(([key, value]) => {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            if (typeof value !== 'string') return value != null;
            const trimmed = value.trim();
            if (!trimmed) return false;
            if (key === 'state') return trimmed !== 'NSW';
            return true;
        });
    }, [employmentTypes, files, form, rolesNeeded]);

    const persistPharmacy = async ({ afterSave }: { afterSave?: () => void } = {}) => {
        if (!validate()) return false;
        setSaving(true);
        setError('');

        try {
            const payload = buildPharmacyPayload();

            const hasFiles = Boolean(files.approval || files.sops || files.induction || files.sump);
            const targetPharmacyId = currentPharmacyId ?? (mode === 'edit' ? pharmacyId ?? null : null);

            if (hasFiles) {
                const formData = new FormData();
                // Text fields
                Object.entries(payload).forEach(([k, v]) => {
                    if (v === null || v === undefined) return;
                    if (Array.isArray(v)) {
                        v.forEach(item => formData.append(k, String(item)));
                        return;
                    }
                    formData.append(k, String(v));
                });

                // Files
                if (files.approval) formData.append('approval_certificate', { uri: files.approval.uri, name: files.approval.name, type: files.approval.mimeType ?? 'application/pdf' } as any);
                if (files.sops) formData.append('sops', { uri: files.sops.uri, name: files.sops.name, type: files.sops.mimeType ?? 'application/pdf' } as any);
                if (files.induction) formData.append('induction_guides', { uri: files.induction.uri, name: files.induction.name, type: files.induction.mimeType ?? 'application/pdf' } as any);
                if (files.sump) formData.append('qld_sump_docs', { uri: files.sump.uri, name: files.sump.name, type: files.sump.mimeType ?? 'application/pdf' } as any);

                if (targetPharmacyId) {
                    await updatePharmacy(targetPharmacyId, formData as any);
                } else {
                    const created = await createPharmacy(formData as any);
                    if (created?.id != null) {
                        setCurrentPharmacyId(String(created.id));
                    }
                }
            } else {
                if (targetPharmacyId) {
                    await updatePharmacy(targetPharmacyId, payload as any);
                } else {
                    const created = await createPharmacy(payload as any);
                    if (created?.id != null) {
                        setCurrentPharmacyId(String(created.id));
                    }
                }
            }

            unsaved.markClean({
                form,
                employmentTypes,
                rolesNeeded,
                files: { approval: null, sops: null, induction: null, sump: null },
            });
            initialStateRef.current = {
                employmentTypes,
                existingFiles,
                form,
                rolesNeeded,
            };
            if (afterSave) afterSave();
            else if (onSuccess) onSuccess();
            else router.back();
            return true;

        } catch (err: any) {
            const apiMessage = formatApiError(err?.response?.data);
            const detail = apiMessage || err?.message;
            setError(detail || 'Save failed');
            console.error(err);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        await persistPharmacy();
    };

    const handleApplyToWeekdays = () => {
        const { weekdays_start, weekdays_end } = form;
        if (weekdays_start && weekdays_end) {
            setForm(prev => ({
                ...prev,
                monday_start: weekdays_start,
                monday_end: weekdays_end,
                monday_closed: false,
                tuesday_start: weekdays_start,
                tuesday_end: weekdays_end,
                tuesday_closed: false,
                wednesday_start: weekdays_start,
                wednesday_end: weekdays_end,
                wednesday_closed: false,
                thursday_start: weekdays_start,
                thursday_end: weekdays_end,
                thursday_closed: false,
                friday_start: weekdays_start,
                friday_end: weekdays_end,
                friday_closed: false,
                saturdays_start: weekdays_start,
                saturdays_end: weekdays_end,
                saturdays_closed: false,
                sundays_start: weekdays_start,
                sundays_end: weekdays_end,
                sundays_closed: false,
                public_holidays_start: weekdays_start,
                public_holidays_end: weekdays_end,
                public_holidays_closed: false,
            }));
        }
    };

    const handleContinueLater = async () => {
        if (!hasDraftContent) {
            if (onContinueLater) await onContinueLater();
            else if (onCancel) onCancel();
            else router.back();
            return;
        }
        await persistPharmacy({
            afterSave: async () => {
                if (onContinueLater) await onContinueLater();
                else if (onCancel) onCancel();
                else router.back();
            },
        });
    };

    const handleNext = () => {
        setActiveTab((prev) => Math.min(prev + 1, lastTabIndex));
    };

    const title = useMemo(() => (mode === 'edit' ? 'Edit Pharmacy' : 'Add Pharmacy'), [mode]);

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            >
                {showSetupHero ? (
                    <LinearGradient
                        colors={['#143EEA', '#2429B8', '#8B1CF6', '#D20DAE']}
                        locations={[0, 0.45, 0.72, 1]}
                        start={{ x: 0, y: 0.1 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.hero}
                    >
                        <View style={styles.heroOrbLg} />
                        <View style={styles.heroOrbMd} />
                        <View style={styles.heroOrbSm} />
                        <View style={styles.heroStripe} />
                        <View style={styles.heroContent}>
                            <View style={styles.heroTextBlock}>
                                <View style={styles.heroBadge}>
                                    <Text style={styles.heroBadgeText}>Pharmacy setup</Text>
                                </View>
                                <Text style={styles.heroTitle}>Add your pharmacy</Text>
                                <Text style={styles.heroSubtitle}>
                                    Create the first pharmacy in your workspace. Add location, documents, staffing and hours now, then finish the rest later.
                                </Text>
                                {/* <View style={styles.heroChipRow}>
                                    <View style={styles.heroChipPrimary}>
                                        <Text style={styles.heroChipPrimaryText}>Basic details first</Text>
                                    </View>
                                    <View style={styles.heroChipSecondary}>
                                        <Text style={styles.heroChipSecondaryText}>7 sections to complete</Text>
                                    </View>
                                </View> */}
                            </View>
                            {/* <View style={styles.heroSummaryCard}>
                                <Text style={styles.heroSummaryLabel}>Setup flow</Text>
                                <Text style={styles.heroSummaryValue}>7</Text>
                                <Text style={styles.heroSummaryTitle}>sections to complete</Text>
                                <Text style={styles.heroSummaryText}>
                                    Basic, regulatory, docs, employment, hours, rate and about.
                                </Text>
                            </View> */}
                        </View>
                    </LinearGradient>
                ) : (
                    <View style={styles.header}>
                        <Text style={styles.title}>{title}</Text>
                    </View>
                )}

                {/* TABS */}
                <View style={styles.tabsOuter}>
                    <View style={styles.tabsContainer}>
                        {TABS.map((tab, idx) => {
                            const active = activeTab === idx;
                            return (
                                <TouchableOpacity
                                    key={tab.label}
                                    onPress={() => setActiveTab(idx)}
                                    activeOpacity={0.9}
                                    style={[
                                        styles.tabButton,
                                        active && styles.activeTabButton,
                                    ]}
                                >
                                    <MaterialCommunityIcons
                                        name={tab.icon as any}
                                        size={16}
                                        color={active ? '#143EEA' : '#6D28D9'}
                                    />
                                    <Text style={active ? styles.activeTabButtonText : styles.tabButtonText}>
                                        {tab.shortLabel}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
                <Divider />

                {loading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color={surfaceTokens.primary} />
                        <Text>Loading...</Text>
                    </View>
                ) : (
                    <ScrollView
                        contentContainerStyle={[styles.content, { paddingBottom: 50 }]}
                        keyboardShouldPersistTaps="always"
                        nestedScrollEnabled={true}
                        keyboardDismissMode="none"
                    >
                        {error ? <Text style={styles.error}>{error}</Text> : null}

                        <Surface style={styles.card} elevation={1}>
                            {/* TAB 0: GENERAL */}
                            {activeTab === 0 && (
                                <>
                                    {!form.google_place_id ? (
                                        <GooglePlacesInput
                                            label="Search Address *"
                                            value={form.street_address}
                                            onPlaceSelected={handlePlaceSelected}
                                            error={!form.street_address && error ? 'Required' : undefined}
                                        />
                                    ) : (
                                        <>
                                            <Button
                                                mode="outlined"
                                                icon="refresh"
                                                onPress={handleClearPlace}
                                                style={styles.mb}
                                                textColor={surfaceTokens.primary}
                                            >
                                                Clear & Search Again
                                            </Button>

                                            <TextInput
                                                label="Street Address *"
                                                value={form.street_address}
                                                onChangeText={(v) => setForm(p => ({ ...p, street_address: v }))}
                                                mode="outlined"
                                                style={styles.input}
                                            />

                                            <TextInput
                                                label="Suburb *"
                                                value={form.suburb}
                                                onChangeText={(v) => setForm(p => ({ ...p, suburb: v }))}
                                                mode="outlined"
                                                style={styles.input}
                                            />

                                            <Text style={styles.label}>State *</Text>
                                            <Menu
                                                visible={stateMenuVisible}
                                                onDismiss={() => setStateMenuVisible(false)}
                                                anchor={
                                                    <Button
                                                        mode="outlined"
                                                        onPress={() => setStateMenuVisible(true)}
                                                        style={[styles.input, { alignItems: 'flex-start' }]}
                                                        contentStyle={{ justifyContent: 'flex-start' }}
                                                    >
                                                        {form.state || 'Select State'}
                                                    </Button>
                                                }
                                            >
                                                {STATES.map(s => (
                                                    <Menu.Item
                                                        key={s}
                                                        onPress={() => { setForm(p => ({ ...p, state: s })); setStateMenuVisible(false); }}
                                                        title={s}
                                                    />
                                                ))}
                                            </Menu>

                                            <TextInput
                                                label="Postcode *"
                                                value={form.postcode}
                                                onChangeText={(v) => setForm(p => ({ ...p, postcode: v }))}
                                                mode="outlined"
                                                style={styles.input}
                                                keyboardType="numeric"
                                            />
                                        </>
                                    )}
                                    <TextInput
                                        label="Pharmacy Name *"
                                        value={form.name}
                                        onChangeText={(v) => setForm(p => ({ ...p, name: v }))}
                                        mode="outlined"
                                        style={styles.input}
                                    />
                                    <TextInput
                                        label="Email"
                                        value={form.email}
                                        onChangeText={(v) => setForm(p => ({ ...p, email: v }))}
                                        mode="outlined"
                                        style={styles.input}
                                        keyboardType="email-address"
                                    />



                                </>
                            )}

                            {/* TAB 1: APPROVAL */}
                            {activeTab === 1 && (
                                <>
                                    <TextInput
                                        label="ABN *"
                                        value={form.abn}
                                        onChangeText={(v) => setForm(p => ({ ...p, abn: v }))}
                                        mode="outlined"
                                        style={styles.input}
                                        keyboardType="numeric"
                                        disabled={abnIsLocked}
                                    />
                                    {abnIsLocked ? (
                                        <HelperText type="info" visible>
                                            This pharmacy ABN is locked after verification and confirmation.
                                        </HelperText>
                                    ) : (
                                        <HelperText type="error" visible={Boolean(error) && !form.abn}>
                                            ABN is required and must be 11 digits.
                                        </HelperText>
                                    )}
                                    <View style={styles.abnActionsRow}>
                                        <Button
                                            mode="outlined"
                                            onPress={() => void checkABN()}
                                            loading={checkingABN}
                                            disabled={abnIsLocked || abnInvalid || abnDigits.length !== 11 || checkingABN}
                                        >
                                            Check ABN
                                        </Button>
                                        <Chip mode="outlined" style={styles.abnChip}>
                                            {abnIsLocked
                                                ? 'ABN verified'
                                                : (!abnEntityName && abnVerificationNote)
                                                    ? 'ABN invalid/unavailable'
                                                    : (abnEntityName || abnVerificationNote)
                                                        ? 'ABN awaiting confirmation'
                                                        : 'ABN not checked'}
                                        </Chip>
                                    </View>
                                    {/* {!currentPharmacyId ? (
                                        <HelperText type="info" visible>
                                            Checking the ABN does not create a pharmacy record. The real pharmacy will be created when you finish and save the onboarding.
                                        </HelperText>
                                    ) : null} */}
                                    {(checkingABN || abnEntityName || abnEntityType || abnStatus || abnVerificationNote || abnLastChecked || abnGstRegistered !== null) ? (
                                        <Surface style={styles.abnCard} elevation={0}>
                                            <Text style={styles.abnCardTitle}>ABN details (from ABR)</Text>
                                            {checkingABN ? (
                                                <>
                                                    <ActivityIndicator size="small" color={surfaceTokens.primary} style={styles.abnSpinner} />
                                                    <View style={styles.abnSkeletonLineLg} />
                                                    <View style={styles.abnSkeletonLineMd} />
                                                    <View style={styles.abnSkeletonLineSm} />
                                                    <View style={styles.abnSkeletonNote} />
                                                </>
                                            ) : (
                                                <>
                                                    {abnEntityName ? <Text style={styles.abnCardLine}>Entity name: {abnEntityName}</Text> : null}
                                                    {abnEntityType ? <Text style={styles.abnCardLine}>Entity type: {abnEntityType}</Text> : null}
                                                    {abnStatus ? <Text style={styles.abnCardLine}>ABN status: {abnStatus}</Text> : null}
                                                    <Text style={styles.abnCardLine}>
                                                        GST registered (ABR): {abnGstRegistered == null ? '-' : abnGstRegistered ? 'Yes' : 'No'}
                                                        {abnGstRegistered ? ` • From: ${formatDate(abnGstFrom)}${abnGstTo ? ` • To: ${formatDate(abnGstTo)}` : ''}` : ''}
                                                    </Text>
                                                    {abnLastChecked ? <Text style={styles.abnCardLine}>Last checked: {formatDateTime(abnLastChecked)}</Text> : null}
                                                    {abnVerificationNote ? <Text style={styles.abnCardNote}>{abnVerificationNote}</Text> : null}
                                                </>
                                            )}
                                            <Button
                                                mode="contained"
                                                onPress={() => void confirmABN()}
                                                disabled={saving || !abnEntityName || abnIsLocked}
                                                style={styles.abnConfirmButton}
                                            >
                                                {abnIsLocked ? 'Confirmed' : saving ? 'Confirming...' : 'Confirm this ABN'}
                                            </Button>
                                        </Surface>
                                    ) : null}

                                    <Text style={styles.label}>Approval Certificate</Text>
                                    <Button mode="outlined" icon="upload" onPress={() => handlePickFile('approval')} style={{ marginBottom: 8 }}>
                                        {files.approval ? 'File Selected' : 'Upload Certificate'}
                                    </Button>
                                    {files.approval && <Text style={styles.fileText}>{files.approval.name}</Text>}
                                    {existingFiles.approval && !files.approval && (
                                        <Text style={styles.fileText}>Existing: Valid Certificate</Text>
                                    )}
                                </>
                            )}

                            {/* TAB 2: DOCUMENTS */}
                            {activeTab === 2 && (
                                <>
                                    <Text style={styles.label}>SOPs</Text>
                                    <Button mode="outlined" icon="upload" onPress={() => handlePickFile('sops')} style={styles.mb}>
                                        Upload SOPs
                                    </Button>
                                    {files.sops && <Text style={styles.fileText}>{files.sops.name}</Text>}

                                    <Text style={styles.label}>Induction Guides</Text>
                                    <Button mode="outlined" icon="upload" onPress={() => handlePickFile('induction')} style={styles.mb}>
                                        Upload Guides
                                    </Button>
                                    {files.induction && <Text style={styles.fileText}>{files.induction.name}</Text>}

                                    <Text style={styles.label}>S8 / SUMP Docs</Text>
                                    <Button mode="outlined" icon="upload" onPress={() => handlePickFile('sump')} style={styles.mb}>
                                        Upload S8/SUMP
                                    </Button>
                                    {files.sump && <Text style={styles.fileText}>{files.sump.name}</Text>}
                                </>
                            )}

                            {/* TAB 3: STAFFING */}
                            {activeTab === 3 && (
                                <>
                                    <View style={styles.selectionSection}>
                                        <Text style={styles.sectionHeader}>Employment Types</Text>
                                        <Text style={styles.sectionHelper}>Choose the employment arrangements this pharmacy supports.</Text>
                                        <View style={styles.selectionGrid}>
                                            {EMPLOYMENT_TYPES.map(type => {
                                                const checked = employmentTypes.includes(type);
                                                return (
                                                    <TouchableOpacity
                                                        key={type}
                                                        style={[styles.selectionCard, styles.selectionCardGrid, checked && styles.selectionCardActive]}
                                                        onPress={() => toggleList(employmentTypes, setEmploymentTypes, type)}
                                                        activeOpacity={0.85}
                                                    >
                                                        <Checkbox status={checked ? 'checked' : 'unchecked'} onPress={() => toggleList(employmentTypes, setEmploymentTypes, type)} />
                                                        <View style={styles.selectionTextBlock}>
                                                            <Text style={styles.selectionTitle}>{prettifyOptionLabel(type)}</Text>
                                                            <Text style={styles.selectionSubtitle}>Available for this pharmacy</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    <View style={styles.selectionSection}>
                                        <Text style={styles.sectionHeader}>Roles Needed</Text>
                                        <Text style={styles.sectionHelper}>Mark the staff profiles this pharmacy expects to hire or assign.</Text>
                                        <View style={styles.selectionGrid}>
                                            {ROLE_OPTIONS.map(role => {
                                                const checked = rolesNeeded.includes(role);
                                                return (
                                                    <TouchableOpacity
                                                        key={role}
                                                        style={[styles.selectionCard, styles.selectionCardGrid, checked && styles.selectionCardActive]}
                                                        onPress={() => toggleList(rolesNeeded, setRolesNeeded, role)}
                                                        activeOpacity={0.85}
                                                    >
                                                        <Checkbox status={checked ? 'checked' : 'unchecked'} onPress={() => toggleList(rolesNeeded, setRolesNeeded, role)} />
                                                        <View style={styles.selectionTextBlock}>
                                                            <Text style={styles.selectionTitle}>{prettifyOptionLabel(role)}</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </>
                            )}

                            {/* TAB 4: HOURS */}
                            {activeTab === 4 && (
                                <>
                                    <Text style={styles.helperText}>Format: HH:MM (e.g. 09:00, 17:30)</Text>
                                    <View style={styles.weekdayTemplate}>
                                        <HoursRow label="Weekdays" startKey="weekdays_start" endKey="weekdays_end" form={form} setActiveTimeField={setActiveTimeField} />
                                        <Button
                                            mode="text"
                                            onPress={handleApplyToWeekdays}
                                            disabled={!form.weekdays_start || !form.weekdays_end}
                                            style={{ alignSelf: 'flex-end', marginTop: -8 }}
                                            labelStyle={{ fontSize: 12 }}
                                        >
                                            Apply to all
                                        </Button>
                                    </View>
                                    <HoursRow label="Monday" startKey="monday_start" endKey="monday_end" closedKey="monday_closed" form={form} setForm={setForm} setActiveTimeField={setActiveTimeField} />
                                    <HoursRow label="Tuesday" startKey="tuesday_start" endKey="tuesday_end" closedKey="tuesday_closed" form={form} setForm={setForm} setActiveTimeField={setActiveTimeField} />
                                    <HoursRow label="Wednesday" startKey="wednesday_start" endKey="wednesday_end" closedKey="wednesday_closed" form={form} setForm={setForm} setActiveTimeField={setActiveTimeField} />
                                    <HoursRow label="Thursday" startKey="thursday_start" endKey="thursday_end" closedKey="thursday_closed" form={form} setForm={setForm} setActiveTimeField={setActiveTimeField} />
                                    <HoursRow label="Friday" startKey="friday_start" endKey="friday_end" closedKey="friday_closed" form={form} setForm={setForm} setActiveTimeField={setActiveTimeField} />
                                    <HoursRow label="Saturdays" startKey="saturdays_start" endKey="saturdays_end" closedKey="saturdays_closed" form={form} setForm={setForm} setActiveTimeField={setActiveTimeField} />
                                    <HoursRow label="Sundays" startKey="sundays_start" endKey="sundays_end" closedKey="sundays_closed" form={form} setForm={setForm} setActiveTimeField={setActiveTimeField} />
                                    <HoursRow label="Public Holidays" startKey="public_holidays_start" endKey="public_holidays_end" closedKey="public_holidays_closed" form={form} setForm={setForm} setActiveTimeField={setActiveTimeField} />
                                </>
                            )}

                            {/* TAB 5: RATE */}
                            {activeTab === 5 && (
                                <>
                                    <TouchableOpacity
                                        onPress={() => Linking.openURL(GOVERNMENT_AWARD_GUIDE_URL)}
                                        activeOpacity={0.88}
                                        style={styles.rateNotice}
                                    >
                                        <Text style={styles.rateNoticeEyebrow}>Award Guide</Text>
                                        <Text style={styles.rateNoticeTitle}>Staff are paid according to the current government award rate.</Text>
                                        <Text style={styles.rateNoticeText}>The rate details below apply to the locum Pharmacist rates for this pharmacy.</Text>
                                        <Text style={styles.rateNoticeLink}>View Fair Work award guide</Text>
                                        <Text style={styles.rateNoticeMeta}>Published 6 February 2026</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.label}>Default Rate Type</Text>
                                    <Menu
                                        visible={rateMenuVisible}
                                        onDismiss={() => setRateMenuVisible(false)}
                                        anchor={
                                            <Button mode="outlined" onPress={() => setRateMenuVisible(true)} style={styles.mb}>
                                                {RATE_TYPES.find(r => r.value === form.default_rate_type)?.label || 'Select Rate Type'}
                                            </Button>
                                        }
                                    >
                                        {RATE_TYPES.map(type => (
                                            <Menu.Item
                                                key={type.value}
                                                onPress={() => {
                                                    setForm(p => ({ ...p, default_rate_type: type.value as any }));
                                                    setRateMenuVisible(false);
                                                }}
                                                title={type.label}
                                            />
                                        ))}
                                    </Menu>

                                    {form.default_rate_type === 'FIXED' && (
                                        <TextInput
                                            label="Default Fixed Rate (AUD)"
                                            value={form.default_fixed_rate}
                                            onChangeText={v => setForm(p => ({ ...p, default_fixed_rate: v }))}
                                            mode="outlined"
                                            keyboardType="numeric"
                                            placeholder={RATE_MINIMUM_EXAMPLE}
                                            style={styles.input}
                                        />
                                    )}
                                    {form.default_rate_type && form.default_rate_type !== 'PHARMACIST_PROVIDED' && (
                                        <>
                                            <Text style={styles.label}>Base Rates (AUD)</Text>
                                            <TextInput
                                                label="Weekday Rate (AUD)"
                                                value={form.rate_weekday}
                                                onChangeText={v => setForm(p => ({ ...p, rate_weekday: v }))}
                                                mode="outlined"
                                                keyboardType="numeric"
                                                placeholder={RATE_MINIMUM_EXAMPLE}
                                                style={styles.input}
                                            />
                                            <TextInput
                                                label="Saturday Rate (AUD)"
                                                value={form.rate_saturday}
                                                onChangeText={v => setForm(p => ({ ...p, rate_saturday: v }))}
                                                mode="outlined"
                                                keyboardType="numeric"
                                                placeholder={RATE_MINIMUM_EXAMPLE}
                                                style={styles.input}
                                            />
                                            <TextInput
                                                label="Sunday Rate (AUD)"
                                                value={form.rate_sunday}
                                                onChangeText={v => setForm(p => ({ ...p, rate_sunday: v }))}
                                                mode="outlined"
                                                keyboardType="numeric"
                                                placeholder={RATE_MINIMUM_EXAMPLE}
                                                style={styles.input}
                                            />
                                            <TextInput
                                                label="Public Holiday Rate (AUD)"
                                                value={form.rate_public_holiday}
                                                onChangeText={v => setForm(p => ({ ...p, rate_public_holiday: v }))}
                                                mode="outlined"
                                                keyboardType="numeric"
                                                placeholder={RATE_MINIMUM_EXAMPLE}
                                                style={styles.input}
                                            />
                                            <TextInput
                                                label="Early Morning Rate (AUD)"
                                                value={form.rate_early_morning}
                                                onChangeText={v => setForm(p => ({ ...p, rate_early_morning: v }))}
                                                mode="outlined"
                                                keyboardType="numeric"
                                                placeholder={RATE_MINIMUM_EXAMPLE}
                                                style={styles.input}
                                            />
                                            <TextInput
                                                label="Late Night Rate (AUD)"
                                                value={form.rate_late_night}
                                                onChangeText={v => setForm(p => ({ ...p, rate_late_night: v }))}
                                                mode="outlined"
                                                keyboardType="numeric"
                                                placeholder={RATE_MINIMUM_EXAMPLE}
                                                style={styles.input}
                                            />
                                        </>
                                    )}
                                </>
                            )}

                            {/* TAB 6: ABOUT */}
                            {activeTab === 6 && (
                                <TextInput
                                    label="About Pharmacy"
                                    value={form.about}
                                    onChangeText={v => setForm(p => ({ ...p, about: v }))}
                                    mode="outlined"
                                    multiline
                                    numberOfLines={6}
                                    style={styles.input}
                                />
                            )}

                        </Surface>

                        {/* ACTIONS */}
                        <View style={styles.actions}>
                            {mode === 'edit' ? (
                                <>
                                    <Button
                                        mode="outlined"
                                        onPress={handleSave}
                                        loading={saving}
                                        disabled={saving}
                                        style={{ flex: 1 }}
                                    >
                                        Save Changes
                                    </Button>
                                    <View style={{ flexDirection: 'row', flex: 1, gap: 12 }}>
                                        <Button
                                            mode="outlined"
                                            onPress={() => activeTab > 0 && setActiveTab(p => p - 1)}
                                            disabled={saving || activeTab === 0}
                                            style={{ flex: 1 }}
                                        >
                                            Back
                                        </Button>
                                        <Button
                                            mode="contained"
                                            onPress={handleNext}
                                            disabled={saving || activeTab === lastTabIndex}
                                            style={{ flex: 1 }}
                                        >
                                            Next
                                        </Button>
                                    </View>
                                </>
                            ) : (
                                <>
                                    <Button
                                        mode="outlined"
                                        onPress={() => activeTab > 0 ? setActiveTab(p => p - 1) : (onCancel ? onCancel() : router.back())}
                                        disabled={saving}
                                        style={{ flex: 1 }}
                                    >
                                        {activeTab > 0 ? 'Back' : 'Cancel'}
                                    </Button>
                                    <Button
                                        mode="contained"
                                        onPress={activeTab === lastTabIndex ? handleSave : handleNext}
                                        loading={activeTab === lastTabIndex ? saving : false}
                                        disabled={saving}
                                        style={{ flex: 1 }}
                                    >
                                        {activeTab === lastTabIndex ? 'Create Pharmacy' : 'Next'}
                                    </Button>
                                </>
                            )}
                        </View>
                    </ScrollView>
                )}

                <Portal>
                    <TimePickerModal
                        visible={Boolean(activeTimeField)}
                        onDismiss={() => setActiveTimeField(null)}
                        onConfirm={({ hours, minutes }) => {
                            if (!activeTimeField) return;
                            setForm((prev) => ({
                                ...prev,
                                [activeTimeField.key]: formatTimeValue(hours, minutes),
                            }));
                            setActiveTimeField(null);
                        }}
                        hours={parseTimeValue(activeTimeField ? form[activeTimeField.key as keyof typeof form] as string : '').hours}
                        minutes={parseTimeValue(activeTimeField ? form[activeTimeField.key as keyof typeof form] as string : '').minutes}
                        label={activeTimeField ? `Select ${activeTimeField.label}` : 'Select time'}
                        use24HourClock
                    />
                </Portal>
            </KeyboardAvoidingView>
        </SafeAreaView >
    );
}

const HoursRow = ({ label, startKey, endKey, closedKey, form, setForm, setActiveTimeField }: any) => {
    const isClosed = Boolean(closedKey && form[closedKey]);
    const toggleClosed = () => {
        if (!closedKey || !setForm) return;
        setForm((prev: any) => ({
            ...prev,
            [closedKey]: !Boolean(prev[closedKey]),
            [startKey]: !Boolean(prev[closedKey]) ? '' : prev[startKey],
            [endKey]: !Boolean(prev[closedKey]) ? '' : prev[endKey],
        }));
    };

    return (
    <View style={{ marginBottom: 16 }}>
        <View style={styles.hoursRowHeader}>
            <Text style={{ fontWeight: '600', marginBottom: 4 }}>{label}</Text>
            {closedKey ? (
                <TouchableOpacity
                    style={[styles.closedToggle, isClosed ? styles.closedToggleActive : null]}
                    onPress={toggleClosed}
                    activeOpacity={0.8}
                >
                    <MaterialCommunityIcons
                        name="block-helper"
                        size={16}
                        color={isClosed ? '#B91C1C' : '#64748B'}
                    />
                    <Text style={[styles.closedToggleText, isClosed ? styles.closedToggleTextActive : null]}>
                        Closed
                    </Text>
                </TouchableOpacity>
            ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
                style={styles.timeField}
                activeOpacity={0.85}
                disabled={isClosed}
                onPress={() => setActiveTimeField({ key: startKey, label: `${label} start time` })}
            >
                <TextInput
                    label="Start"
                    value={isClosed ? '' : form[startKey]}
                    mode="outlined"
                    style={styles.timeInput}
                    placeholder="09:00"
                    disabled={isClosed}
                    editable={false}
                    pointerEvents="none"
                    right={<TextInput.Icon icon="clock-outline" />}
                />
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.timeField}
                activeOpacity={0.85}
                disabled={isClosed}
                onPress={() => setActiveTimeField({ key: endKey, label: `${label} end time` })}
            >
                <TextInput
                    label="End"
                    value={isClosed ? '' : form[endKey]}
                    mode="outlined"
                    style={styles.timeInput}
                    placeholder="17:00"
                    disabled={isClosed}
                    editable={false}
                    pointerEvents="none"
                    right={<TextInput.Icon icon="clock-outline" />}
                />
            </TouchableOpacity>
        </View>
    </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: surfaceTokens.bgDark },
    header: { padding: 16, backgroundColor: surfaceTokens.bg },
    title: { fontWeight: '700', fontSize: 24 },
    hero: {
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 8,
        minHeight: 240,
        borderRadius: 24,
        overflow: 'hidden',
        paddingHorizontal: 20,
        paddingVertical: 22,
        position: 'relative',
    },
    heroContent: {
        flex: 1,
        justifyContent: 'space-between',
        gap: 18,
    },
    heroTextBlock: {
        gap: 10,
        zIndex: 1,
    },
    heroBadge: {
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.24)',
    },
    heroBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    heroTitle: {
        color: '#FFFFFF',
        fontSize: 42,
        lineHeight: 44,
        fontWeight: '900',
    },
    heroSubtitle: {
        maxWidth: 640,
        color: 'rgba(255,255,255,0.96)',
        fontSize: 16,
        lineHeight: 24,
        fontWeight: '700',
    },
    heroChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    heroChipPrimary: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: '#FFFFFF',
    },
    heroChipPrimaryText: {
        color: '#063BDA',
        fontSize: 13,
        fontWeight: '900',
    },
    heroChipSecondary: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.24)',
    },
    heroChipSecondaryText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
    heroSummaryCard: {
        alignSelf: 'flex-start',
        width: '100%',
        maxWidth: 320,
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.24)',
    },
    heroSummaryLabel: {
        color: 'rgba(255,255,255,0.72)',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    heroSummaryValue: {
        marginTop: 6,
        color: '#FFFFFF',
        fontSize: 44,
        lineHeight: 48,
        fontWeight: '900',
    },
    heroSummaryTitle: {
        marginTop: 2,
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '900',
    },
    heroSummaryText: {
        marginTop: 10,
        color: 'rgba(255,255,255,0.86)',
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
    },
    heroOrbLg: {
        position: 'absolute',
        right: -36,
        bottom: -82,
        width: 320,
        height: 320,
        borderRadius: 160,
        backgroundColor: 'rgba(255,255,255,0.10)',
    },
    heroOrbMd: {
        position: 'absolute',
        right: 18,
        bottom: -40,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: 'rgba(143,232,255,0.12)',
    },
    heroOrbSm: {
        position: 'absolute',
        right: 72,
        bottom: 8,
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(255,255,255,0.16)',
    },
    heroStripe: {
        position: 'absolute',
        right: -12,
        top: -6,
        bottom: -6,
        width: 110,
        backgroundColor: 'rgba(210,13,174,0.44)',
        transform: [{ skewX: '-10deg' }],
    },
    content: {
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 40,
        gap: 14,
        width: '100%',
        maxWidth: 980,
        alignSelf: 'center',
    },
    timeField: {
        flex: 1,
    },
    timeInput: {
        backgroundColor: surfaceTokens.bg,
    },
    weekdayTemplate: {
        marginBottom: 18,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#d0d7de',
        backgroundColor: '#f8faff',
    },
    hoursRowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 4,
    },
    closedToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#d0d7de',
        backgroundColor: '#f8fafc',
    },
    closedToggleActive: {
        borderColor: 'rgba(220,38,38,0.5)',
        backgroundColor: 'rgba(220,38,38,0.1)',
    },
    closedToggleText: {
        fontWeight: '700',
        color: '#64748B',
    },
    closedToggleTextActive: {
        color: '#B91C1C',
        fontWeight: '900',
    },
    tabsOuter: {
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 6,
        paddingBottom: 14,
        backgroundColor: surfaceTokens.bg,
    },
    tabsContainer: {
        width: '100%',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 0,
    },
    tabButton: {
        flex: 1,
        minWidth: 0,
        backgroundColor: '#FFFFFF',
        borderColor: '#D9E2F2',
        borderWidth: 1,
        minHeight: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 2,
        paddingVertical: 6,
        shadowColor: '#06123A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    tabButtonText: {
        color: '#42526E',
        fontWeight: '800',
        fontSize: 10,
        textAlign: 'center',
    },
    activeTabButton: {
        backgroundColor: 'rgba(20,62,234,0.10)',
        borderColor: 'rgba(20,62,234,0.28)',
        borderWidth: 1,
        shadowColor: '#143EEA',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 3,
    },
    activeTabButtonText: {
        color: '#143EEA',
        fontWeight: '800',
        fontSize: 10,
        textAlign: 'center',
    },
    card: {
        padding: 16,
        borderRadius: 22,
        backgroundColor: surfaceTokens.bg,
        gap: 12,
        zIndex: 2000, // Critical for dropdown to float over other elements
        borderWidth: 1,
        borderColor: '#D9E2F2',
        shadowColor: '#06123A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
        elevation: 3,
    },
    input: { backgroundColor: surfaceTokens.bg, marginBottom: 8 },
    label: { fontSize: 14, color: surfaceTokens.textMuted, marginBottom: 4, marginTop: 8 },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    radioItem: { flexDirection: 'row', alignItems: 'center' },
    selectionSection: {
        gap: 10,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#D9E2F2',
        backgroundColor: '#F8FAFF',
    },
    selectionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    selectionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#D9E2F2',
        backgroundColor: '#FBFCFE',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 1,
    },
    selectionCardGrid: {
        flexBasis: '47%',
        flexGrow: 1,
        minWidth: 140,
    },
    selectionCardActive: {
        borderColor: surfaceTokens.primary,
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
    },
    selectionTextBlock: {
        flex: 1,
        gap: 2,
        justifyContent: 'center',
    },
    selectionTitle: {
        color: surfaceTokens.text,
        fontWeight: '700',
    },
    selectionSubtitle: {
        color: surfaceTokens.textMuted,
        fontSize: 12,
    },
    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    error: { color: surfaceTokens.error, marginBottom: 8 },
    mb: { marginBottom: 12 },
    fileText: { fontSize: 12, fontStyle: 'italic', marginBottom: 8, color: surfaceTokens.primary },
    abnActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 4,
        marginBottom: 4,
    },
    abnChip: {
        backgroundColor: '#FFFFFF',
    },
    abnCard: {
        marginTop: 6,
        marginBottom: 12,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#D9E2F2',
        backgroundColor: '#FFFFFF',
        gap: 6,
    },
    abnCardTitle: {
        color: surfaceTokens.text,
        fontWeight: '800',
        marginBottom: 2,
    },
    abnSpinner: {
        marginTop: 2,
        marginBottom: 4,
        alignSelf: 'flex-start',
    },
    abnSkeletonLineLg: {
        height: 14,
        width: '82%',
        borderRadius: 999,
        backgroundColor: '#E6ECF8',
    },
    abnSkeletonLineMd: {
        height: 14,
        width: '68%',
        borderRadius: 999,
        backgroundColor: '#E6ECF8',
    },
    abnSkeletonLineSm: {
        height: 14,
        width: '74%',
        borderRadius: 999,
        backgroundColor: '#E6ECF8',
    },
    abnSkeletonNote: {
        marginTop: 4,
        height: 38,
        width: '100%',
        borderRadius: 12,
        backgroundColor: '#EEF3FC',
    },
    abnCardLine: {
        color: surfaceTokens.textMuted,
        lineHeight: 20,
    },
    abnCardNote: {
        marginTop: 4,
        color: surfaceTokens.primary,
        lineHeight: 20,
        fontWeight: '600',
    },
    abnConfirmButton: {
        marginTop: 8,
        alignSelf: 'flex-start',
    },
    sectionHeader: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 2, color: surfaceTokens.text },
    sectionHelper: { fontSize: 12, color: surfaceTokens.textMuted, marginBottom: 4 },
    helperText: { fontSize: 12, color: surfaceTokens.textMuted, marginBottom: 8 },
    rateNotice: {
        marginBottom: 10,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(20,62,234,0.12)',
        backgroundColor: '#F7F9FF',
        shadowColor: '#143EEA',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 2,
        gap: 4,
    },
    rateNoticeEyebrow: {
        color: '#6D28D9',
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    rateNoticeTitle: {
        color: surfaceTokens.text,
        fontSize: 15,
        fontWeight: '800',
        lineHeight: 22,
    },
    rateNoticeText: {
        color: surfaceTokens.textMuted,
        fontSize: 13,
        lineHeight: 20,
    },
    rateNoticeLink: {
        marginTop: 4,
        color: '#143EEA',
        fontSize: 13,
        fontWeight: '800',
    },
    rateNoticeMeta: {
        color: '#64748B',
        fontSize: 12,
    },
});
