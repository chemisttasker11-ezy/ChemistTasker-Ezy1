import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import axios from 'axios';
import {
  TextField,
  Button,
  Box,
  CircularProgress,
  Alert,
  Link,
  Typography,
  MenuItem,
  Divider,
  Stack,
  Chip,
} from '@mui/material';
import AuthLayout from '../layouts/AuthLayout';
import PublicLogoTopBar from '../components/PublicLogoTopBar';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';

interface MagicInfo {
  pharmacy: number;
  pharmacy_name: string;
  category: 'FULL_PART_TIME' | 'LOCUM_CASUAL';
  expires_at: string;
  payroll_enabled: boolean;
}

const getFirstErrorMessage = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }
  return null;
};

const prettyCategory = (c?: MagicInfo['category']) =>
  c === 'FULL_PART_TIME' ? 'Full/Part-time' : c === 'LOCUM_CASUAL' ? 'Locum/Casual' : '-';

const ROLE_OPTIONS = [
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'TECHNICIAN', label: 'Dispensary Technician' },
  { value: 'ASSISTANT', label: 'Pharmacy Assistant' },
  { value: 'INTERN', label: 'Intern' },
  { value: 'STUDENT', label: 'Pharmacy Student' },
];

const OTHER_STAFF_ROLE_VALUES = ['TECHNICIAN', 'ASSISTANT', 'INTERN', 'STUDENT'];

const PHARMACIST_AWARD_LEVEL_OPTIONS = [
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'EXPERIENCED_PHARMACIST', label: 'Experienced Pharmacist' },
  { value: 'PHARMACIST_IN_CHARGE', label: 'Pharmacist In Charge' },
  { value: 'PHARMACIST_MANAGER', label: 'Pharmacist Manager' },
];

const OTHERSTAFF_CLASSIFICATION_OPTIONS = [
  { value: 'LEVEL_1', label: 'Level 1' },
  { value: 'LEVEL_2', label: 'Level 2' },
  { value: 'LEVEL_3', label: 'Level 3' },
  { value: 'LEVEL_4', label: 'Level 4' },
];

const INTERN_HALF_OPTIONS = [
  { value: 'FIRST_HALF', label: 'First Half' },
  { value: 'SECOND_HALF', label: 'Second Half' },
];

const STUDENT_YEAR_OPTIONS = [
  { value: 'YEAR_1', label: 'Year 1' },
  { value: 'YEAR_2', label: 'Year 2' },
  { value: 'YEAR_3', label: 'Year 3' },
  { value: 'YEAR_4', label: 'Year 4' },
];

