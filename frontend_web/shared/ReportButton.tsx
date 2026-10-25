'use client';

// "Report" on a public talent post or job board shift (Vite and Next). Reports go to that board's moderators.
import { useState } from 'react';
import { Alert, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, TextField, Typography } from '@mui/material';
import { Flag } from 'lucide-react';
import { BOARD_REPORT_REASONS, reportBoardItem } from '@chemisttasker/shared-core';

export function ReportButton({ kind, id }: { kind: 'talent' | 'jobs'; id: number }) {
  const thing = kind === 'talent' ? 'profile' : 'shift';
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const close = () => { if (!busy) { setOpen(false); setError(''); } };
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await reportBoardItem(kind, id, [reason, details.trim()].filter(Boolean).join(': '));
      setSent(true);
      setOpen(false);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      setError(status === 401 || status === 403
        ? `Sign in to report a ${thing}.`
        : `We couldn't send your report. Try again in a moment.`);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return <Typography role="status" sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary, #445474)' }}>Reported. Thank you.</Typography>;
  }
  return (
    <>
      <ButtonBase onClick={() => setOpen(true)} aria-label={`Report this ${thing}`}
        sx={{ gap: 0.5, minHeight: 44, minWidth: 44, px: 0.75, borderRadius: '8px', fontSize: 12.5, fontWeight: 600, color: 'var(--ct-text-secondary, #445474)',
          '& svg': { width: 14, height: 14 }, '&:hover': { color: 'var(--ct-text-primary, #06214A)', bgcolor: 'var(--ct-hover-bg, #F5F8FC)' },
          '&:focus-visible': { outline: '2px solid var(--ct-accent-strong, #3C18A8)', outlineOffset: 2 } }}>
        <Flag aria-hidden />Report
      </ButtonBase>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs" aria-labelledby={`report-${kind}-${id}`}>
        <DialogTitle id={`report-${kind}-${id}`} sx={{ fontFamily: 'var(--ct-font-display, Outfit, sans-serif)', fontWeight: 500 }}>Report this {thing}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: 'var(--ct-text-secondary, #445474)', mb: 1.5 }}>
            Our moderators review every report. The person who posted it is not told who reported it.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <RadioGroup value={reason} onChange={event => setReason(event.target.value)} aria-label="What is wrong">
            {BOARD_REPORT_REASONS.map(option => <FormControlLabel key={option} value={option} control={<Radio />} label={option} />)}
          </RadioGroup>
          <TextField label="Anything else? (optional)" value={details} onChange={event => setDetails(event.target.value)} fullWidth multiline minRows={2}
            inputProps={{ maxLength: 400 }} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={busy || !reason} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {busy ? 'Sending…' : 'Send report'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
