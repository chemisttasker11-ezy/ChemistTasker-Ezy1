export type PharmacyFormMode = 'create' | 'edit';

export type PharmacyFormProps = {
    mode: PharmacyFormMode;
    pharmacyId?: string;
    onSuccess?: () => void;
    onCancel?: () => void;
    onContinueLater?: () => void | Promise<void>;
    showSetupHero?: boolean;
};

export const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
export const EMPLOYMENT_TYPES = ['PART_TIME', 'FULL_TIME', 'LOCUMS'];
export const ROLE_OPTIONS = ['PHARMACIST', 'INTERN', 'ASSISTANT', 'TECHNICIAN', 'STUDENT', 'ADMIN', 'DRIVER'];

export const prettifyOptionLabel = (value: string) =>
    value
        .split('_')
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');

export const RATE_TYPES = [
    { value: 'FIXED', label: 'Fixed (Hourly)' },
    { value: 'FLEXIBLE', label: 'Flexible' },
    { value: 'PHARMACIST_PROVIDED', label: 'Pharmacist Provided' },
];

export const RATE_MINIMUM_EXAMPLE = '55';
export const GOVERNMENT_AWARD_GUIDE_URL =
    'https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf';

export const TABS = [
    { label: 'Basic', shortLabel: 'Basic', icon: 'domain' },
    { label: 'Regulatory', shortLabel: 'Reg', icon: 'check-decagram' },
    { label: 'Docs', shortLabel: 'Docs', icon: 'file-document' },
    { label: 'Employment', shortLabel: 'Staff', icon: 'account-group' },
    { label: 'Hours', shortLabel: 'Hours', icon: 'clock-outline' },
    { label: 'Rate', shortLabel: 'Rate', icon: 'cash' },
    { label: 'About', shortLabel: 'About', icon: 'message' },
];

export const parseTimeValue = (value?: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
    if (!match) {
        return { hours: 9, minutes: 0 };
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return { hours: 9, minutes: 0 };
    }
    return {
        hours: Math.min(23, Math.max(0, hours)),
        minutes: Math.min(59, Math.max(0, minutes)),
    };
};

export const formatTimeValue = (hours: number, minutes: number) =>
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

export const normalizeCoord = (value: number | null) => {
    if (value == null || Number.isNaN(value)) return null;
    const rounded = Number(value.toFixed(6));
    return Object.is(rounded, -0) ? 0 : rounded;
};

export const formatApiError = (data: any) => {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (typeof data.detail === 'string') return data.detail;
    return Object.entries(data)
        .flatMap(([key, value]) => {
            if (Array.isArray(value)) {
                return value.map((item) => `${key}: ${String(item)}`);
            }
            if (value != null && typeof value !== 'object') {
                return [`${key}: ${String(value)}`];
            }
            return [];
        })
        .join('\n');
};

export const formatDate = (value?: string | null) => {
    if (!value) return 'Not checked';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

export const formatDateTime = (value?: string | null) => {
    if (!value) return 'Not checked';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};
