// src/pages/onboardingV2/RefereesV2.tsx
import * as React from 'react';
import {
  Box, Paper, Stack, Typography, TextField, Button, Snackbar, Alert, Chip, MenuItem, Tooltip
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
  // referee 1
  referee1_name?: string | null;
  referee1_relation?: string | null;
  referee1_workplace?: string | null;
  referee1_email?: string | null;
  referee1_confirmed?: boolean | null;
  referee1_rejected?: boolean | null;
  referee1_last_sent?: string | null;

  // referee 2
  referee2_name?: string | null;
  referee2_relation?: string | null;
  referee2_workplace?: string | null;
  referee2_email?: string | null;
  referee2_confirmed?: boolean | null;
  referee2_rejected?: boolean | null;
  referee2_last_sent?: string | null;
};

const REL_CHOICES = [
  { value: 'manager',    label: 'Manager' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'colleague',  label: 'Colleague' },
  { value: 'owner',      label: 'Owner' },
  { value: 'other',      label: 'Other' },
];

function StatusChip({
  confirmed, rejected, label,
}: { confirmed?: boolean | null; rejected?: boolean | null; label: string }) {
  if (confirmed) {
    return <Chip icon={<CheckCircleOutlineIcon />} color="success" label={`${label}: Accepted`} variant="outlined" />;
  }
  if (rejected) {
    return <Chip icon={<ErrorOutlineIcon />} color="error" label={`${label}: Declined`} variant="outlined" />;
  }
  return <Chip icon={<HourglassBottomIcon />} label={`${label}: Pending`} variant="outlined" />;
}

