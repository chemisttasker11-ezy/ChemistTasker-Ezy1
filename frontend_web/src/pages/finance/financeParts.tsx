// Presentation for Invoices (finance workspace). Pure UI: the workspace owns data and actions.
import { Box, Stack, Typography } from '@mui/material';
import { FileText, Landmark, ListChecks, PiggyBank } from 'lucide-react';
import { financeStatus, type FinanceInvoice, type FinanceTaxCode } from '@chemisttasker/shared-core';
import { Pill } from '../../components/ui/Pill';
import { type StatusTone } from '../../components/ui/tone';
import { Facts, InvoiceSection, PayToDetails, formatDay } from '../dashboard/sidebar/Invoices/invoiceParts';
import { dollars } from './helpers';

export const taxLabels: Record<FinanceTaxCode, string> = { GST: 'GST 10%', GST_FREE: 'GST-free', INPUT_TAXED: 'Input taxed', OUT_OF_SCOPE: 'No GST' };

/** One wording and tone per invoice state, so the list, editor and review all say the same thing. */
export function financeState(invoice: FinanceInvoice): { label: string; tone: StatusTone; hint: string } {
  const status = financeStatus(invoice);
  switch (status) {
    case 'Paid': return { label: 'Paid', tone: 'green', hint: 'Payment recorded' };
    case 'Overdue': return { label: 'Overdue', tone: 'red', hint: 'Past its due date and not paid' };
    case 'Revision requested': return { label: 'Changes requested', tone: 'amber', hint: 'The pharmacy asked for a corrected invoice' };
    case 'Approved for payment': return { label: 'Approved', tone: 'cyan', hint: 'Checked and approved for payment, not paid yet' };
    case 'Part paid': return { label: 'Part paid', tone: 'blue', hint: 'Some of it is paid; the rest is still owed' };
    case 'Sent': return { label: 'Sent', tone: 'blue', hint: 'Sent and waiting for payment' };
    case 'Void': return { label: 'Void', tone: 'neutral', hint: 'Cancelled; kept for your records' };
    default: return { label: 'Draft', tone: 'neutral', hint: 'Saved, not sent yet' };
  }
}

export function FinanceStatusPill({ invoice }: { invoice: FinanceInvoice }) {
  const state = financeState(invoice);
  return <Pill label={state.label} tone={state.tone} title={state.hint} />;
}

/** "Due 14 Oct", "Due today", "3 days overdue". */
export function dueText(invoice: FinanceInvoice): string {
  const due = invoice.payload.due_date;
  if (!due) return '';
  if (invoice.status === 'paid' || invoice.status === 'draft') return `Due ${formatDay(due)}`;
  const days = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
  return days === 0 ? 'Due today' : `Due ${formatDay(due)}`;
}

const label = { color: 'var(--ct-text-secondary)', fontSize: 12.5, mb: 0.5 } as const;
const muted = { color: 'var(--ct-text-secondary)', fontSize: 14 } as const;

