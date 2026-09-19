import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, InputLabel, Link, MenuItem, Paper, Select, Stack,
  TextField, Typography,
} from '@mui/material';
import {
  createEmploymentEngagement, listEmploymentEngagements,
  previewEmploymentEngagementAward, updateEmploymentEngagement,
} from './api';

type StaffRow = { membership_id: number; worker_name: string; role: string; employment_type: string };
type Props = { pharmacyId: number; staff: StaffRow[] };

const CLASSIFICATIONS: Record<string, Array<{ value: string; label: string }>> = {
  PHARMACIST: [
    { value: 'PHARMACIST', label: 'Pharmacist' },
    { value: 'EXPERIENCED_PHARMACIST', label: 'Experienced Pharmacist' },
    { value: 'PHARMACIST_IN_CHARGE', label: 'Pharmacist in charge' },
    { value: 'PHARMACIST_MANAGER', label: 'Pharmacist manager' },
  ],
  INTERN: [
    { value: 'FIRST_HALF', label: '1st half of training' },
    { value: 'SECOND_HALF', label: '2nd half of training' },
  ],
  STUDENT: [
    { value: 'YEAR_1', label: '1st year' }, { value: 'YEAR_2', label: '2nd year' },
    { value: 'YEAR_3', label: '3rd year' }, { value: 'YEAR_4', label: '4th year' },
  ],
  ASSISTANT: [
    { value: 'LEVEL_1', label: 'Level 1' }, { value: 'LEVEL_2', label: 'Level 2' },
    { value: 'LEVEL_3', label: 'Level 3' }, { value: 'LEVEL_4', label: 'Level 4' },
  ],
  TECHNICIAN: [
    { value: 'LEVEL_1', label: 'Level 1' }, { value: 'LEVEL_2', label: 'Level 2' },
    { value: 'LEVEL_3', label: 'Level 3' }, { value: 'LEVEL_4', label: 'Level 4' },
  ],
};

const isoToday = () => new Date().toISOString().slice(0, 10);
const blankForm: any = {
  public_id: '', membership_id: 0, worker_name: '', role: '', employment_type: 'FULL_TIME',
  effective_from: isoToday(), effective_to: '', job_title: '', pay_basis: 'AWARD',
  award_classification: '', award_source_label: '', award_source_url: '', award_effective_from: '',
  rate_weekday: '', rate_saturday: '', rate_sunday: '', rate_public_holiday: '',
  rate_early_morning: '', rate_late_night: '', early_morning_applicable: false,
  late_night_applicable: false, notes: '',
};

