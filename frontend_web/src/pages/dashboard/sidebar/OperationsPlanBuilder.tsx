import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, Divider,
  FormControlLabel, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { CalendarDays, ClipboardPlus, Copy, FileCheck2, GripVertical, Plus, Send, Trash2 } from 'lucide-react';
import { format, addDays, differenceInCalendarDays } from 'date-fns';
import {
  type OperationAudience, type OperationCatalogEntry, type OperationPlan,
  type OperationPreflight, type OperationTask, type OperationTemplate,
  applyOperationTemplate, createOperationPlan, createOperationTask, editOperationTask,
  deleteOperationTask, previewOperationPlan, publishOperationPlan,
  fetchMembershipsByPharmacy,
} from '@chemisttasker/shared-core';

const ROLE_OPTIONS = [
  { value: '', label: 'Any eligible pharmacy role' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'INTERN', label: 'Intern' },
  { value: 'TECHNICIAN', label: 'Dispensary technician' },
  { value: 'ASSISTANT', label: 'Pharmacy assistant' },
  { value: 'STUDENT', label: 'Student' },
];
const AUDIENCES: Array<{ value: OperationAudience; label: string; description: string }> = [
  { value: 'ROLE_ON_DUTY', label: 'Eligible role on shift', description: 'Match the published roster and chosen role' },
  { value: 'ON_DUTY', label: 'Working at this time', description: 'Use staff scheduled during the time window' },
  { value: 'TEAM_POOL', label: 'Shared team task', description: 'One authorised staff member can complete for the pool' },
  { value: 'EVERY_ON_DUTY', label: 'Every scheduled employee', description: 'Each assigned person must complete separately' },
  { value: 'NAMED', label: 'Named individual(s)', description: 'Directly choose active members; may be outside a shift for training' },
];
const today = () => format(new Date(), 'yyyy-MM-dd');
type TaskDraft = {
  title: string; date: string; description: string; area: string; audience: OperationAudience;
  role: string; members: number[]; steps: string; startTime: string; endTime: string;
  requiresVerification: boolean; target: string; targetUnit: string;
  targetKind: 'operational' | 'clinical' | 'safety'; trainingUrl: string;
};
const blankDraft = (day: string): TaskDraft => ({
  title: '', date: day, description: '', area: 'dispensary', audience: 'ROLE_ON_DUTY',
  role: '', members: [], steps: '', startTime: '', endTime: '',
  requiresVerification: false, target: '', targetUnit: '',
  targetKind: 'operational', trainingUrl: '',
});
type Props = {
  pharmacyId: number;
  plans: OperationPlan[];
  templates: OperationTemplate[];
  catalog: OperationCatalogEntry[];
  onReload: () => Promise<void>;
  onOpenTask: (id: number) => void;
  onShowTemplates: () => void;
};
type Member = { id: number; role?: string; invitedName?: string; invited_name?: string; userDetails?: { firstName?: string; lastName?: string }; user_details?: { first_name?: string; last_name?: string } };
function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'The operation could not be completed.';
}

function normalizeMembers(source: unknown): Member[] {
  if (Array.isArray(source)) return source as Member[];
  if (source && typeof source === 'object' && 'results' in source) {
    return ((source as { results?: unknown }).results ?? []) as Member[];
  }
  return [];
}
function memberName(m: Member) {
  const details = m.userDetails ?? m.user_details;
  const name = m.invitedName || m.invited_name || [
    (details as { firstName?: string })?.firstName || (details as { first_name?: string })?.first_name,
    (details as { lastName?: string })?.lastName || (details as { last_name?: string })?.last_name,
  ].filter(Boolean).join(' ') || 'Member ' + m.id;
  return name + (m.role ? ' · ' + m.role : '');
}

