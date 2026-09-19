import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type {
  WorkforceAwardPreview,
  WorkforceEmploymentEngagement,
  WorkforceEmploymentEngagementWrite,
  WorkforceEngagementPayBasis,
  WorkforceWorkSettings,
} from '@chemisttasker/shared-core';
import {
  createEmploymentEngagement,
  listEmploymentEngagements,
  previewEmploymentEngagementAward,
  updateEmploymentEngagement,
} from './api';

type Props = { pharmacyId: number; staff: WorkforceWorkSettings[] };
type EmploymentType = WorkforceEmploymentEngagement['employment_type'];
type RateKey =
  | 'rate_weekday'
  | 'rate_saturday'
  | 'rate_sunday'
  | 'rate_public_holiday'
  | 'rate_early_morning'
  | 'rate_late_night';

type EngagementForm = {
  public_id: string;
  supersedes_public_id: string;
  membership_id: number;
  worker_name: string;
  role: string;
  employment_type: EmploymentType;
  effective_from: string;
  effective_to: string;
  job_title: string;
  pay_basis: WorkforceEngagementPayBasis;
  award_classification: string;
  award_source_label: string;
  award_source_url: string;
  award_effective_from: string;
  rate_weekday: string;
  rate_saturday: string;
  rate_sunday: string;
  rate_public_holiday: string;
  rate_early_morning: string;
  rate_late_night: string;
  early_morning_applicable: boolean;
  late_night_applicable: boolean;
  notes: string;
  terms_editable: boolean;
};

const isoToday = () => dayjs().format('YYYY-MM-DD');
const blankForm = (): EngagementForm => ({
  public_id: '',
  supersedes_public_id: '',
  membership_id: 0,
  worker_name: '',
  role: '',
  employment_type: 'FULL_TIME',
  effective_from: isoToday(),
  effective_to: '',
  job_title: '',
  pay_basis: 'AWARD',
  award_classification: '',
  award_source_label: '',
  award_source_url: '',
  award_effective_from: '',
  rate_weekday: '',
  rate_saturday: '',
  rate_sunday: '',
  rate_public_holiday: '',
  rate_early_morning: '',
  rate_late_night: '',
  early_morning_applicable: false,
  late_night_applicable: false,
  notes: '',
  terms_editable: true,
});

const isActiveOn = (row: WorkforceEmploymentEngagement, date: string) =>
  row.effective_from <= date && (!row.effective_to || row.effective_to >= date);