/** The invoice as the payer reads it: parties, lines, totals, where to pay. Used for review and past revisions. */
export function InvoiceDocument({ invoice, onCopy }: { invoice: FinanceInvoice; onCopy: (label: string, value: string) => void }) {
  const p = invoice.payload;
  const calc = invoice.calculation;
  const owed = Number(invoice.paid) > 0 ? invoice.balance : calc.payable;
  return (
    <Stack spacing={2}>
      <InvoiceSection icon={<FileText />} tone="violet" title="Invoice">
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mb: 2.5 }}>
          <Box>
            <Typography sx={label}>From</Typography>
            <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600 }}>{p.issuer_name || 'Name not given'}</Typography>
            {p.issuer_abn ? <Typography sx={muted}>ABN {p.issuer_abn}</Typography> : null}
            <Typography sx={muted}>{p.gst_registered ? 'GST registered' : 'Not GST registered'}</Typography>
          </Box>
          <Box>
            <Typography sx={label}>Bill to</Typography>
            <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600 }}>{p.customer?.name || 'Customer not given'}</Typography>
            {p.customer?.address ? <Typography sx={{ ...muted, whiteSpace: 'pre-line' }}>{p.customer.address}</Typography> : null}
            {p.customer?.abn ? <Typography sx={muted}>ABN {p.customer.abn}</Typography> : null}
          </Box>
        </Box>
        <Facts columns={4} items={[
          { label: 'Issued', value: formatDay(p.invoice_date) },
          { label: 'Due', value: formatDay(p.due_date) },
          { label: 'Reference', value: p.reference },
          { label: 'Version', value: `Revision ${invoice.version}` },
        ]} />
      </InvoiceSection>

      <InvoiceSection icon={<ListChecks />} tone="magenta" title="Work and costs">
        {p.lines.length ? (
          <Box component="ul" aria-label="Line items" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {p.lines.map((line, index) => (
              <Stack component="li" key={`${line.source_assignment_id ?? 'line'}-${index}`} direction="row" spacing={2} justifyContent="space-between" alignItems="flex-start" sx={{ py: 1.5, borderTop: index ? '1px solid var(--ct-border-color)' : 'none' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 14.5, overflowWrap: 'anywhere' }}>{line.description || 'Item'}</Typography>
                  <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 13.5 }}>
                    {[line.worked_on && formatDay(line.worked_on), `${Number(line.quantity)} ${line.unit || ''} × ${dollars(line.unit_price)}`.replace('  ', ' '), line.tax_code && taxLabels[line.tax_code]].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 14.5, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{calc.lines[index] ? dollars(calc.lines[index].gross) : ''}</Typography>
              </Stack>
            ))}
          </Box>
        ) : <Typography sx={muted}>This invoice has no line items.</Typography>}
        <Box component="dl" sx={{ m: 0, mt: 2, ml: { sm: 'auto' }, maxWidth: { sm: 360 }, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 0.75, columnGap: 2 }}>
          {([['Subtotal', calc.subtotal], ['GST', calc.gst], ...(Number(invoice.paid) > 0 ? [['Paid so far', invoice.paid]] : [])] as [string, string][]).map(([name, value]) => (
            <Box key={name} sx={{ display: 'contents' }}>
              <Typography component="dt" sx={{ ...muted }}>{name}</Typography>
              <Typography component="dd" sx={{ m: 0, color: 'var(--ct-text-primary)', fontSize: 14, fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{dollars(value)}</Typography>
            </Box>
          ))}
          <Box sx={{ gridColumn: '1 / -1', borderTop: '1px solid var(--ct-border-color)', mt: 0.5 }} />
          <Typography component="dt" sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 15, alignSelf: 'center' }}>Total payable</Typography>
          <Typography component="dd" sx={{ m: 0, textAlign: 'right', color: 'var(--ct-accent-strong)', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{dollars(calc.payable)}</Typography>
        </Box>
        {p.notes ? <Typography sx={{ ...muted, mt: 2, whiteSpace: 'pre-line' }}>Note: {p.notes}</Typography> : null}
      </InvoiceSection>

      <InvoiceSection icon={<Landmark />} tone="cyan" title="Pay to">
        <PayToDetails rows={[['Account name', p.bank_account_name], ['BSB', p.bsb], ['Account number', p.account_number]]} amountDue={dollars(owed)} onCopy={onCopy} />
      </InvoiceSection>

      {Number(calc.super) > 0 ? (
        <InvoiceSection icon={<PiggyBank />} tone="magenta" title="Super (paid to the fund)">
          <Facts items={[
            { label: 'Amount', value: dollars(calc.super) },
            { label: 'Rate', value: `${Number(p.super_rate)}%` },
            { label: 'Fund', value: p.super_fund_name },
            { label: 'USI', value: p.super_usi },
            { label: 'Member number', value: p.super_member_number },
          ]} />
        </InvoiceSection>
      ) : null}
    </Stack>
  );
}
