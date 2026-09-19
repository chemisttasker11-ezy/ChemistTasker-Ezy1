import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
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
    && !saving;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Review membership application</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.25}>
          <Alert severity="info">
            Email, mobile number, date of birth and username are locked identifiers after submission. Employment-facing details can be corrected before approval, and every change is included in the applicant's approval notification.
          </Alert>

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography fontWeight={900} gutterBottom>Locked applicant identifiers</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              <TextField label="Email" value={identifiers.email} disabled fullWidth />
              <TextField label="Mobile" value={identifiers.mobile} disabled fullWidth />
              <TextField label="Date of birth" value={identifiers.dateOfBirth} disabled fullWidth />
              <TextField label="Username" value={identifiers.username} disabled fullWidth />
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography fontWeight={900} gutterBottom>Reviewed membership details</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              <TextField label="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} fullWidth />
              <TextField label="Last name" value={lastName} onChange={(event) => setLastName(event.target.value)} fullWidth />
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
              {isStaff && (
                <TextField label="Job title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} required fullWidth />
              )}
              {isStaff && payrollEnabled && (
                <FormControl fullWidth>
                  <InputLabel>Award classification</InputLabel>
                  <Select value={classification} label="Award classification" onChange={(event) => setClassification(String(event.target.value))}>
                    {classificationOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
              <FormControl fullWidth>
                <InputLabel>{isStaff ? 'Employment type' : 'Favourite type'}</InputLabel>
                <Select
                  value={employmentType}
                  label={isStaff ? 'Employment type' : 'Favourite type'}
                  onChange={(event) => setEmploymentType(String(event.target.value) as EmploymentType)}
                >
                  {(isStaff ? allowedEmploymentTypes : ['LOCUM', 'SHIFT_HERO']).map((type) => (
                    <MenuItem key={type} value={type}>{String(type).replaceAll('_', ' ')}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Paper>

          {existingChanges.length > 0 && (
            <Alert severity="warning">
              {existingChanges.length} review change{existingChanges.length === 1 ? '' : 's'} already recorded. The applicant will receive the full change list on approval.
            </Alert>
          )}

          {isStaff && !payrollEnabled && (
            <Alert severity="success">
              ChemistTasker Payroll is disabled for this pharmacy. No Award classification or rates are required for approval. The worker can still be rostered, clock attendance and produce timesheets for your existing payroll system.
            </Alert>
          )}

          {!isStaff && (
            <Alert severity="info">
              Favourite-list membership does not create a standing employment rate. Posted or negotiated shift rates and ABN/TFN terms are accepted and frozen per assigned shift.
            </Alert>
          )}

          {isStaff && payrollEnabled && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography fontWeight={900}>Initial ChemistTasker Payroll terms</Typography>
                  <Typography variant="body2" color="text.secondary">
                    These terms are created atomically with the membership and are included in the approval email.
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <TextField type="date" label="Effective from" InputLabelProps={{ shrink: true }} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} fullWidth />
                  <TextField type="date" label="Effective to (optional)" InputLabelProps={{ shrink: true }} value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} fullWidth />
                </Stack>
                <FormControl fullWidth>
                  <InputLabel>Pay basis</InputLabel>
                  <Select
                    value={payBasis}
                    label="Pay basis"
                    onChange={(event) => {
                      const next = String(event.target.value) as PayBasis;
                      setPayBasis(next);
                      setRateWeekday('');
                      setRateSaturday('');
                      setRateSunday('');
                      setRatePublicHoliday('');
                    }}
                  >
                    <MenuItem value="AWARD">Award rate</MenuItem>
                    <MenuItem value="ABOVE_AWARD">Above award / agreed rates</MenuItem>
                  </Select>
                </FormControl>

                {previewError && <Alert severity="error">{previewError}</Alert>}
                {preview && (
                  <Alert severity="info">
                    Award floor: weekday AUD {preview.rateWeekday}/hr · Saturday AUD {preview.rateSaturday}/hr · Sunday AUD {preview.rateSunday}/hr · Public holiday AUD {preview.ratePublicHoliday}/hr
                    {preview.rateScope === 'junior' ? ' · DOB-based junior percentage ' + preview.juniorPercentage + '%' : ''}
                  </Alert>
                )}

                {payBasis === 'ABOVE_AWARD' && (
                  <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                      <TextField label="Agreed weekday rate" type="number" value={rateWeekday} onChange={(event) => setRateWeekday(event.target.value)} />
                      <TextField label="Agreed Saturday rate" type="number" value={rateSaturday} onChange={(event) => setRateSaturday(event.target.value)} />
                      <TextField label="Agreed Sunday rate" type="number" value={rateSunday} onChange={(event) => setRateSunday(event.target.value)} />
                      <TextField label="Agreed public holiday rate" type="number" value={ratePublicHoliday} onChange={(event) => setRatePublicHoliday(event.target.value)} />
                    </Box>
                    {!aboveAwardChanged && preview && (
                      <Alert severity="warning">At least one agreed rate must be above the Award floor to save above-award terms.</Alert>
                    )}
                  </>
                )}

                {employmentType === 'PART_TIME' && (
                  <Paper variant="outlined" sx={{ p: 1.25 }}>
                    <Stack spacing={1}>
                      <Typography fontWeight={800}>Agreed part-time ordinary hours</Typography>
                      {days.map((day) => (
                        <Box key={day.weekday} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '150px 1fr 1fr 1fr 1fr' }, gap: 1, alignItems: 'center' }}>
                          <FormControlLabel control={<Checkbox checked={day.enabled} onChange={(_, checked) => updateDay(day.weekday, { enabled: checked })} />} label={day.label} />
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
                  </Paper>
                )}
              </Stack>
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSaveReview} disabled={saving}>Save review</Button>
        <Button variant="contained" onClick={handleApprove} disabled={!canApprove}>
          {saving ? 'Saving…' : 'Approve & send'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
