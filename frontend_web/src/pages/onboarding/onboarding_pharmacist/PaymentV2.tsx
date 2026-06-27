// src/pages/onboardingV2/PaymentV2.tsx
import * as React from 'react';
import {
  Box, Stack, Typography, TextField, Button, RadioGroup, FormControlLabel, Radio,
  Switch, Chip, Divider, Snackbar, Alert, CircularProgress, Skeleton
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';

import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';

dayjs.extend(utc);

type ApiData = {
  // server basics
  payment_preference?: 'ABN' | 'TFN' | string;

  // TFN (server stores raw as tfn_number; we read masked only)
  tfn_masked?: string | null;

  // Super (always required for TFN; optional for ABN)
  super_fund_name?: string | null;
  super_usi?: string | null;
  super_member_number?: string | null;

  // ABN input
  abn?: string | null;

  // ABR scraped readbacks
  abn_entity_name?: string | null;
  abn_entity_type?: string | null;
  abn_status?: string | null;
  abn_gst_registered?: boolean | null;
  abn_gst_from?: string | null; // ISO date from serializer
  abn_gst_to?: string | null;   // ISO date from serializer
  abn_last_checked?: string | null;

  // verification flags
  abn_verified?: boolean | null;
  abn_verification_note?: string | null;
  abn_entity_confirmed?: boolean | null;
};

const prettyDate = (d?: string | null) => {
  if (!d) return '';
  const dt = dayjs.utc(d);
  if (!dt.isValid()) return d;
  return dt.local().toDate().toLocaleDateString();
};

// digits-only helper (used by ABN/TFN validation & payload)
const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');


export default function PaymentV2() {
  const roleKey = 'pharmacist';

  const [data, setData] = React.useState<ApiData>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [checkingABN, setCheckingABN] = React.useState(false);
  const [snack, setSnack] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');

  // local inputs (so we never show raw TFN from server)
  const [tfnInput, setTfnInput] = React.useState('');
  const [abnInput, setAbnInput] = React.useState('');
  const [showSuperABN, setShowSuperABN] = React.useState(false); // ABN-only toggle
  const unsaved = useUnsavedChangesGuard({
    disabled: loading || saving || checkingABN,
    value: { abnInput, data, showSuperABN, tfnInput },
  });

  // ---- local derived validation state ----
  const abnDigits = React.useMemo(() => onlyDigits(abnInput), [abnInput]);
  const abnValid  = abnDigits.length === 11;
  const abnError  = (data.payment_preference || '').toUpperCase() === 'ABN' && abnInput.length > 0 && !abnValid;

  const tfnDigits = React.useMemo(() => onlyDigits(tfnInput), [tfnInput]);
  // TFN is usually 9 digits; some older TFNs are 8. Allow 8 or 9.
  const tfnValid  = tfnDigits.length === 9 || tfnDigits.length === 8;
  const tfnError  = (data.payment_preference || '').toUpperCase() === 'TFN' && tfnInput.length > 0 && !tfnValid;

  const isTFN = (data.payment_preference || '').toUpperCase() === 'TFN';
  const isABN = (data.payment_preference || '').toUpperCase() === 'ABN';

  // ---------- load ----------
  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getOnboardingDetail(roleKey);
      const d: ApiData = (res as any) || {};
      setData(d);
      let nextData = d;

      // preselect preference if empty
      const pref = (d.payment_preference || '').toUpperCase();
      if (!pref) {
        if (d.tfn_masked || d.super_fund_name || d.super_usi || d.super_member_number) {
          nextData = { ...d, payment_preference: 'TFN' };
          setData(nextData);
        } else if (d.abn) {
          nextData = { ...d, payment_preference: 'ABN' };
          setData(nextData);
        } else {
          nextData = { ...d, payment_preference: 'TFN' };
          setData(nextData);
        }
      }

      // set ABN input from server value
      setAbnInput(d.abn || '');

      // show super section for TFN; ABN depends on toggle
      const nextShowSuperABN = Boolean(d.super_fund_name || d.super_usi || d.super_member_number);
      setShowSuperABN(nextShowSuperABN);
      unsaved.markClean({
        abnInput: d.abn || '',
        data: nextData,
        showSuperABN: nextShowSuperABN,
        tfnInput: '',
      });
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [roleKey]);

  React.useEffect(() => { load(); }, [load]);

  const setField = (name: keyof ApiData, value: any) =>
    setData(prev => ({ ...prev, [name]: value }));

  // ---------- helpers ----------
  const renderABNChip = () => {
    if (data.abn_verified) {
      return <Chip icon={<CheckCircleOutlineIcon />} color="success" label="ABN verified" variant="outlined" />;
    }
    if (!data.abn_entity_name && data.abn_verification_note) {
      return <Chip icon={<ErrorOutlineIcon />} color="error" label="ABN – invalid/unavailable" variant="outlined" />;
    }
    if (data.abn_entity_name || data.abn_verification_note) {
      return <Chip icon={<HourglassBottomIcon />} label="ABN – awaiting confirmation" variant="outlined" />;
    }
    return <Chip icon={<ErrorOutlineIcon />} color="default" label="ABN – not checked" variant="outlined" />;
  };

  const abrBullets = () => {
    if (checkingABN) {
      return (
        <Box sx={{ mt: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: .75 }}>ABN details (from ABR)</Typography>
          <Skeleton variant="text" width="72%" height={28} />
          <Skeleton variant="text" width="56%" height={28} />
          <Skeleton variant="text" width="64%" height={28} />
          <Skeleton variant="rectangular" height={44} sx={{ mt: 1, borderRadius: 1 }} />
        </Box>
      );
    }

    const hasAny =
      !!data.abn_entity_name ||
      !!data.abn_status ||
      !!data.abn_entity_type ||
      data.abn_gst_registered !== null;

    if (!hasAny && data.abn_verification_note) {
      return (
        <Alert severity="error">
          We couldn’t verify this ABN. Reason: {data.abn_verification_note}
        </Alert>
      );
    }

    if (!hasAny) return null;

    return (
      <Box sx={{ mt: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: .5 }}>ABN details (from ABR)</Typography>
        <Box component="ul" sx={{ pl: 2, m: 0, color: 'text.secondary' }}>
          {data.abn_entity_name ? <li><b>Entity name:</b> {data.abn_entity_name}</li> : null}
          {data.abn_entity_type ? <li><b>Entity type:</b> {data.abn_entity_type}</li> : null}
          {data.abn_status ? <li><b>ABN status:</b> {data.abn_status}</li> : null}
          <li>
            <b>GST registered (ABR):</b>{' '}
            {data.abn_gst_registered == null ? '—' : (data.abn_gst_registered ? 'Yes' : 'No')}
            {data.abn_gst_registered ? (
              <>
                {' '}• <b>From:</b> {prettyDate(data.abn_gst_from) || '—'}
              </>
            ) : null}
          </li>
          {data.abn_last_checked ? <li><b>Last checked:</b> {dayjs.utc(data.abn_last_checked).local().toDate().toLocaleString()}</li> : null}
        </Box>
        {data.abn_verification_note && (
          <Alert severity="info" sx={{ mt: 1 }}>{data.abn_verification_note}</Alert>
        )}
      </Box>
    );
  };

  // ---------- actions ----------
  const saveTFNAndSuper = async () => {
    setSaving(true); setSnack(''); setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'payment');
      fd.append('payment_preference', 'TFN');
      if (tfnInput) fd.append('tfn', tfnInput); // write-only
      if (data.super_fund_name != null)   fd.append('super_fund_name', String(data.super_fund_name));
      if (data.super_usi != null)         fd.append('super_usi', String(data.super_usi));
      if (data.super_member_number != null) fd.append('super_member_number', String(data.super_member_number));
      // enforce server-side too by sending submitted_for_verification to run validations
      fd.append('submitted_for_verification', 'true');

      const res = await updateOnboardingForm(roleKey, fd);
      const nextData = res as any;
      setData(nextData);
      setTfnInput(''); // do not persist raw TFN in UI
      unsaved.markClean({
        abnInput,
        data: nextData,
        showSuperABN,
        tfnInput: '',
      });
      setSnack('TFN & Super saved.');
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

  const saveABNAndOptionalSuper = async () => {
    setSaving(true); setSnack(''); setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'payment');
      fd.append('payment_preference', 'ABN');
      fd.append('abn', abnInput.trim());
      if (data.super_fund_name != null)     fd.append('super_fund_name', String(data.super_fund_name));
      if (data.super_usi != null)           fd.append('super_usi', String(data.super_usi));
      if (data.super_member_number != null) fd.append('super_member_number', String(data.super_member_number));

      const res = await updateOnboardingForm(roleKey, fd);
      const nextData = res as any;
      setData(nextData);
      unsaved.markClean({
        abnInput,
        data: nextData,
        showSuperABN,
        tfnInput,
      });
      setSnack('Saved.');
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

  // Runs the server task to scrape ABR
  const checkABN = async () => {
    setCheckingABN(true); setSnack(''); setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'payment');
      fd.append('payment_preference', 'ABN');
      fd.append('abn', abnInput.trim());
      fd.append('submitted_for_verification', 'true'); // trigger scrape task

      const res = await updateOnboardingForm(roleKey, fd);
      const nextData = res as any;
      setData(nextData);
      unsaved.markClean({
        abnInput,
        data: nextData,
        showSuperABN,
        tfnInput,
      });
      setSnack('ABN check queued. Refreshing…');
      // small refetch loop to pull results (simple & pragmatic)
      setTimeout(load, 1200);
    } catch (e: any) {
      const resp = e.response?.data;
      setError(
        resp && typeof resp === 'object'
          ? Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n')
          : e.message
      );
    } finally {
      setCheckingABN(false);
    }
  };

  // User confirms the scraped ABR data is theirs -> only then backend sets abn_verified
  const confirmABN = async () => {
    setSaving(true); setSnack(''); setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'payment');
      fd.append('payment_preference', 'ABN');
      fd.append('abn_entity_confirmed', 'true');

      const res = await updateOnboardingForm(roleKey, fd);
      const nextData = res as any;
      setData(nextData);
      unsaved.markClean({
        abnInput,
        data: nextData,
        showSuperABN,
        tfnInput,
      });
      setSnack('ABN confirmed.');
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
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Payment</Typography>

      {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>{error}</Alert>}

      {/* preference */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: .5 }}>Choose your payment method</Typography>
        <RadioGroup
          row
          value={(data.payment_preference || '').toUpperCase() || 'TFN'}
          onChange={(_, v) => setField('payment_preference', v as any)}
        >
          <FormControlLabel value="TFN" control={<Radio />} label="TFN (Payslip)" />
          <FormControlLabel value="ABN" control={<Radio />} label="ABN (Contractor)" />
        </RadioGroup>
      </Box>

      {/* TFN PATH */}
      {isTFN && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField
              label="TFN"
              value={tfnInput}
              onChange={e => setTfnInput(e.target.value)}
              placeholder={data.tfn_masked || 'Enter your TFN'}
              error={tfnError}
              helperText={
                tfnError
                  ? 'TFN must be 9 digits (some older TFNs are 8).'
                  : (data.tfn_masked ? `Stored as: ${data.tfn_masked} (server masks on read)` : ' ')
              }
              sx={{ flex: 1, minWidth: 260, maxWidth: 460 }}
            />
          </Stack>

          <Divider />

          {/* Super (required) */}
          <Typography variant="subtitle2">Super details (required for TFN)</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <TextField
              label="Super Fund Name *"
              value={data.super_fund_name || ''}
              onChange={e => setField('super_fund_name', e.target.value)}
              sx={{ flex: 1, minWidth: 240, maxWidth: 420 }}
            />
            <TextField
              label="USI *"
              value={data.super_usi || ''}
              onChange={e => setField('super_usi', e.target.value)}
              sx={{ flex: 1, minWidth: 180, maxWidth: 320 }}
            />
            <TextField
              label="Member Number *"
              value={data.super_member_number || ''}
              onChange={e => setField('super_member_number', e.target.value)}
              sx={{ flex: 1, minWidth: 200, maxWidth: 320 }}
            />
          </Box>

          <Stack direction="row" spacing={1.5} sx={{ pt: .5 }}>
            <Button
              variant="contained"
              disabled={saving || (!tfnInput && !data.tfn_masked) || !(data.super_fund_name && data.super_usi && data.super_member_number)}
              onClick={saveTFNAndSuper}
            >
              {saving ? 'Saving…' : 'Save TFN & Super'}
            </Button>
          </Stack>
        </Stack>
      )}

      {/* ABN PATH */}
      {isABN && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="ABN"
              value={abnInput}
              onChange={e => setAbnInput(e.target.value)}
              error={abnError}
              helperText={abnError ? 'ABN must be 11 digits.' : ' '}
              sx={{ flex: 1, minWidth: 260, maxWidth: 420 }}
            />
            <Button variant="outlined" onClick={checkABN} disabled={checkingABN || !abnInput.trim()}>
              {checkingABN ? <><CircularProgress size={18} sx={{ mr: 1 }} />Checking…</> : 'Check ABN'}
            </Button>
            {renderABNChip()}
          </Stack>

          {/* ABR results */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.5, bgcolor: 'background.paper' }}>
            {abrBullets()}
            <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
              <Button
                variant="contained"
                color="success"
                onClick={confirmABN}
                disabled={
                  saving ||
                  !data.abn_entity_name ||           // nothing scraped yet
                  !!data.abn_verified                // already confirmed
                }
              >
                {saving ? 'Confirming…' : (data.abn_verified ? 'Confirmed' : 'Confirm this ABN')}
              </Button>
            </Stack>
          </Box>

          {/* Optional super for ABN */}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Switch checked={showSuperABN} onChange={e => setShowSuperABN(e.target.checked)} />
            <Typography variant="body2">Add Super details</Typography>
          </Stack>
          {showSuperABN && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <TextField
                label="Super Fund Name"
                value={data.super_fund_name || ''}
                onChange={e => setField('super_fund_name', e.target.value)}
                sx={{ flex: 1, minWidth: 240, maxWidth: 420 }}
              />
              <TextField
                label="USI"
                value={data.super_usi || ''}
                onChange={e => setField('super_usi', e.target.value)}
                sx={{ flex: 1, minWidth: 180, maxWidth: 320 }}
              />
              <TextField
                label="Member Number"
                value={data.super_member_number || ''}
                onChange={e => setField('super_member_number', e.target.value)}
                sx={{ flex: 1, minWidth: 200, maxWidth: 320 }}
              />
            </Box>
          )}

          <Stack direction="row" spacing={1.5} sx={{ pt: .5 }}>
            <Button
              variant="outlined"
              disabled={saving || !abnInput.trim()}
              onClick={saveABNAndOptionalSuper}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Stack>
        </Stack>
      )}

      <Snackbar open={!!snack} autoHideDuration={2400} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
