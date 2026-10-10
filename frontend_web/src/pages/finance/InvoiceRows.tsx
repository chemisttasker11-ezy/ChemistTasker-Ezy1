import { financeStatus, type FinanceInvoice } from '@chemisttasker/shared-core';
import {
  Box, Button,
  IconButton,
  Stack,
  Tooltip, Typography
} from '@mui/material';
import {
  AlertTriangle,
  Clock3,
  Download, FileText,
  MoreHorizontal,
  Pencil
} from 'lucide-react';
import { type ReactNode } from 'react';
import DashboardContentState from '../../components/dashboard/DashboardContentState';
import { Pill } from '../../components/ui/Pill';
import { formatDay } from '../dashboard/sidebar/Invoices/invoiceParts';
import { dueText, FinanceStatusPill } from './financeParts';
import { dollars } from './helpers';

import { receivedKey } from './invoiceFilters';
export const rowTitle = { color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 15 } as const;
export const rowMeta = { color: 'var(--ct-text-secondary)', fontSize: 13.5, lineHeight: 1.5 } as const;
export const amountSx = { color: 'var(--ct-text-primary)', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 19, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

export function Empty({ title, detail, actionLabel, onAction }: { title: string; detail: string; actionLabel?: string; onAction?: () => void }) {
  return <DashboardContentState kind="empty" title={title} description={detail} actionLabel={actionLabel} onAction={onAction} compact />;
}

/** A note under a row: why it needs attention. */
function RowNote({ tone, children }: { tone: 'amber' | 'neutral'; children: ReactNode }) {
  return <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ mt: 0.75, color: tone === 'amber' ? 'var(--ct-status-amber-fg)' : 'var(--ct-text-secondary)', '& svg': { flexShrink: 0, mt: '3px' } }}>
    {tone === 'amber' ? <AlertTriangle size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
    <Typography sx={{ fontSize: 13.5, lineHeight: 1.45, color: 'inherit', overflowWrap: 'anywhere' }}>{children}</Typography>
  </Stack>;
}

export function InvoiceRow({ invoice, busy, viewInvoice, onPdf, onMenu }: {
  invoice: FinanceInvoice; busy: boolean; viewInvoice: (invoice: FinanceInvoice) => void; onPdf: (invoice: FinanceInvoice) => void; onMenu: (anchor: HTMLElement, invoice: FinanceInvoice) => void;
}) {
    const isInvoice = invoice.kind === 'invoice';
    const partPaid = Number(invoice.paid) > 0 && Number(invoice.balance) > 0;
    const openRequest = invoice.review_requests?.find(request => !request.resolved_at);
    return <Box component="li" key={invoice.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', md: 'minmax(0, 1fr) 150px auto' }, columnGap: 2, rowGap: 1, alignItems: 'center', py: 2, borderTop: '1px solid var(--ct-border-color)', '&:first-of-type': { borderTop: 'none' } }}>
      <Box sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', md: 'auto' } }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography sx={rowTitle}>{invoice.payload.customer?.name || 'No customer'}</Typography>
          <FinanceStatusPill invoice={invoice} />
        </Stack>
        <Typography sx={rowMeta}>
          {[invoice.number, isInvoice ? `Issued ${formatDay(invoice.payload.invoice_date)}` : 'Super fund request', dueText(invoice), invoice.version > 1 ? `Revision ${invoice.version}` : '', invoice.delivery_status ? `Email ${invoice.delivery_status}` : ''].filter(Boolean).join(' · ')}
        </Typography>
        {financeStatus(invoice) === 'Revision requested' ? <RowNote tone="amber">{openRequest ? `${openRequest.requested_by_name} asked: ${openRequest.note}` : invoice.last_review_note || 'The pharmacy asked for changes.'}</RowNote> : null}
      </Box>
      <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
        <Typography sx={amountSx}>{dollars(invoice.calculation.payable)}</Typography>
        {partPaid ? <Typography sx={{ ...rowMeta, fontSize: 12.5 }}>{dollars(invoice.balance)} still owed</Typography> : null}
      </Box>
      <Stack direction="row" spacing={0.75} justifyContent="flex-end">
        <Button variant="outlined" disabled={busy} startIcon={isInvoice ? <Pencil size={15} /> : <Download size={15} />} onClick={() => { if (isInvoice) viewInvoice(invoice); else onPdf(invoice); }} sx={{ minHeight: 40, minWidth: 96 }}>
          {isInvoice ? (financeStatus(invoice) === 'Revision requested' ? 'Fix' : 'Open') : 'PDF'}
        </Button>
        <Tooltip title="More actions">
          <IconButton aria-label={`More actions for ${invoice.number}`} disabled={busy} onClick={event => onMenu(event.currentTarget, invoice)} sx={{ width: 40, height: 40, border: '1px solid var(--ct-border-color)', borderRadius: '12px' }}>
            <MoreHorizontal size={18} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>;
  }

export function ReceivedInvoiceRow({ invoice, busy, openHistory, onPdf }: {
  invoice: FinanceInvoice; busy: boolean; openHistory: (invoice: FinanceInvoice) => void; onPdf: (invoice: FinanceInvoice) => void;
}) {
    const historicalOnly = invoice.is_current === false;
    const key = receivedKey(invoice);
    return <Box component="li" key={invoice.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', md: 'minmax(0, 1fr) 150px auto' }, columnGap: 2, rowGap: 1, alignItems: 'center', py: 2, borderTop: '1px solid var(--ct-border-color)', '&:first-of-type': { borderTop: 'none' } }}>
      <Box sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', md: 'auto' } }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography sx={rowTitle}>{invoice.payload.issuer_name || 'Contractor'}</Typography>
          <FinanceStatusPill invoice={invoice} />
          {historicalOnly ? <Pill outlined label="Last sent version" title="A newer version is saved but not sent yet" /> : null}
        </Stack>
        <Typography sx={rowMeta}>{[invoice.number, invoice.payload.customer?.name, `Issued ${formatDay(invoice.payload.invoice_date)}`, dueText(invoice)].filter(Boolean).join(' · ')}</Typography>
        {key === 'waiting' && invoice.last_review_note ? <RowNote tone="amber">You asked: {invoice.last_review_note}</RowNote> : null}
        {historicalOnly ? <RowNote tone="neutral">The contractor saved a newer version but hasn't sent it. You're seeing the last one they sent.</RowNote> : null}
      </Box>
      <Typography sx={{ ...amountSx, textAlign: { xs: 'left', md: 'right' } }}>{dollars(invoice.calculation.payable)}</Typography>
      <Stack direction="row" spacing={0.75} justifyContent="flex-end">
        <Button variant={key === 'review' && !historicalOnly ? 'contained' : 'outlined'} disabled={busy} startIcon={<FileText size={15} />} onClick={() => openHistory(invoice)} aria-label={`Review ${invoice.number} from ${invoice.payload.issuer_name}`} sx={{ minHeight: 40, minWidth: 112 }}>
          {key === 'review' && !historicalOnly ? 'Review' : 'View'}
        </Button>
        <Tooltip title="Download PDF">
          <IconButton aria-label={`Download ${invoice.number} PDF`} disabled={busy} onClick={() => onPdf(invoice)} sx={{ width: 40, height: 40, border: '1px solid var(--ct-border-color)', borderRadius: '12px' }}>
            <Download size={17} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>;
  }