export default function OperationsPlanBuilder({
  pharmacyId, plans, templates, catalog, onReload, onOpenTask, onShowTemplates,
}: Props) {
  const [planId, setPlanId] = useState<number | null>(null);
  const [newPlan, setNewPlan] = useState({
    name: 'Pharmacy operations · ' + today(), period: 'daily',
    starts_on: today(), ends_on: today(), notes: '',
  });
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState(today());
  const [copyTo, setCopyTo] = useState(today());
  const [members, setMembers] = useState<Member[]>([]);
  const [review, setReview] = useState<OperationPreflight | null>(null);
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setPlanId(old => old && plans.some(p => p.id === old) ? old : plans[0]?.id ?? null);
    setReview(null); setReviewedRevision(null);
  }, [pharmacyId, plans]);
  useEffect(() => {
    let live = true;
    fetchMembershipsByPharmacy(pharmacyId).then(data => {
      if (live) setMembers(normalizeMembers(data));
    }).catch(() => { if (live) setMembers([]); });
    return () => { live = false; };
  }, [pharmacyId]);

  const plan = useMemo(() => plans.find(p => p.id === planId) ?? null, [plans, planId]);
  const taskList = plan?.items ?? [];
  const editable = plan?.status === 'DRAFT';
  const dates = useMemo(() => {
    if (!plan) return [] as string[];
    const start = selectedDay < plan.starts_on ? plan.starts_on : selectedDay > plan.ends_on ? plan.starts_on : selectedDay;
    const range = Math.min(7, differenceInCalendarDays(new Date(plan.ends_on + 'T12:00:00'),
      new Date(start + 'T12:00:00')) + 1);
    return Array.from({ length: range }, (_, i) => format(addDays(new Date(start + 'T12:00:00'), i), 'yyyy-MM-dd'));
  }, [plan, selectedDay]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      await onReload();
      setReview(null); setReviewedRevision(null);
      setNotice(success);
    } catch (e) { setError(readableError(e)); }
    finally { setBusy(false); }
  }
  async function createNewPlan(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const created = await createOperationPlan({
        ...newPlan, pharmacy: pharmacyId,
        period: newPlan.period as OperationPlan['period'],
      });
      await onReload();
      setPlanId(created.id);
      setSelectedDay(created.starts_on);
      setShowNewPlan(false);
      setNotice('Draft created. Add tasks before publishing.');
    } catch (e) { setError(readableError(e)); }
    finally { setBusy(false); }
  }
  function editDraft(item?: OperationTask) {
    if (item) {
      setEditingTask(item.id);
      setTaskDraft({
        title: item.title, date: item.date, description: item.description, area: item.area,
        audience: item.audience, role: item.role_codes[0] ?? '', members: item.membership_ids,
        steps: item.checklist.map(x => x.label).join('\n'), startTime: item.start_time?.slice(0, 5) ?? '',
        endTime: item.end_time?.slice(0, 5) ?? '', requiresVerification: item.requires_verification,
        target: item.target_value === null ? '' : String(item.target_value), targetUnit: item.target_unit,
        targetKind: item.target_kind, trainingUrl: item.training_url,
      });
    } else {
      setEditingTask(null);
      setTaskDraft(blankDraft(selectedDay));
    }
  }
  async function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!plan || !taskDraft) return;
    if (taskDraft.targetKind === 'clinical' && taskDraft.role && taskDraft.role !== 'PHARMACIST') {
      setError('Clinical-service work must target pharmacists.'); return;
    }
    const payload = {
      plan: plan.id, date: taskDraft.date, title: taskDraft.title.trim(), description: taskDraft.description,
      area: taskDraft.area.trim(), audience: taskDraft.audience,
      membership_ids: taskDraft.audience === 'NAMED' ? taskDraft.members : [],
      role_codes: taskDraft.role ? [taskDraft.role] : taskDraft.targetKind === 'clinical' ? ['PHARMACIST'] : [],
      checklist: taskDraft.steps.split('\n').map(s => s.trim()).filter(Boolean).map((label, index) => ({
        id: String(index + 1), label, required: true,
      })),
      start_time: taskDraft.startTime || null, end_time: taskDraft.endTime || null,
      requires_verification: taskDraft.requiresVerification,
      target_value: taskDraft.target.trim() ? Number(taskDraft.target) : null,
      target_unit: taskDraft.targetUnit, target_kind: taskDraft.targetKind, training_url: taskDraft.trainingUrl,
    };
    await mutate(async () => {
      if (editingTask) await editOperationTask(editingTask, payload);
      else await createOperationTask(payload);
    }, editingTask ? 'Task updated.' : 'Task added to the draft.');
    setTaskDraft(null); setEditingTask(null);
  }
  async function copyTask(task: OperationTask, date: string) {
    if (!plan) return;
    await mutate(() => createOperationTask({
      plan: plan.id, date, title: task.title, description: task.description, area: task.area,
      audience: task.audience, membership_ids: task.membership_ids,
      role_codes: task.role_codes, checklist: task.checklist.map(step => ({ ...step })),
      start_time: task.start_time, end_time: task.end_time, requires_verification: task.requires_verification,
      target_value: task.target_value, target_unit: task.target_unit, target_kind: task.target_kind,
      training_url: task.training_url,
    }), 'Independent task copy added.');
  }
  async function copyDay() {
    if (!plan || copyTo < plan.starts_on || copyTo > plan.ends_on) {
      setError('Destination must be inside this plan.'); return;
    }
    const originals = taskList.filter(x => x.date === selectedDay);
    if (!originals.length) { setError('There are no tasks on the chosen source date.'); return; }
    await mutate(async () => {
      for (const original of originals) {
        await createOperationTask({
          plan: plan.id, date: copyTo, title: original.title, description: original.description,
          area: original.area, audience: original.audience,
          membership_ids: [...original.membership_ids], role_codes: [...original.role_codes],
          checklist: original.checklist.map(step => ({ ...step })),
          start_time: original.start_time, end_time: original.end_time,
          requires_verification: original.requires_verification,
          target_value: original.target_value, target_unit: original.target_unit,
          target_kind: original.target_kind, training_url: original.training_url,
        });
      }
    }, 'Independent daily tasks copied.');
  }
  async function moveTask(event: DragEvent, destination: string) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-chemisttasker-operation');
    const id = Number(raw);
    if (!editable || !Number.isSafeInteger(id) || !taskList.some(t => t.id === id)) return;
    await mutate(() => editOperationTask(id, { date: destination }), 'Task moved to ' + destination + '.');
  }

  return <Stack spacing={3}>
    <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
        <Box><Typography variant="h6" fontWeight={750}>Build your operating plan</Typography>
          <Typography variant="body2" color="text.secondary">Draft, assign by published roster, preview, then publish to the real pharmacy calendar.</Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={17}/>} onClick={() => setShowNewPlan(x => !x)}>New plan</Button>
      </Stack>
      {showNewPlan && <Box component="form" onSubmit={e => void createNewPlan(e)} sx={{ mt: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} flexWrap="wrap">
          <TextField required label="Plan name" size="small" value={newPlan.name} onChange={e => setNewPlan(x => ({ ...x, name: e.target.value }))} sx={{ flex: 2, minWidth: 220 }} />
          <TextField select size="small" label="Plan type" value={newPlan.period} onChange={e => setNewPlan(x => ({ ...x, period: e.target.value }))} sx={{ flex: 1, minWidth: 150 }}>
            {['daily', 'weekly', 'monthly', 'training', 'campaign', 'other'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Starts" type="date" value={newPlan.starts_on} onChange={e => setNewPlan(x => ({ ...x, starts_on: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Ends" type="date" value={newPlan.ends_on} onChange={e => setNewPlan(x => ({ ...x, ends_on: e.target.value }))} InputLabelProps={{ shrink: true }} />
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button type="submit" variant="contained" disabled={busy}>Create draft</Button><Button onClick={() => setShowNewPlan(false)}>Cancel</Button></Stack>
      </Box>}
    </Paper>
    {error && <Alert severity="error" role="alert">{error}</Alert>}
    {notice && <Alert severity="success" role="status">{notice}</Alert>}
    {plans.length > 0 && <TextField select label="Select plan" size="small" fullWidth value={planId ?? ''} onChange={e => {
      setPlanId(Number(e.target.value)); setReview(null); setReviewedRevision(null);
    }}>
      {plans.map(p => <MenuItem key={p.id} value={p.id}>{p.name} · {p.starts_on} – {p.ends_on} · {p.status}</MenuItem>)}
    </TextField>}
    {!plan && <Alert severity="info">Create your first daily, weekly, monthly or training plan to get started.</Alert>}
    {plan && <>
      <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center" justifyContent="space-between">
          <Stack><Typography variant="h6" fontWeight={750}>{plan.name}</Typography>
            <Typography variant="body2" color="text.secondary">{plan.period} · {plan.starts_on} to {plan.ends_on} · Revision {plan.revision}</Typography></Stack>
          <Chip color={editable ? 'warning' : 'success'} label={plan.status} />
        </Stack>
        <Divider sx={{ my: 2 }}/>
        {editable && <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <TextField select label="Apply template" size="small" value={templateId} sx={{ minWidth: 240, flex: 1 }}
            onChange={e => setTemplateId(Number(e.target.value))}>
            {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.name} · {t.category}</MenuItem>)}
          </TextField>
          <Button startIcon={<ClipboardPlus size={17}/>} disabled={busy || templateId === ''} variant="outlined" onClick={() => void mutate(
            () => applyOperationTemplate(plan.id, Number(templateId)), 'Template scheduled across your selected dates.',
          )}>Schedule template</Button>
          <Button variant="contained" onClick={() => editDraft()} startIcon={<Plus size={17}/>}>Add task</Button>
        </Stack>}
        {editable && templates.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>
          Start by saving a pharmacy template from the curated library. <Button onClick={onShowTemplates}>Browse templates</Button>
        </Alert>}
        {editable && <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 2 }} alignItems={{ md: 'center' }}>
          <TextField type="date" label="Copy tasks from" size="small" value={selectedDay} onChange={e => setSelectedDay(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField type="date" label="To date" size="small" value={copyTo} onChange={e => setCopyTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          <Button variant="outlined" disabled={busy || !taskList.some(t => t.date === selectedDay)} startIcon={<Copy size={16}/>} onClick={() => void copyDay()}>Copy day</Button>
        </Stack>}
      </Paper>
      {taskDraft && <Paper component="form" onSubmit={e => void saveTask(e)} variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
        <Typography variant="h6" fontWeight={700} mb={2}>{editingTask ? 'Edit draft task' : 'New calendar task'}</Typography>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField required label="Task title" size="small" fullWidth value={taskDraft.title} onChange={e => setTaskDraft(s => s && ({ ...s, title: e.target.value }))} />
            <TextField required label="Date" type="date" size="small" value={taskDraft.date} InputLabelProps={{ shrink: true }}
              inputProps={{ min: plan.starts_on, max: plan.ends_on }} onChange={e => setTaskDraft(s => s && ({ ...s, date: e.target.value }))} />
          </Stack>
          <TextField label="Instructions" size="small" fullWidth multiline minRows={2} value={taskDraft.description}
            onChange={e => setTaskDraft(s => s && ({ ...s, description: e.target.value }))} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Work area" size="small" fullWidth value={taskDraft.area}
              onChange={e => setTaskDraft(s => s && ({ ...s, area: e.target.value }))} />
            <TextField type="time" label="Start" size="small" value={taskDraft.startTime} InputLabelProps={{ shrink: true }}
              onChange={e => setTaskDraft(s => s && ({ ...s, startTime: e.target.value }))} />
            <TextField type="time" label="End" size="small" value={taskDraft.endTime} InputLabelProps={{ shrink: true }}
              onChange={e => setTaskDraft(s => s && ({ ...s, endTime: e.target.value }))} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Assignment rule" size="small" fullWidth value={taskDraft.audience}
              helperText={AUDIENCES.find(x => x.value === taskDraft.audience)?.description}
              onChange={e => setTaskDraft(s => s && ({ ...s, audience: e.target.value as OperationAudience }))}>
              {AUDIENCES.map(a => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
            </TextField>
            <TextField select label="Eligible role" size="small" fullWidth value={taskDraft.role}
              onChange={e => setTaskDraft(s => s && ({ ...s, role: e.target.value }))}>
              {ROLE_OPTIONS.map(a => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
            </TextField>
          </Stack>
          {taskDraft.audience === 'NAMED' && <Box>
            <Typography fontWeight={700} variant="subtitle2">Assign active members</Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
              {members.map(member => <FormControlLabel key={member.id}
                control={<Checkbox checked={taskDraft.members.includes(member.id)}
                  onChange={(_, checked) => setTaskDraft(s => s && ({
                    ...s, members: checked ? [...s.members, member.id] : s.members.filter(id => id !== member.id),
                  }))} />}
                label={memberName(member)} />)}
            </Stack>
          </Box>}
          <TextField label="Checklist (one required step per line)" size="small" fullWidth multiline minRows={3}
            value={taskDraft.steps} onChange={e => setTaskDraft(s => s && ({ ...s, steps: e.target.value }))} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="KPI classification" size="small" value={taskDraft.targetKind} fullWidth
              onChange={e => setTaskDraft(s => s && ({ ...s, targetKind: e.target.value as TaskDraft['targetKind'] }))}>
              {['operational', 'clinical', 'safety'].map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </TextField>
            <TextField type="number" size="small" label="Team target (optional)" value={taskDraft.target}
              inputProps={{ min: 0, max: 100000 }} onChange={e => setTaskDraft(s => s && ({ ...s, target: e.target.value }))} />
            <TextField size="small" label="Unit" value={taskDraft.targetUnit}
              onChange={e => setTaskDraft(s => s && ({ ...s, targetUnit: e.target.value }))} />
          </Stack>
          <TextField label="Training link (optional)" size="small" type="url" fullWidth value={taskDraft.trainingUrl}
            onChange={e => setTaskDraft(s => s && ({ ...s, trainingUrl: e.target.value }))} />
          <FormControlLabel label="Require separate supervisor verification"
            control={<Checkbox checked={taskDraft.requiresVerification}
              onChange={(_, checked) => setTaskDraft(s => s && ({ ...s, requiresVerification: checked }))} />} />
          <Stack direction="row" gap={1}>
            <Button type="submit" variant="contained" disabled={busy || !taskDraft.title.trim()}>Save task</Button>
            <Button onClick={() => { setTaskDraft(null); setEditingTask(null); }}>Cancel</Button>
          </Stack>
        </Stack>
      </Paper>}
      <Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }} mb={2}>
          <Typography variant="h6" fontWeight={750}>Scheduled work · {taskList.length} tasks</Typography>
          <Typography variant="body2" color="text.secondary">Drag draft tasks between dates, or open a task to review details.</Typography>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 185px), 1fr))', gap: 1.5 }}>
          {dates.map(day => <Paper key={day} variant="outlined" onDragOver={e => { if (editable) e.preventDefault(); }}
            onDrop={e => { if (editable) void moveTask(e, day); }} sx={{ borderRadius: 3, minHeight: 150, p: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1}>{format(new Date(day + 'T12:00:00'), 'EEE d MMM')}</Typography>
            <Stack spacing={1}>
              {taskList.filter(t => t.date === day).map(item => <Card key={item.id} variant="outlined"
                draggable={editable} onDragStart={e => e.dataTransfer.setData('application/x-chemisttasker-operation', String(item.id))}
                sx={{ borderRadius: 2, cursor: editable ? 'grab' : 'default' }}>
                <CardContent sx={{ p: 1.3, '&:last-child': { pb: 1.3 } }}>
                  <Stack direction="row" alignItems="flex-start" gap={0.5}>
                    {editable && <GripVertical size={15} aria-hidden="true" />}
                    <Box flex={1}><Typography fontWeight={650} variant="body2">{item.title}</Typography>
                      <Typography color="text.secondary" variant="caption">{item.area} · {item.start_time?.slice(0, 5) ?? 'anytime'}</Typography>
                    </Box>
                  </Stack>
                  <Chip size="small" sx={{ mt: 1 }} color={item.progress.status === 'FINISHED' ? 'success' : 'default'}
                    label={item.progress.status.toLowerCase().replaceAll('_', ' ')} />
                  <Stack direction="row" gap={0.5} mt={1} flexWrap="wrap">
                    {editable ? <>
                      <Button size="small" onClick={() => editDraft(item)}>Edit</Button>
                      <Tooltip title="Make an independent copy"><Button size="small" aria-label={'Duplicate ' + item.title} onClick={() => void copyTask(item, item.date)}><Copy size={15}/></Button></Tooltip>
                      <Tooltip title="Remove draft item"><Button size="small" color="error" aria-label={'Remove ' + item.title} onClick={() => void mutate(() => deleteOperationTask(item.id), 'Draft task removed.')}><Trash2 size={15}/></Button></Tooltip>
                    </> : <Button size="small" onClick={() => onOpenTask(item.id)}>Open</Button>}
                  </Stack>
                </CardContent>
              </Card>)}
              {editable && <Button size="small" variant="text" onClick={() => {
                setSelectedDay(day); setEditingTask(null); setTaskDraft(blankDraft(day));
              }} startIcon={<Plus size={15}/>}>Add</Button>}
            </Stack>
          </Paper>)}
        </Box>
        <Stack direction="row" flexWrap="wrap" gap={1.5} mt={2} alignItems="center">
          <TextField label="Jump to date" type="date" size="small" value={selectedDay} InputLabelProps={{ shrink: true }}
            inputProps={{ min: plan.starts_on, max: plan.ends_on }}
            onChange={e => setSelectedDay(e.target.value)} />
          <Button size="small" startIcon={<CalendarDays size={16}/>}
            onClick={() => setSelectedDay(plan.starts_on)}>First day</Button>
        </Stack>
      </Box>
      {editable && <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
        <Typography variant="h6" fontWeight={750} mb={1}>Publish to the real calendar</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Publishing is atomic. Only eligible, active pharmacy members are assigned.
          Roster-based rules require a published roster with matching coverage. Drafts are not visible to staff.
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          <Button variant="outlined" startIcon={<FileCheck2 size={17}/>} disabled={busy || !taskList.length}
            onClick={() => void (async () => { setBusy(true); setError('');
              try { const next = await previewOperationPlan(plan.id); setReview(next); setReviewedRevision(plan.revision); }
              catch (e) { setError(readableError(e)); } finally { setBusy(false); }
            })()}>Preview staff allocation</Button>
          <Button variant="contained" color="primary" startIcon={<Send size={17}/>}
            disabled={busy || !review?.ready || reviewedRevision !== plan.revision}
            onClick={() => void mutate(() => publishOperationPlan(plan.id, plan.revision), 'Plan published to the pharmacy calendar.')}>
            Publish to calendar
          </Button>
        </Stack>
        {review && <Box mt={2}>
          {review.ready
            ? <Alert severity="success">{review.assignments.length} tasks have eligible staff allocations. Review before publishing.</Alert>
            : <Alert severity="warning">Publication blocked. Fix each roster, membership or eligibility issue below.</Alert>}
          {review.blockers.map(b => <Typography key={b.task_id + b.message} color="error" variant="body2" mt={1}>
            {b.date} · Task {b.task_id}: {b.message}
          </Typography>)}
          {review.assignments.map(a => <Typography key={a.task_id} variant="caption" sx={{ display: 'block' }}>
            Task {a.task_id}: {a.membership_ids.length} eligible member(s)
          </Typography>)}
        </Box>}
      </Paper>}
      {!editable && <Alert severity="success">This plan is published. Staff complete the actual WorkNotes in the calendar; progress displayed here is read from those records.</Alert>}
    </>}
  </Stack>;
}
