/// <reference types="@types/google.maps" />
import * as React from 'react';
import {
  Box, Button, Chip, MenuItem,  TextField, Typography,   Dialog, DialogTitle, DialogContent, DialogActions, 

  Alert, Snackbar
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';

import { API_BASE_URL } from '../../../constants/api';
import { useAuth } from '../../../contexts/AuthContext';
import ProfilePhotoUploader from '../../../components/profilePhoto/ProfilePhotoUploader';
import type { User } from '../../../contexts/AuthContext';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';
import {
  getOnboarding,
  updateOnboarding,
  mobileRequestOtp,
  mobileVerifyOtp,
  mobileResendOtp,
} from '@chemisttasker/shared-core';

const EXPLORER_ROLE_CHOICES = [
  { value: 'STUDENT',          label: 'Student' },
  { value: 'JUNIOR',           label: 'Junior' },
  { value: 'CAREER_SWITCHER',  label: 'Career switcher' },
] as const;

type ExplorerRole = typeof EXPLORER_ROLE_CHOICES[number]['value'];

type ApiData = {
  // user*
  username?: string;
  first_name?: string;
  last_name?: string;
  profile_photo?: string | null;
  profile_photo_url?: string | null;

  phone_number?: string;
  government_id?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  emergency_contact_number?: string | null;
  emergency_contact_relation?: string | null;

  // optional address (saved on onboarding model)
  street_address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  google_place_id?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  role_type?: ExplorerRole | string | null;

  // verification flags/notes
  gov_id_verified?: boolean | null;
  gov_id_verification_note?: string | null;
};

const GOOGLE_LIBRARIES = ['places'] as Array<'places'>;
const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const;

export default function BasicInfoV2() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [data, setData] = React.useState<ApiData>({});
  const [lockedNames, setLockedNames] = React.useState({ first: false, last: false });
  const [profilePhotoFile, setProfilePhotoFile] = React.useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = React.useState<string | null>(null);
  const [profilePhotoCleared, setProfilePhotoCleared] = React.useState(false);
  const [snack, setSnack] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');
  const [addressDisplay, setAddressDisplay] = React.useState<string>('');
  const canSubmit = true; // Other staff Basic tab has no AHPRA gating



  // --- mobile verification state & membership flag ---
  const { user, setUser } = useAuth();

  const hasMembership = Array.isArray(user?.memberships) && user.memberships.length > 0;
  const isMobileVerified = Boolean((user as any)?.is_mobile_verified);
  const [mobileVerifiedLocal, setMobileVerifiedLocal] = React.useState<boolean>(isMobileVerified);


  const [otpOpen, setOtpOpen] = React.useState(false);
  const [otp, setOtp] = React.useState('');
  const [otpBusy, setOtpBusy] = React.useState(false);
  const [otpMsg, setOtpMsg] = React.useState('');
  const [otpErr, setOtpErr] = React.useState('');
  const saveRef = React.useRef<(() => Promise<void>) | null>(null);
  const unsaved = useUnsavedChangesGuard({
    disabled: loading || saving,
    onSave: () => saveRef.current?.(),
    value: {
      addressDisplay,
      data,
      profilePhotoCleared,
      profilePhotoFile,
      profilePhotoPreview,
    },
  });

  // Google Places
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY || '',
    libraries: GOOGLE_LIBRARIES,
  });
  const autocompleteRef = React.useRef<google.maps.places.Autocomplete | null>(null);

  const roleKey = 'explorer';

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    getOnboarding(roleKey as any)
      .then(res => {
        if (!mounted) return;
        const nextData = res as any;
        setData(nextData);
        setLockedNames({
          first: isMobileVerified,
          last: isMobileVerified,
        });
        const nextPhoto =
          nextData?.profile_photo_url ||
          (nextData?.profile_photo ? `${API_BASE_URL}${nextData.profile_photo}` : null);
        setProfilePhotoPreview(nextPhoto);
        setProfilePhotoFile(null);
        setProfilePhotoCleared(false);
        // Pre-fill the visible address from parts so it never looks blank
        const s = [nextData?.street_address, nextData?.suburb, nextData?.state, nextData?.postcode]
          .filter(Boolean).join(', ');
        setAddressDisplay(s);
        unsaved.markClean({
          addressDisplay: s,
          data: nextData,
          profilePhotoCleared: false,
          profilePhotoFile: null,
          profilePhotoPreview: nextPhoto,
        });
      })
      .catch(e => setError(e?.message || 'Unable to load onboarding'))
      .finally(() => setLoading(false));
    return () => { mounted = false; };
  }, [roleKey]);

  const setField = (name: keyof ApiData, value: any) =>
    setData(prev => ({ ...prev, [name]: value }));

  // const getFileUrl = (path?: string | null) =>
  //   path ? (path.startsWith('http') ? path : `${API_BASE_URL}${path}`) : '';

  // When user picks a place, keep a nice full string AND store structured parts
  const onPickPlace = () => {
    const a = autocompleteRef.current;
    if (!a) return;
    const place = a.getPlace();
    if (!place || !place.address_components) return;

    let streetNumber = '';
    let route = '';
    let locality = '';
    let postalCode = '';
    let stateShort = '';

    place.address_components.forEach(c => {
      const t = c.types;
      if (t.includes('street_number')) streetNumber = c.long_name;
      if (t.includes('route')) route = c.short_name;
      if (t.includes('locality')) locality = c.long_name;
      if (t.includes('postal_code')) postalCode = c.long_name;
      if (t.includes('administrative_area_level_1')) stateShort = c.short_name;
    });

    const pretty = place.formatted_address ||
      [streetNumber && route ? `${streetNumber} ${route}` : '', locality, stateShort, postalCode]
        .filter(Boolean).join(', ');

    setAddressDisplay(pretty);

    setData(prev => ({
      ...prev,
      street_address: `${streetNumber} ${route}`.trim() || prev.street_address || '',
      suburb: locality || prev.suburb || '',
      state: stateShort || prev.state || '',
      postcode: postalCode || prev.postcode || '',
      google_place_id: place.place_id || prev.google_place_id || '',
      latitude: place.geometry?.location?.lat() ?? prev.latitude ?? null,
      longitude: place.geometry?.location?.lng() ?? prev.longitude ?? null,
    }));
  };

  const save = async (submitForVerification: boolean) => {
    setSaving(true);
    setSnack('');
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'basic');
      if (submitForVerification) fd.append('submitted_for_verification', 'true');

      // user names
      if (data.username != null)   fd.append('username',   String(data.username));
      if (data.first_name != null) fd.append('first_name', String(data.first_name));
      if (data.last_name != null)  fd.append('last_name',  String(data.last_name));
      if (data.role_type != null) fd.append('role_type', String(data.role_type));

      // phone/ahpra
      if (data.phone_number != null) fd.append('phone_number', String(data.phone_number));

      // date of birth
      if (data.date_of_birth != null) fd.append('date_of_birth', String(data.date_of_birth));
      if (data.gender != null) fd.append('gender', String(data.gender));
      if (data.emergency_contact_number != null) fd.append('emergency_contact_number', String(data.emergency_contact_number));
      if (data.emergency_contact_relation != null) fd.append('emergency_contact_relation', String(data.emergency_contact_relation));

      // address
      (['street_address','suburb','state','postcode','google_place_id','latitude','longitude'] as const)
        .forEach(k => {
          const v = data[k];
          if (v != null && v !== '') fd.append(k, String(v));
        });

      if (profilePhotoFile) {
        fd.append('profile_photo', profilePhotoFile);
      } else if (profilePhotoCleared) {
        fd.append('profile_photo_clear', 'true');
      }

      // government id file

      const res = await updateOnboarding(roleKey as any, fd as any);
      const nextData = res as any;
      setData(nextData);
      setLockedNames({
        first: isMobileVerified || mobileVerifiedLocal,
        last: isMobileVerified || mobileVerifiedLocal,
      });
      const nextPhoto =
        nextData?.profile_photo_url ||
        (nextData?.profile_photo ? `${API_BASE_URL}${nextData.profile_photo}` : null);
      setProfilePhotoPreview(nextPhoto);
      setProfilePhotoFile(null);
      setProfilePhotoCleared(false);
      setUser((prev: User | null) => (prev ? {
        ...prev,
        username: nextData.username || prev.username,
        first_name: nextData.first_name ?? prev.first_name,
        last_name: nextData.last_name ?? prev.last_name,
        mobile_number: nextData.phone_number ?? prev.mobile_number,
        profile_photo: nextPhoto,
        profile_photo_url: nextPhoto,
        profilePhoto: nextPhoto,
        profilePhotoUrl: nextPhoto,
      } : prev));
      window.dispatchEvent(new CustomEvent('ct-profile-updated', {
        detail: { ...nextData, profile_photo: nextPhoto, profile_photo_url: nextPhoto },
      }));

      // refresh the visible address line from saved parts (in case backend normalizes)
      const s = [nextData?.street_address, nextData?.suburb, nextData?.state, nextData?.postcode]
        .filter(Boolean).join(', ');
      if (s) setAddressDisplay(s);
      unsaved.markClean({
        addressDisplay: s,
        data: nextData,
        profilePhotoCleared: false,
        profilePhotoFile: null,
        profilePhotoPreview: nextPhoto,
      });

      setSnack(submitForVerification ? 'Submitted for verification.' : 'Saved.');
    } catch (e: any) {
      const resp = (e as any)?.response?.data;
      setError(
        resp && typeof resp === 'object'
          ? Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n')
          : (e?.message || 'Error saving')
      );
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    saveRef.current = () => save(false);
  });

  const VerifiedChip = ({ ok, label }: { ok?: boolean | null; label: string }) => {
    if (ok === true)   return <Chip icon={<CheckCircleOutlineIcon />} color="success" label={label} variant="outlined" />;
    if (ok === false)  return <Chip icon={<ErrorOutlineIcon />}   color="error"   label={`${label}`} variant="outlined" />;
    return               <Chip icon={<HourglassBottomIcon />}      label={`${label}`}               variant="outlined" />;
  };


  // --- mobile OTP handlers ---
  const sendMobileOtp = async () => {
    setOtpBusy(true); setOtpErr(''); setOtpMsg('');
    try {
      await mobileRequestOtp({
        first_name: data.first_name,
        last_name: data.last_name,
        username: data.username,
        mobile_number: data.phone_number,
      } as any);
      setOtpMsg('Code sent to your mobile.');
    } catch (e: any) {
      setOtpErr(e?.response?.data?.error || e?.response?.data?.detail || e.message || 'Failed to send code.');
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyMobileOtp = async () => {
    setOtpBusy(true); setOtpErr(''); setOtpMsg('');
    try {
      await mobileVerifyOtp({ otp } as any);
      setOtpMsg('Mobile verified!');
      setMobileVerifiedLocal(true);
      setLockedNames({ first: true, last: true });
      if (setUser) {
        setUser((prev: User | null) => (prev ? {
          ...prev,
          first_name: data.first_name,
          last_name: data.last_name,
          username: data.username || prev.username,
          mobile_number: data.phone_number,
          is_mobile_verified: true,
        } : prev));
      }
      // Optionally close after success:
      // setTimeout(() => setOtpOpen(false), 800);
    } catch (e: any) {
      setOtpErr(e?.response?.data?.error || e?.response?.data?.detail || e.message || 'Verification failed.');
    } finally {
      setOtpBusy(false);
    }
  };

  const resendMobileOtp = async () => {
    setOtpBusy(true); setOtpErr(''); setOtpMsg('');
    try {
      await mobileResendOtp({} as any);
      setOtpMsg('New code sent.');
    } catch (e: any) {
      setOtpErr(e?.response?.data?.error || e?.response?.data?.detail || e.message || 'Could not resend code.');
    } finally {
      setOtpBusy(false);
    }
  };

  if (loading) return <Typography>Loading…</Typography>;

return (
  <Box sx={{ width: '100%' }}>
    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
      Basic Information
    </Typography>

    {error && (
      <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>
        {error}
      </Alert>
    )}

    <Box sx={{ mb: 3 }}>
      <ProfilePhotoUploader
        value={profilePhotoPreview}
        onChange={(file, previewUrl, cleared) => {
          setProfilePhotoFile(file);
          setProfilePhotoPreview(previewUrl);
          setProfilePhotoCleared(Boolean(cleared) && !file);
        }}
        disabled={saving}
      />
    </Box>

    {/* ROW 1 — names on one row */}
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
      <TextField
        label="First Legal Name"
        value={data.first_name || ''}
        onChange={e => setField('first_name', e.target.value)}
        disabled={lockedNames.first}
        sx={{ flex: '1 1 220px', minWidth: 200, maxWidth: 320 }}
      />
      <TextField
        label="Last Legal Name"
        value={data.last_name || ''}
        onChange={e => setField('last_name', e.target.value)}
        disabled={lockedNames.last}
        sx={{ flex: '1 1 220px', minWidth: 200, maxWidth: 320 }}
      />
      <TextField
        label="Username"
        value={data.username || ''}
        onChange={e => setField('username', e.target.value)}
        sx={{ flex: '1 1 220px', minWidth: 200, maxWidth: 320 }}
      />
    </Box>

    {/* ROW 2 — phone + verify inline */}
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        mb: 2,
      }}
    >
      <TextField
        label="Phone Number"
        value={data.phone_number || ''}
        onChange={e => setField('phone_number', e.target.value)}
        required={!hasMembership}
        disabled={isMobileVerified || mobileVerifiedLocal}
        sx={{ flex: '1 1 260px', minWidth: 220, maxWidth: 360 }}
      />

      {/* verify / badge — keep inline with the phone field */}
      {(isMobileVerified || mobileVerifiedLocal) ? (
        <Box sx={{ flex: '0 0 auto' }}>
          <VerifiedChip ok={true} label="Mobile Verified" />
        </Box>
      ) : (
        <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 1, mt: { xs: 1, md: 0 } }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setOtpOpen(true)}
            disabled={!data.phone_number}
          >
            Verify mobile
          </Button>
          {!hasMembership && (
            <Typography variant="caption" color="text.secondary">
              Required for regular registrations
            </Typography>
          )}
        </Box>
      )}
    </Box>

    {/* ROW 3 — role (then DOB) */}
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
      <TextField
        select
        label="Role"
        value={(data.role_type as string) || ''}
        onChange={e => setField('role_type', e.target.value)}
        sx={{ flex: '1 1 220px', minWidth: 200, maxWidth: 320 }}
      >
        {EXPLORER_ROLE_CHOICES.map(opt => (
          <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
        ))}
      </TextField>

      <TextField
        label="Date of Birth"
        type="date"
        value={data.date_of_birth || ''}
        onChange={e => setField('date_of_birth', e.target.value)}
        InputLabelProps={{ shrink: true }}
        sx={{ flex: '0 1 220px', minWidth: 200, maxWidth: 220 }}
      />
      <TextField
        select
        label="Gender"
        value={data.gender || ''}
        onChange={e => setField('gender', e.target.value)}
        sx={{ flex: '1 1 220px', minWidth: 200, maxWidth: 260 }}
      >
        <MenuItem value="">Select gender</MenuItem>
        {GENDER_OPTIONS.map(opt => (
          <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
        ))}
      </TextField>
    </Box>

    <Typography variant="subtitle1" sx={{ mt: 1, mb: 1 }}>
      Emergency Contact
    </Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
      <TextField
        label="Emergency Contact Number"
        value={data.emergency_contact_number || ''}
        onChange={e => setField('emergency_contact_number', e.target.value)}
        sx={{ flex: '1 1 260px', minWidth: 220, maxWidth: 360 }}
      />
      <TextField
        label="Relation to You"
        value={data.emergency_contact_relation || ''}
        onChange={e => setField('emergency_contact_relation', e.target.value)}
        sx={{ flex: '1 1 260px', minWidth: 220, maxWidth: 360 }}
      />
    </Box>

    {/* Address section */}
    <Typography variant="subtitle1" sx={{ mt: 1, mb: 1 }}>
      Address (optional)
    </Typography>

    {/* Search address (controlled) */}
    <Box sx={{ mb: 2 }}>
      {isLoaded ? (
        <Autocomplete
          onLoad={(ref) => (autocompleteRef.current = ref)}
          onPlaceChanged={onPickPlace}
          options={{
            componentRestrictions: { country: 'au' },
            fields: ['address_components', 'geometry', 'place_id', 'formatted_address'],
          }}
        >
          <TextField
            fullWidth
            label="Search Address"
            value={addressDisplay}
            onChange={(e) => setAddressDisplay(e.target.value)}
          />
        </Autocomplete>
      ) : loadError ? (
        <Typography color="error">Google Maps failed to load.</Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">Loading address input…</Typography>
      )}
    </Box>

    {/* Structured address parts */}
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
      <TextField
        label="Street Address"
        value={data.street_address || ''}
        onChange={e => setField('street_address', e.target.value)}
        sx={{ flex: '2 1 360px', minWidth: 260, maxWidth: 560 }}
      />
      <TextField
        label="Suburb"
        value={data.suburb || ''}
        onChange={e => setField('suburb', e.target.value)}
        sx={{ flex: '1 1 220px', minWidth: 180, maxWidth: 280 }}
      />
      <TextField
        label="State"
        value={data.state || ''}
        onChange={e => setField('state', e.target.value)}
        sx={{ flex: '0 1 120px', minWidth: 100, maxWidth: 140 }}
      />
      <TextField
        label="Postcode"
        value={data.postcode || ''}
        onChange={e => setField('postcode', e.target.value)}
        sx={{ flex: '0 1 140px', minWidth: 100, maxWidth: 160 }}
      />
    </Box>

    {/* Actions: Save left, Submit right */}
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, flexWrap: 'wrap', gap: 1.5 }}>
      <Button variant="outlined" disabled={saving} onClick={() => save(false)}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
      <Button variant="contained" disabled={saving || !canSubmit} onClick={() => save(true)}>
        {saving ? 'Submitting…' : 'Submit & Verify Basic'}
      </Button>
    </Box>

    {/* OTP dialog */}
    <Dialog open={otpOpen} onClose={() => setOtpOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Verify Mobile</DialogTitle>
      <DialogContent>
        {otpErr && <Alert severity="error" sx={{ mb: 1 }}>{otpErr}</Alert>}
        {otpMsg && <Alert severity="success" sx={{ mb: 1 }}>{otpMsg}</Alert>}

        <Typography variant="body2" sx={{ mb: 1 }}>
          Number: <b>{data.phone_number || '—'}</b>
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button variant="outlined" onClick={sendMobileOtp} disabled={otpBusy || !data.phone_number}>
            Send code
          </Button>
          <Button variant="text" onClick={resendMobileOtp} disabled={otpBusy}>
            Resend
          </Button>
        </Box>

        <TextField
          fullWidth
          label="Enter OTP"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          disabled={otpBusy}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOtpOpen(false)} disabled={otpBusy}>Close</Button>
        <Button variant="contained" onClick={verifyMobileOtp} disabled={otpBusy || !otp}>
          {otpBusy ? 'Please wait…' : 'Verify'}
        </Button>
      </DialogActions>
    </Dialog>

    <Snackbar open={!!snack} autoHideDuration={2400} onClose={() => setSnack('')} message={snack} />
  </Box>
);

}
