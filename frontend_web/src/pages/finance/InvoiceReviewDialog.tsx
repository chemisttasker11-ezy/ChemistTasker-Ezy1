import {
  Alert,
  Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  TextField,
  Typography
} from '@mui/material';
import { dollars } from './helpers';

import type { ReviewAction } from './InvoiceReviewDrawer';

export default function InvoiceReviewDialog({ action, busy, error, onClose, onNote, onFundConfirmation, onConfirm }: { action: ReviewAction | null; busy: boolean; error: string; onClose: () => void; onNote: (note: string) => void; onFundConfirmation: (confirmed: boolean) => void; onConfirm: (action: ReviewAction, success: string) => void }) {
  return (
    <Dialog open={Boolean(action)} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="finance-review-action-title">
      {action && (() => {
        const { invoice, kind } = action; const who = invoice.payload.issuer_name || 'the contractor';
        const needsFundConfirmation = kind === 'paid' && invoice.kind === 'super_request';
        const copyFor = {
          approve: { title: `Approve ${invoice.number} for payment?`, body: `This records that the invoice is correct. Pay ${dollars(invoice.calculation.payable)} to the account on the invoice, then mark it paid.`, label: 'Approve for payment', busyLabel: 'Approving…', done: 'Invoice approved for payment.' },
          revise: { title: `Ask ${who} for changes?`, body: `Say what needs fixing. ${who} gets your note and sends a corrected version; this one stays in the history.`, label: 'Send request', busyLabel: 'Sending…', done: `Change request sent to ${who}.` },
          paid: { title: `Mark ${invoice.number} as paid?`, body: 'Do this once the money has left your account.', label: 'Mark as paid', busyLabel: 'Saving…', done: 'Invoice marked as paid.' },
        }[kind];
        return <>
          <DialogTitle id="finance-review-action-title" sx={{ fontWeight: 600 }}>{copyFor.title}</DialogTitle>
          <DialogContent>
            <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 15, lineHeight: 1.55, mb: 2 }}>{copyFor.body}</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField autoFocus fullWidth multiline minRows={3} required={kind === 'revise'} disabled={busy}
              label={kind === 'revise' ? 'What needs changing?' : 'Note (optional)'}
              placeholder={kind === 'revise' ? 'For example: the 9 October shift finished at 4pm, so 7.5 hours.' : undefined}
              helperText={kind === 'revise' ? 'Required. Hours, finish time, rate, items or GST.' : undefined}
              value={action.note} onChange={event => onNote(event.target.value)} />
            {needsFundConfirmation && <FormControlLabel disabled={busy} control={<Checkbox checked={Boolean(action.fundPaymentConfirmed)} onChange={event => onFundConfirmation(event.target.checked)} />} label="I confirm this payment went to the super fund" />}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button disabled={busy} onClick={onClose}>Cancel</Button>
            <Button variant="contained" color={kind === 'revise' ? 'warning' : 'primary'} disabled={busy || (kind === 'revise' && !action.note.trim()) || (needsFundConfirmation && !action.fundPaymentConfirmed)} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={() => onConfirm(action, copyFor.done)}>{busy ? copyFor.busyLabel : copyFor.label}</Button>
          </DialogActions>
        </>;
      })()}
    </Dialog>

  );
}
