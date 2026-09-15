// src/pages/onboarding_explorer/IdentityV2.tsx
import * as React from 'react';
import { Box, Button, Link, TextField, Typography, MenuItem, Chip, Alert, Snackbar } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import { API_BASE_URL } from '../../../constants/api';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';

type ApiData = {
  government_id?: string | null;
  government_id_type?: 'DRIVER_LICENSE' | 'VISA' | 'AUS_PASSPORT' | 'OTHER_PASSPORT' | 'AGE_PROOF' | string | null;
  identity_secondary_file?: string | null;
  identity_meta?: {
    state?: string;
    expiry?: string;
    visa_type_number?: string;
    valid_to?: string;
    country?: string;
    passport_country?: string;
    passport_expiry?: string;
  } | null;
  gov_id_verified?: boolean | null;
  gov_id_verification_note?: string | null;
};

const DOC_TYPES: Array<{ value: NonNullable<ApiData['government_id_type']>, label: string }> = [
  { value: 'DRIVER_LICENSE', label: 'Driving license' },
  { value: 'VISA', label: 'Visa' },
  { value: 'AUS_PASSPORT', label: 'Australian Passport' },
  { value: 'OTHER_PASSPORT', label: 'Other Passport' },
  { value: 'AGE_PROOF', label: 'Age Proof Card' },
];
const AUS_STATES = ['ACT','NSW','NT','QLD','SA','TAS','VIC','WA'];

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (Congo-Brazzaville)","Costa Rica","Croatia","Cuba","Cyprus","Czechia","Democratic Republic of the Congo","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"
];

