// src/pages/onboardingV2/RatesV2.tsx
import * as React from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  FormControlLabel,
  Checkbox,
  Button,
  Alert,
  Snackbar,
  CircularProgress,
  Stack,
} from '@mui/material';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';

type RatePref = {
  weekday: string;
  saturday: string;
  sunday: string;
  public_holiday: string;
  early_morning: string;
  late_night: string;
  early_morning_same_as_day?: boolean;
  late_night_same_as_day?: boolean;
};

type ApiData = {
  rate_preference?: RatePref | null;
};

const emptyRates: RatePref = {
  weekday: '',
  saturday: '',
  sunday: '',
  public_holiday: '',
  early_morning: '',
  late_night: '',
  early_morning_same_as_day: false,
  late_night_same_as_day: false,
};

export default function RatesV2() {
  // Keep the same detail endpoint style used in your V2 tabs
  const roleKey = 'pharmacist';

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [snack, setSnack] = React.useState('');

  const [rates, setRates] = React.useState<RatePref>(emptyRates);
  const unsaved = useUnsavedChangesGuard({
    disabled: loading || saving,
    value: rates,
  });

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        const d: ApiData = (res as any) || {};
        const nextRates = { ...emptyRates, ...(d.rate_preference || {}) };
        setRates(nextRates);
        unsaved.markClean(nextRates);
      } catch (e: any) {
        setError(e.response?.data?.detail || e.message || 'Failed to load rates');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [roleKey]);

  // keep string values (legacy pattern), strip non-numeric except "."
  const setField = (k: keyof RatePref) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^\d.]/g, '');
    setRates(prev => ({ ...prev, [k]: v }));
  };

  const toggle = (k: keyof RatePref) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRates(prev => ({ ...prev, [k]: e.target.checked }));

  const save = async () => {
    setSaving(true);
    setError('');
    setSnack('');
    try {
      const form = new FormData();
      form.append('tab', 'rate');
      form.append('rate_preference', JSON.stringify(rates));

      const res = await updateOnboardingForm(roleKey, form);

      const d: ApiData = (res as any) || {};
      const nextRates = { ...emptyRates, ...(d.rate_preference || {}) };
      setRates(nextRates);
      unsaved.markClean(nextRates);
      setSnack('Rates saved.');
    } catch (e: any) {
      const resp = e.response?.data;
      setError(
        resp && typeof resp === 'object'
          ? Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n')
          : e.message
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>Loading…</Typography>;

  return (
    <Box sx={{ width: '100%', maxWidth: 960, px: { xs: 2, md: 3 }, pb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
        Rates
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>{error}</Alert>}

      <Alert severity="info" sx={{ mb: 2 }}>
        Enter your hourly rates. Early morning is <b>&lt; 8:00 am</b>. Late night is <b>&gt; 7:00 pm</b>.
        Tick “same as day” to automatically use the day’s rate for those times.
      </Alert>

      {/* Base day rates — keep simple, column layout for mobile */}
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <TextField
          fullWidth
          margin="normal"
          label="Weekday"
          value={rates.weekday || ''}
          onChange={setField('weekday')}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Saturday"
          value={rates.saturday || ''}
          onChange={setField('saturday')}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Sunday"
          value={rates.sunday || ''}
          onChange={setField('sunday')}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Public Holiday"
          value={rates.public_holiday || ''}
          onChange={setField('public_holiday')}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
        />
      </Box>

      {/* Early / Late section */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Early & Late
        </Typography>

        {/* Use Stacks to avoid Grid and keep mobile-first */}
        <Stack spacing={1.5}>
          <Box>
            <TextField
              fullWidth
              margin="normal"
              label="Early Morning (< 8 am)"
              value={rates.early_morning || ''}
              onChange={setField('early_morning')}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              disabled={!!rates.early_morning_same_as_day}
              helperText={
                rates.early_morning_same_as_day
                  ? 'Using day rate automatically'
                  : 'Specific early morning rate'
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!rates.early_morning_same_as_day}
                  onChange={toggle('early_morning_same_as_day')}
                />
              }
              label="Early Morning: same as day"
            />
          </Box>

          <Box>
            <TextField
              fullWidth
              margin="normal"
              label="Late Night (> 7 pm)"
              value={rates.late_night || ''}
              onChange={setField('late_night')}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              disabled={!!rates.late_night_same_as_day}
              helperText={
                rates.late_night_same_as_day
                  ? 'Using day rate automatically'
                  : 'Specific late night rate'
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!rates.late_night_same_as_day}
                  onChange={toggle('late_night_same_as_day')}
                />
              }
              label="Late Night: same as day"
            />
          </Box>
        </Stack>
      </Box>

      <Box sx={{ mt: 2 }}>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? (<><CircularProgress size={18} sx={{ mr: 1 }} />Saving…</>) : 'Save Rates'}
        </Button>
      </Box>

      <Snackbar open={!!snack} autoHideDuration={2400} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
