import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Container,
  Paper,
  Stepper,
  Step,
  StepLabel,
  StepConnector,
  TextField,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Button,
  Snackbar,
  IconButton,
  Typography,
  Stack,
  Alert,
  Tooltip,
  createTheme,
  ThemeProvider,
  useMediaQuery,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  // Switch,
  // Divider,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import type { StepIconProps } from '@mui/material/StepIcon';
import {
  InfoOutlined as InfoIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Work as WorkIcon,
  Visibility as VisibilityIcon,
  VerifiedUser as SkillsIcon,
  AttachMoney as RateIcon,
  Schedule as ScheduleIcon,
  ExpandMore as ExpandMoreIcon,
  Block as BlockIcon,
} from '@mui/icons-material';
import Grid from '@mui/material/Grid';
import { stepConnectorClasses } from '@mui/material/StepConnector';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import dayjs from 'dayjs';
import { ORG_ROLES } from '../../../constants/roles';
import {
  PharmacySummary,
  Shift,
  EscalationLevelKey,
  fetchPharmaciesService,
  fetchActiveShiftDetailService,
  calculateShiftRates,
  createOwnerShiftService,
  updateOwnerShiftService,
} from '@chemisttasker/shared-core';
import skillsCatalog from '../../../../../shared-core/skills_catalog.json';
import { useColorMode } from '../../../theme/sleekTheme';
import apiClient from '../../../utils/apiClient';

// --- Interface Definitions ---
type PharmacyOption = PharmacySummary & { hasChain?: boolean; claimed?: boolean };
type ShiftDescriptionTemplate = {
  id: number;
  pharmacy: number;
  role_needed: string;
  description: string;
};
type SlotTime = { startTime: string; endTime: string };
type PharmacyHoursForDate = SlotTime & {
  closed: boolean;
  label: string;
  isPublicHoliday: boolean;
};
interface SlotEntry {
  date: string; startTime: string; endTime: string; isRecurring: boolean;
  recurringDays: number[]; recurringEndDate: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: {
    slotIndex: number;
    occurrenceIndex: number;
  };
}

const toRateInputString = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

const getSlotRateValue = (slot: any): unknown =>
  slot?.rate ?? slot?.rate_per_hour ?? slot?.ratePerHour ?? slot?.hourly_rate ?? slot?.hourlyRate;

const firstPresent = (...values: unknown[]): unknown =>
  values.find((value) => value !== null && value !== undefined && value !== '');

type CalendarViewOption = 'month' | 'week' | 'day';
const CALENDAR_VIEWS: CalendarViewOption[] = ['month', 'week', 'day'];
const GOVERNMENT_AWARD_GUIDE_URL = 'https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf';

interface CalendarSlotSelection {
  start: Date;
  end: Date;
  slots: Date[];
  action?: 'select' | 'click' | 'doubleClick';
  bounds?: DOMRect | ClientRect;
  box?: DOMRect | ClientRect;
}

const localizer = momentLocalizer(moment);

const WEEK_DAYS = [
  { v: 1, l: 'M', full: 'Monday' },
  { v: 2, l: 'T', full: 'Tuesday' },
  { v: 3, l: 'W', full: 'Wednesday' },
  { v: 4, l: 'T', full: 'Thursday' },
  { v: 5, l: 'F', full: 'Friday' },
  { v: 6, l: 'S', full: 'Saturday' },
  { v: 0, l: 'S', full: 'Sunday' },
];

const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_SUPER_PERCENT = 11.5;

const toIsoDate = (value: string): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = dayjs(trimmed);
  if (parsed.isValid()) {
    return parsed.startOf('day').toDate();
  }

  const datePortion = trimmed.split('T')[0];
  if (datePortion) {
    const [year, month, day] = datePortion.split('-').map((part) => Number.parseInt(part, 10));
    if ([year, month, day].every((part) => Number.isFinite(part))) {
      return new Date(year, month - 1, day);
    }
  }

  return null;
};

const isValidDate = (date: Date | null | undefined): date is Date => {
  return Boolean(date && !Number.isNaN(date.getTime()));
};

const applyTimeToDate = (date: Date, time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  const next = new Date(date.getTime());
  next.setHours(hour, minute, 0, 0);
  return next;
};

const formatSlotDate = (value: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '');
const formatSlotTime = (value: string) => dayjs(`1970-01-01T${value}`).format('h:mm A');
const getSlotDurationHours = (startTime?: string, endTime?: string) => {
  if (!startTime || !endTime) return 0;
  const start = dayjs(`1970-01-01T${startTime.slice(0, 5)}`);
  let end = dayjs(`1970-01-01T${endTime.slice(0, 5)}`);
  if (!start.isValid() || !end.isValid()) return 0;
  if (end.isBefore(start) || end.isSame(start)) end = end.add(1, 'day');
  return Math.max(0, end.diff(start, 'minute') / 60);
};
const formatSlotDisplayDate = (value: string) => {
  if (!value) return '';
  const parsed = dayjs(value);
  if (!parsed.isValid()) return value;
  const day = parsed.date();
  const suffix =
    day >= 11 && day <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';
  return `${parsed.format('ddd')}, ${day}${suffix} of ${parsed.format('MMMM YYYY')}`;
};
const RATE_TYPE_DESCRIPTIONS: Record<string, string> = {
  FLEXIBLE: 'The rate is flexible and negotiable with the candidate.',
  FIXED: 'The rate is fixed in advanceand  and not negotiable',
  PHARMACIST_PROVIDED: 'Use the candidate’s preset rate. You’ll always see it before assigning the shift.',
};
const toInputDateTimeLocal = (value?: string | null) =>
  value ? dayjs(value).local().format('YYYY-MM-DDTHH:mm') : '';

const normalizePrefillRole = (value?: string | null) => {
  if (!value) return '';
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  if (['PHARMACIST', 'TECHNICIAN', 'ASSISTANT', 'INTERN', 'STUDENT', 'EXPLORER'].includes(normalized)) {
    return normalized;
  }
  if (normalized.includes('OTHER_STAFF')) return 'ASSISTANT';
  if (normalized.includes('COMMUNITY_PHARMACIST')) return 'PHARMACIST';
  if (normalized.includes('DISPENSARY_TECHNICIAN')) return 'TECHNICIAN';
  if (normalized.includes('PHARMACY_TECHNICIAN')) return 'TECHNICIAN';
  if (normalized.includes('PHARMACY_ASSISTANT')) return 'ASSISTANT';
  if (normalized.includes('PHARMACIST')) return 'PHARMACIST';
  if (normalized.includes('TECHNICIAN')) return 'TECHNICIAN';
  if (normalized.includes('ASSISTANT')) return 'ASSISTANT';
  if (normalized.includes('INTERN')) return 'INTERN';
  if (normalized.includes('STUDENT')) return 'STUDENT';
  return '';
};

const describeRecurringDays = (days: number[]) => {
  if (!days?.length) return '';
  const ordered = [...days].sort((a, b) => ((a === 0 ? 7 : a) - (b === 0 ? 7 : b)));
  return ordered.map((day) => DAY_LABELS_SHORT[day]).join(' / ');
};

const readPharmacyValue = (pharmacy: any, snake: string, camel?: string) =>
  pharmacy?.[snake] ?? (camel ? pharmacy?.[camel] : undefined);

const normalizeHour = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value ? value.slice(0, 5) : '';
};

const toCamelHoursKey = (prefix: string, suffix: 'start' | 'end' | 'closed') =>
  `${prefix}_${suffix}`.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const pharmacyPublicHolidayDates = (pharmacy: any): string[] => {
  const raw =
    pharmacy?.public_holiday_dates ??
    pharmacy?.publicHolidayDates ??
    pharmacy?.public_holidays_dates ??
    pharmacy?.publicHolidaysDates ??
    pharmacy?.public_holidays ??
    pharmacy?.publicHolidays;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => (typeof value === 'string' ? value.slice(0, 10) : ''))
    .filter(Boolean);
};