export default function MembershipApplyPage() {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading: authLoading } = useAuth();

  const [loadingInfo, setLoadingInfo] = useState(true);
  const [info, setInfo] = useState<MagicInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [role, setRole] = useState<string>('PHARMACIST');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [mobile, setMobile] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  const [pharmacistLevel, setPharmacistLevel] = useState('');
  const [otherStaffLevel, setOtherStaffLevel] = useState('');
  const [internHalf, setInternHalf] = useState('');
  const [studentYear, setStudentYear] = useState('');

  const isAuthenticatedWorker = user?.role === 'PHARMACIST' || user?.role === 'OTHER_STAFF';
  const authenticatedRoleBlocked = Boolean(user && !isAuthenticatedWorker);
  const workerPaymentPath =
    user?.role === 'PHARMACIST'
      ? '/dashboard/pharmacist/onboarding?step=payment'
      : user?.role === 'OTHER_STAFF'
        ? '/dashboard/otherstaff/onboarding?step=payment'
        : null;
  const payrollClassificationRequired =
    info?.category === 'FULL_PART_TIME' && Boolean(info?.payroll_enabled);
  const roleOptions = useMemo(() => {
    if (user?.role === 'PHARMACIST') {
      return ROLE_OPTIONS.filter((option) => option.value === 'PHARMACIST');
    }
    if (user?.role === 'OTHER_STAFF') {
      return ROLE_OPTIONS.filter((option) => OTHER_STAFF_ROLE_VALUES.includes(option.value));
    }
    return ROLE_OPTIONS;
  }, [user?.role]);

  const activeLevelField = useMemo(() => {
    switch (role) {
      case 'PHARMACIST':
        return {
          key: 'pharmacist_award_level',
          label: 'Pharmacist Award Level',
          value: pharmacistLevel,
          set: setPharmacistLevel,
          options: PHARMACIST_AWARD_LEVEL_OPTIONS,
        } as const;
      case 'TECHNICIAN':
      case 'ASSISTANT':
        return {
          key: 'otherstaff_classification_level',
          label: 'Classification Level',
          value: otherStaffLevel,
          set: setOtherStaffLevel,
          options: OTHERSTAFF_CLASSIFICATION_OPTIONS,
        } as const;
      case 'INTERN':
        return {
          key: 'intern_half',
          label: 'Intern (First or Second Half)',
          value: internHalf,
          set: setInternHalf,
          options: INTERN_HALF_OPTIONS,
        } as const;
      case 'STUDENT':
        return {
          key: 'student_year',
          label: 'Student Year',
          value: studentYear,
          set: setStudentYear,
          options: STUDENT_YEAR_OPTIONS,
        } as const;
      default:
        return null;
    }
  }, [role, pharmacistLevel, otherStaffLevel, internHalf, studentYear]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!token) throw new Error('Missing token');
        setLoadingInfo(true);
        setInfoError(null);
        const { data } = await axios.get<MagicInfo>(`${API_BASE_URL}${API_ENDPOINTS.magicMembershipInfo(token)}`);
        if (mounted) setInfo(data);
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 410) setInfoError('This link has expired. Please contact the pharmacy to request a new link.');
        else if (status === 404) setInfoError('This link is invalid.');
        else setInfoError('Unable to load link information. Please try again later.');
      } finally {
        if (mounted) setLoadingInfo(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!user || !isAuthenticatedWorker) return;
    setFirstName(user.first_name || user.firstName || '');
    setLastName(user.last_name || user.lastName || '');
    setUsername(user.username || '');
    setMobile(user.mobile_number || '');
    setEmail(user.email || '');
    setRole((currentRole) => {
      if (user.role === 'PHARMACIST') {
        return 'PHARMACIST';
      }
      return OTHER_STAFF_ROLE_VALUES.includes(currentRole) ? currentRole : 'TECHNICIAN';
    });
  }, [isAuthenticatedWorker, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const requiresJobTitle = info?.category === 'FULL_PART_TIME';
      const trimmedJobTitle = jobTitle.trim();

      if (requiresJobTitle && !trimmedJobTitle) {
        setSubmitError('Please enter your job title.');
        setSubmitting(false);
        return;
      }

      if (payrollClassificationRequired && activeLevelField && !activeLevelField.value) {
        setSubmitError(`Please select ${activeLevelField.label.toLowerCase()}.`);
        setSubmitting(false);
        return;
      }

      if (authenticatedRoleBlocked) {
        setSubmitError('Only pharmacist and other staff accounts can submit this application while signed in.');
        setSubmitting(false);
        return;
      }

      if (!dateOfBirth) {
        setSubmitError('Please enter your date of birth.');
        setSubmitting(false);
        return;
      }

      if (dateOfBirth > new Date().toISOString().slice(0, 10)) {
        setSubmitError('Date of birth cannot be in the future.');
        setSubmitting(false);
        return;
      }

      if (!email.trim()) {
        setSubmitError('Please enter your email address.');
        setSubmitting(false);
        return;
      }

      if (user?.email && email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
        setSubmitError('Use the email address on your signed-in account.');
        setSubmitting(false);
        return;
      }

      if (!username.trim()) {
        setSubmitError('Please enter your username.');
        setSubmitting(false);
        return;
      }

      const payload: Record<string, unknown> = {
        role,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: username.trim(),
        mobile_number: mobile.trim(),
        date_of_birth: dateOfBirth,
        email: email.trim().toLowerCase(),
        pharmacist_award_level: payrollClassificationRequired ? (pharmacistLevel || null) : null,
        otherstaff_classification_level: payrollClassificationRequired ? (otherStaffLevel || null) : null,
        intern_half: payrollClassificationRequired ? (internHalf || null) : null,
        student_year: payrollClassificationRequired ? (studentYear || null) : null,
      };

      if (requiresJobTitle) {
        payload.job_title = trimmedJobTitle;
      }

      if (user) {
        await apiClient.post(API_ENDPOINTS.magicMembershipApply(token), payload);
      } else {
        await axios.post(`${API_BASE_URL}${API_ENDPOINTS.magicMembershipApply(token)}`, payload);
      }
      setSubmitted(true);
    } catch (err: any) {
      const data = err?.response?.data;
      const firstFieldError =
        data && typeof data === 'object'
          ? Object.values(data as Record<string, unknown>)
              .map(getFirstErrorMessage)
              .find((value): value is string => Boolean(value))
          : null;
      const msg = data?.detail || data?.error || firstFieldError || 'Could not submit your application.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const pageContent = () => {
    if (loadingInfo) {
      return (
        <AuthLayout title="Join This Pharmacy">
          <Box textAlign="center" mt={4}>
            <CircularProgress />
          </Box>
        </AuthLayout>
      );
    }

    if (infoError) {
      return (
        <AuthLayout title="Join This Pharmacy">
          <Alert severity="error" sx={{ mb: 2 }}>{infoError}</Alert>
          <Typography variant="body2">
            Back to{' '}
            <Link component={RouterLink} to="/login" fontWeight="bold" color="#00a99d">
              Login
            </Link>
          </Typography>
        </AuthLayout>
      );
    }

    return (
      <AuthLayout title="Join This Pharmacy">
        <Box
          sx={{
            mb: 3,
            p: 2.25,
            borderRadius: 3,
            background: 'linear-gradient(135deg, rgba(0,169,157,0.12), rgba(15,23,42,0.04))',
            border: '1px solid rgba(148,163,184,0.22)',
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {info?.pharmacy_name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Complete this short form to send your application directly to the pharmacy team.
              </Typography>
            </Box>
            <Chip label={prettyCategory(info?.category)} sx={{ fontWeight: 700, bgcolor: 'rgba(255,255,255,0.9)' }} />
          </Stack>
        </Box>

        {submitted ? (
          <>
            <Alert severity="success" sx={{ mb: 2 }}>
              Application submitted! The pharmacy will review your details and contact you.
            </Alert>
            {info?.category === 'FULL_PART_TIME' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Your application is pending. Staff approval requires a ChemistTasker worker account using this same email and the TFN pathway in your private Payment Profile.
                {info.payroll_enabled
                  ? ' Because this pharmacy uses ChemistTasker Payroll, complete the TFN and super setup before the pharmacy can approve the application.'
                  : ' The pharmacy will process payroll externally, but TFN remains the employee source-of-truth while ChemistTasker manages roster, attendance and timesheets.'}
              </Alert>
            )}
            {info?.category === 'LOCUM_CASUAL' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Favourite-list approval does not choose TFN or ABN for you. Your private worker Payment Profile remains the source of truth when you later accept a shift.
              </Alert>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {workerPaymentPath ? (
                <Button component={RouterLink} to={workerPaymentPath} variant="contained">
                  Complete Payment Profile
                </Button>
              ) : (
                <>
                  <Button component={RouterLink} to="/register" variant="contained">
                    Create worker account
                  </Button>
                  <Button component={RouterLink} to="/login" variant="outlined">
                    Log in
                  </Button>
                </>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
              Use the same email address as this application so ChemistTasker can link the worker profile to the pharmacy request.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              You can also return to{' '}
              <Link component={RouterLink} to={user?'/dashboard':'/login'} fontWeight="bold" color="#00a99d">
                {user?'My dashboard':'Log in'}
              </Link>
              .
            </Typography>
          </>
        ) : (
          <>
            <Divider sx={{ my: 2 }} />
            {user && isAuthenticatedWorker && (
              <Alert severity="info" sx={{ mb: 2 }}>
                We prefilled this application from your signed-in account. Use your account email and role.
              </Alert>
            )}
            {authenticatedRoleBlocked && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                This application can only be submitted by pharmacist or other staff accounts while signed in.
              </Alert>
            )}
            {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}

            {info?.category === 'FULL_PART_TIME' && (
              <Alert severity={info.payroll_enabled ? 'info' : 'success'} sx={{ mb: 2 }}>
                {info.payroll_enabled
                  ? 'This is a TFN pharmacy-staff pathway. The pharmacy will review your Award classification and prepare dated employment terms. Before final approval, use this same email for your ChemistTasker worker account, select TFN in your private Payment Profile, and complete TFN/super setup. Those identifiers stay private and are never entered in this pharmacy application.'
                  : 'This is a TFN pharmacy-staff pathway. ChemistTasker will manage roster, attendance and timesheets while the pharmacy processes payroll externally. Before final approval, use this same email for your ChemistTasker worker account and select TFN in your private Payment Profile; private TFN details are never shown to the pharmacy.'}
              </Alert>
            )}
            {info?.category === 'LOCUM_CASUAL' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Favourite-list membership does not set a standing pay rate or payment method. Your private ChemistTasker Payment Profile remains the source of truth for TFN vs ABN. Each accepted shift freezes the final rate and routes TFN work to payroll/timesheet processing or verified ABN work to invoicing.
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <TextField
                select
                fullWidth
                margin="normal"
                label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
                disabled={authLoading || user?.role === 'PHARMACIST' || authenticatedRoleBlocked}
              >
                {roleOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                fullWidth
                margin="normal"
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />

              <TextField
                fullWidth
                margin="normal"
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />

              <TextField
                fullWidth
                margin="normal"
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />

              <TextField
                fullWidth
                margin="normal"
                label="Mobile Number"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g., 041x xxx xxx"
                required
              />

              <TextField
                fullWidth
                margin="normal"
                label="Date of birth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ max: new Date().toISOString().slice(0, 10) }}
                helperText="Used to apply age-dependent Pharmacy Award rates correctly."
                required
              />

              <TextField
                fullWidth
                margin="normal"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={Boolean(user?.email) || authenticatedRoleBlocked}
              />

              {info?.category === 'FULL_PART_TIME' && (
                <TextField
                  fullWidth
                  margin="normal"
                  label="Job Title"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                />
              )}

              {payrollClassificationRequired && activeLevelField && (
                <TextField
                  select
                  fullWidth
                  margin="normal"
                  label={activeLevelField.label}
                  value={activeLevelField.value}
                  onChange={(e) => activeLevelField.set(e.target.value)}
                >
                  <MenuItem value="">-</MenuItem>
                  {activeLevelField.options.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              <Box mt={3}>
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  disabled={submitting || authenticatedRoleBlocked}
                  sx={{ py: 1.5, backgroundColor: '#00a99d', '&:hover': { backgroundColor: '#00877d' } }}
                >
                  {submitting ? <CircularProgress size={24} color="inherit" /> : 'Submit Application'}
                </Button>
              </Box>
            </form>
          </>
        )}
      </AuthLayout>
    );
  };

  return (
    <>
      <PublicLogoTopBar />
      {pageContent()}
    </>
  );
}