export default function IdentityV2() {
  const [data, setData] = React.useState<ApiData>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [snack, setSnack] = React.useState('');
  const [error, setError] = React.useState('');
  const [secondaryFile, setSecondaryFile] = React.useState<File | null>(null);
  const [meta, setMeta] = React.useState<Record<string, string>>({});
  const unsaved = useUnsavedChangesGuard({
    disabled: loading || saving,
    value: { data, file, meta, secondaryFile },
  });

  const getFileUrl = (path?: string | null) =>
    path ? (path.startsWith('http') ? path : `${API_BASE_URL}${path}`) : '';

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getOnboardingDetail('explorer');
        if (!mounted) return;
        const nextData = res as any;
        const nextMeta = (nextData.identity_meta as Record<string, string> | null) || {};
        setData(nextData);
        setMeta(nextMeta);
        unsaved.markClean({ data: nextData, file: null, meta: nextMeta, secondaryFile: null });
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const setField = (name: keyof ApiData, value: any) =>
    setData(prev => ({ ...prev, [name]: value }));
  React.useEffect(() => {
    setMeta((data.identity_meta as any) || {});
  }, [data.identity_meta]);

  const save = async (submitForVerification: boolean) => {
    setSaving(true); setSnack(''); setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'identity');
      if (submitForVerification) fd.append('submitted_for_verification', 'true');
      if (data.government_id_type != null) fd.append('government_id_type', String(data.government_id_type));
      if (file) fd.append('government_id', file);
      if (secondaryFile) fd.append('identity_secondary_file', secondaryFile);
      if (meta && Object.keys(meta).length > 0) {
        fd.append('identity_meta', JSON.stringify(meta));
      }

      const res = await updateOnboardingForm('explorer', fd);
      const nextData = res as any;
      const nextMeta = (nextData.identity_meta as Record<string, string> | null) || {};
      setData(nextData);
      setMeta(nextMeta);
      setFile(null);
      setSecondaryFile(null);
      unsaved.markClean({ data: nextData, file: null, meta: nextMeta, secondaryFile: null });
      setSnack(submitForVerification ? 'Submitted for verification.' : 'Saved.');
    } catch (e: any) {
      const resp = e?.response?.data;
      setError(
        resp && typeof resp === 'object'
          ? Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n')
          : (e?.message || 'Failed to save')
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>Loading...</Typography>;

  const VerifiedChip = ({ ok, label }: { ok?: boolean | null; label: string }) => {
    if (ok === true)   return <Chip icon={<CheckCircleOutlineIcon />} color="success" label={label} variant="outlined" />;
    if (ok === false)  return <Chip icon={<ErrorOutlineIcon />}   color="error"   label={label} variant="outlined" />;
    return               <Chip icon={<HourglassBottomIcon />}      label={label}               variant="outlined" />;
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
        Identity Document
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>
          {error}
        </Alert>
      )}

      {/* Top row: document type + primary upload */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr auto' },
          columnGap: 2,
          rowGap: 2,
          alignItems: 'center',
          mb: 2,
        }}
      >
        <TextField
          select
          fullWidth
          label="Document Type"
          value={data.government_id_type || ''}
          onChange={(e) => setField('government_id_type', e.target.value)}
        >
          {DOC_TYPES.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>

        <Button variant="outlined" size="small" component="label" sx={{ justifySelf: { sm: 'end' } }}>
          {file ? 'Change file' : data.government_id ? 'Replace file' : 'Upload file'}
          <input
            hidden
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Button>
      </Box>

      {/* DRIVER LICENSE: state + expiry */}
      {data.government_id_type === 'DRIVER_LICENSE' && (
        <Box
          sx={{
          width: '100%',
          display: 'grid',
          rowGap: 2,
          columnGap: 2,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          mt: 2,
          }}
        >
          <TextField
            select
            label="State/Territory"
            value={meta.state || ''}
            onChange={(e) => setMeta((m) => ({ ...m, state: e.target.value }))}
            fullWidth
          >
            {AUS_STATES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            type="date"
            label="Expiry date"
            InputLabelProps={{ shrink: true }}
            value={meta.expiry || ''}
            onChange={(e) => setMeta((m) => ({ ...m, expiry: e.target.value }))}
            fullWidth
          />
        </Box>
      )}

      {/* VISA: visa_type + valid_to + Overseas Passport upload + country + expiry */}
      {data.government_id_type === 'VISA' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 2 }}>
          <TextField
            label="Visa type/number"
            value={meta.visa_type_number || ''}
            onChange={(e) => setMeta((m) => ({ ...m, visa_type_number: e.target.value }))}
            fullWidth
          />

          <TextField
            type="date"
            label="Valid to"
            InputLabelProps={{ shrink: true }}
            value={meta.valid_to || ''}
            onChange={(e) => setMeta((m) => ({ ...m, valid_to: e.target.value }))}
            fullWidth
          />

          <TextField
            select
            label="Country"
            value={meta.country || ''}
            onChange={(e) => setMeta((m) => ({ ...m, country: e.target.value }))}
            fullWidth
          >
            {COUNTRIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            type="date"
            label="Passport expiry"
            InputLabelProps={{ shrink: true }}
            value={meta.passport_expiry || ''}
            onChange={(e) => setMeta((m) => ({ ...m, passport_expiry: e.target.value }))}
            fullWidth
          />

          <TextField
            select
            label="Passport Country"
            value={meta.passport_country || ''}
            onChange={(e) => setMeta((m) => ({ ...m, passport_country: e.target.value }))}
            fullWidth
          >
            {COUNTRIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>

          <Button variant="outlined" size="small" component="label" sx={{ justifySelf: { sm: 'end' } }}>
            {secondaryFile ? 'Change file' : data.identity_secondary_file ? 'Replace file' : 'Upload file'}
            <input
              hidden
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setSecondaryFile(e.target.files?.[0] || null)}
            />
          </Button>
        </Box>
      )}

      {/* Secondary upload + Metadata for other passport */}
      {data.government_id_type === 'OTHER_PASSPORT' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 2 }}>
          <Button variant="outlined" size="small" component="label">
            {secondaryFile ? 'Change file' : data.identity_secondary_file ? 'Replace file' : 'Upload passport'}
            <input
              hidden
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setSecondaryFile(e.target.files?.[0] || null)}
            />
          </Button>

          <TextField
            select
            label="Passport Country"
            value={meta.passport_country || ''}
            onChange={(e) => setMeta((m) => ({ ...m, passport_country: e.target.value }))}
            fullWidth
          >
            {COUNTRIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            type="date"
            label="Passport expiry"
            InputLabelProps={{ shrink: true }}
            value={meta.passport_expiry || ''}
            onChange={(e) => setMeta((m) => ({ ...m, passport_expiry: e.target.value }))}
            fullWidth
          />
        </Box>
      )}

      {/* Status chips */}
      <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
        <VerifiedChip ok={data.gov_id_verified} label="Government ID" />
        {data.gov_id_verification_note && (
          <Chip icon={<ErrorOutlineIcon />} color="warning" label={data.gov_id_verification_note} variant="outlined" />
        )}
      </Box>

      {/* Action buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {data.government_id && (
            <Link href={getFileUrl(data.government_id)} target="_blank" rel="noopener">
              Download current ID
            </Link>
          )}
          {data.identity_secondary_file && (
            <Link href={getFileUrl(data.identity_secondary_file)} target="_blank" rel="noopener">
              Download secondary file
            </Link>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" disabled={saving} onClick={() => save(false)}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="contained" disabled={saving} onClick={() => save(true)}>
            {saving ? 'Submitting...' : 'Submit & Verify'}
          </Button>
        </Box>
      </Box>

      <Snackbar open={!!snack} autoHideDuration={2400} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