const isPublicHolidayDate = (date: string, pharmacy: any) =>
  pharmacyPublicHolidayDates(pharmacy).includes(date);

const pharmacyHoursForDate = (
  pharmacy: PharmacyOption | undefined,
  date: string,
  fallback: SlotTime
): PharmacyHoursForDate => {
  if (!pharmacy || !date) {
    return { ...fallback, closed: false, label: 'selected day', isPublicHoliday: false };
  }

  const parsed = dayjs(date);
  const isPublicHoliday = isPublicHolidayDate(date, pharmacy);
  const weekday = parsed.isValid() ? parsed.day() : -1;
  const prefix = isPublicHoliday
    ? 'public_holidays'
    : weekday === 0
      ? 'sundays'
      : weekday === 6
        ? 'saturdays'
        : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'][weekday - 1] || '';
  const label = isPublicHoliday
    ? 'public holiday'
    : weekday === 0
      ? 'Sunday'
      : weekday === 6
        ? 'Saturday'
        : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][weekday - 1] || 'selected day';

  if (!prefix) {
    return { ...fallback, closed: false, label, isPublicHoliday };
  }

  const start = normalizeHour(readPharmacyValue(pharmacy, `${prefix}_start`, toCamelHoursKey(prefix, 'start')));
  const end = normalizeHour(readPharmacyValue(pharmacy, `${prefix}_end`, toCamelHoursKey(prefix, 'end')));
  const closed = Boolean(readPharmacyValue(pharmacy, `${prefix}_closed`, toCamelHoursKey(prefix, 'closed')));

  return {
    startTime: start || fallback.startTime,
    endTime: end || fallback.endTime,
    closed,
    label,
    isPublicHoliday,
  };
};