export default function EmploymentEngagementsPanel({ pharmacyId, staff }: Props) {
  const [engagements, setEngagements] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blankForm);
  const [loadingAward, setLoadingAward] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setEngagements(await listEmploymentEngagements(pharmacyId)); }
    catch (err: any) { setError(err?.message || 'Unable to load employment engagements.'); }
  }, [pharmacyId]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<number, any[]>();
    engagements.forEach((row) => map.set(Number(row.membership_id), [...(map.get(Number(row.membership_id)) || []), row]));
    return map;
  }, [engagements]);

  const previewAward = async (next: any) => {
    if (!next.membership_id || next.pay_basis !== 'AWARD' || !next.award_classification) return;
    setLoadingAward(true);
    setError('');
    try {
      const preview: any = await previewEmploymentEngagementAward({
        membership_id: Number(next.membership_id),
        employment_type: next.employment_type,
        award_classification: next.award_classification,
      });
      setForm((current: any) => ({
        ...current,
        award_source_label: preview.award_source_label,
        award_source_url: preview.award_source_url,
        award_effective_from: preview.award_effective_from,
        rate_weekday: preview.rate_weekday,
        rate_saturday: preview.rate_saturday,
        rate_sunday: preview.rate_sunday,
        rate_public_holiday: preview.rate_public_holiday,
        rate_early_morning: preview.rate_early_morning,
        rate_late_night: preview.rate_late_night,
        early_morning_applicable: preview.early_morning_applicable,
        late_night_applicable: preview.late_night_applicable,
      }));
    } catch (err: any) {
      setError(err?.message || 'Unable to resolve the selected award classification.');
    } finally { setLoadingAward(false); }
  };

  const startNew = (worker: StaffRow) => {
    const classification = CLASSIFICATIONS[worker.role]?.[0]?.value || '';
    const next = {
      ...blankForm,
      membership_id: worker.membership_id,
      worker_name: worker.worker_name,
      role: worker.role,
      employment_type: ['FULL_TIME', 'PART_TIME', 'CASUAL'].includes(worker.employment_type) ? worker.employment_type : 'CASUAL',
      award_classification: classification,
      effective_from: isoToday(),
    };
    setForm(next);
    setOpen(true);
    void previewAward(next);
  };

  const startEdit = (row: any) => {
    setForm({ ...blankForm, ...row, effective_to: row.effective_to || '', rate_early_morning: row.rate_early_morning || '', rate_late_night: row.rate_late_night || '' });
    setOpen(true);
  };

  const setAndPreview = (patch: any) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (next.pay_basis === 'AWARD') void previewAward(next);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        membership_id: Number(form.membership_id),
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        employment_type: form.employment_type,
        job_title: form.job_title,
        pay_basis: form.pay_basis,
        award_classification: form.award_classification,
        notes: form.notes,
      };
      if (form.pay_basis === 'ABOVE_AWARD') {
        Object.assign(payload, {
          rate_weekday: form.rate_weekday, rate_saturday: form.rate_saturday,
          rate_sunday: form.rate_sunday, rate_public_holiday: form.rate_public_holiday,
          early_morning_applicable: Boolean(form.early_morning_applicable),
          late_night_applicable: Boolean(form.late_night_applicable),
          rate_early_morning: form.early_morning_applicable ? form.rate_early_morning : null,
          rate_late_night: form.late_night_applicable ? form.rate_late_night : null,
        });
      }
      if (form.public_id) await updateEmploymentEngagement(form.public_id, payload);
      else await createEmploymentEngagement(payload);
      setOpen(false);
      await load();
    } catch (err: any) { setError(err?.message || 'Unable to save employment engagement.'); }
    finally { setSaving(false); }
  };

  const rateField = (key: string, label: string, disabled = false) => (
    <TextField
      size="small" type="number" label={label} value={form[key] || ''} disabled={disabled}
      onChange={(e) => setForm((current: any) => ({ ...current, [key]: e.target.value }))}
      InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>{'$'}</Typography> }}
    />
  );

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Membership stays the stable worker-at-pharmacy identity. Engagements are dated role/pay agreements, so new terms do not rewrite historical payroll terms.
      </Alert>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {staff.map((worker) => {
        const rows = grouped.get(worker.membership_id) || [];
        return (
          <Paper key={worker.membership_id} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                <Box>
                  <Typography fontWeight={900}>{worker.worker_name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {worker.role.replaceAll('_', ' ')} · membership #{worker.membership_id}
                  </Typography>
                </Box>
                <Button variant="contained" onClick={() => startNew(worker)}>New engagement</Button>
              </Stack>
              {!rows.length && <Typography variant="body2" color="text.secondary">No dated employment engagement recorded yet.</Typography>}
              {rows.map((row) => (
                <Paper key={row.public_id} variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ md: 'center' }}>
                    <Box flex={1}>
                      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
                        <Chip size="small" label={row.pay_basis === 'AWARD' ? 'Award' : 'Above award'} color={row.pay_basis === 'AWARD' ? 'primary' : 'success'} />
                        <Typography fontWeight={800}>{String(row.award_classification || row.role).replaceAll('_', ' ')}</Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {row.effective_from} → {row.effective_to || 'Current'} · Weekday {'$'}{row.rate_weekday}/hr · Sat {'$'}{row.rate_saturday}/hr · Sun {'$'}{row.rate_sunday}/hr · Public holiday {'$'}{row.rate_public_holiday}/hr
                      </Typography>
                      {row.late_night_applicable && row.rate_late_night && (
                        <Typography variant="body2" color="text.secondary">Late night summary: {'$'}{row.rate_late_night}/hr</Typography>
                      )}
                    </Box>
                    <Button variant="outlined" onClick={() => startEdit(row)}>Edit</Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        );
      })}

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{form.public_id ? 'Edit employment engagement' : 'New employment engagement'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.25} pt={0.5}>
            <Box>
              <Typography fontWeight={900}>{form.worker_name}</Typography>
              <Typography variant="body2" color="text.secondary">{String(form.role || '').replaceAll('_', ' ')}</Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField fullWidth size="small" type="date" label="Effective from" InputLabelProps={{ shrink: true }} value={form.effective_from} onChange={(e) => setForm((f: any) => ({ ...f, effective_from: e.target.value }))} />
              <TextField fullWidth size="small" type="date" label="Effective to (optional)" InputLabelProps={{ shrink: true }} value={form.effective_to} onChange={(e) => setForm((f: any) => ({ ...f, effective_to: e.target.value }))} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel>Employment type</InputLabel>
                <Select value={form.employment_type} label="Employment type" onChange={(e) => setAndPreview({ employment_type: String(e.target.value) })}>
                  <MenuItem value="FULL_TIME">Full-time</MenuItem><MenuItem value="PART_TIME">Part-time</MenuItem><MenuItem value="CASUAL">Casual</MenuItem>
                </Select>
              </FormControl>
              <TextField fullWidth size="small" label="Job title" value={form.job_title} onChange={(e) => setForm((f: any) => ({ ...f, job_title: e.target.value }))} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel>Pay basis</InputLabel>
                <Select value={form.pay_basis} label="Pay basis" onChange={(e) => setAndPreview({ pay_basis: String(e.target.value) })}>
                  <MenuItem value="AWARD">Award rate</MenuItem><MenuItem value="ABOVE_AWARD">Above award / agreed rates</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Award classification</InputLabel>
                <Select value={form.award_classification} label="Award classification" onChange={(e) => setAndPreview({ award_classification: String(e.target.value) })}>
                  {(CLASSIFICATIONS[form.role] || []).map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>

            {form.pay_basis === 'AWARD' && (
              <Alert severity="success">
                {loadingAward ? 'Resolving award schedule…' : <>Rates are derived from {form.award_source_label || 'the configured Pharmacy Award schedule'}{form.award_effective_from ? ' effective ' + form.award_effective_from : ''}. {form.award_source_url && <Link href={form.award_source_url} target="_blank" rel="noreferrer">Open pay guide</Link>}</>}
              </Alert>
            )}

            <Box>
              <Typography fontWeight={900} sx={{ mb: 1 }}>Agreed hourly rate schedule</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                {rateField('rate_weekday', 'Weekday', form.pay_basis === 'AWARD')}
                {rateField('rate_saturday', 'Saturday', form.pay_basis === 'AWARD')}
                {rateField('rate_sunday', 'Sunday', form.pay_basis === 'AWARD')}
                {rateField('rate_public_holiday', 'Public holiday', form.pay_basis === 'AWARD')}
              </Box>
            </Box>

            {form.pay_basis === 'AWARD' ? (
              <Alert severity="info">
                Early-morning summary: {'$'}{form.rate_early_morning || '—'}/hr · Late-night summary: {'$'}{form.rate_late_night || '—'}/hr. The backend also freezes the complete weekday/Saturday/Sunday time-window schedule.
              </Alert>
            ) : (
              <Stack spacing={1}>
                <FormControlLabel control={<Checkbox checked={Boolean(form.early_morning_applicable)} onChange={(_, checked) => setForm((f: any) => ({ ...f, early_morning_applicable: checked }))} />} label="Separate early-morning agreed rate applies" />
                {form.early_morning_applicable && rateField('rate_early_morning', 'Early morning')}
                <FormControlLabel control={<Checkbox checked={Boolean(form.late_night_applicable)} onChange={(_, checked) => setForm((f: any) => ({ ...f, late_night_applicable: checked }))} />} label="Separate late-night agreed rate applies" />
                {form.late_night_applicable && rateField('rate_late_night', 'Late night')}
              </Stack>
            )}
            <TextField multiline minRows={2} label="Agreement notes" value={form.notes} onChange={(e) => setForm((f: any) => ({ ...f, notes: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || loadingAward || !form.effective_from || !form.award_classification}>
            {saving ? 'Saving…' : 'Save engagement'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
