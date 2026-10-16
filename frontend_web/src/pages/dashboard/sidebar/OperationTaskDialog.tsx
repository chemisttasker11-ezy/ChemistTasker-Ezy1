import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, LinearProgress, Stack, TextField, Typography,
} from '@mui/material';
import { ClipboardCheck, ExternalLink, ShieldCheck, Target } from 'lucide-react';
import {
  type OperationTask, getOperationTask, getOperationMySteps,
  toggleOperationStep, submitOperationWork, reopenOperationWork,
  recordOperationKpi, verifyOperationTask,
} from '@chemisttasker/shared-core';

type Props = { taskId: number | null; onClose: () => void; onUpdated?: () => void };

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'The operation could not be completed. Try again.';
}

/** One staff execution surface reused in the owner planner and calendar. */
export default function OperationTaskDialog({ taskId, onClose, onUpdated }: Props) {
  const [task, setTask] = useState<OperationTask | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [canAct, setCanAct] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [kpiValue, setKpiValue] = useState('1');
  const [pendingKpiKey, setPendingKpiKey] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = async (id: number) => {
    const data = await getOperationTask(id);
    setTask(data);
    try {
      const own = await getOperationMySteps(id);
      setSteps(own.completed_step_ids);
      setCanAct(true);
    } catch {
      // Managers without an employee membership may review/verify but cannot
      // impersonate worker completion or KPI submissions.
      setSteps([]);
      setCanAct(false);
    }
  };
  useEffect(() => {
    if (!taskId) { setTask(null); return; }
    let cancelled = false;
    setError(''); setMessage(''); setLoading(true); setTask(null);
    Promise.all([getOperationTask(taskId), getOperationMySteps(taskId).catch(() => null)])
      .then(([data, own]) => {
        if (cancelled) return;
        setTask(data);
        setCanAct(Boolean(own));
        setSteps(own?.completed_step_ids ?? []);
      })
      .catch(e => { if (!cancelled) setError(errorText(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId]);

  async function act(fn: () => Promise<unknown>, success: string) {
    if (!taskId) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await fn();
      await refresh(taskId);
      setMessage(success);
      onUpdated?.();
    } catch (e) {
      setError(errorText(e));
    } finally { setBusy(false); }
  }

  const required = task?.checklist.filter(s => s.required) ?? [];
  const done = required.filter(s => steps.includes(s.id)).length;
  const checklistComplete = required.length === done;

  return (
    <Dialog open={taskId !== null} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="operation-task-title">
      <DialogTitle id="operation-task-title" sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ClipboardCheck size={22} aria-hidden="true" />
          <Box flex={1}><Typography variant="h6" fontWeight={750}>{task?.title ?? 'Operational task'}</Typography>
            <Typography variant="caption" color="text.secondary">{task?.date} · {task?.area}</Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <Stack direction="row" spacing={2} alignItems="center" p={2}><CircularProgress size={20}/><Typography>Loading task…</Typography></Stack>}
        {error && <Alert severity="error" sx={{ mb: 2 }} role="alert">{error}</Alert>}
        {message && <Alert severity="success" sx={{ mb: 2 }} role="status">{message}</Alert>}
        {task && <Stack spacing={3}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" color={task.progress.status === 'FINISHED' ? 'success' : 'default'}
              label={task.progress.status.replace(/_/g, ' ').toLowerCase()} />
            <Chip size="small" label={task.audience.replaceAll('_', ' ').toLowerCase()} />
            {task.requires_verification && <Chip icon={<ShieldCheck size={14}/>} size="small"
              color={task.progress.verified ? 'success' : 'warning'}
              label={task.progress.verified ? 'Verified' : 'Supervisor sign-off required'} />}
          </Stack>
          {task.description && <Typography variant="body2">{task.description}</Typography>}
          <Typography variant="body2" color="text.secondary">
            {task.progress.completed} of {task.progress.assigned} assigned people submitted
            {task.start_time ? ' · ' + task.start_time.slice(0, 5) : ''}
            {task.end_time ? '–' + task.end_time.slice(0, 5) : ''}
          </Typography>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Checklist</Typography>
            <Typography variant="body2" color="text.secondary" mb={1}>
              {done} / {required.length} required steps for your assignment
            </Typography>
            <LinearProgress aria-label="Checklist completion" variant="determinate"
              value={required.length ? 100 * done / required.length : 100} sx={{ height: 8, borderRadius: 6, mb: 2 }} />
            {task.checklist.map(step => <Stack key={step.id} direction="row" alignItems="flex-start" spacing={1}>
              <Checkbox inputProps={{ 'aria-label': step.label }} checked={steps.includes(step.id)}
                disabled={!canAct || busy || task.progress.verified || task.progress.status === 'FINISHED' || task.progress.status === 'AWAITING_VERIFICATION'}
                onChange={(_, next) => void act(
                  () => toggleOperationStep(task.id, step.id, next, evidence),
                  next ? 'Checklist step saved.' : 'Checklist step reopened.',
                )} />
              <Box pt={0.6}><Typography variant="body2">{step.label}</Typography>
                {!step.required && <Typography variant="caption" color="text.secondary">Optional step</Typography>}
              </Box>
            </Stack>)}
            {task.checklist.length === 0 && <Typography variant="body2" color="text.secondary">
              No checklist steps required.
            </Typography>}
            {canAct && task.checklist.length > 0 && <TextField label="Evidence or exception note (optional)"
              size="small" fullWidth multiline minRows={2} value={evidence}
              helperText="Do not enter patient-identifiable information."
              onChange={e => setEvidence(e.target.value)} inputProps={{ maxLength: 2000 }} sx={{ mt: 1 }} />}
          </Box>
          {task.target_value !== null && <Box>
            <Divider sx={{ mb: 2 }} />
            <Stack direction="row" spacing={1} alignItems="center"><Target size={18}/><Typography fontWeight={700}>Team KPI</Typography></Stack>
            <Typography variant="h6" fontWeight={700}>{task.progress.kpi_actual} / {task.target_value} <Typography component="span" color="text.secondary" variant="caption">{task.target_unit}</Typography></Typography>
            <LinearProgress variant="determinate" value={Math.min(100, task.target_value ? 100 * task.progress.kpi_actual / task.target_value : 100)}
              aria-label="KPI progress" sx={{ height: 8, borderRadius: 6, my: 1 }} />
            {canAct && <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <TextField label="Add achieved" size="small" type="number" value={kpiValue} sx={{ width: 150 }}
                inputProps={{ min: 1, max: 10000, step: 1 }} onChange={e => { setKpiValue(e.target.value); setPendingKpiKey(null); }} />
              <Button variant="outlined" disabled={busy || !Number.isInteger(Number(kpiValue)) || Number(kpiValue) < 1}
                onClick={() => { const key = pendingKpiKey ?? crypto.randomUUID(); setPendingKpiKey(key);
                  void act(() => recordOperationKpi(task.id, Number(kpiValue), key), 'Progress recorded.'); }}>
                Record progress
              </Button>
            </Stack>}
            {task.target_kind === 'clinical' && <Alert severity="info" sx={{ mt: 1 }}>
              This is a planning indicator, not a claim or proof of eligibility for a funded clinical service.
            </Alert>}
          </Box>}
          {task.training_url && <Button component="a" href={task.training_url} target="_blank" rel="noopener noreferrer"
            endIcon={<ExternalLink size={16}/>} variant="text" sx={{ alignSelf: 'flex-start' }}>Open training resource</Button>}
          {canAct && task.calendar_note_id && <Stack direction="row" gap={1} flexWrap="wrap">
            <Button variant="contained" disabled={busy || !checklistComplete || task.progress.verified}
              onClick={() => void act(() => submitOperationWork(task.calendar_note_id!, task.date), 'Work submitted to the calendar.')}>
              Submit completed work
            </Button>
            <Button variant="outlined" disabled={busy || task.progress.verified}
              onClick={() => void act(() => reopenOperationWork(task.calendar_note_id!, task.date), 'Work reopened.')}>
              Reopen
            </Button>
          </Stack>}
          {task.requires_verification && task.progress.status === 'AWAITING_VERIFICATION' && <Box>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle1" fontWeight={700} mb={1}>Supervisor verification</Typography>
            <TextField label="Verification notes" size="small" fullWidth multiline value={reviewNote}
              inputProps={{ maxLength: 2000 }} onChange={e => setReviewNote(e.target.value)}
              helperText="A separate authorised reviewer must sign off. Patient identifiers should not be entered." />
            <Button startIcon={<ShieldCheck size={16}/>} sx={{ mt: 1 }} disabled={busy} variant="contained"
              onClick={() => void act(() => verifyOperationTask(task.id, reviewNote), 'Verification recorded.')}>
              Verify task
            </Button>
          </Box>}
        </Stack>}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
