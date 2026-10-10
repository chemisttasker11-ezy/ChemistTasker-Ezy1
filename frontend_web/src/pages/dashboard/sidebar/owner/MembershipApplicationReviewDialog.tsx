import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Check } from 'lucide-react';
import { Pill } from '../../../../components/ui/Pill';
import { PersonAvatar, employmentLabel, roleLabel, roleTone } from './teamUi';
import dayjs from 'dayjs';
import {
  approveMembershipApplicationService,
  previewMembershipApplicationAwardService,
  reviewMembershipApplicationService,
  type MembershipApplication,
} from '@chemisttasker/shared-core';

type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CASUAL' | 'LOCUM' | 'SHIFT_HERO';
type PayBasis = 'AWARD' | 'ABOVE_AWARD';

type Props = {
  open: boolean;
  application: MembershipApplication | null;
  defaultEmploymentType: string;
  allowedEmploymentTypes: string[];
  onClose: () => void;
  onUpdated: (application: MembershipApplication) => void;
  onApproved: () => void;
  onNotification?: (message: string, severity: 'success' | 'error') => void;
};

type PartTimeDay = {
  weekday: number;
  label: string;
  enabled: boolean;
  start_time: string;
  end_time: string;
  meal_break_start: string;
  meal_break_minutes: number;
};

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const blankDays = (): PartTimeDay[] =>
  WEEK_DAYS.map((label, weekday) => ({
    weekday,
    label,
    enabled: weekday < 5,
    start_time: '09:00',
    end_time: '17:00',
    meal_break_start: '13:00',
    meal_break_minutes: 30,
  }));

const ROLE_OPTIONS = [
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'INTERN', label: 'Intern Pharmacist' },
  { value: 'TECHNICIAN', label: 'Dispensary Technician' },
  { value: 'ASSISTANT', label: 'Pharmacy Assistant' },
  { value: 'STUDENT', label: 'Pharmacy Student' },
];

const CLASSIFICATIONS: Record<string, Array<{ value: string; label: string }>> = {
  PHARMACIST: [
    { value: 'PHARMACIST', label: 'Pharmacist' },
    { value: 'EXPERIENCED_PHARMACIST', label: 'Experienced Pharmacist' },
    { value: 'PHARMACIST_IN_CHARGE', label: 'Pharmacist in charge' },
    { value: 'PHARMACIST_MANAGER', label: 'Pharmacist manager' },
  ],
  INTERN: [
    { value: 'FIRST_HALF', label: 'Intern - first half' },
    { value: 'SECOND_HALF', label: 'Intern - second half' },
  ],
  STUDENT: [
    { value: 'YEAR_1', label: 'Student - year 1' },
    { value: 'YEAR_2', label: 'Student - year 2' },
    { value: 'YEAR_3', label: 'Student - year 3' },
    { value: 'YEAR_4', label: 'Student - year 4' },
  ],
  ASSISTANT: [
    { value: 'LEVEL_1', label: 'Pharmacy assistant level 1' },
    { value: 'LEVEL_2', label: 'Pharmacy assistant level 2' },
    { value: 'LEVEL_3', label: 'Pharmacy assistant level 3' },
    { value: 'LEVEL_4', label: 'Pharmacy assistant level 4' },
  ],
  TECHNICIAN: [
    { value: 'LEVEL_3', label: 'Dispensary assistant level 3' },
    { value: 'LEVEL_4', label: 'Level 4 / Certificate IV duties' },
  ],
};

const read = (app: MembershipApplication | null, camelKey: string, snakeKey: string) =>
  app ? ((app as any)[camelKey] ?? (app as any)[snakeKey] ?? '') : '';

const classificationFor = (app: MembershipApplication | null) =>
  String(
    read(app, 'pharmacistAwardLevel', 'pharmacist_award_level')
    || read(app, 'otherstaffClassificationLevel', 'otherstaff_classification_level')
    || read(app, 'internHalf', 'intern_half')
    || read(app, 'studentYear', 'student_year')
    || '',
  );

const reviewPayload = (
  role: string,
  firstName: string,
  lastName: string,
  jobTitle: string,
  classification: string,
) => ({
  role,
  first_name: firstName.trim(),
  last_name: lastName.trim(),
  job_title: jobTitle.trim(),
  pharmacist_award_level: role === 'PHARMACIST' ? classification || null : null,
  otherstaff_classification_level: ['ASSISTANT', 'TECHNICIAN'].includes(role) ? classification || null : null,
  intern_half: role === 'INTERN' ? classification || null : null,
  student_year: role === 'STUDENT' ? classification || null : null,
});