export default function EmploymentEngagementsPanel({ pharmacyId, staff }: Props) {
  const [engagements, setEngagements] = useState<WorkforceEmploymentEngagement[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EngagementForm>(() => blankForm());
  const [awardPreview, setAwardPreview] = useState<WorkforceAwardPreview | null>(null);
  const [loadingAward, setLoadingAward] = useState(false);
  const [saving, setSaving] = useState(false);
  const previewSequence = useRef(0);

  const load = useCallback(async () => {
    try {
      setEngagements(await listEmploymentEngagements(pharmacyId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load employment engagements.');
    }
  }, [pharmacyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<number, WorkforceEmploymentEngagement[]>();
    engagements.forEach((row) => {
      map.set(row.membership_id, [...(map.get(row.membership_id) || []), row]);
    });
    return map;
  }, [engagements]);

  const eligibleStaff = useMemo(
    () => staff.filter((worker) => worker.employment_engagement_eligible),
    [staff],
  );
  const excludedStaff = useMemo(
    () => staff.filter((worker) => !worker.employment_engagement_eligible),
    [staff],
  );

  const selectedWorker = useMemo(
    () => staff.find((worker) => worker.membership_id === form.membership_id) || null,
    [staff, form.membership_id],
  );

  const classificationOptions = selectedWorker?.award_classification_options || [];

  const previewAward = async (next: EngagementForm) => {
    if (!next.membership_id || !next.award_classification) {
      setAwardPreview(null);
      return;
    }

    const requestId = ++previewSequence.current;
    setLoadingAward(true);
    setError('');
    try {
      const preview = await previewEmploymentEngagementAward({
        membership_id: next.membership_id,
        employment_type: next.employment_type,
        award_classification: next.award_classification,
      });
      if (requestId !== previewSequence.current) return;
      setAwardPreview(preview);
      setForm((current) => {
        if (
          current.membership_id !== next.membership_id
          || current.award_classification !== next.award_classification
          || current.employment_type !== next.employment_type
        ) {
          return current;
        }
        return {
          ...current,
          award_source_label: preview.award_source_label,
          award_source_url: preview.award_source_url,
          award_effective_from: preview.award_effective_from,
          ...(current.pay_basis === 'AWARD'
            ? {
                rate_weekday: preview.rate_weekday,
                rate_saturday: preview.rate_saturday,
                rate_sunday: preview.rate_sunday,
                rate_public_holiday: preview.rate_public_holiday,
                rate_early_morning: preview.rate_early_morning,
                rate_late_night: preview.rate_late_night,
                early_morning_applicable: preview.early_morning_applicable,
                late_night_applicable: preview.late_night_applicable,
              }
            : {}),
        };
      });
    } catch (err: unknown) {
      if (requestId !== previewSequence.current) return;
      setAwardPreview(null);
      setError(err instanceof Error ? err.message : 'Unable to resolve the selected Award classification.');
    } finally {
      if (requestId === previewSequence.current) setLoadingAward(false);
    }
  };

  const startNew = (worker: WorkforceWorkSettings) => {
    if (!worker.employment_engagement_eligible) {
      setError('Locum and Shift Hero memberships are not employee engagements and are intentionally excluded.');
      return;
    }

    const today = isoToday();
    const current = (grouped.get(worker.membership_id) || []).find((row) => isActiveOn(row, today));
    const effectiveFrom = current?.effective_from === today
      ? dayjs(today).add(1, 'day').format('YYYY-MM-DD')
      : today;

    const next: EngagementForm = {
      ...blankForm(),
      membership_id: worker.membership_id,
      worker_name: worker.worker_name,
      role: worker.role,
      employment_type: worker.employment_type as EmploymentType,
      award_classification: worker.default_award_classification || '',
      effective_from: effectiveFrom,
      supersedes_public_id: current?.public_id || '',
      terms_editable: true,
    };
    setAwardPreview(null);
    setForm(next);
    setOpen(true);
    if (next.award_classification) void previewAward(next);
  };

  const startEdit = (row: WorkforceEmploymentEngagement) => {
    const next: EngagementForm = {
      ...blankForm(),
      ...row,
      supersedes_public_id: '',
      effective_to: row.effective_to || '',
      award_effective_from: row.award_effective_from || '',
      rate_early_morning: row.rate_early_morning || '',
      rate_late_night: row.rate_late_night || '',
      terms_editable: Boolean(row.terms_editable),
    };
    setAwardPreview(null);
    setForm(next);
    setOpen(true);
    if (next.award_classification) void previewAward(next);
  };

  const setAndPreview = (patch: Partial<EngagementForm>) => {
    const next = { ...form, ...patch };
    setForm(next);
    void previewAward(next);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const historical = Boolean(form.public_id && !form.terms_editable);
      if (historical) {
        await updateEmploymentEngagement(form.public_id, {
          effective_to: form.effective_to || null,
          notes: form.notes,
        });
      } else {
        const payload: WorkforceEmploymentEngagementWrite = {
          membership_id: form.membership_id,
          ...(form.supersedes_public_id ? { supersedes_public_id: form.supersedes_public_id } : {}),
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
            rate_weekday: form.rate_weekday,
            rate_saturday: form.rate_saturday,
            rate_sunday: form.rate_sunday,
            rate_public_holiday: form.rate_public_holiday,
            early_morning_applicable: form.early_morning_applicable,
            late_night_applicable: form.late_night_applicable,
            rate_early_morning: form.early_morning_applicable ? form.rate_early_morning : null,
            rate_late_night: form.late_night_applicable ? form.rate_late_night : null,
          });
        }

        if (form.public_id) await updateEmploymentEngagement(form.public_id, payload);
        else await createEmploymentEngagement(payload);
      }

      setOpen(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save employment engagement.');
    } finally {
      setSaving(false);
    }
  };

  const rateField = (key: RateKey, label: string, disabled = false) => (
    <TextField
      size="small"
      type="number"
      label={label}
      value={form[key]}
      disabled={disabled}
      inputProps={{ min: 0, step: '0.01' }}
      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
      InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>{'$'}</Typography> }}
    />
  );

  const scheduleRate = (section: string, key: string) =>
    awardPreview?.schedule?.[section]?.[key] || '—';

  const historical = Boolean(form.public_id && !form.terms_editable);
  const aboveAwardComplete =
    form.pay_basis !== 'ABOVE_AWARD'
    || Boolean(
      form.rate_weekday
      && form.rate_saturday
      && form.rate_sunday
      && form.rate_public_holiday
      && (!form.early_morning_applicable || form.rate_early_morning)
      && (!form.late_night_applicable || form.rate_late_night),
    );
  const canSave =
    historical
    || Boolean(
      form.effective_from
      && form.award_classification
      && aboveAwardComplete
      && !loadingAward,
    );

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Membership remains the stable worker-at-pharmacy identity used by attendance. Employment engagements are dated employment/pay records. Once an engagement starts, its pay terms are historical; new terms create a successor rather than rewriting prior payroll history.
      </Alert>

      {excludedStaff.length > 0 && (
        <Alert severity="info">
          {excludedStaff.length} Locum/Shift Hero membership{excludedStaff.length === 1 ? ' is' : 's are'} excluded here. They remain available to shift workflows but are not silently converted into casual employee engagements.
        </Alert>
      )}

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      {eligibleStaff.map((worker) => {
        const rows = grouped.get(worker.membership_id) || [];
        const current = rows.find((row) => isActiveOn(row, isoToday()));
        return (
          <Paper key={worker.membership_id} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                <Box>
                  <Typography fontWeight={900}>{worker.worker_name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {worker.role.replaceAll('_', ' ')} · {worker.employment_type.replaceAll('_', ' ')} · membership #{worker.membership_id}
                  </Typography>
                </Box>
                <Button variant="contained" onClick={() => startNew(worker)}>
                  {current ? 'New terms' : 'New engagement'}
                </Button>
              </Stack>

              {!rows.length && (
                <Typography variant="body2" color="text.secondary">
                  No dated employment engagement recorded yet.
                </Typography>
              )}

              {rows.map((row) => (
                <Paper key={row.public_id} variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ md: 'center' }}>
                    <Box flex={1}>
                      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
                        <Chip
                          size="small"
                          label={row.pay_basis === 'AWARD' ? 'Award' : 'Above award'}
                          color={row.pay_basis === 'AWARD' ? 'primary' : 'success'}
                        />
                        {isActiveOn(row, isoToday()) && <Chip size="small" label="Current" variant="outlined" />}
                        <Typography fontWeight={800}>
                          {String(row.award_classification || row.role).replaceAll('_', ' ')}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {row.effective_from} → {row.effective_to || 'Current'} · Weekday {'$'}{row.rate_weekday}/hr · Sat {'$'}{row.rate_saturday}/hr · Sun {'$'}{row.rate_sunday}/hr · Public holiday {'$'}{row.rate_public_holiday}/hr
                      </Typography>
                      {row.late_night_applicable && row.rate_late_night && (
                        <Typography variant="body2" color="text.secondary">
                          Weekday 9 pm–midnight: {'$'}{row.rate_late_night}/hr
                        </Typography>
                      )}
                    </Box>
                    <Button variant="outlined" onClick={() => startEdit(row)}>
                      {row.terms_editable ? 'Edit future' : 'End / notes'}
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        );
      })}

      {!eligibleStaff.length && (
        <Alert severity="warning">
          No full-time, part-time or casual employee memberships are available for employment engagement setup.
        </Alert>
      )}

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {historical
            ? 'Update engagement end date / notes'
            : form.public_id
              ? 'Edit future employment engagement'
              : form.supersedes_public_id
                ? 'Create successor employment engagement'
                : 'New employment engagement'}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.25} pt={0.5}>
            <Box>
              <Typography fontWeight={900}>{form.worker_name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {String(form.role || '').replaceAll('_', ' ')}
              </Typography>
            </Box>

            {historical && (
              <Alert severity="info">
                This engagement has started, so its classification and pay terms are locked for payroll history. You may close it or amend notes. Use “New terms” to create a dated successor.
              </Alert>
            )}

            {!historical && form.supersedes_public_id && (
              <Alert severity="warning">
                Saving these new terms will atomically end the current engagement on the day before the new effective date. Existing historical rates remain unchanged.
              </Alert>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Effective from"
                InputLabelProps={{ shrink: true }}
                value={form.effective_from}
                disabled={historical}
                onChange={(event) => setForm((current) => ({ ...current, effective_from: event.target.value }))}
              />
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Effective to (optional)"
                InputLabelProps={{ shrink: true }}
                value={form.effective_to}
                onChange={(event) => setForm((current) => ({ ...current, effective_to: event.target.value }))}
              />
            </Stack>

            {!historical && (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Employment type</InputLabel>
                    <Select
                      value={form.employment_type}
                      label="Employment type"
                      onChange={(event) => setAndPreview({ employment_type: String(event.target.value) as EmploymentType })}
                    >
                      <MenuItem value="FULL_TIME">Full-time</MenuItem>
                      <MenuItem value="PART_TIME">Part-time</MenuItem>
                      <MenuItem value="CASUAL">Casual</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    fullWidth
                    size="small"
                    label="Job title"
                    value={form.job_title}
                    onChange={(event) => setForm((current) => ({ ...current, job_title: event.target.value }))}
                  />
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Pay basis</InputLabel>
                    <Select
                      value={form.pay_basis}
                      label="Pay basis"
                      onChange={(event) => setAndPreview({ pay_basis: String(event.target.value) as WorkforceEngagementPayBasis })}
                    >
                      <MenuItem value="AWARD">Award rate</MenuItem>
                      <MenuItem value="ABOVE_AWARD">Above award / agreed rates</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small">
                    <InputLabel>Award classification</InputLabel>
                    <Select
                      value={form.award_classification}
                      label="Award classification"
                      onChange={(event) => setAndPreview({ award_classification: String(event.target.value) })}
                    >
                      {classificationOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                {!form.award_classification && (
                  <Alert severity="warning">
                    Select the Award classification from the employee’s duties, competencies and qualifications. ChemistTasker does not guess a classification from the role name.
                  </Alert>
                )}

                {form.role === 'TECHNICIAN' && (
                  <Alert severity="info">
                    “Dispensary Technician” is a ChemistTasker role, not a Pharmacy Award classification name. MA000012 identifies dispensary work at Pharmacy assistant / Dispensary assistant level 3; Level 4 applies where the Certificate IV competencies and required level of work are met.
                  </Alert>
                )}

                {awardPreview && (
                  <Alert severity={form.pay_basis === 'AWARD' ? 'success' : 'info'}>
                    <strong>{awardPreview.classification_label}</strong> · {form.pay_basis === 'AWARD' ? 'Award schedule' : 'Award minimum underpinning'} · {awardPreview.award_effective_basis || 'effective ' + awardPreview.award_effective_from}.{' '}
                    <Link href={awardPreview.award_source_url} target="_blank" rel="noreferrer">
                      Open Fair Work pay guide
                    </Link>
                  </Alert>
                )}

                <Box>
                  <Typography fontWeight={900} sx={{ mb: 1 }}>
                    {form.pay_basis === 'AWARD' ? 'Award hourly rate summary' : 'Agreed hourly rates'}
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                    {rateField('rate_weekday', 'Weekday 8 am–7 pm', form.pay_basis === 'AWARD')}
                    {rateField('rate_saturday', 'Saturday 8 am–6 pm', form.pay_basis === 'AWARD')}
                    {rateField('rate_sunday', 'Sunday 7 am–9 pm', form.pay_basis === 'AWARD')}
                    {rateField('rate_public_holiday', 'Public holiday', form.pay_basis === 'AWARD')}
                  </Box>
                </Box>

                {form.pay_basis === 'ABOVE_AWARD' && awardPreview && (
                  <Alert severity="info">
                    Award floors for the selected classification are {'$'}{awardPreview.rate_weekday} weekday, {'$'}{awardPreview.rate_saturday} Saturday, {'$'}{awardPreview.rate_sunday} Sunday and {'$'}{awardPreview.rate_public_holiday} public holiday. The API rejects an “above award” rate below these floors.
                  </Alert>
                )}

                {form.pay_basis === 'AWARD' ? (
                  awardPreview && (
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                      <Typography fontWeight={900} sx={{ mb: 1 }}>Penalty windows frozen with this engagement</Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.75 }}>
                        <Typography variant="body2">Weekday 7–8 am: <strong>{'$'}{scheduleRate('weekday', 'early_07_08')}</strong></Typography>
                        <Typography variant="body2">Weekday 7–9 pm: <strong>{'$'}{scheduleRate('weekday', 'evening_19_21')}</strong></Typography>
                        <Typography variant="body2">Weekday 9 pm–midnight: <strong>{'$'}{scheduleRate('weekday', 'late_21_24')}</strong></Typography>
                        <Typography variant="body2">Saturday 7–8 am: <strong>{'$'}{scheduleRate('saturday', 'early_07_08')}</strong></Typography>
                        <Typography variant="body2">Saturday 6–9 pm: <strong>{'$'}{scheduleRate('saturday', 'evening_18_21')}</strong></Typography>
                        <Typography variant="body2">Saturday 9 pm–midnight: <strong>{'$'}{scheduleRate('saturday', 'late_21_24')}</strong></Typography>
                        <Typography variant="body2">Sunday outside 7 am–9 pm: <strong>{'$'}{scheduleRate('sunday', 'outside_07_21')}</strong></Typography>
                      </Box>
                      {awardPreview.ordinary_hours_note && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                          {awardPreview.ordinary_hours_note}
                        </Typography>
                      )}
                    </Paper>
                  )
                ) : (
                  <Stack spacing={1}>
                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={form.early_morning_applicable}
                          onChange={(_, checked) => setForm((current) => ({ ...current, early_morning_applicable: checked }))}
                        />
                      )}
                      label="Separate weekday 7–8 am agreed rate applies"
                    />
                    {form.early_morning_applicable && rateField('rate_early_morning', 'Weekday 7–8 am')}

                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={form.late_night_applicable}
                          onChange={(_, checked) => setForm((current) => ({ ...current, late_night_applicable: checked }))}
                        />
                      )}
                      label="Separate weekday 9 pm–midnight agreed rate applies"
                    />
                    {form.late_night_applicable && rateField('rate_late_night', 'Weekday 9 pm–midnight')}

                    <Typography variant="caption" color="text.secondary">
                      Where no separate agreed penalty-window rate is recorded, payroll must still use at least the frozen Award floor. Overtime is retained separately in the Award snapshot.
                    </Typography>
                  </Stack>
                )}

                {awardPreview?.junior_rate_note && form.role === 'ASSISTANT' && ['LEVEL_1', 'LEVEL_2'].includes(form.award_classification) && (
                  <Alert severity="warning">{awardPreview.junior_rate_note}</Alert>
                )}
              </>
            )}

            <TextField
              multiline
              minRows={2}
              label="Agreement notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || !canSave}>
            {saving ? 'Saving…' : historical ? 'Save end date / notes' : 'Save engagement'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
