import { rowTitle, rowMeta } from './InvoiceRows';
import { type FinanceInvoice } from '@chemisttasker/shared-core';
import {
  Alert, Box, Button,
  Drawer,
  IconButton,
  Stack,
  Tooltip, Typography
} from '@mui/material';
import {
  CheckCircle2,
  Download,
  Pencil,
  X
} from 'lucide-react';
import SectionCard from '../../components/ui/SectionCard';
import { dueText, FinanceStatusPill, InvoiceDocument } from './financeParts';
import { dollars } from './helpers';

import { receivedKey } from './invoiceFilters';

export type ReviewAction = { invoice: FinanceInvoice; kind: 'approve' | 'revise' | 'paid'; note: string };
type Props = {
  reviewInvoice: FinanceInvoice | null; historyDocument: FinanceInvoice | null; receivedMode: boolean; busy: boolean; error: string; notice: string;
  onClose: () => void; clearError: () => void; clearNotice: () => void; clearDocument: () => void;
  copy: (label: string, value: string) => void; openRevision: (invoice: FinanceInvoice, version: number) => void; downloadRevision: (invoice: FinanceInvoice, version: number) => void;
  onPdf: (invoice: FinanceInvoice) => void; onOpenInvoice: (invoice: FinanceInvoice) => void; onReview: (action: ReviewAction) => void;
};
export default function InvoiceReviewDrawer({ reviewInvoice, historyDocument, receivedMode, busy, error, notice, onClose, clearError, clearNotice, clearDocument, copy, openRevision, downloadRevision, onPdf, onOpenInvoice, onReview }: Props) {
  const shown = historyDocument || reviewInvoice;
  const reviewKey = reviewInvoice ? receivedKey(reviewInvoice) : null;
  const historicalReview = reviewInvoice?.is_current === false;
  return (
    <Drawer anchor="right" open={Boolean(reviewInvoice)} onClose={onClose} PaperProps={{ 'data-ct-tokens': '', sx: { width: { xs: '100%', sm: 680 }, bgcolor: 'var(--ct-page-bg)', backgroundImage: 'none' } } as object} aria-labelledby="finance-review-title">
      {reviewInvoice && shown && <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5} sx={{ px: { xs: 2, sm: 3 }, pt: 2.5, pb: 2, borderBottom: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography id="finance-review-title" component="h2" sx={{ color: 'var(--ct-text-primary)', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 24 }}>{reviewInvoice.number}</Typography>
              <FinanceStatusPill invoice={reviewInvoice} />
            </Stack>
            <Typography sx={rowMeta}>{receivedMode ? `From ${reviewInvoice.payload.issuer_name}` : `To ${reviewInvoice.payload.customer?.name || 'customer'}`} · {dollars(reviewInvoice.calculation.payable)} · {dueText(reviewInvoice)}</Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose} disabled={busy} sx={{ width: 44, height: 44 }}><X size={20} /></IconButton>
        </Stack>
        <Stack spacing={2} sx={{ px: { xs: 2, sm: 3 }, py: 2.5, flex: 1 }}>
          {error && <Alert severity="error" onClose={clearError}>{error}</Alert>}
          {notice && <Alert severity="success" onClose={clearNotice}>{notice}</Alert>}
          {historicalReview && <Alert severity="info">The contractor saved a newer version but hasn't sent it yet. This is the last one they sent, so it can't be approved or changed here.</Alert>}
          {receivedMode && reviewKey === 'waiting' && reviewInvoice.last_review_note ? <Alert severity="warning">You asked for changes: {reviewInvoice.last_review_note}</Alert> : null}
          {!receivedMode && reviewInvoice.has_unsent_revision && <Alert severity="info">You have a newer saved version that hasn't been sent. The pharmacy only sees sent versions.</Alert>}
          {historyDocument && <Alert severity="info" action={<Button color="inherit" onClick={clearDocument}>Show current</Button>}>You're looking at revision {historyDocument.version}.</Alert>}
          <InvoiceDocument invoice={shown} onCopy={copy} />
          <SectionCard dense title="History">
            {reviewInvoice.revisions?.length ? <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {reviewInvoice.revisions.map(revision => <Stack component="li" key={revision.version} direction="row" alignItems="center" spacing={1} sx={{ py: 1.25, borderTop: '1px solid var(--ct-border-color)', '&:first-of-type': { borderTop: 'none' } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ ...rowTitle, fontSize: 14 }}>Revision {revision.version}{historyDocument?.version === revision.version ? ' · showing' : ''}</Typography>
                  <Typography sx={{ ...rowMeta, fontSize: 12.5 }}>{[revision.invoice_status.replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase()), new Date(revision.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }), dollars(revision.calculation.payable)].join(' · ')}</Typography>
                </Box>
                <Button disabled={busy} onClick={() => openRevision(reviewInvoice, revision.version)}>View</Button>
                <Tooltip title="Download this revision"><IconButton aria-label={`Download revision ${revision.version} PDF`} disabled={busy} onClick={() => downloadRevision(reviewInvoice, revision.version)} sx={{ width: 40, height: 40 }}><Download size={17} /></IconButton></Tooltip>
              </Stack>)}
            </Box> : <Typography sx={rowMeta}>No earlier revisions.</Typography>}
          </SectionCard>
        </Stack>
        <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} justifyContent="flex-end" sx={{ position: 'sticky', bottom: 0, px: { xs: 2, sm: 3 }, py: 1.75, borderTop: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)' }}>
          {receivedMode ? <>
            <Button variant="outlined" disabled={busy || historicalReview || reviewInvoice.status === 'paid'} onClick={() => onReview({ invoice: reviewInvoice, kind: 'paid', note: '' })} sx={{ minHeight: 44 }}>Mark as paid</Button>
            <Button variant="outlined" color="warning" disabled={busy || historicalReview} onClick={() => onReview({ invoice: reviewInvoice, kind: 'revise', note: '' })} sx={{ minHeight: 44 }}>Ask for changes</Button>
            <Tooltip title={reviewInvoice.status === 'paid' ? 'Already paid' : reviewKey === 'approved' ? 'Already approved' : ''}><span style={{ display: 'flex' }}>
              <Button fullWidth variant="contained" startIcon={<CheckCircle2 size={16} />} disabled={busy || historicalReview || reviewKey === 'approved' || reviewInvoice.status === 'paid'} onClick={() => onReview({ invoice: reviewInvoice, kind: 'approve', note: '' })} sx={{ minHeight: 44 }}>Approve for payment</Button>
            </span></Tooltip>
          </> : <>
            <Button variant="outlined" startIcon={<Download size={15} />} disabled={busy} onClick={() => onPdf(reviewInvoice)} sx={{ minHeight: 44 }}>Download PDF</Button>
            {reviewInvoice.kind === 'invoice' && <Button variant="contained" startIcon={<Pencil size={15} />} onClick={() => onOpenInvoice(reviewInvoice)} sx={{ minHeight: 44 }}>Open invoice</Button>}
          </>}
        </Stack>
      </Box>}
    </Drawer>

  );
}
