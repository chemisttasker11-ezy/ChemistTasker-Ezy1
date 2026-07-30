// src/pages/onboarding/OwnerOnboarding.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Button,
  Alert,
  Snackbar,
  InputAdornment,
  Chip,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  FormLabel,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { API_BASE_URL } from '../../constants/api';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useNavigate } from 'react-router-dom';
import ProfilePhotoUploader from '../../components/profilePhoto/ProfilePhotoUploader';
import apiClient from '../../utils/apiClient';
import { useAuth, type User } from '../../contexts/AuthContext';
import { UnsavedChangesBoundary, useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { AHPRA_CONSENT_TEXT } from '../../constants/ahpraConsent';
import AccountDeletionSection from '../../components/AccountDeletionSection';

interface FormData {
  username: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  gender: string;
  role: 'MANAGER' | 'PHARMACIST';
  chain_pharmacy: boolean;
  number_of_pharmacies: number;
  ahpra_number: string;
  ahpra_years_since_first_registration?: number | null;
  ahpra_verified?: boolean | null;
  ahpra_verification_note?: string | null;
  profile_photo?: string | null;
  profile_photo_url?: string | null;
}

const ROLE_OPTIONS = [
  { value: 'MANAGER', label: 'Pharmacy Manager' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
];

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const LIGHT_PAGE_BG = '#F4F7FB';
const LIGHT_SURFACE = '#FFFFFF';
const LIGHT_BORDER = '#D9E2F2';
const HERO_GRADIENT_START = '#143EEA';
// const HERO_GRADIENT_END = '#D20DAE';
const HERO_GRADIENT = 'linear-gradient(135deg, #143EEA 0%, #2429B8 45%, #8B1CF6 72%, #D20DAE 100%)';

type OwnerOnboardingProps = {
  standalone?: boolean;
  onSuccessPath?: string;
};

function OwnerOnboardingContent({
  standalone = false,
  onSuccessPath,
}: OwnerOnboardingProps) {
  const roleKey = 'owner';
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [isUpdate, setIsUpdate] = useState(false);
  const isMobileVerified = Boolean(user?.is_mobile_verified);

  const [data, setData] = useState<FormData>({
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    gender: '',
    role: 'MANAGER',
    chain_pharmacy: false,
    number_of_pharmacies: 1,
    ahpra_number: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('Profile saved successfully!');
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [profilePhotoCleared, setProfilePhotoCleared] = useState(false);
  const [lockedNames, setLockedNames] = useState({ first: false, last: false });
  const [subscriptionSummary, setSubscriptionSummary] = useState<{
    active: boolean;
    status: string;
    staffCount: number;
    extraSeatCount: number;
  } | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const saveRef = React.useRef<(() => Promise<void>) | null>(null);
  const unsaved = useUnsavedChangesGuard({
    disabled: loading,
    onSave: () => saveRef.current?.(),
    value: {
      data,
      profilePhotoCleared,
      profilePhotoFile,
      profilePhotoPreview,
    },
  });
  const displayName = useMemo(() => {
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
    return name || data.username || 'Owner setup';
  }, [data.first_name, data.last_name, data.username]);
  const roleLabel = ROLE_OPTIONS.find((option) => option.value === data.role)?.label ?? 'Owner';
  const showAhpra = data.role === 'PHARMACIST' || Boolean(data.ahpra_number);
  const isAhpraVerified = data.ahpra_verified === true;
  const sectionCardSx = {
    p: { xs: 2, md: 3 },
    borderRadius: 4,
    border: `1px solid ${LIGHT_BORDER}`,
    boxShadow: '0 18px 42px rgba(99, 102, 241, 0.08)',
    bgcolor: LIGHT_SURFACE,
    color: '#111827',
  } as const;
  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: LIGHT_SURFACE,
      color: '#111827',
      borderRadius: 2,
      '& .MuiInputBase-input': {
        color: '#111827',
        WebkitTextFillColor: '#111827',
      },
      '& .MuiInputBase-input.Mui-disabled': {
        color: '#475569',
        WebkitTextFillColor: '#475569',
      },
      '& .MuiSelect-select': {
        color: '#111827',
      },
      '& .MuiInputAdornment-root': {
        color: '#64748B',
      },
      '& fieldset': {
        borderColor: LIGHT_BORDER,
      },
      '&:hover fieldset': {
        borderColor: '#B8C4DB',
      },
      '&.Mui-focused fieldset': {
        borderColor: HERO_GRADIENT_START,
        borderWidth: 1,
      },
      '&.Mui-disabled': {
        bgcolor: '#F3F6FB',
      },
    },
    '& .MuiInputLabel-root': {
      color: '#64748B',
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: HERO_GRADIENT_START,
    },
    '& .MuiFormHelperText-root': {
      color: '#64748B',
      marginLeft: 0,
    },
  } as const;

  useEffect(() => {
    getOnboardingDetail(roleKey)
      .then(res => {
        const d: any = res;
        const nextData = {
          username: d.username || '',
          first_name: d.first_name || '',
          last_name: d.last_name || '',
          phone_number: d.phone_number || '',
          gender: d.gender || '',
          role: (d.role as 'MANAGER' | 'PHARMACIST') || 'MANAGER',
          chain_pharmacy: !!d.chain_pharmacy,
          number_of_pharmacies: Math.max(1, Number(d.number_of_pharmacies) || 1),
          ahpra_number: d.ahpra_number || '',
          ahpra_years_since_first_registration: d.ahpra_years_since_first_registration ?? null,
          ahpra_verified: typeof d.ahpra_verified === 'boolean' ? d.ahpra_verified : null,
          ahpra_verification_note: d.ahpra_verification_note || null,
        };
        setIsUpdate(true);
        setData(nextData);
        setLockedNames({
          first: Boolean(d.first_name),
          last: Boolean(d.last_name),
        });
        const nextPhoto =
          d.profile_photo_url || (d.profile_photo ? `${API_BASE_URL}${d.profile_photo}` : null);
        setProfilePhotoPreview(nextPhoto);
        setProfilePhotoFile(null);
        setProfilePhotoCleared(false);
        unsaved.markClean({
          data: nextData,
          profilePhotoCleared: false,
          profilePhotoFile: null,
          profilePhotoPreview: nextPhoto,
        });
      })
      .catch(err => {
        if (err.response?.status !== 404) {
          setError(err.response?.data?.detail || err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [roleKey]);

  useEffect(() => {
    if (standalone) {
      return;
    }
    apiClient
      .get('/billing/subscription/')
      .then(({ data }) => {
        setSubscriptionSummary({
          active: !!data.active,
          status: data.status || 'inactive',
          staffCount: data.staffCount ?? 5,
          extraSeatCount: data.extraSeatCount ?? 0,
        });
      })
      .catch(() => {
        setSubscriptionSummary(null);
      });
  }, [standalone]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setData(prev => ({
      ...prev,
      [name]: name === 'number_of_pharmacies' ? Math.max(1, Number(value) || 1) : value,
    }));
  };

  const handleChainPharmacyToggle = (
    _event: React.MouseEvent<HTMLElement>,
    newValue: 'yes' | 'no' | null,
  ) => {
    if (newValue !== null) {
      const isChain = newValue === 'yes';
      setData(prev => ({
        ...prev,
        chain_pharmacy: isChain,
        ...(!isChain ? { number_of_pharmacies: 1 } : {}),
      }));
    }
  };

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    const payload = new FormData();
    const normalizedData = {
      ...data,
      number_of_pharmacies: data.chain_pharmacy ? Math.max(1, data.number_of_pharmacies || 1) : 1,
    };
    Object.entries(normalizedData).forEach(([k, v]) => {
      payload.append(k, String(v));
    });
    if (!isAhpraVerified) {
      payload.append('submitted_for_verification', 'true');
    }
    if (profilePhotoFile) {
      payload.append('profile_photo', profilePhotoFile);
    } else if (profilePhotoCleared) {
      payload.append('profile_photo_clear', 'true');
    }

    const saved = await updateOnboardingForm(roleKey, payload);
    const nextData = (saved as any) || {};
    const nextPhoto =
      nextData?.profile_photo_url ||
      (nextData?.profile_photo ? `${API_BASE_URL}${nextData.profile_photo}` : profilePhotoPreview);
    const syncedProfile = {
      ...nextData,
      username: normalizedData.username || nextData.username,
      first_name: nextData.first_name ?? normalizedData.first_name,
      last_name: nextData.last_name ?? normalizedData.last_name,
      phone_number: nextData.phone_number ?? normalizedData.phone_number,
      profile_photo: nextPhoto,
      profile_photo_url: nextPhoto,
    };
    setUser((prev: User | null) => (
      prev
        ? {
            ...prev,
            username: syncedProfile.username || prev.username,
            first_name: syncedProfile.first_name ?? prev.first_name,
            last_name: syncedProfile.last_name ?? prev.last_name,
            mobile_number: syncedProfile.phone_number ?? prev.mobile_number,
            profile_photo: nextPhoto,
            profile_photo_url: nextPhoto,
            profilePhoto: nextPhoto,
            profilePhotoUrl: nextPhoto,
          }
        : prev
    ));
    window.dispatchEvent(new CustomEvent('ct-profile-updated', {
      detail: syncedProfile,
    }));

    setSnackbarMessage('Profile saved successfully!');
    setSnackbarOpen(true);
    setLoading(false);
    setProfilePhotoFile(null);
    setProfilePhotoCleared(false);
    unsaved.markClean({
      data: normalizedData,
      profilePhotoCleared: false,
      profilePhotoFile: null,
      profilePhotoPreview,
    });
  } catch (err: any) {
    setError(err.response?.data?.detail || err.message);
    setLoading(false);
  }
};

  useEffect(() => {
    saveRef.current = () => handleSubmit({ preventDefault: () => undefined } as React.FormEvent);
  });

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
    navigate(onSuccessPath || '/dashboard/owner/overview');
  };

  const handleCopyFriendReferral = async () => {
    setReferralLoading(true);
    try {
      const { data: referral } = await apiClient.post('/client-profile/pill-rewards/refer-friend/', {});
      const code = referral?.referral_code;
      if (!code) throw new Error('Referral code was not returned.');
      const url = new URL('/register', window.location.origin);
      url.searchParams.set('referral_code', code);
      await navigator.clipboard.writeText(url.toString());
      setError('');
      setSnackbarMessage('Referral link copied to clipboard.');
      setSnackbarOpen(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to create referral link.');
    } finally {
      setReferralLoading(false);
    }
  };

  const VerifiedChip = ({ ok, label }: { ok?: boolean | null; label: string }) => {
    if (ok === true)   return <Chip icon={<CheckCircleOutlineIcon />} color="success" label={label} variant="outlined" />;
    if (ok === false)  return <Chip icon={<ErrorOutlineIcon />}   color="error"   label={`${label}`} variant="outlined" />;
    return               <Chip icon={<HourglassBottomIcon />}      label={`${label}`}               variant="outlined" />;
  };

  if (loading) return <Typography>Loading…</Typography>;

  return (
    <UnsavedChangesBoundary>
      {() => (
    <Box sx={{ bgcolor: LIGHT_PAGE_BG, minHeight: standalone ? 'calc(100vh - 72px)' : 'auto', py: { xs: 2, md: standalone ? 3 : 0 } }}>
    <Container maxWidth="xl">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert severity="success" sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>

      <Box
        sx={{
          borderRadius: { xs: 3, md: 4 },
          overflow: 'hidden',
          mb: 2,
          backgroundImage: HERO_GRADIENT,
          color: '#FFFFFF',
          minHeight: { xs: 250, md: 300 },
          position: 'relative',
          boxShadow: '0 22px 54px rgba(6, 26, 61, 0.12)',
          px: { xs: 2, md: 4 },
          py: { xs: 2.5, md: 4 },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: [
              `radial-gradient(circle at 64% 98%, ${alpha('#8FE8FF', 0.14)} 0 110px, transparent 111px)`,
              `radial-gradient(circle at 72% 96%, ${alpha('#6FE7DD', 0.16)} 0 190px, transparent 191px)`,
              `radial-gradient(circle at 66% 96%, ${alpha('#FFFFFF', 0.12)} 0 275px, transparent 276px)`,
              `linear-gradient(100deg, transparent 0 78%, ${alpha('#D20DAE', 0.75)} 78% 100%)`,
            ].join(', '),
            pointerEvents: 'none',
          }}
        />
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 2.5, md: 4 }}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
          sx={{ position: 'relative', zIndex: 1, minHeight: '100%' }}
        >
          <Box sx={{ maxWidth: 760 }}>
            <Chip
              label="Owner onboarding"
              size="small"
              sx={{
                mb: 1.5,
                bgcolor: alpha('#FFFFFF', 0.14),
                color: '#FFFFFF',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                border: `1px solid ${alpha('#FFFFFF', 0.24)}`,
              }}
            />
            <Typography
              variant="h3"
              sx={{
                fontSize: { xs: 34, md: 56 },
                fontWeight: 900,
                lineHeight: 1.04,
                overflowWrap: 'anywhere',
              }}
            >
              {displayName}
            </Typography>
            <Typography
              variant="body1"
              sx={{
                mt: 1.5,
                maxWidth: 620,
                fontSize: { xs: 15, md: 20 },
                fontWeight: 700,
                lineHeight: 1.45,
                color: alpha('#FFFFFF', 0.96),
              }}
            >
              Finish your profile details now so your pharmacy workspace can be created without delays.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: { xs: 2, md: 3 } }}>
              <Chip
                label={roleLabel}
                sx={{
                  bgcolor: '#FFFFFF',
                  color: '#063BDA',
                  fontWeight: 900,
                  '& .MuiChip-label': { px: 1.75 },
                }}
              />
              <Chip
                label="Required before workspace setup"
                sx={{
                  bgcolor: alpha('#FFFFFF', 0.14),
                  color: '#FFFFFF',
                  fontWeight: 800,
                  border: `1px solid ${alpha('#FFFFFF', 0.24)}`,
                }}
              />
            </Stack>
          </Box>
          <Box
            sx={{
              alignSelf: { xs: 'flex-start', md: 'center' },
              p: { xs: 1.5, md: 2 },
              borderRadius: 3,
              bgcolor: alpha('#FFFFFF', 0.12),
              border: `1px solid ${alpha('#FFFFFF', 0.24)}`,
              boxShadow: `inset 0 1px 0 ${alpha('#FFFFFF', 0.18)}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            <ProfilePhotoUploader
              value={profilePhotoPreview}
              onChange={(file, previewUrl, cleared) => {
                setProfilePhotoFile(file);
                setProfilePhotoPreview(previewUrl);
                setProfilePhotoCleared(Boolean(cleared) && !file);
              }}
              disabled={loading}
              title=""
              helperText=""
            />
          </Box>
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gap: 3 }}>
        <Paper sx={sectionCardSx} elevation={0}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#111827' }}>
              Profile
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B' }}>
              Complete your owner profile details before moving to referral and subscription actions.
            </Typography>
          </Box>

          <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            margin="normal"
            label="First Name"
            name="first_name"
            value={data.first_name}
            onChange={handleChange}
            required
            disabled={lockedNames.first}
            helperText={lockedNames.first ? 'Locked after initial registration.' : undefined}
            InputProps={lockedNames.first ? {
              endAdornment: (
                <InputAdornment position="end">
                  <LockOutlinedIcon fontSize="small" />
                </InputAdornment>
              ),
            } : undefined}
            sx={inputSx}
          />

          <TextField
            fullWidth
            margin="normal"
            label="Last Name"
            name="last_name"
            value={data.last_name}
            onChange={handleChange}
            required
            disabled={lockedNames.last}
            helperText={lockedNames.last ? 'Locked after initial registration.' : undefined}
            InputProps={lockedNames.last ? {
              endAdornment: (
                <InputAdornment position="end">
                  <LockOutlinedIcon fontSize="small" />
                </InputAdornment>
              ),
            } : undefined}
            sx={inputSx}
          />

          <TextField
            fullWidth
            margin="normal"
            label="Username"
            name="username"
            value={data.username}
            onChange={handleChange}
            required
            sx={inputSx}
          />

          <TextField
            fullWidth
            margin="normal"
            label="Phone Number"
            name="phone_number"
            value={data.phone_number}
            onChange={handleChange}
            required
            disabled={isMobileVerified}
            sx={inputSx}
          />
          <Box sx={{ mt: 1, mb: 1 }}>
            <VerifiedChip ok={isMobileVerified} label="Mobile Verified" />
          </Box>

          <TextField
            select
            fullWidth
            margin="normal"
            label="Gender"
            name="gender"
            value={data.gender}
            onChange={handleChange}
            sx={inputSx}
          >
            <MenuItem value="">Select gender</MenuItem>
            {GENDER_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>

          <FormControl component="fieldset" fullWidth sx={{ mt: 2, mb: 1 }}>
            <FormLabel component="legend" sx={{ ...inputSx['& .MuiInputLabel-root'], mb: 1, fontWeight: 600, color: '#111827' }}>
              Do you have more than one pharmacy?
            </FormLabel>
            <ToggleButtonGroup
              value={data.chain_pharmacy ? 'yes' : 'no'}
              exclusive
              onChange={handleChainPharmacyToggle}
              aria-label="Do you have more than one pharmacy?"
            >
              <ToggleButton
                value="yes"
                sx={{ '&.Mui-selected, &.Mui-selected:hover': { color: 'white', backgroundColor: 'success.main' }, fontWeight: 700 }}
              >
                Yes
              </ToggleButton>
              <ToggleButton
                value="no"
                sx={{ '&.Mui-selected, &.Mui-selected:hover': { color: 'white', backgroundColor: 'error.main' }, fontWeight: 700 }}
              >
                No
              </ToggleButton>
            </ToggleButtonGroup>
          </FormControl>

          {data.chain_pharmacy && (
            <TextField
              fullWidth
              margin="normal"
              label="Number of Pharmacies"
              name="number_of_pharmacies"
              type="number"
              value={data.number_of_pharmacies}
              onChange={handleChange}
              inputProps={{ min: 1 }}
              helperText="You can add more pharmacies after setup as well."
              required
              sx={inputSx}
            />
          )}

          <TextField
            select
            fullWidth
            margin="normal"
            label="Role"
            name="role"
            value={data.role}
            onChange={handleChange}
            required
            sx={inputSx}
          >
            {ROLE_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>

          {showAhpra && (
            <>
              <TextField
                fullWidth
                margin="normal"
                label="AHPRA Number"
                name="ahpra_number"
                value={data.ahpra_number}
                onChange={handleChange}
                disabled={isAhpraVerified}
                required={data.role === 'PHARMACIST'}
                helperText={isAhpraVerified ? 'AHPRA number is locked after verification.' : AHPRA_CONSENT_TEXT}
                InputProps={{
                  startAdornment: <InputAdornment position="start">PHA</InputAdornment>,
                }}
                sx={inputSx}
              />
              <TextField
                fullWidth
                margin="normal"
                label="Years Since First Registration"
                value={
                  data.ahpra_years_since_first_registration != null
                    ? String(data.ahpra_years_since_first_registration)
                    : ''
                }
                disabled
                sx={inputSx}
              />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mt: 1 }}>
                <VerifiedChip ok={data.ahpra_verified} label="AHPRA" />
                {typeof data.ahpra_verified === 'boolean' && (
                  <Typography
                    variant="body2"
                    title={data.ahpra_verification_note || (data.ahpra_verified ? 'Verified' : 'Pending/Not verified')}
                    sx={{
                      color: data.ahpra_verified
                        ? 'success.main'
                        : (data.ahpra_verification_note ? 'error.main' : '#64748B'),
                      flex: '1 1 260px',
                      minWidth: 180,
                      maxWidth: 520,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {data.ahpra_verification_note || (data.ahpra_verified ? 'AHPRA registration is valid and current.' : 'Pending/Not verified')}
                  </Typography>
                )}
              </Box>
            </>
          )}

          <Paper
            variant="outlined"
            sx={{
              mt: 4,
              p: 3,
              borderRadius: 3,
              borderColor: '#CBD5E1',
              bgcolor: '#F8FAFF',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#111827' }}>
                  Save profile
                </Typography>
                {/* <Typography variant="body2" sx={{ color: '#64748B' }}>
                  Submit your profile details here. Referral and subscription tools are separated below.
                </Typography> */}
              </Box>
              <Box sx={{ textAlign: 'right' }}>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ px: 3, minWidth: 160 }}
            >
              {loading ? 'Saving…' : isUpdate ? 'Save Changes' : 'Submit'}
            </Button>
              </Box>
            </Stack>
          </Paper>
          </Box>
        </Paper>

        {!standalone && (
        <Paper sx={sectionCardSx} elevation={0}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <PersonAddAltIcon color="primary" />
                <Typography variant="h5" fontWeight={800}>
                  Refer a colleague
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: '#64748B', maxWidth: 720 }}>
                Copy a referral link. When your friend registers with it, pills can be awarded to your account.
              </Typography>
            </Box>
            <Button variant="contained" onClick={handleCopyFriendReferral} disabled={referralLoading}>
              {referralLoading ? 'Creating...' : 'Copy referral link'}
            </Button>
          </Stack>
        </Paper>
        )}

        {!standalone && (
        <Paper sx={sectionCardSx} elevation={0}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <CreditCardIcon color="primary" />
                <Typography variant="h5" fontWeight={800}>
                  Subscription and seats
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: '#64748B', maxWidth: 720 }}>
                {subscriptionSummary?.active
                  ? `Active subscription with ${subscriptionSummary.staffCount} total seats (${subscriptionSummary.extraSeatCount} extra).`
                  : 'No active subscription yet. Once active, you can manage extra seats here.'}
              </Typography>
            </Box>
            <Button
              variant="contained"
              onClick={() => navigate('/dashboard/owner/overview?view=billing&mode=seats')}
            >
              {subscriptionSummary?.active ? 'Manage seats' : 'Open subscription'}
            </Button>
          </Stack>
        </Paper>
        )}
      </Box>
      <Box sx={{ mt: { xs: 8, md: 10 }, mb: 2 }}>
        <AccountDeletionSection />
      </Box>
    </Container>
    </Box>
      )}
    </UnsavedChangesBoundary>
  );
}

export default function OwnerOnboarding(props: OwnerOnboardingProps) {
  return (
    <UnsavedChangesBoundary>
      {() => <OwnerOnboardingContent {...props} />}
    </UnsavedChangesBoundary>
  );
}