const firstError = (error: any, fallback: string) => {
  const data = error?.response?.data;
  if (typeof data?.detail === 'string') return data.detail;
  if (data && typeof data === 'object') {
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
      if (typeof value === 'string') return value;
    }
  }
  return error?.message || fallback;
};

export default function MembershipApplicationReviewDialog({
  open,
  application,
  defaultEmploymentType,
  allowedEmploymentTypes,
  onClose,
  onUpdated,
  onApproved,
  onNotification,
}: Props) {
  const [localApp, setLocalApp] = useState<MembershipApplication | null>(application);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('PHARMACIST');
  const [jobTitle, setJobTitle] = useState('');
  const [classification, setClassification] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('CASUAL');
  const [effectiveFrom, setEffectiveFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [effectiveTo, setEffectiveTo] = useState('');
  const [payBasis, setPayBasis] = useState<PayBasis>('AWARD');
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState('');
  const [rateWeekday, setRateWeekday] = useState('');
  const [rateSaturday, setRateSaturday] = useState('');
  const [rateSunday, setRateSunday] = useState('');
  const [ratePublicHoliday, setRatePublicHoliday] = useState('');
  const [days, setDays] = useState<PartTimeDay[]>(blankDays());
  const [saving, setSaving] = useState(false);
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    if (!application || !open) return;
    setLocalApp(application);
    setFirstName(String(read(application, 'firstName', 'first_name')));
    setLastName(String(read(application, 'lastName', 'last_name')));
    setRole(String(application.role || 'PHARMACIST'));
    setJobTitle(String(read(application, 'jobTitle', 'job_title')));
    setClassification(classificationFor(application));
    const appCategory = String(application.category);
    const nextEmployment = appCategory === 'LOCUM_CASUAL'
      ? (String(application.role).toUpperCase() === 'PHARMACIST' ? 'LOCUM' : 'SHIFT_HERO')
      : (allowedEmploymentTypes.includes(defaultEmploymentType) ? defaultEmploymentType : 'CASUAL');
    setEmploymentType(nextEmployment as EmploymentType);
    setEffectiveFrom(dayjs().format('YYYY-MM-DD'));
    setEffectiveTo('');
    setPayBasis('AWARD');
    setPreview(null);
    setPreviewError('');
    setRateWeekday('');
    setRateSaturday('');
    setRateSunday('');
    setRatePublicHoliday('');
    setDays(blankDays());
  }, [application, open, allowedEmploymentTypes, defaultEmploymentType]);

  const payrollEnabled = Boolean(read(localApp, 'payrollEnabled', 'payroll_enabled'));
  const isStaff = localApp?.category === 'FULL_PART_TIME';
  const classificationOptions = CLASSIFICATIONS[role] || [];
  const identifiers = {
    email: localApp?.email || '',
    mobile: read(localApp, 'mobileNumber', 'mobile_number'),
    dateOfBirth: read(localApp, 'dateOfBirth', 'date_of_birth'),
    username: read(localApp, 'username', 'username'),
  };
  const paymentProfile = (
    (localApp as any)?.paymentProfileStatus
    ?? (localApp as any)?.payment_profile_status
    ?? null
  ) as null | {
    accountLinked?: boolean;
    onboardingComplete?: boolean;
    paymentPreference?: 'TFN' | 'ABN' | null;
    status?: string;
    payrollReady?: boolean;
    invoiceReady?: boolean;
    missingFields?: string[];
  };
  const staffPaymentPathReady =
    !isStaff
    || (
      paymentProfile?.paymentPreference === 'TFN'
      && (!payrollEnabled || Boolean(paymentProfile?.payrollReady))
    );
  const paymentMissing = paymentProfile?.missingFields || [];

  useEffect(() => {
    if (!open || !localApp || !isStaff || !payrollEnabled || !classification || !effectiveFrom) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewError('');
    previewMembershipApplicationAwardService(localApp.id, {
      employment_type: employmentType,
      award_classification: classification,
      effective_from: effectiveFrom,
    })
      .then((result: any) => {
        if (cancelled) return;
        setPreview(result);
        if (payBasis === 'ABOVE_AWARD') {
          setRateWeekday((value) => value || String(result.rateWeekday || ''));
          setRateSaturday((value) => value || String(result.rateSaturday || ''));
          setRateSunday((value) => value || String(result.rateSunday || ''));
          setRatePublicHoliday((value) => value || String(result.ratePublicHoliday || ''));
        }
      })
      .catch((error: any) => {
        if (!cancelled) setPreviewError(firstError(error, 'Unable to resolve Award rates.'));
      });
    return () => {
      cancelled = true;
    };
  }, [classification, effectiveFrom, employmentType, isStaff, localApp, open, payBasis, payrollEnabled]);

  const updateDay = (weekday: number, patch: Partial<PartTimeDay>) => {
    setDays((current) => current.map((day) => day.weekday === weekday ? { ...day, ...patch } : day));
  };

  const saveReview = async (): Promise<MembershipApplication | null> => {
    if (!localApp) return null;
    const updated = await reviewMembershipApplicationService(
      localApp.id,
      reviewPayload(role, firstName, lastName, jobTitle, classification),
    );
    setLocalApp(updated);
    onUpdated(updated);
    return updated;
  };

  const handleSaveReview = async () => {
    setSaving(true);
    try {
      await saveReview();
      onNotification?.('Application review changes saved.', 'success');
    } catch (error: any) {
      onNotification?.(firstError(error, 'Unable to save application review.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!localApp) return;
    setSaving(true);
    try {
      const updated = await saveReview();
      if (!updated) return;

      const payload: any = { employment_type: employmentType };
      if (isStaff && payrollEnabled) {
        const terms: any = {
          effective_from: effectiveFrom,
          effective_to: effectiveTo || null,
          employment_type: employmentType,
          job_title: jobTitle.trim(),
          pay_basis: payBasis,
          award_classification: classification,
        };
        if (employmentType === 'PART_TIME') {
          terms.ordinary_hours_pattern = {
            days: days.filter((day) => day.enabled).map((day) => ({
              weekday: day.weekday,
              start_time: day.start_time,
              end_time: day.end_time,
              meal_break_start: day.meal_break_minutes ? day.meal_break_start : null,
              meal_break_minutes: day.meal_break_minutes,
            })),
          };
        }
        if (payBasis === 'ABOVE_AWARD') {
          terms.rate_weekday = rateWeekday;
          terms.rate_saturday = rateSaturday;
          terms.rate_sunday = rateSunday;
          terms.rate_public_holiday = ratePublicHoliday;
          terms.early_morning_applicable = false;
          terms.late_night_applicable = false;
        }
        payload.employment_engagement = terms;
      }

      await approveMembershipApplicationService(updated.id, payload);
      onNotification?.('Application approved and final terms sent to the applicant.', 'success');
      onApproved();
      onClose();
    } catch (error: any) {
      onNotification?.(firstError(error, 'Unable to approve application.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const existingChanges = useMemo(
    () => ((localApp as any)?.reviewChanges ?? (localApp as any)?.review_changes ?? []) as Array<any>,
    [localApp],
  );

  const aboveAwardChanged = preview
    ? [rateWeekday, rateSaturday, rateSunday, ratePublicHoliday].some((value, index) => {
        const floor = [
          preview.rateWeekday,
          preview.rateSaturday,
          preview.rateSunday,
          preview.ratePublicHoliday,
        ][index];
        return Number(value || 0) > Number(floor || 0);
      })
    : false;

  const partTimeReady =
    employmentType !== 'PART_TIME'
    || days.some((day) => day.enabled && day.start_time && day.end_time);

  const canApprove =
    Boolean(localApp)
    && Boolean(firstName.trim())
    && Boolean(lastName.trim())
    && (!isStaff || Boolean(jobTitle.trim()))
    && (!isStaff || !payrollEnabled || Boolean(classification))
    && (!isStaff || !payrollEnabled || Boolean(preview))
    && (!isStaff || !payrollEnabled || payBasis !== 'ABOVE_AWARD' || aboveAwardChanged)
    && (!isStaff || !payrollEnabled || partTimeReady)
    && staffPaymentPathReady
    && !saving;

  const missing: string[] = [];
  if (localApp) {
    if (!firstName.trim() || !lastName.trim()) missing.push('First and last name');
    if (isStaff && !jobTitle.trim()) missing.push('Job title');
    if (isStaff && payrollEnabled && !classification) missing.push('Award classification');
    if (isStaff && payrollEnabled && classification && !preview) missing.push('Award rates (loading or unavailable)');
    if (isStaff && payrollEnabled && payBasis === 'ABOVE_AWARD' && !aboveAwardChanged) missing.push('At least one agreed rate above the Award floor');
    if (isStaff && payrollEnabled && !partTimeReady) missing.push('Agreed part-time hours for at least one day');
    if (!staffPaymentPathReady) missing.push("The worker's payment setup (they complete it in their private profile)");
  }
  const applicantName = [firstName, lastName].filter(Boolean).join(' ') || 'Applicant';
  const section = (step: number, title: string, hint?: string) => (
    <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 1.5 }}>
      <Box sx={{ width: 26, height: 26, flex: '0 0 26px', borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)', fontSize: 13, fontWeight: 600 }}>{step}</Box>
      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: 16, color: 'var(--ct-text-primary)' }}>{title}</Typography>
        {hint ? <Typography sx={{ fontSize: 13.5, color: 'var(--ct-text-secondary)' }}>{hint}</Typography> : null}
      </Box>
    </Stack>
  );
  const note = (text: string) => (
    <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'var(--ct-subtle-bg)', color: 'var(--ct-text-secondary)', fontSize: 13.5, lineHeight: 1.55 }}>{text}</Box>
  );
  const sectionSx = { p: { xs: 2, sm: 2.25 }, borderRadius: '16px', border: '1px solid var(--ct-border-color)' } as const;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth fullScreen={phone} aria-labelledby="review-application-title">
      <DialogTitle id="review-application-title" sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <PersonAvatar name={applicantName} tone={roleTone(role)} size={44} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="span" sx={{ display: 'block', fontWeight: 600, fontSize: 19, color: 'var(--ct-text-primary)' }}>Review {applicantName}</Typography>
            <Typography component="span" sx={{ display: 'block', fontSize: 14, color: 'var(--ct-text-secondary)' }}>
              {isStaff ? 'Staff application' : 'Favourite locum application'} · {roleLabel(role)}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ borderColor: 'var(--ct-border-color)' }}>
        <Stack spacing={2.25}>
          <Box sx={sectionSx}>
            {section(1, 'Applicant', 'Contact details are locked once they apply.')}
            <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
              {[
                ['Email', identifiers.email],
                ['Mobile', identifiers.mobile],
                ['Date of birth', identifiers.dateOfBirth],
                ['Username', identifiers.username],
              ].map(([label, value]) => (
                <Box key={label} sx={{ minWidth: 0 }}>
                  <Typography component="dt" sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary)' }}>{label}</Typography>
                  <Typography component="dd" sx={{ m: 0, fontSize: 14.5, fontWeight: 500, color: 'var(--ct-text-primary)', overflowWrap: 'anywhere' }}>{value || '—'}</Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--ct-text-secondary)', mb: 0.75 }}>Payment setup</Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                <Pill
                  label={paymentProfile?.paymentPreference ? `${paymentProfile.paymentPreference} pathway` : 'Payment preference not set'}
                  tone={paymentProfile?.paymentPreference ? 'violet' : 'amber'}
                />
                {paymentProfile?.paymentPreference === 'TFN' && (
                  <Pill label={paymentProfile.payrollReady ? 'Payroll profile ready' : 'Payroll profile incomplete'} tone={paymentProfile.payrollReady ? 'green' : 'amber'} />
                )}
                {paymentProfile?.paymentPreference === 'ABN' && (
                  <Pill label={paymentProfile.invoiceReady ? 'Invoice profile ready' : 'Invoice profile incomplete'} tone={paymentProfile.invoiceReady ? 'green' : 'amber'} />
                )}
                {!paymentProfile?.accountLinked && <Pill label="Worker account not linked" tone="amber" />}
                {paymentProfile?.accountLinked && !paymentProfile?.onboardingComplete && <Pill label="Onboarding incomplete" tone="amber" />}
              </Stack>
              {paymentMissing.length > 0 && (
                <Typography sx={{ mt: 1, fontSize: 13.5, color: 'var(--ct-status-amber-fg)' }}>
                  Still needed in their private profile: {paymentMissing.map((field) => field.replaceAll('_', ' ')).join(', ')}.
                </Typography>
              )}
              <Typography sx={{ mt: 1, fontSize: 12.5, color: 'var(--ct-text-secondary)' }}>
                A readiness summary only. TFN and super numbers stay private to the worker.
              </Typography>
            </Box>
            {isStaff && paymentProfile?.paymentPreference === 'ABN' && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                Pharmacy staff (full-time, part-time and casual) use the TFN employee pathway. ABN is for independent shift work only.
              </Alert>
            )}
            {isStaff && payrollEnabled && paymentProfile?.paymentPreference === 'TFN' && !paymentProfile?.payrollReady && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                ChemistTasker Payroll is on, so approval waits until the worker finishes their TFN and super setup.
              </Alert>
            )}
          </Box>

          <Box sx={sectionSx}>
            {section(2, isStaff ? 'Role and employment' : 'Role and favourite type', 'Changes are audited and emailed to the applicant when you save.')}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField label="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} fullWidth required />
              <TextField label="Last name" value={lastName} onChange={(event) => setLastName(event.target.value)} fullWidth required />
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={role}
                  label="Role"
                  onChange={(event) => {
                    const nextRole = String(event.target.value);
                    setRole(nextRole);
                    setClassification('');
                  }}
                >
                  {ROLE_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>{isStaff ? 'Employment type' : 'Favourite type'}</InputLabel>
                <Select
                  value={employmentType}
                  label={isStaff ? 'Employment type' : 'Favourite type'}
                  onChange={(event) => setEmploymentType(String(event.target.value) as EmploymentType)}
                >
                  {(isStaff ? allowedEmploymentTypes : ['LOCUM', 'SHIFT_HERO']).map((type) => (
                    <MenuItem key={type} value={type}>{employmentLabel(type)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {isStaff && (
                <TextField label="Job title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} required fullWidth helperText="Shown to the team" />
              )}
              {isStaff && payrollEnabled && (
                <FormControl fullWidth required>
                  <InputLabel>Award classification</InputLabel>
                  <Select value={classification} label="Award classification" onChange={(event) => setClassification(String(event.target.value))}>
                    {classificationOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            </Box>
            <Box sx={{ mt: 1.5 }}>
              {existingChanges.length > 0
                ? note(`${existingChanges.length} change${existingChanges.length === 1 ? '' : 's'} already recorded and emailed. The full list goes out again with the approval.`)
                : isStaff && !payrollEnabled
                  ? note('ChemistTasker Payroll is off for this pharmacy, so no Award classification or rates are needed. They can still be rostered, clock in and produce timesheets for your own payroll.')
                  : !isStaff
                    ? note('Favourites have no standing pay rate. Each shift locks its own rate and TFN or ABN terms when they accept it.')
                    : null}
            </Box>
          </Box>

          {isStaff && payrollEnabled && (
            <Box sx={sectionSx}>
              {section(3, 'Payroll terms', 'Created together with the membership and included in the approval email.')}
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField type="date" label="Starts" InputLabelProps={{ shrink: true }} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} fullWidth />
                  <TextField type="date" label="Ends (optional)" InputLabelProps={{ shrink: true }} value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} fullWidth />
                </Stack>
                <Box role="radiogroup" aria-label="Pay basis" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  {([['AWARD', 'Award rate', 'Pay the Award floor for their classification'], ['ABOVE_AWARD', 'Above Award', 'Agree higher rates for some or all days']] as const).map(([value, label, hint]) => {
                    const selected = payBasis === value;
                    return (
                      <ButtonBase
                        key={value}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setPayBasis(value);
                          setRateWeekday('');
                          setRateSaturday('');
                          setRateSunday('');
                          setRatePublicHoliday('');
                        }}
                        sx={{
                          display: 'block',
                          p: 1.5,
                          textAlign: 'left',
                          borderRadius: '12px',
                          border: '1px solid',
                          borderColor: selected ? 'var(--ct-accent-strong)' : 'var(--ct-border-color)',
                          bgcolor: selected ? 'var(--ct-tone-violet-bg)' : 'transparent',
                          '&.Mui-focusVisible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 },
                        }}
                      >
                        <Typography sx={{ fontWeight: 600, fontSize: 15, color: selected ? 'var(--ct-tone-violet-fg)' : 'var(--ct-text-primary)' }}>{label}</Typography>
                        <Typography sx={{ fontSize: 13.5, color: selected ? 'var(--ct-tone-violet-fg)' : 'var(--ct-text-secondary)' }}>{hint}</Typography>
                      </ButtonBase>
                    );
                  })}
                </Box>

                {previewError && <Alert severity="error">{previewError}</Alert>}
                {preview && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1, p: 1.5, borderRadius: '12px', bgcolor: 'var(--ct-subtle-bg)' }}>
                    {([['Weekday', preview.rateWeekday], ['Saturday', preview.rateSaturday], ['Sunday', preview.rateSunday], ['Public holiday', preview.ratePublicHoliday]] as const).map(([label, value]) => (
                      <Box key={label}>
                        <Typography sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary)' }}>Award floor · {label}</Typography>
                        <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--ct-text-primary)', fontVariantNumeric: 'tabular-nums' }}>${value}/hr</Typography>
                      </Box>
                    ))}
                    {preview.rateScope === 'junior' ? (
                      <Typography sx={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--ct-text-secondary)' }}>Junior rate: {preview.juniorPercentage}% based on date of birth.</Typography>
                    ) : null}
                  </Box>
                )}

                {payBasis === 'ABOVE_AWARD' && (
                  <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                      {([['Weekday rate', rateWeekday, setRateWeekday], ['Saturday rate', rateSaturday, setRateSaturday], ['Sunday rate', rateSunday, setRateSunday], ['Public holiday rate', ratePublicHoliday, setRatePublicHoliday]] as const).map(([label, value, set]) => (
                        <TextField
                          key={label}
                          label={label}
                          type="number"
                          value={value}
                          onChange={(event) => set(event.target.value)}
                          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: <InputAdornment position="end">/hr</InputAdornment> }}
                        />
                      ))}
                    </Box>
                    {!aboveAwardChanged && preview && (
                      <Alert severity="warning">Set at least one rate above the Award floor, or choose Award rate.</Alert>
                    )}
                  </>
                )}

                {employmentType === 'PART_TIME' && (
                  <Box>
                    <Typography sx={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ct-text-primary)', mb: 1 }}>Agreed part-time hours</Typography>
                    <Stack spacing={1} divider={<Box sx={{ borderTop: '1px solid var(--ct-border-color)' }} />}>
                      {days.map((day) => (
                        <Box key={day.weekday} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '150px repeat(4, minmax(0, 1fr))' }, gap: 1, alignItems: 'center' }}>
                          <FormControlLabel
                            sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
                            control={<Checkbox checked={day.enabled} onChange={(_, checked) => updateDay(day.weekday, { enabled: checked })} />}
                            label={day.label}
                          />
                          <TextField size="small" type="time" label="Start" InputLabelProps={{ shrink: true }} disabled={!day.enabled} value={day.start_time} onChange={(event) => updateDay(day.weekday, { start_time: event.target.value })} />
                          <TextField size="small" type="time" label="Finish" InputLabelProps={{ shrink: true }} disabled={!day.enabled} value={day.end_time} onChange={(event) => updateDay(day.weekday, { end_time: event.target.value })} />
                          <FormControl size="small" disabled={!day.enabled}>
                            <InputLabel>Meal break</InputLabel>
                            <Select value={day.meal_break_minutes} label="Meal break" onChange={(event) => updateDay(day.weekday, { meal_break_minutes: Number(event.target.value) })}>
                              <MenuItem value={0}>None</MenuItem>
                              <MenuItem value={30}>30 min</MenuItem>
                              <MenuItem value={45}>45 min</MenuItem>
                              <MenuItem value={60}>60 min</MenuItem>
                            </Select>
                          </FormControl>
                          <TextField size="small" type="time" label="Break starts" InputLabelProps={{ shrink: true }} disabled={!day.enabled || !day.meal_break_minutes} value={day.meal_break_start} onChange={(event) => updateDay(day.weekday, { meal_break_start: event.target.value })} />
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0, flex: '1 1 260px' }} aria-live="polite">
          {missing.length > 0 && !saving ? (
            <Typography sx={{ fontSize: 13, color: 'var(--ct-text-secondary)' }}>
              <Box component="strong" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>Still needed: </Box>
              {missing.join(' · ')}
            </Typography>
          ) : null}
        </Box>
        <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="outlined" onClick={handleSaveReview} disabled={saving}>Save changes</Button>
          <Button
            variant="contained"
            onClick={handleApprove}
            disabled={!canApprove}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Check size={16} />}
          >
            {saving ? 'Saving…' : 'Approve and send'}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
