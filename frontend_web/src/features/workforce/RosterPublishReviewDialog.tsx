import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import { publishRosterRevision, validateRosterRevision } from './api';
import type { RosterWarning, RosterWorkspaceResponse } from './types';

export default function RosterPublishReviewDialog({
  open,
  workspace,
  onClose,
  onPublished,
}: {
  open: boolean;
  workspace: RosterWorkspaceResponse | null;
  onClose: () => void;
  onPublished: () => Promise<void> | void;
}) {
  const [warnings, setWarnings] = useState<RosterWarning[]>([]);
  const [errors, setErrors] = useState<Array<{ type: string; message: string }>>([]);
  const [ack, setAck] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const allWarningKeys = useMemo(() => warnings.map((row) => row.warning_key).filter(Boolean) as string[], [warnings]);

  useEffect(() => {
    if (!open || !workspace?.period_id) return;
    setAck(new Set());
    setMessage('');
    setBusy(true);
    validateRosterRevision(workspace.period_id, workspace.draft_revision)
      .then((result) => {
        const validation = result as { warnings?: RosterWarning[]; errors?: Array<{ type: string; message: string }> };
        setWarnings(validation.warnings || []);
        setErrors(validation.errors || []);
      })
      .catch((err: any) => setMessage(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Validation failed.'))
      .finally(() => setBusy(false));
  }, [open, workspace?.period_id, workspace?.draft_revision]);

  const publish = async () => {
    if (!workspace?.period_id) return;
    setBusy(true);
    setMessage('');
    try {
      await publishRosterRevision({
        periodId: workspace.period_id,
        expectedRevision: workspace.draft_revision,
        acknowledgedWarningKeys: Array.from(ack),
        operationId: crypto.randomUUID(),
      });
      await onPublished();
      onClose();
    } catch (err: any) {
      const payload = err?.response?.data;
      setMessage(payload?.message || payload?.error || (payload ? JSON.stringify(payload) : err?.message) || 'Publish failed.');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Review before publishing</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography color="text.secondary">This publishes draft revision {workspace?.draft_revision}. If another manager changes the roster first, the server returns a revision conflict instead of overwriting their work.</Typography>
          {message && <Alert severity="error">{message}</Alert>}
          {errors.map((row, i) => <Alert severity="error" key={`${row.type}-${i}`}><strong>{row.type}</strong> · {row.message}</Alert>)}
          {warnings.map((row, i) => {
            const key = row.warning_key || `${row.type}-${i}`;
            return <Alert severity="warning" key={key}>
              <Stack>
                <Typography><strong>{row.type}</strong> · {row.message}</Typography>
                {row.warning_key && <FormControlLabel control={<Checkbox checked={ack.has(row.warning_key)} onChange={(_, checked) => setAck((current) => { const next = new Set(current); if (checked) next.add(row.warning_key!); else next.delete(row.warning_key!); return next; })} />} label="I reviewed this warning" />}
              </Stack>
            </Alert>;
          })}
          {!errors.length && !warnings.length && <Alert severity="success">No blocking errors or warnings.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={publish} disabled={busy || errors.length > 0 || ack.size !== allWarningKeys.length}>Publish reviewed roster</Button>
      </DialogActions>
    </Dialog>
  );
}