const ORG_ROLE_VALUES = ORG_ROLES as readonly string[];

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

  const prefillPharmacyId = params.get('pharmacy') ?? params.get('pharmacy_id');
  const prefillRoleNeeded = params.get('role') ?? params.get('role_needed');
  const prefillDate = params.get('date') ?? params.get('slot_date');
  const prefillDatesParam = params.get('dates') ?? params.get('slot_dates');
  const prefillStartTime = params.get('start_time') ?? params.get('start');
  const prefillEndTime = params.get('end_time') ?? params.get('end');
  const prefillVisibility = params.get('visibility');
  const prefillEmploymentType = params.get('employment_type');
  const prefillDedicatedUser = params.get('dedicated_user') ?? params.get('dedicated_user_id');
  const hasPrefill = Boolean(
    prefillPharmacyId ||
    prefillRoleNeeded ||
    prefillDate ||
    prefillDatesParam ||
    prefillStartTime ||
    prefillEndTime ||
    prefillVisibility ||
    prefillEmploymentType ||
    prefillDedicatedUser
  );

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

  const StepConnectorStyled = styled(StepConnector)(({ theme }) => ({
    [`&.${stepConnectorClasses.alternativeLabel}`]: {
      top: 24,
    },
    [`& .${stepConnectorClasses.line}`]: {
      borderColor: theme.palette.grey[300],
      borderTopWidth: 2,
      borderRadius: 1,
    },
    [`&.${stepConnectorClasses.active} .${stepConnectorClasses.line}`]: {
      borderColor: theme.palette.primary.main,
    },
    [`&.${stepConnectorClasses.completed} .${stepConnectorClasses.line}`]: {
      borderColor: theme.palette.primary.main,
    },
  }));

  const StepIconRoot = styled('div')<{ ownerState: { active?: boolean; completed?: boolean } }>(
    ({ theme, ownerState }) => ({
      zIndex: 1,
      width: 44,
      height: 44,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: theme.transitions.create(['background-color', 'box-shadow', 'transform'], {
        duration: theme.transitions.duration.shorter,
      }),
      color: ownerState.active || ownerState.completed
        ? theme.palette.common.white
        : theme.palette.text.secondary,
      background: ownerState.completed || ownerState.active
        ? 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)'
        : theme.palette.grey[200],
      boxShadow: ownerState.active
        ? '0 12px 24px rgba(109, 40, 217, 0.25)'
        : '0 0 0 rgba(0,0,0,0)',
      transform: ownerState.active ? 'scale(1.05)' : 'scale(1)',
    })
  );

  const StepIconComponent = (props: StepIconProps) => {
    const { active, completed, icon } = props;
    const stepIndex = Number(icon) - 1;
    const Icon = steps[stepIndex]?.icon ?? WorkIcon;
    return (
      <StepIconRoot ownerState={{ active, completed }}>
        <Icon fontSize="small" />
      </StepIconRoot>
    );
  };

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
      return Number.isFinite(num) ? num : null;
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
    const workloadOptions = ['Sole Pharmacist', 'High Script Load', 'Webster Packs'];
    const ESCALATION_LABELS: Record<string, string> = { FULL_PART_TIME: 'Pharmacy Members', LOCUM_CASUAL: 'Favourite Staff', OWNER_CHAIN: 'Owner Chain', ORG_CHAIN: 'Organization', PLATFORM: 'Platform (Public)' };
    const fieldSx = {
      '& .MuiOutlinedInput-root': {
        borderRadius: 2,
        bgcolor: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : 'background.paper',
      },
    };
    const embeddedPanelSx = isEmbedded
      ? {
          p: 1.5,
          borderRadius: 2,
          borderColor: 'rgba(15, 23, 42, 0.08)',
          bgcolor: 'transparent',
          boxShadow: 'none',
        }
      : {
          p: 2,
          borderRadius: 3,
          borderColor: 'grey.200',
        };
    const VISIBILITY_META: Record<string, { eyebrow: string; description: string; accent: string }> = {
      FULL_PART_TIME: {
        eyebrow: 'Internal first',
        description: 'Start with your own pharmacy team before widening the audience.',
        accent: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(5, 150, 105, 0.06))',
      },
      LOCUM_CASUAL: {
        eyebrow: 'Trusted bench',
        description: 'Open the shift to your known locums and favourite casual staff.',
        accent: 'linear-gradient(135deg, rgba(59, 130, 246, 0.16), rgba(37, 99, 235, 0.06))',
      },
      OWNER_CHAIN: {
        eyebrow: 'Chain network',
        description: 'Share across the owner chain when local coverage is still unavailable.',
        accent: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.06))',
      },
      ORG_CHAIN: {
        eyebrow: 'Organization reach',
        description: 'Escalate to the wider organization to improve fill speed.',
        accent: 'linear-gradient(135deg, rgba(236, 72, 153, 0.16), rgba(190, 24, 93, 0.06))',
      },
      PLATFORM: {
        eyebrow: 'Public audience',
        description: 'Publish broadly on the platform for maximum visibility and reach.',
        accent: 'linear-gradient(135deg, rgba(109, 40, 217, 0.18), rgba(79, 70, 229, 0.06))',
      },
    };
    const formatEscalationDateTime = (value?: string) =>
      value ? dayjs(value).format('ddd, MMM D - h:mm A') : 'Choose a date and time';

    switch (stepKey) {
      case 'details': return (
        <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
          <Grid size={12}>
            <FormControl fullWidth size="small" sx={fieldSx}>
              <InputLabel>Pharmacy *</InputLabel>
              <Select
                value={pharmacyId}
                label="Pharmacy *"
                onChange={e => setPharmacyId(Number(e.target.value))}
                disabled={scopedPharmacyId != null}
              >
                {pharmacies.map(p => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControl fullWidth size="small" sx={fieldSx}>
              <InputLabel>Role Needed *</InputLabel>
              <Select
                value={roleNeeded}
                label="Role Needed *"
                onChange={e => setRoleNeeded(e.target.value)}
              >
                <MenuItem value="PHARMACIST">Pharmacist</MenuItem>
                <MenuItem value="TECHNICIAN">Dispensary Technician</MenuItem>
                <MenuItem value="ASSISTANT">Assistant</MenuItem>
                <MenuItem value="INTERN">Intern Pharmacist</MenuItem>
                <MenuItem value="STUDENT">Pharmacy Student</MenuItem>
                <MenuItem value="EXPLORER">Explorer</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControl fullWidth size="small" sx={fieldSx}>
              <InputLabel>Employment Type *</InputLabel>
              <Select
                value={employmentType}
                label="Employment Type *"
                onChange={e => setEmploymentType(e.target.value)}
              >
                <MenuItem value="LOCUM">
                  {roleNeeded === 'PHARMACIST' ? 'Locum' : 'Casual'}
                </MenuItem>
                <MenuItem value="FULL_TIME">Full-Time</MenuItem>
                <MenuItem value="PART_TIME">Part-Time</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={12}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', sm: 'center' }}
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle2" color="text.secondary">
                {descriptionTemplateLoading
                  ? 'Loading role description template...'
                  : descriptionTemplate?.description
                    ? 'Role description template available'
                    : 'No role description template saved yet'}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!descriptionTemplate?.description}
                  onClick={handleUseDescriptionTemplate}
                >
                  Use Template
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={descriptionTemplateSaving || !pharmacyId || !roleNeeded || !description.trim()}
                  onClick={handleSaveDescriptionTemplate}
                >
                  {descriptionTemplateSaving ? 'Saving...' : 'Save as Template'}
                </Button>
              </Stack>
            </Stack>
            <TextField
              label="Shift Description"
              multiline
              minRows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
              fullWidth
              placeholder="Provide key responsibilities or context..."
              size="small"
              sx={fieldSx}
            />
          </Grid>
          <Grid size={12}>
            <Paper variant="outlined" sx={embeddedPanelSx}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Shift Flags
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={isEmbedded ? 1.5 : 2}>
                <FormControlLabel
                  control={<Checkbox checked={hasTravel} onChange={(_, checked) => setHasTravel(checked)} />}
                  label="Travel allowance"
                />
                <FormControlLabel
                  control={<Checkbox checked={hasAccommodation} onChange={(_, checked) => setHasAccommodation(checked)} />}
                  label="Accommodation provided"
                />
                <FormControlLabel
                  control={<Checkbox checked={isUrgent} onChange={(_, checked) => setIsUrgent(checked)} />}
                  label="Mark as urgent"
                />
              </Stack>
            </Paper>
          </Grid>
          <Grid size={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Workload Tags
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1.5}>
              {workloadOptions.map(tag => {
                const selected = workloadTags.includes(tag);
                return (
                  <Chip
                    key={tag}
                    label={tag}
                    onClick={() =>
                      setWorkloadTags(current =>
                        selected ? current.filter(x => x !== tag) : [...current, tag]
                      )
                    }
                    variant={selected ? 'filled' : 'outlined'}
                    color={selected ? 'primary' : 'default'}
                    clickable
                    sx={{
                      borderRadius: '999px',
                      fontWeight: 600,
                      px: 1.5,
                      py: 0.5,
                    }}
                  />
                );
              })}
            </Stack>
          </Grid>
        </Grid>
      );
      case 'skills': {
        const roleKey = roleNeeded === 'PHARMACIST' ? 'pharmacist' : 'otherstaff';
        const roleCatalog = (skillsCatalog as any)[roleKey] || {};
        
        const categories = [
          { key: 'clinical_services', title: 'Clinical Services', items: roleCatalog.clinical_services || [] },
          { key: 'dispense_software', title: 'Dispense Software', items: roleCatalog.dispense_software || [] },
          { key: 'expanded_scope', title: 'Expanded Scope', items: roleCatalog.expanded_scope || [] },
        ].filter(cat => cat.items.length > 0);

        return (
          <Stack spacing={3}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Select which skills are <strong>Required</strong> (must have to apply) or <strong>Favorable</strong> (nice to have, but not mandatory).
            </Alert>
            
            <Box sx={{ width: '100%' }}>
              {categories.map((category, index) => {
                const selectedCount = category.items.filter((s: any) => mustHave.includes(s.code) || niceToHave.includes(s.code)).length;

                return (
                  <Accordion 
                    key={category.key} 
                    disableGutters 
                    elevation={0}
                    defaultExpanded={index === 0}
                    sx={{
                      border: '1px solid',
                      borderColor: 'grey.200',
                      '&:not(:last-child)': { borderBottom: 0 },
                      '&:before': { display: 'none' },
                      '&:first-of-type': { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
                      '&:last-of-type': { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      sx={{
                        bgcolor: isDarkMode ? 'rgba(15, 23, 42, 0.84)' : 'grey.50',
                        borderBottom: '1px solid',
                        borderColor: 'grey.200',
                        '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5, my: 1.5 }
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight={600}>
                        {category.title}
                      </Typography>
                      {selectedCount > 0 && (
                        <Chip 
                          size="small" 
                          label={`${selectedCount} selected`} 
                          color="primary" 
                          variant="outlined"
                          sx={{ height: 22, fontWeight: 600, bgcolor: isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'white' }} 
                        />
                      )}
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 0 }}>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
                        }}
                      >
                        {category.items.map((s: any, idx: number) => {
                          const value = mustHave.includes(s.code) 
                            ? 'required' 
                            : niceToHave.includes(s.code) 
                              ? 'favorable' 
                              : null;
                              
                          return (
                            <Box
                              key={s.code}
                              sx={{
                                display: 'flex',
                                flexDirection: { xs: 'column', xl: 'row' },
                                alignItems: { xs: 'flex-start', xl: 'center' },
                                justifyContent: 'space-between',
                                p: 2.5,
                                gap: 2,
                                minHeight: 124,
                                minWidth: 0,
                                borderBottom: idx < category.items.length - 1 ? '1px solid' : 'none',
                                borderRight: {
                                  lg: idx % 2 === 0 && idx < category.items.length - 1 ? '1px solid' : 'none',
                                },
                                borderColor: 'grey.100',
                                bgcolor: value === 'required' ? 'rgba(109, 40, 217, 0.06)' : value === 'favorable' ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                                transition: 'all 0.2s ease-in-out',
                                '&:hover': {
                                  bgcolor: value ? undefined : isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'grey.50'
                                }
                              }}
                            >
                              <Box sx={{ flex: '1 1 auto', minWidth: 0, pr: { xl: 1 } }}>
                                <Typography
                                  variant="body1"
                                  fontWeight={value ? 600 : 500}
                                  color={value ? 'text.primary' : 'text.secondary'}
                                  sx={{ overflowWrap: 'anywhere' }}
                                >
                                  {s.label}
                                </Typography>
                                {s.description && (
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                                    {s.description}
                                  </Typography>
                                )}
                              </Box>
                              
                              <ToggleButtonGroup
                                size="small"
                                value={value}
                                exclusive
                                onChange={(_, newVal) => {
                                  setMustHave(prev => prev.filter(x => x !== s.code));
                                  setNiceToHave(prev => prev.filter(x => x !== s.code));
                                  if (newVal === 'required') {
                                    setMustHave(prev => [...prev, s.code]);
                                  } else if (newVal === 'favorable') {
                                    setNiceToHave(prev => [...prev, s.code]);
                                  }
                                }}
                                sx={{
                                  flex: '0 0 auto',
                                  width: { xs: '100%', sm: 'auto' },
                                  bgcolor: 'background.paper',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                  '& .MuiToggleButtonGroup-grouped': {
                                    border: '1px solid',
                                    borderColor: 'grey.300',
                                  },
                                  '& .MuiToggleButton-root': {
                                    flex: { xs: 1, sm: '0 0 auto' },
                                    minWidth: 108,
                                    px: 2,
                                    py: 0.75,
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    color: 'text.secondary',
                                  },
                                  '& .Mui-selected': {
                                    bgcolor: value === 'required' ? 'primary.main' : 'secondary.dark',
                                    color: 'white !important',
                                    borderColor: value === 'required' ? 'primary.main' : 'secondary.dark',
                                    zIndex: 1,
                                    '&:hover': {
                                      bgcolor: value === 'required' ? 'primary.dark' : '#03694b',
                                    }
                                  }
                                }}
                              >
                                <ToggleButton value="required">Required</ToggleButton>
                                <ToggleButton value="favorable">Favorable</ToggleButton>
                              </ToggleButtonGroup>
                            </Box>
                          );
                        })}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Box>
          </Stack>
        );
      }
      case 'visibility':
        const startIdx = allowedVis.indexOf(visibility);
        const upcomingTiers = !isEmbedded && startIdx > -1 ? allowedVis.slice(startIdx + 1) : [];
        return (
          <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
            <Grid size={12}>
              <Paper
                variant="outlined"
                sx={{
                  p: { xs: 2, md: 2.5 },
                  borderRadius: 4,
                  borderColor: 'rgba(109, 40, 217, 0.12)',
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(39, 28, 73, 0.82))'
                    : 'linear-gradient(135deg, rgba(248, 250, 252, 1), rgba(245, 243, 255, 0.95))',
                }}
              >
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Box>
                      <Typography variant="overline" sx={{ letterSpacing: 1, color: 'primary.main', fontWeight: 700 }}>
                        Audience Plan
                      </Typography>
                      <Typography variant="h6" fontWeight={700}>
                        {isEmbedded ? 'Private direct booking' : 'Control who sees this shift first'}
                      </Typography>
                    </Box>
                    {!isEmbedded && visibility && (
                      <Chip
                        label={`Starting with ${ESCALATION_LABELS[visibility]}`}
                        sx={{
                          fontWeight: 700,
                          bgcolor: 'rgba(109, 40, 217, 0.08)',
                          color: 'primary.dark',
                        }}
                      />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {isEmbedded
                      ? 'This booking stays private and is only visible to the selected team member.'
                      : 'Choose the first audience, then optionally schedule when the shift should expand to broader groups.'}
                  </Typography>
                </Stack>
              </Paper>
            </Grid>
            {canPostAnonymously && (
              <Grid size={12}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    borderColor: postAnonymously ? 'rgba(109, 40, 217, 0.28)' : 'grey.200',
                    bgcolor: postAnonymously ? isDarkMode ? 'rgba(109, 40, 217, 0.18)' : 'rgba(245, 243, 255, 0.72)' : 'background.paper',
                  }}
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={postAnonymously}
                        onChange={(_, checked) => setPostAnonymously(checked)}
                      />
                    }
                    label={
                      <Box>
                        <Typography
                          variant="body1"
                          sx={{ display: 'block', fontWeight: 600 }}
                        >
                          Post as anonymous
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Only the pharmacy suburb will be shown.
                       </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start', m: 0 }}
                  />
                </Paper>
              </Grid>
            )}
            {!isEmbedded && (
              <Grid size={12}>
                <Stack spacing={2}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Initial Audience</InputLabel>
                    <Select
                      value={visibility}
                      label="Initial Audience"
                      onChange={e => setVisibility(e.target.value)}
                    >
                      {allowedVis.map(opt => (
                        <MenuItem key={opt} value={opt}>
                          {ESCALATION_LABELS[opt]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Grid container spacing={2}>
                    {allowedVis.map((opt, index) => {
                      const meta = VISIBILITY_META[opt] ?? VISIBILITY_META.PLATFORM;
                      const isSelected = visibility === opt;
                      const isCurrentOrPast = startIdx > -1 && index <= startIdx;
                      return (
                        <Grid key={opt} size={{ xs: 12, md: 6, xl: 4 }}>
                          <Paper
                            variant="outlined"
                            onClick={() => setVisibility(opt)}
                            sx={{
                              p: 2,
                              borderRadius: 3,
                              cursor: 'pointer',
                              height: '100%',
                              borderColor: isSelected ? 'primary.main' : 'grey.200',
                              bgcolor: isSelected ? isDarkMode ? 'rgba(109, 40, 217, 0.2)' : 'rgba(245, 243, 255, 0.96)' : 'background.paper',
                              backgroundImage: meta.accent,
                              boxShadow: isSelected ? '0 12px 30px rgba(109, 40, 217, 0.14)' : 'none',
                              transition: 'all 180ms ease',
                              '&:hover': {
                                borderColor: isSelected ? 'primary.main' : 'rgba(109, 40, 217, 0.28)',
                                transform: 'translateY(-2px)',
                              },
                            }}
                          >
                            <Stack spacing={1.5} height="100%">
                              <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                                <Box>
                                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.6 }}>
                                    {meta.eyebrow}
                                  </Typography>
                                  <Typography variant="subtitle1" fontWeight={700}>
                                    {ESCALATION_LABELS[opt]}
                                  </Typography>
                                </Box>
                                <Chip
                                  size="small"
                                  label={isSelected ? 'Selected' : isCurrentOrPast ? 'In flow' : `Stage ${index + 1}`}
                                  color={isSelected ? 'primary' : 'default'}
                                  variant={isSelected ? 'filled' : 'outlined'}
                                />
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                {meta.description}
                              </Typography>
                            </Stack>
                          </Paper>
                        </Grid>
                      );
                    })}
                  </Grid>
                </Stack>
              </Grid>
            )}
            {(showNotifyPharmacyStaff || showNotifyFavoriteStaff || showNotifyChainMembers) && (
              <Grid size={12}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    borderRadius: 3,
                    borderColor: 'grey.200',
                    background: isDarkMode
                      ? 'linear-gradient(180deg, rgba(16, 27, 47, 1), rgba(15, 23, 42, 0.94))'
                      : 'linear-gradient(180deg, rgba(255,255,255,1), rgba(249,250,251,1))',
                  }}
                >
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Notification Boost
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Choose which groups should get an immediate nudge when this shift goes live.
                      </Typography>
                    </Box>
                    <Stack spacing={1.25}>
                    {showNotifyPharmacyStaff && (
                        <Paper variant="outlined" sx={{ borderRadius: 2.5, borderColor: notifyPharmacyStaff ? 'rgba(109, 40, 217, 0.28)' : 'grey.200', bgcolor: notifyPharmacyStaff ? isDarkMode ? 'rgba(109, 40, 217, 0.18)' : 'rgba(245, 243, 255, 0.72)' : 'background.paper' }}>
                          <FormControlLabel
                            control={(
                              <Checkbox
                                checked={notifyPharmacyStaff}
                                onChange={(_, checked) => setNotifyPharmacyStaff(checked)}
                              />
                            )}
                            label="Email and notify pharmacy staff members"
                            sx={{ m: 0, px: 1.5, py: 0.75, width: '100%' }}
                          />
                        </Paper>
                    )}
                    {showNotifyFavoriteStaff && (
                        <Paper variant="outlined" sx={{ borderRadius: 2.5, borderColor: notifyFavoriteStaff ? 'rgba(109, 40, 217, 0.28)' : 'grey.200', bgcolor: notifyFavoriteStaff ? isDarkMode ? 'rgba(109, 40, 217, 0.18)' : 'rgba(245, 243, 255, 0.72)' : 'background.paper' }}>
                          <FormControlLabel
                            control={(
                              <Checkbox
                                checked={notifyFavoriteStaff}
                                onChange={(_, checked) => setNotifyFavoriteStaff(checked)}
                              />
                            )}
                            label="Email and notify pharmacy favourite staff"
                            sx={{ m: 0, px: 1.5, py: 0.75, width: '100%' }}
                          />
                        </Paper>
                    )}
                    {showNotifyChainMembers && (
                        <Paper variant="outlined" sx={{ borderRadius: 2.5, borderColor: notifyChainMembers ? 'rgba(109, 40, 217, 0.28)' : 'grey.200', bgcolor: notifyChainMembers ? isDarkMode ? 'rgba(109, 40, 217, 0.18)' : 'rgba(245, 243, 255, 0.72)' : 'background.paper' }}>
                          <FormControlLabel
                            control={(
                              <Checkbox
                                checked={notifyChainMembers}
                                onChange={(_, checked) => setNotifyChainMembers(checked)}
                              />
                            )}
                            label="Email and notify your chain members"
                            sx={{ m: 0, px: 1.5, py: 0.75, width: '100%' }}
                          />
                        </Paper>
                    )}
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            )}
            {!isEmbedded && upcomingTiers.length > 0 && (
              <Grid size={12}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 2, md: 2.5 },
                    borderRadius: 3,
                    borderColor: 'grey.200',
                  }}
                >
                  <Stack spacing={2.5}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Escalation Schedule
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        If the shift is still unfilled, these timestamps will automatically widen the audience in order.
                      </Typography>
                    </Box>
                    <Grid container spacing={2}>
                      {upcomingTiers.map((tier, index) => (
                        <Grid key={tier} size={{ xs: 12, lg: 6 }}>
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 2,
                              borderRadius: 3,
                              borderColor: escalationDates[tier] ? 'rgba(109, 40, 217, 0.24)' : 'grey.200',
                              bgcolor: escalationDates[tier] ? isDarkMode ? 'rgba(109, 40, 217, 0.16)' : 'rgba(245, 243, 255, 0.6)' : 'background.paper',
                            }}
                          >
                            <Stack spacing={1.5}>
                              <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                                <Typography variant="subtitle2" fontWeight={700}>
                                  {`${index + 2}. ${ESCALATION_LABELS[tier]}`}
                                </Typography>
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={escalationDates[tier] ? 'Scheduled' : 'Optional'}
                                />
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                {formatEscalationDateTime(escalationDates[tier])}
                              </Typography>
                              <TextField
                                label={`Escalate to ${ESCALATION_LABELS[tier]}`}
                                type="datetime-local"
                                value={escalationDates[tier] || ''}
                                onChange={e => setEscalationDates(d => ({ ...d, [tier]: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                size="small"
                                sx={fieldSx}
                              />
                            </Stack>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </Stack>
                </Paper>
              </Grid>
            )}
          </Grid>
        );
      case 'timetable': {
        return (
          <Grid
            container
            rowSpacing={isEmbedded ? 1.5 : 2}
            columnSpacing={{ xs: 0, lg: isEmbedded ? 2 : 0 }}
            sx={isEmbedded ? { alignItems: 'stretch' } : undefined}
          >
            <Grid size={{ xs: 12 }}>
              <Paper
                variant="outlined"
                sx={{
                  p: isEmbedded ? { xs: 0.5, sm: 1 } : { xs: 1.5, sm: 2 },
                  borderRadius: isEmbedded ? 0 : 3,
                  borderColor: isEmbedded ? 'transparent' : 'grey.200',
                  bgcolor: isEmbedded ? 'transparent' : isDarkMode ? 'rgba(15, 23, 42, 0.84)' : 'grey.50',
                  mx: 0,
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: { xs: 0.5, sm: 2 },
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  width: '100%',
                  boxShadow: 'none',
                }}
              >
                <FormControlLabel
                  control={<Checkbox size="small" checked={flexibleTiming} onChange={e => setFlexibleTiming(e.target.checked)} />}
                  label="Flexible timing (start/end may adjust)"
                />
                <FormControlLabel
                  control={<Checkbox size="small" checked={singleUserOnly} onChange={e => setSingleUserOnly(e.target.checked)} />}
                  label="A single person must work all timetable entries"
                />
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: isEmbedded ? 4.5 : 5 }} sx={{ order: { xs: 1, lg: 0 }, minWidth: 0 }}>
              <Stack spacing={isEmbedded ? 1.5 : 2.5}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: isEmbedded ? 1.75 : 2.5,
                    borderRadius: isEmbedded ? 2 : 3,
                    borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.10)' : 'grey.200',
                    boxShadow: isEmbedded ? 'none' : undefined,
                  }}
                >
                  <Stack spacing={2}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Add schedule entry
                    </Typography>
                    <Grid container rowSpacing={2} columnSpacing={2}>
                      <Grid size={{ xs: 12 }}>
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                          <DatePicker
                            label="Date"
                            format="DD/MM/YYYY"
                            value={slotDate ? dayjs(slotDate) : null}
                            minDate={dayjs(minDateInputValue)}
                            onChange={(value) => {
                              const nextDate = value && value.isValid() ? value.format('YYYY-MM-DD') : '';
                              setSlotDate(nextDate);
                              if (nextDate) {
                                const hours = getDefaultTimesForDate(nextDate);
                                setSlotStartTime(hours.startTime);
                                setSlotEndTime(hours.endTime);
                              }
                            }}
                            // slotProps={{
                            //   textField: {
                            //     fullWidth: true,
                            //     size: 'small',
                            //     helperText: slotDate ? `Display: ${formatSlotDate(slotDate)}` : 'Use DD/MM/YYYY display',
                            //     sx: fieldSx,
                            //   },
                            // }}
                          />
                        </LocalizationProvider>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="Start"
                          type="time"
                          value={slotStartTime}
                          onChange={e => setSlotStartTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="End"
                          type="time"
                          value={slotEndTime}
                          onChange={e => setSlotEndTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      {slotDateHours?.closed && (
                        <Grid size={12}>
                          <Alert severity="warning" icon={<BlockIcon />}>
                            This pharmacy is marked closed on this {slotDateHours.label}. You can still edit the times and add the shift.
                          </Alert>
                        </Grid>
                      )}
                      <Grid size={12}>
                        <Button
                          variant="contained"
                          onClick={handleAddManualSlot}
                          startIcon={<AddIcon />}
                          fullWidth
                          sx={{ height: 44, borderRadius: 2 }}
                        >
                          Add slot
                        </Button>
                      </Grid>
                    </Grid>
                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={isRecurring}
                          onChange={e => {
                            const checked = e.target.checked;
                            setIsRecurring(checked);
                            if (!checked) {
                              setRecurringDays([]);
                              setRecurringEndDate('');
                            }
                          }}
                        />
                      )}
                      label="This is a recurring weekly schedule"
                    />
                    {isRecurring && (
                      <Stack spacing={2}>
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                          <DatePicker
                            label="Repeat until"
                            format="DD/MM/YYYY"
                            value={recurringEndDate ? dayjs(recurringEndDate) : null}
                            minDate={slotDate ? dayjs(slotDate) : dayjs(minDateInputValue)}
                            onChange={(value) => setRecurringEndDate(value && value.isValid() ? value.format('YYYY-MM-DD') : '')}
                            slotProps={{
                              textField: {
                                fullWidth: true,
                                size: 'small',
                                helperText: recurringEndDate ? `Display: ${formatSlotDate(recurringEndDate)}` : 'Use DD/MM/YYYY display',
                                sx: fieldSx,
                              },
                            }}
                          />
                        </LocalizationProvider>
                        <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1}>
                          {WEEK_DAYS.map((d) => (
                            <Button
                              key={d.v}
                              variant={recurringDays.includes(d.v) ? 'contained' : 'outlined'}
                              onClick={() =>
                                setRecurringDays(days => {
                                  if (days.includes(d.v)) {
                                    return days.filter(x => x !== d.v);
                                  }
                                  const next = [...days, d.v];
                                  return next.sort((a, b) => ((a === 0 ? 7 : a) - (b === 0 ? 7 : b)));
                                })
                              }
                              sx={{ minWidth: 44, borderRadius: '10px' }}
                              aria-label={d.full}
                            >
                              {d.l}
                            </Button>
                          ))}
                        </Stack>
                      </Stack>
                    )}
                    {closedSelectedDates.length > 0 && (
                      <Alert severity="warning" icon={<BlockIcon />}>
                        {closedSelectedDates.length} selected date{closedSelectedDates.length > 1 ? 's are' : ' is'} marked closed for this pharmacy. They stay selected and the times remain editable.
                      </Alert>
                    )}
                  </Stack>
                </Paper>

                {selectedDates.length > 0 && (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: isEmbedded ? 1.5 : 2,
                      borderRadius: isEmbedded ? 2 : 3,
                      borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.10)' : 'grey.200',
                      boxShadow: isEmbedded ? 'none' : undefined,
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight={600}>
                          Selected calendar days
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleAddAllSelectedDates}
                            sx={{ borderRadius: 999 }}
                          >
                            Add all slots
                          </Button>
                          <Button size="small" onClick={() => { setSelectedDates([]); setSelectedDateTimes({}); }}>
                            Clear
                          </Button>
                        </Stack>
                      </Stack>
                      <Stack spacing={1}>
                        {selectedDates.map((date) => {
                          const times = selectedDateTimes[date] || { startTime: slotStartTime, endTime: slotEndTime };
                          const hours = getDefaultTimesForDate(date, times);
                          return (
                            <Box
                              key={date}
                              sx={{
                                display: 'flex',
                                flexWrap: 'nowrap',
                                gap: 1,
                                alignItems: 'center',
                                border: '1px solid',
                                borderColor: 'grey.200',
                                borderRadius: 1,
                                p: 1,
                                overflowX: 'auto',
                              }}
                            >
                              <Chip
                                label={formatSlotDate(date)}
                                onDelete={() => {
                                  setSelectedDates((prev) => prev.filter((d) => d !== date));
                                  setSelectedDateTimes((prev) => {
                                    const next = { ...prev };
                                    delete next[date];
                                    return next;
                                  });
                                }}
                              />
                              {hours.closed && (
                                <Chip
                                  icon={<BlockIcon />}
                                  color="error"
                                  variant="outlined"
                                  label={`Closed ${hours.label}`}
                                  sx={{ flexShrink: 0 }}
                                />
                              )}
                              <TextField
                                label="Start"
                                type="time"
                                value={times.startTime}
                                onChange={(e) =>
                                  setSelectedDateTimes((prev) => ({
                                    ...prev,
                                    [date]: { startTime: e.target.value, endTime: times.endTime },
                                  }))
                                }
                                size="small"
                                sx={{ width: 140 }}
                                InputLabelProps={{ shrink: true }}
                              />
                              <TextField
                                label="End"
                                type="time"
                                value={times.endTime}
                                onChange={(e) =>
                                  setSelectedDateTimes((prev) => ({
                                    ...prev,
                                    [date]: { startTime: times.startTime, endTime: e.target.value },
                                  }))
                                }
                                size="small"
                                sx={{ width: 140 }}
                                InputLabelProps={{ shrink: true }}
                              />
                              <IconButton
                                onClick={() => handleAddSelectedDate(date)}
                                sx={{
                                  bgcolor: 'primary.main',
                                  color: 'common.white',
                                  '&:hover': { bgcolor: 'primary.dark' },
                                }}
                              >
                                <AddIcon />
                              </IconButton>
                            </Box>
                          );
                        })}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Adjust times per day, then use the purple plus to add one day or "Add all slots" to add everything at once.
                      </Typography>
                    </Stack>
                  </Paper>
                )}

                <Paper
                  variant="outlined"
                  sx={{
                    p: isEmbedded ? 1.5 : 2.5,
                    borderRadius: isEmbedded ? 2 : 3,
                    borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.10)' : 'grey.200',
                    boxShadow: isEmbedded ? 'none' : undefined,
                  }}
                >
                  {slots.length === 0 ? (
                    <Alert severity="info">No schedule entries added yet.</Alert>
                  ) : (
                    <Stack spacing={1.5}>
                      {slots.map((slot, index) => {
                        const recurringLabel = describeRecurringDays(slot.recurringDays);
                        return (
                          <Box
                            key={`${slot.date}-${slot.startTime}-${index}`}
                            sx={{
                              border: '1px solid',
                              borderColor: 'grey.200',
                              borderRadius: 2,
                              px: 2,
                              py: 1.5,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 2,
                            }}
                          >
                            <Box>
                              <Typography variant="subtitle2" fontWeight={600}>
                                {formatSlotDisplayDate(slot.date)}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {`${formatSlotTime(slot.startTime)} – ${formatSlotTime(slot.endTime)}`}
                              </Typography>
                              {slot.isRecurring && (
                                <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
                                  <Chip size="small" color="primary" label="Recurring" />
                                  {recurringLabel && (
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={recurringLabel}
                                    />
                                  )}
                                  {slot.recurringEndDate && (
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={`Ends ${formatSlotDisplayDate(slot.recurringEndDate)}`}
                                    />
                                  )}
                                </Stack>
                              )}
                            </Box>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Tooltip title="Edit slot">
                                <IconButton edge="end" onClick={() => handleEditSlot(index)} color="primary">
                                  <EditIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete slot">
                                <IconButton edge="end" onClick={() => setSlots(sc => sc.filter((_, idx) => idx !== index))} color="error">
                                  <DeleteIcon />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                </Paper>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, lg: isEmbedded ? 7.5 : 7 }} sx={{ order: { xs: 0, lg: 1 }, minWidth: 0 }}>
              <Paper
                variant="outlined"
                sx={{
                  p: isEmbedded ? { xs: 1, md: 1.5 } : 2,
                  borderRadius: isEmbedded ? 2 : 3,
                  borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.10)' : 'grey.200',
                  height: isEmbedded ? { xs: 420, sm: 480, md: 560 } : { xs: 420, sm: 460, md: 540 },
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: isEmbedded ? 'none' : undefined,
                  '& .rbc-calendar': {
                    fontFamily: "'Inter', sans-serif",
                  },
                  '& .rbc-toolbar': {
                    gap: 0.75,
                    mb: isEmbedded ? 1 : undefined,
                  },
                  '& .rbc-toolbar button': {
                    px: isEmbedded ? 1 : undefined,
                    py: isEmbedded ? 0.5 : undefined,
                  },
                  '& .rbc-toolbar-label': {
                    fontWeight: 600,
                    fontSize: isEmbedded ? '0.95rem' : undefined,
                  },
                  '& .rbc-event': {
                    fontSize: '0.75rem',
                  },
                }}
              >
                <Stack spacing={1.5} sx={{ height: '100%' }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Timetable preview
                  </Typography>
                  <Calendar
                    selectable
                    longPressThrottle={50}
                    localizer={localizer}
                    events={calendarEvents}
                    dayPropGetter={dayPropGetter}
                    date={safeCalendarDate}
                    view={calendarView}
                    views={CALENDAR_VIEWS}
                    step={calendarView === 'week' || calendarView === 'day' ? 15 : 30}
                    timeslots={calendarView === 'week' || calendarView === 'day' ? 4 : 2}
                    style={{ flex: 1 }}
                    eventPropGetter={eventStyleGetter}
                    startAccessor="start"
                    endAccessor="end"
                    popup
                    onNavigate={(newDate: Date) => {
                      if (!isValidDate(newDate)) {
                        console.warn('Ignoring calendar navigation to invalid date', newDate);
                        return;
                      }
                      const next = dayjs(newDate);
                      if (next.isBefore(todayStart, 'day')) {
                        setCalendarDate(minCalendarDate);
                      } else if (next.isAfter(dayjs(maxCalendarDate), 'day')) {
                        setCalendarDate(maxCalendarDate);
                      } else {
                        setCalendarDate(next.toDate());
                      }
                    }}
                    onView={(newView: string) => {
                      const nextView = CALENDAR_VIEWS.includes(newView as CalendarViewOption)
                        ? (newView as CalendarViewOption)
                        : 'month';
                      setCalendarView(nextView);
                    }}
                    min={calendarTimeBounds.min}
                    max={calendarTimeBounds.max}
                    onSelectSlot={({ start, end, slots }: CalendarSlotSelection) => {
                      const startMoment = dayjs(start as Date);
                      const endMoment = dayjs(end as Date);

                      if (startMoment.isBefore(todayStart, 'minute')) {
                        showSnackbar('Cannot select time in the past.', 'error');
                        return;
                      }

                      if (calendarView === 'week' || calendarView === 'day') {
                        const dateStr = startMoment.format('YYYY-MM-DD');
                        if (selectedDateSet.has(dateStr)) {
                          setSelectedDates((prev) => prev.filter((date) => date !== dateStr));
                          setSelectedDateTimes((prev) => {
                            const next = { ...prev };
                            delete next[dateStr];
                            return next;
                          });
                          return;
                        }
                        setSlotStartTime(startMoment.format('HH:mm'));
                        let endCandidate = endMoment;
                        if (!endMoment.isAfter(startMoment)) {
                          endCandidate = startMoment.add(1, 'hour');
                        }
                        const endVal = endCandidate.format('HH:mm');
                        setSlotEndTime(endVal);
                        mergeSelectedDates([dateStr], {
                          startTime: startMoment.format('HH:mm'),
                          endTime: endVal,
                        });
                        setIsRecurring(false);
                        setRecurringDays([]);
                        setRecurringEndDate('');
                        return;
                      }

                      const slotValues: Array<Date | string> = slots && slots.length ? (slots as Array<Date | string>) : [start as Date];
                      const slotDates = slotValues.map((slotValue) =>
                        dayjs(slotValue).format('YYYY-MM-DD')
                      );
                      const uniqueDates = Array.from(new Set<string>(slotDates)).filter(
                        (date) => !dayjs(date).isBefore(todayStart, 'day')
                      );

                      if (!uniqueDates.length) {
                        showSnackbar('Cannot select past dates.', 'error');
                        return;
                      }

                      setSelectedDates((prev) => {
                        const next = new Set(prev);
                        uniqueDates.forEach((date) => {
                          if (next.has(date)) {
                            next.delete(date);
                          } else {
                            next.add(date);
                          }
                        });
                        return [...next].sort();
                      });
                      setSelectedDateTimes((prev) => {
                        const next = { ...prev };
                        uniqueDates.forEach((date) => {
                          if (selectedDateSet.has(date)) {
                            delete next[date];
                          } else if (!next[date]) {
                            const hours = getDefaultTimesForDate(date);
                            next[date] = { startTime: hours.startTime, endTime: hours.endTime };
                          }
                        });
                        return next;
                      });
                      const latestSelected = uniqueDates.find((date) => !selectedDateSet.has(date));
                      if (latestSelected) {
                        const hours = getDefaultTimesForDate(latestSelected);
                        setSlotDate(latestSelected);
                        setSlotStartTime(hours.startTime);
                        setSlotEndTime(hours.endTime);
                      }
                      setIsRecurring(false);
                      setRecurringDays([]);
                      setRecurringEndDate('');
                    }}
                    onSelectEvent={(event: CalendarEvent) => {
                      const resource = event.resource;
                      if (resource?.slotIndex !== undefined) {
                        const slot = slots[resource.slotIndex];
                        if (slot) {
                          setSlotDate(slot.date);
                          setSlotStartTime(slot.startTime);
                          setSlotEndTime(slot.endTime);
                          setIsRecurring(slot.isRecurring);
                          setRecurringDays(slot.recurringDays || []);
                          setRecurringEndDate(slot.recurringEndDate || '');
                          setSelectedDates([slot.date]);
                          setSelectedDateTimes({ [slot.date]: { startTime: slot.startTime, endTime: slot.endTime } });
                        }
                      }
                    }}
                    messages={{ next: 'Next', previous: 'Back', today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
                  />
                  {calendarEvents.length === 0 && (
                    <Typography variant="body2" color="text.secondary" align="center">
                      Tap a date to set the timetable above. You can add multiple entries and combine recurring schedules.
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        );
      }
      case 'pay': {
        const showSlotPreview = isLocumLike && !(roleNeeded === 'PHARMACIST' && rateType === 'PHARMACIST_PROVIDED');
        const hasOutsidePharmacyMemberAudience =
          !isEmbedded && (visibility !== 'FULL_PART_TIME' || Object.values(escalationDates).some(Boolean));
        const baseRatesOptionalLabel = hasOutsidePharmacyMemberAudience ? '' : ' (optional)';
        const paymentField = isLocumLike ? (
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small" sx={fieldSx}>
              <InputLabel>Payment Type</InputLabel>
              <Select
                value={paymentPreference}
                label="Payment Type"
                onChange={e => setPaymentPreference(e.target.value)}
              >
                <MenuItem value="ABN">ABN</MenuItem>
                <MenuItem value="TFN">TFN</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        ) : null;
        const superCheckbox = isLocumLike ? (
          <FormControlLabel
            control={(
              <Checkbox
                checked={locumSuperIncluded}
                onChange={(_, checked) => setLocumSuperIncluded(checked)}
              />
            )}
            label="+ superannuation "
          />
        ) : null;

        if (!isLocumLike) {
          return (
            <Stack spacing={3}>
              <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Pay Basis</InputLabel>
                    <Select
                      value={ftptPayMode}
                      label="Pay Basis"
                      onChange={e => setFtptPayMode(e.target.value as 'HOURLY' | 'ANNUAL')}
                    >
                      <MenuItem value="HOURLY">Hourly</MenuItem>
                      <MenuItem value="ANNUAL">Annual Package</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {ftptPayMode === 'HOURLY' ? (
                <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Min Hourly Rate ($/hr)"
                      type="number"
                      value={minHourly}
                      onChange={e => setMinHourly(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Max Hourly Rate ($/hr)"
                      type="number"
                      value={maxHourly}
                      onChange={e => setMaxHourly(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                </Grid>
              ) : (
                <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Min Annual Package ($)"
                      type="number"
                      value={minAnnual}
                      onChange={e => setMinAnnual(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Max Annual Package ($)"
                      type="number"
                      value={maxAnnual}
                      onChange={e => setMaxAnnual(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Super (%)"
                      type="number"
                      value={superPercent}
                      onChange={e => setSuperPercent(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                </Grid>
              )}
            </Stack>
          );
        }

        const renderSlotPreviewList = () => {
          if (!showSlotPreview || expandedSlots.length === 0) return null;
          return (
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, borderColor: 'grey.200' }}>
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Slot rate preview
                </Typography>
                <Stack spacing={1}>
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
                      <Box
                        key={`${slot.date}-${slot.startTime}-${idx}`}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 132px auto' },
                          gap: 1.5,
                          alignItems: 'center',
                          p: 1.5,
                          border: '1px solid',
                          borderColor: 'grey.200',
                          borderRadius: 2.5,
                          bgcolor: 'background.paper',
                          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                            {dayjs(slot.date).format('dddd, D MMMM')}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {`${formatSlotTime(slot.startTime)} - ${formatSlotTime(slot.endTime)}`}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ minWidth: 180, display: 'none' }}>
                          {`${slot.date} · ${slot.startTime}—${slot.endTime}`}
                        </Typography>
                        <TextField
                          label="Rate"
                          type="number"
                          value={row.rate}
                          onChange={(e) => handleSlotRateChange(idx, e.target.value)}
                          size="small"
                          sx={{ width: { xs: '100%', sm: 132 }, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          InputProps={{
                            startAdornment: <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>$</Typography>,
                            endAdornment: <Typography sx={{ ml: 0.5, color: 'text.secondary' }}>/hr</Typography>,
                          }}
                          error={row.status === 'error'}
                          helperText={row.status === 'error' ? (row.error || 'Error') : ''}
                        />
                        <Chip
                          label={row.status === 'loading' ? 'Calculating...' : totalLabel}
                          color={row.status === 'loading' ? 'default' : 'success'}
                          size="small"
                          sx={{ justifySelf: { xs: 'start', sm: 'end' }, fontWeight: 800 }}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </Stack>
            </Paper>
          );
        };

        if (roleNeeded === 'PHARMACIST') {
          return (
            <Stack spacing={3}>
              <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Rate Type</InputLabel>
                    <Select
                      value={rateType}
                      label="Rate Type"
                      onChange={e => setRateType(e.target.value)}
                    >
                      <MenuItem value="FLEXIBLE">Flexible Rate</MenuItem>
                      <MenuItem value="FIXED">Fixed Rate</MenuItem>
                      <MenuItem value="PHARMACIST_PROVIDED">Pharmacist Provided</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {RATE_TYPE_DESCRIPTIONS[rateType] || ''}
                  </Typography>
                </Grid>
                {paymentField}
                {superCheckbox && (
                  <Grid size={{ xs: 12 }}>
                    {superCheckbox}
                  </Grid>
                )}
              </Grid>

              {rateType !== 'PHARMACIST_PROVIDED' && (
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, borderColor: 'grey.200' }}>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Base rates ($/hr){baseRatesOptionalLabel}
                    </Typography>
                    {!hasOutsidePharmacyMemberAudience && (
                      <Typography variant="body2" color="text.secondary">
                        These pay rates will be displayed whenever the shift is visible outside Pharmacy Members.
                      </Typography>
                    )}
                    <Grid container rowSpacing={2} columnSpacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Weekday"
                          type="number"
                          value={rateWeekday}
                          onChange={e => setRateWeekday(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Saturday"
                          type="number"
                          value={rateSaturday}
                          onChange={e => setRateSaturday(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Sunday"
                          type="number"
                          value={rateSunday}
                          onChange={e => setRateSunday(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Public Holiday"
                          type="number"
                          value={ratePublicHoliday}
                          onChange={e => setRatePublicHoliday(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Early Morning"
                          type="number"
                          value={rateEarlyMorning}
                          onChange={e => setRateEarlyMorning(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Late Night"
                          type="number"
                          value={rateLateNight}
                          onChange={e => setRateLateNight(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                    </Grid>
                    <Box>
                      <Button
                        variant="outlined"
                        onClick={handleSavePharmacyRateDefaults}
                        disabled={savingPharmacyRates || !pharmacyId}
                      >
                        {savingPharmacyRates ? 'Updating defaults...' : 'Update Pharmacy Default Rates'}
                      </Button>
                    </Box>
                  </Stack>
                </Paper>
              )}

              {renderSlotPreviewList()}
            </Stack>
          );
        }

        return (
          <Stack spacing={3}>
            <Typography
              variant="body1"
              align="center"
              sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}
            >
              <Box component="span">
                Rate is set by government award
                <br />
                published 6 February 2026
              </Box>
              <Tooltip title="View pay guide">
                <IconButton
                  size="small"
                  href={GOVERNMENT_AWARD_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Typography>
            {paymentField}
            {superCheckbox}
            <TextField
              label="Owner Bonus ($/hr, optional)"
              type="number"
              value={ownerBonus}
              onChange={e => setOwnerBonus(e.target.value)}
              fullWidth
              helperText="This bonus is added to the award rate."
              size="small"
              sx={fieldSx}
            />
            {renderSlotPreviewList()}
          </Stack>
        );
      }
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

          <Stepper
            activeStep={activeStep}
            alternativeLabel={!isMobile}
            orientation={isMobile ? 'vertical' : 'horizontal'}
            connector={<StepConnectorStyled />}
            sx={{
              mb: isEmbedded ? 1.5 : 3,
              px: isEmbedded ? { xs: 0, sm: 1 } : { xs: 1, sm: 4 },
              ...(isEmbedded && {
                '& .MuiStepLabel-label': { fontSize: '0.78rem' },
                '& .MuiStepIcon-root, & [class*="StepIconRoot"]': { transform: 'scale(0.9)' },
              }),
            }}
          >
            {steps.map((step, index) => (
              <Step key={step.label}>
                <StepLabel
                  StepIconComponent={StepIconComponent}
                  onClick={editingShiftId ? () => setActiveStep(index) : undefined}
                  sx={editingShiftId ? { cursor: 'pointer' } : undefined}
                >
                  <Typography
                    variant="body2"
                    fontWeight={activeStep === index ? 700 : 500}
                    color={activeStep === index ? 'text.primary' : 'text.secondary'}
                  >
                    {step.label}
                  </Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{ minHeight: isEmbedded ? 0 : 350, px: isEmbedded ? 0 : { xs: 0, md: 2.5 }, pt: isEmbedded ? 0 : 0.5 }}>
            {!isEmbedded && (
              <Typography variant="h5" fontWeight={500} gutterBottom>{steps[activeStep].label}</Typography>
            )}
            {renderStepContent(activeStep)}
          </Box>

          <Stack
            direction={{ xs: 'column-reverse', sm: 'row' }}
            spacing={{ xs: 2, sm: 3 }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            sx={{
              mt: isEmbedded ? 1.5 : 5,
              pt: isEmbedded ? 1.5 : 3,
              borderTop: '1px solid',
              borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.08)' : '#eee',
            }}
          >
            <Button
              onClick={() => setActiveStep(p => p - 1)}
              disabled={activeStep === 0}
              variant="text"
              sx={{ minWidth: 120 }}
            >
              Back
            </Button>
            {activeStep < steps.length - 1 ? (
              <Button
                onClick={() => {
                  const nextStep = activeStep + 1;
                  const currentKey = steps[activeStep]?.key;
                  // Ensure timetable entries exist before moving to pay step
                  if (currentKey === 'timetable') {
                    if (slots.length === 0) {
                      showSnackbar('Add at least one timetable entry before continuing.', 'error');
                      return;
                    }
                  }
                  setActiveStep(nextStep);
                }}
                variant="contained"
                fullWidth={isMobile}
                sx={{ minWidth: isMobile ? '100%' : 140, borderRadius: 2 }}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="contained"
                color="success"
                onClick={handleSubmit}
                disabled={submitting}
                fullWidth={isMobile}
                sx={{ minWidth: isMobile ? '100%' : 160, borderRadius: 2 }}
              >
                {submitting ? 'Submitting...' : (editingShiftId ? 'Update Shift' : 'Post Shift')}
              </Button>
            )}
          </Stack>
        </Paper>
        <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
        </Snackbar>
      </Container>
    </ThemeProvider>
  );
};

export default PostShiftPage;