export default function RefereesV2() {
  const roleKey = 'explorer';

  const [data, setData] = React.useState<ApiData>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [snack, setSnack] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');
  const unsaved = useUnsavedChangesGuard({
    disabled: loading || saving,
    value: data,
  });

  // ---------- load ----------
  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getOnboardingDetail(roleKey);
      const nextData = (res as any) || {};
      setData(nextData);
      unsaved.markClean(nextData);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [roleKey]);

  React.useEffect(() => { load(); }, [load]);

  const setRefField = (idx: 1 | 2, key: 'name'|'relation'|'workplace'|'email', value: any) => {
    setData(prev => ({ ...prev, [`referee${idx}_${key}`]: value }));
  };

  const canSend = () => {
    const required1 = Boolean(data.referee1_name && data.referee1_relation && data.referee1_workplace && data.referee1_email);
    const required2 = Boolean(data.referee2_name && data.referee2_relation && data.referee2_workplace && data.referee2_email);
    return required1 && required2;
  };

  // ---------- actions ----------
  const saveOnly = async () => {
    setSaving(true); setSnack(''); setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'referees');

      // send all current values (backend ignores locked/confirmed fields anyway)
      ([
        'referee1_name','referee1_relation','referee1_workplace','referee1_email',
        'referee2_name','referee2_relation','referee2_workplace','referee2_email',
      ] as const).forEach(k => {
        const v = (data as any)[k];
        if (v !== undefined && v !== null) fd.append(k, String(v));
      });

      const res = await updateOnboardingForm(roleKey, fd);
      const nextData = (res as any) || {};
      setData(nextData);
      unsaved.markClean(nextData);
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

  const sendOrResend = async () => {
    setSaving(true); setSnack(''); setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'referees');
      fd.append('submitted_for_verification', 'true'); // triggers email send on backend

      ([
        'referee1_name','referee1_relation','referee1_workplace','referee1_email',
        'referee2_name','referee2_relation','referee2_workplace','referee2_email',
      ] as const).forEach(k => {
        const v = (data as any)[k];
        if (v !== undefined && v !== null) fd.append(k, String(v));
      });

      const res = await updateOnboardingForm(roleKey, fd);
      const nextData = (res as any) || {};
      setData(nextData);
      unsaved.markClean(nextData);
      setSnack('Reference emails sent.');
      // optional: small refresh delay, in case last_sent is updated async
      setTimeout(load, 900);
    } catch (e: any) {
      const resp = e?.response?.data;
      setError(
        resp && typeof resp === 'object'
          ? Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n')
          : e.message || 'Failed to send requests'
      );
    } finally {
      setSaving(false);
    }
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '';
    const dt = dayjs.utc(iso);
    return dt.isValid() ? dt.local().toDate().toLocaleString() : (iso as string);
  };

  if (loading) return <Typography>Loading…</Typography>;

  return (
    <Box sx={{ width: '100%', maxWidth: 960, px: { xs: 2, md: 3 }, pb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Referees</Typography>

      {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>{error}</Alert>}

      {/* Referee 1 */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" fontWeight={700}>Referee 1</Typography>
          <StatusChip confirmed={data.referee1_confirmed} rejected={data.referee1_rejected} label="Status" />
          {data.referee1_last_sent && (
            <Tooltip title="Last email sent">
              <Typography variant="body2" color="text.secondary" sx={{ ml: .5 }}>
                • Last sent: {formatDateTime(data.referee1_last_sent)}
              </Typography>
            </Tooltip>
          )}
        </Stack>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Full Name"
            value={data.referee1_name || ''}
            onChange={e => setRefField(1, 'name', e.target.value)}
            disabled={Boolean(data.referee1_confirmed)}
            sx={{ flex: '2 1 280px', minWidth: 240, maxWidth: 520 }}
          />
          <TextField
            select
            label="Relationship"
            value={data.referee1_relation || ''}
            onChange={e => setRefField(1, 'relation', e.target.value)}
            disabled={Boolean(data.referee1_confirmed)}
            sx={{ flex: '1 1 200px', minWidth: 180, maxWidth: 260 }}
          >
            {REL_CHOICES.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
          </TextField>
          <TextField
            label="Workplace"
            value={data.referee1_workplace || ''}
            onChange={e => setRefField(1, 'workplace', e.target.value)}
            disabled={Boolean(data.referee1_confirmed)}
            sx={{ flex: '1 1 240px', minWidth: 200, maxWidth: 320 }}
          />
          <TextField
            label="Email"
            value={data.referee1_email || ''}
            onChange={e => setRefField(1, 'email', e.target.value)}
            disabled={Boolean(data.referee1_confirmed)}
            sx={{ flex: '1 1 240px', minWidth: 200, maxWidth: 320 }}
          />
        </Box>
      </Paper>

      {/* Referee 2 */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" fontWeight={700}>Referee 2</Typography>
          <StatusChip confirmed={data.referee2_confirmed} rejected={data.referee2_rejected} label="Status" />
          {data.referee2_last_sent && (
            <Tooltip title="Last email sent">
              <Typography variant="body2" color="text.secondary" sx={{ ml: .5 }}>
                • Last sent: {formatDateTime(data.referee2_last_sent)}
              </Typography>
            </Tooltip>
          )}
        </Stack>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Full Name"
            value={data.referee2_name || ''}
            onChange={e => setRefField(2, 'name', e.target.value)}
            disabled={Boolean(data.referee2_confirmed)}
            sx={{ flex: '2 1 280px', minWidth: 240, maxWidth: 520 }}
          />
          <TextField
            select
            label="Relationship"
            value={data.referee2_relation || ''}
            onChange={e => setRefField(2, 'relation', e.target.value)}
            disabled={Boolean(data.referee2_confirmed)}
            sx={{ flex: '1 1 200px', minWidth: 180, maxWidth: 260 }}
          >
            {REL_CHOICES.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
          </TextField>
          <TextField
            label="Workplace"
            value={data.referee2_workplace || ''}
            onChange={e => setRefField(2, 'workplace', e.target.value)}
            disabled={Boolean(data.referee2_confirmed)}
            sx={{ flex: '1 1 240px', minWidth: 200, maxWidth: 320 }}
          />
          <TextField
            label="Email"
            value={data.referee2_email || ''}
            onChange={e => setRefField(2, 'email', e.target.value)}
            disabled={Boolean(data.referee2_confirmed)}
            sx={{ flex: '1 1 240px', minWidth: 200, maxWidth: 320 }}
          />
        </Box>
      </Paper>

      {/* Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, flexWrap: 'wrap', gap: 1.5 }}>
        <Button variant="outlined" disabled={saving} onClick={saveOnly}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="contained"
          disabled={saving || !canSend()}
          onClick={sendOrResend}
        >
          {saving ? 'Sending…' : 'Send / Resend Requests'}
        </Button>
      </Box>

      <Snackbar open={!!snack} autoHideDuration={2400} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
