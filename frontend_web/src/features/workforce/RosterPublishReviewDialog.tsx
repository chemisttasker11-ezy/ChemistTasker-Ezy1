import { useEffect, useMemo, useRef, useState } from 'react';
import { createAsyncScope, prepareRosterPublication, type RosterPublicationAttempt } from '@chemisttasker/shared-core';
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
  const requestScope = useRef(createAsyncScope()).current;
  useEffect(() => {
    requestScope.activate();
    return () => requestScope.dispose();
  }, [requestScope]);
  const [warnings, setWarnings] = useState<RosterWarning[]>([]);
  const [errors, setErrors] = useState<Array<{ type: string; message: string }>>([]);
  const [ack, setAck] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [validatedRevision, setValidatedRevision] = useState<number | null>(null);
  const attempt = useRef<RosterPublicationAttempt | undefined>(undefined);
  const allWarningKeys = useMemo(() => warnings.map((row) => row.warning_key).filter(Boolean) as string[], [warnings]);

  useEffect(() => {
    setValidatedRevision(null);
    setWarnings([]);
    setErrors([]);
    setAck(new Set());
    attempt.current = undefined;
    setBusy(false);
    setMessage('');
    requestScope.cancel('publish');
    if (!open || !workspace?.period_id) return;
    const ticket = requestScope.begin('validate');
    setMessage('');
    setBusy(true);
    ticket.run(() => validateRosterRevision(workspace.period_id!, workspace.draft_revision))
      .then((result) => {
        if (!ticket.isCurrent()) return;
        const validation = result as { draft_revision: number; warnings?: RosterWarning[]; errors?: Array<{ type: string; message: string }> };
        setWarnings(validation.warnings || []);
        setErrors(validation.errors || []);
        setValidatedRevision(validation.draft_revision);
      })
      .catch((err: any) => { if (ticket.isCurrent()) setMessage(err?.message || 'Validation failed. Refresh before publishing.'); })
      .finally(() => { if (ticket.isCurrent()) setBusy(false); });
    return () => { requestScope.cancel('validate'); };
  }, [open, workspace?.period_id, workspace?.draft_revision, requestScope]);

  const publish = async () => {
    if (!workspace?.period_id || validatedRevision !== workspace.draft_revision ||
        errors.length > 0 || allWarningKeys.some((key) => !ack.has(key))) return;
    const ticket = requestScope.begin('publish');
    if (!ticket.isCurrent()) return;
    setBusy(true);
    setMessage('');
    try {
      attempt.current = prepareRosterPublication(
        workspace.period_id, validatedRevision, Array.from(ack), () => crypto.randomUUID(), attempt.current,
      );
      const command = attempt.current.command;
      await ticket.run(() => publishRosterRevision({
        periodId: command.period_id,
        expectedRevision: command.expected_revision,
        acknowledgedWarningKeys: command.acknowledged_warning_keys,
        operationId: command.operation_id,
      }));
      await ticket.run(async () => { await onPublished(); });
      ticket.assertCurrent();
      onClose();
    } catch (err: any) {
      if (!ticket.isCurrent()) return;
      const payload = err?.response?.data;
      setMessage(payload?.message || payload?.error || (payload ? JSON.stringify(payload) : err?.message) || 'Publish failed.');
    } finally { if (ticket.isCurrent()) setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Review before publishing</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography color="text.secondary">This publishes draft revision {workspace?.draft_revision}. If another manager changes the roster first, the server returns a revision conflict instead of overwriting their work.</Typography>
          <Alert severity="info">Publishing a draft week publishes all its shifts, including individually unpublished shifts. While the week stays published, an individually unpublished shift must be republished separately.</Alert>
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
          {validatedRevision !== null && !errors.length && !warnings.length && <Alert severity="success">No blocking errors or warnings.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={publish} disabled={busy || validatedRevision !== workspace?.draft_revision || errors.length > 0 || ack.size !== allWarningKeys.length}>Publish reviewed roster</Button>
      </DialogActions>
    </Dialog>
  );
}
