import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { OperationAudience, OperationPlan } from '@chemisttasker/shared-core';
import { AUDIENCES, ROLE_OPTIONS, type TaskDraft, type Member, memberName } from './operationsDraftModel';

type Props = {
  draft: TaskDraft;
  setDraft: Dispatch<SetStateAction<TaskDraft | null>>;
  editingTask: number | null;
  plan: OperationPlan;
  members: Member[];
  busy: boolean;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
};

export default function OperationsTaskEditor({ draft, setDraft, editingTask, plan, members, busy, onSave, onCancel }: Props) {
  const taskDraft = draft;
  const setTaskDraft = setDraft;
  return (
<Paper component="form" onSubmit={onSave} variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
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
            <Button onClick={onCancel}>Cancel</Button>
          </Stack>
        </Stack>
      </Paper>
  );
}
