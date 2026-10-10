import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer,
  IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Snackbar, Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, Copy, Download, FileText, History, Mail, MoreHorizontal,
  Pencil, PiggyBank, Plus, RefreshCw, Send, Wallet, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { finance, financeStatus, type FinanceCustomer, type FinanceItem, type FinanceInvoice, type FinanceExpense, type FinanceWorksheet } from '@chemisttasker/shared-core';
import { CustomerEditor, ItemEditor, ExpenseEditor, PaymentEditor } from './Editors';
import InvoiceComposer from './InvoiceComposer';
import { takeFinanceHandoff } from './handoff';
import { today, dollars, download, downloadCsv, errorMessage } from './helpers';
import { FinanceStatusPill, InvoiceDocument, dueText } from './financeParts';
import DashboardContentState from '../../components/dashboard/DashboardContentState';
import { buildInvoiceStats, filterInvoicesByTimeframe, INVOICE_TIMEFRAME_OPTIONS, type InvoiceTimeframe } from '../dashboard/sidebar/Invoices/invoiceStats';
import { formatDay } from '../dashboard/sidebar/Invoices/invoiceParts';
import { Pill } from '../dashboard/shiftCenter/ShiftCentreParts';
import { ConfirmDialog } from '../dashboard/sidebar/owner/teamUi';
import PageHeader from '../../components/ui/PageHeader';
import MetricStrip from '../../components/ui/MetricStrip';

type Editor = { kind: 'customer'; value?: FinanceCustomer } | { kind: 'item'; value?: FinanceItem }
  | { kind: 'invoice'; value?: FinanceInvoice; prefillShiftId?: number } | { kind: 'expense'; value?: FinanceExpense }
  | { kind: 'payment'; value: FinanceInvoice };
type Confirmation = { title: string; body: string; confirmLabel: string; busyLabel: string; action: () => Promise<unknown> };
const workerTools = ['invoices', 'customers', 'items', 'expenses', 'bas'] as const;
const ownerTools = ['received'] as const;
const labels: Record<string, string> = { invoices: 'Invoices', received: 'Received invoices', customers: 'Customers', items: 'Saved items', expenses: 'Expenses', bas: 'GST worksheet' };
const timeframeLabel = (value: InvoiceTimeframe) => ({ '30d': 'Last 30 days', '90d': 'Last 90 days', this_year: 'This year', all: 'All time' }[value]);

// Worker list filters. "Sent" covers everything sent and still owed that is not overdue or sent back.
type StatusKey = 'all' | 'saved' | 'sent' | 'revision' | 'overdue' | 'paid';
const statusTabs: [StatusKey, string][] = [['all', 'All'], ['saved', 'Drafts'], ['sent', 'Sent'], ['revision', 'Changes requested'], ['overdue', 'Overdue'], ['paid', 'Paid']];
function statusKey(invoice: FinanceInvoice): StatusKey | null {
  const status = financeStatus(invoice);
  if (status === 'Saved') return 'saved';
  if (status === 'Overdue') return 'overdue';
  if (status === 'Paid') return 'paid';
  if (status === 'Revision requested') return 'revision';
  if (['Sent', 'Part paid', 'Approved for payment'].includes(status)) return 'sent';
  return null;
}

// Pharmacy side: what still needs the reader's attention comes first.
type ReceivedKey = 'all' | 'review' | 'waiting' | 'approved' | 'paid';
const receivedTabs: [ReceivedKey, string, string][] = [
  ['all', 'All', ''],
  ['review', 'To review', 'Check these and approve them or ask for changes'],
  ['waiting', 'With contractor', 'Waiting for the contractor to send a corrected or newer version'],
  ['approved', 'Approved', 'Approved for payment, not marked paid yet'],
  ['paid', 'Paid', 'Payment recorded'],
];
function receivedKey(invoice: FinanceInvoice): Exclude<ReceivedKey, 'all'> {
  if (invoice.status === 'paid') return 'paid';
  // A newer version is saved but unsent: nothing to act on until the contractor sends it.
  if (invoice.review_status === 'REVISION_REQUESTED' || invoice.is_current === false) return 'waiting';
  if (invoice.review_status === 'APPROVED_FOR_PAYMENT') return 'approved';
  return 'review';
}
const receivedOrder: Record<Exclude<ReceivedKey, 'all'>, number> = { review: 0, approved: 1, waiting: 2, paid: 3 };

const panelSx = { p: { xs: 2, md: 2.5 }, borderRadius: 'var(--ct-card-radius)', borderColor: 'var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)', boxShadow: 'none', minWidth: 0 } as const;
const rowTitle = { color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 15 } as const;
const rowMeta = { color: 'var(--ct-text-secondary)', fontSize: 13.5, lineHeight: 1.5 } as const;
const amountSx = { color: 'var(--ct-text-primary)', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 19, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

function Panel({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return <Paper variant="outlined" component="section" aria-label={title} sx={panelSx}>
    {title || action ? <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
      {title ? <Typography component="h2" sx={{ color: 'var(--ct-text-primary)', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 18 }}>{title}</Typography> : <span />}
      {action}
    </Stack> : null}
    {children}
  </Paper>;
}

function Empty({ title, detail, actionLabel, onAction }: { title: string; detail: string; actionLabel?: string; onAction?: () => void }) {
  return <DashboardContentState kind="empty" title={title} description={detail} actionLabel={actionLabel} onAction={onAction} compact />;
}

/** A note under a row: why it needs attention. */
function RowNote({ tone, children }: { tone: 'amber' | 'neutral'; children: ReactNode }) {
  return <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ mt: 0.75, color: tone === 'amber' ? 'var(--ct-status-amber-fg)' : 'var(--ct-text-secondary)', '& svg': { flexShrink: 0, mt: '3px' } }}>
    {tone === 'amber' ? <AlertTriangle size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
    <Typography sx={{ fontSize: 13.5, lineHeight: 1.45, color: 'inherit', overflowWrap: 'anywhere' }}>{children}</Typography>
  </Stack>;
}

export default function FinanceWorkspace({ receivedMode = false }: { receivedMode?: boolean }) {
  const [params, setParams] = useSearchParams();
  const availableTools = receivedMode ? ownerTools : workerTools;
  const requested = params.get('tool');
  const tool = availableTools.find(value => value === requested) || (receivedMode ? 'received' : 'invoices');
  const [customers, setCustomers] = useState<FinanceCustomer[]>([]);
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [receivedInvoices, setReceivedInvoices] = useState<FinanceInvoice[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(''); const [attempt, setAttempt] = useState(0);
  const running = useRef(false);
  const [invoiceStatus, setInvoiceStatus] = useState<StatusKey>('all');
  const [receivedFilter, setReceivedFilter] = useState<ReceivedKey>('all');
  const [snapshotTimeframe, setSnapshotTimeframe] = useState<InvoiceTimeframe>('this_year');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; invoice: FinanceInvoice } | null>(null);
  const [historyInvoice, setHistoryInvoice] = useState<FinanceInvoice | null>(null);
  const [historyDocument, setHistoryDocument] = useState<FinanceInvoice | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reviewAction, setReviewAction] = useState<{ invoice: FinanceInvoice; kind: 'approve' | 'revise' | 'paid'; note: string } | null>(null);
  const [worksheet, setWorksheet] = useState<FinanceWorksheet | null>(null);
  const [periodStart, setPeriodStart] = useState(`${Number(today().slice(0, 4)) - (Number(today().slice(5, 7)) < 7 ? 1 : 0)}-07-01`);
  const [periodEnd, setPeriodEnd] = useState(today()); const [basis, setBasis] = useState<'cash' | 'accrual'>('cash');

  const load = async () => {
    if (receivedMode) {
      const next = await finance.receivedInvoices();
      setReceivedInvoices(next);
      // Keep an open review in step with the refreshed list.
      setHistoryInvoice(current => current ? next.find(invoice => invoice.id === current.id) ?? null : null);
      return;
    }
    const [nextCustomers, nextItems, nextInvoices, nextExpenses] = await Promise.all([finance.customers(), finance.items(), finance.invoices(), finance.expenses()]);
    setCustomers(nextCustomers); setItems(nextItems); setInvoices(nextInvoices); setExpenses(nextExpenses); setWorksheet(null);
  };
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadFailed('');
    const request = receivedMode
      ? finance.receivedInvoices().then(inv => { if (active) setReceivedInvoices(inv); })
      : Promise.all([finance.customers(), finance.items(), finance.invoices(), finance.expenses()]).then(([c, i, inv, exp]) => {
          if (active) { setCustomers(c); setItems(i); setInvoices(inv); setExpenses(exp); }
        });
    request.catch(failure => { if (active) setLoadFailed(errorMessage(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [receivedMode, attempt]);
  const run = async (action: () => Promise<unknown>, success = '') => {
    if (running.current) return; running.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); if (success) setNotice(success); } catch (failure) { setError(errorMessage(failure)); } finally { running.current = false; setBusy(false); }
  };
  const refreshAfterSave = async () => {
    // A failed list refresh must not turn a successful create into a retryable form.
    setNotice('Saved.');
    try { await load(); } catch (failure) { setError(`Saved, but the list didn't refresh. Use Refresh. ${errorMessage(failure)}`); }
  };
  const copy = (label: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => setToast(`${label} copied`), () => setToast(`Couldn't copy the ${label.toLowerCase()}`));
  };
  // Deep links: ?invoice=<id> opens that invoice (composer for the issuer, history for the recipient),
  // ?shift=<id> starts a new invoice prefilled from that accepted shift, ?new=1 starts a blank one.
  const handledLink = useRef(false);
  useEffect(() => {
    if (loading || handledLink.current) return;
    const handoff = takeFinanceHandoff();
    const invoiceId = params.get('invoice') ?? handoff?.invoice ?? null;
    const shiftId = params.get('shift') ?? params.get('shiftId') ?? handoff?.shift ?? null;
    const fresh = params.get('new') ?? (handoff?.new ? '1' : null);
    if (!invoiceId && !shiftId && !fresh) return;
    handledLink.current = true;
    const next = new URLSearchParams(params);
    ['invoice', 'shift', 'shiftId', 'pharmacyId', 'new'].forEach(key => next.delete(key));
    setParams(next, { replace: true });
    const matches = (invoice: FinanceInvoice) => String(invoice.id) === invoiceId || String(invoice.invoice_id) === invoiceId;
    if (invoiceId && receivedMode) {
      const found = receivedInvoices.find(matches);
      if (found) openHistory(found);
      else setError(`Invoice ${invoiceId} isn't in your received invoices. It may have been replaced by a newer revision.`);
    } else if (invoiceId) {
      const found = invoices.find(matches);
      if (found) setEditor({ kind: 'invoice', value: found });
      else void finance.invoice(invoiceId).then(value => setEditor({ kind: 'invoice', value })).catch(() => setError(`Invoice ${invoiceId} couldn't be opened. It may have been removed.`));
    } else if (!receivedMode) {
      setEditor({ kind: 'invoice', prefillShiftId: shiftId ? Number(shiftId) : undefined });
    }
    // Runs once, after the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  const changeTool = (value: string) => { const next = new URLSearchParams(params); next.set('tool', value); setParams(next); setSearch(''); };
  const ask = (confirm: Confirmation) => { setError(''); setMenu(null); setConfirmation(confirm); };
  const openHistory = (invoice: FinanceInvoice) => { setHistoryInvoice(invoice); setHistoryDocument(null); setMenu(null); };
  const closeHistory = () => { if (!busy) { setHistoryInvoice(null); setHistoryDocument(null); } };
  const openRevision = (invoice: FinanceInvoice, version: number) => void run(async () => {
    const document = receivedMode
      ? await finance.receivedRevision(invoice.id, version)
      : await finance.invoiceRevision(invoice.id, version);
    setHistoryDocument(document);
  });
  const downloadRevision = (invoice: FinanceInvoice, version: number) => void run(async () => {
    const blob = receivedMode
      ? await finance.receivedRevisionPdf(invoice.id, version)
      : await finance.invoiceRevisionPdf(invoice.id, version);
    download(blob, `${invoice.number}-v${version}.pdf`);
  });
  const matches = (...values: (string | undefined)[]) => values.join(' ').toLowerCase().includes(search.toLowerCase());
  const serviceInvoices = invoices.filter(invoice => invoice.kind === 'invoice' && !invoice.voided);
  const snapshotInvoices = filterInvoicesByTimeframe(serviceInvoices.map(invoice => ({
    status: invoice.status,
    total: invoice.calculation.payable,
    balance: invoice.balance,
    paid: invoice.paid,
    overdue: financeStatus(invoice) === 'Overdue',
    invoice_date: invoice.payload.invoice_date,
  })), snapshotTimeframe);
  const stats = buildInvoiceStats(snapshotInvoices);
  const countOf = (predicate: (item: (typeof snapshotInvoices)[number]) => boolean) => snapshotInvoices.filter(predicate).length;
  const viewInvoice = (invoice: FinanceInvoice) => setEditor({ kind: 'invoice', value: invoice });
  const filtersActive = invoiceStatus !== 'all' || customerFilter !== 'all' || Boolean(fromDate || toDate || search);
  const resetFilters = () => { setInvoiceStatus('all'); setCustomerFilter('all'); setFromDate(''); setToDate(''); setSearch(''); };
  const otherFilters = (invoice: FinanceInvoice) => (customerFilter === 'all' || String(invoice.payload.customer_id) === customerFilter)
    && (!fromDate || invoice.payload.invoice_date >= fromDate) && (!toDate || invoice.payload.invoice_date <= toDate)
    && matches(invoice.number, invoice.payload.customer?.name, invoice.payload.reference, invoice.status, invoice.review_status);
  const visibleInvoices = invoices.filter(invoice => (invoiceStatus === 'all' || statusKey(invoice) === invoiceStatus) && otherFilters(invoice));
  const statusCount = (key: StatusKey) => invoices.filter(invoice => (key === 'all' || statusKey(invoice) === key) && otherFilters(invoice)).length;
  const searchedReceived = receivedInvoices.filter(invoice =>
    matches(invoice.number, invoice.payload.issuer_name, invoice.payload.reference, invoice.status, invoice.review_status));
  const visibleReceived = searchedReceived
    .filter(invoice => receivedFilter === 'all' || receivedKey(invoice) === receivedFilter)
    .sort((a, b) => receivedOrder[receivedKey(a)] - receivedOrder[receivedKey(b)] || b.payload.invoice_date.localeCompare(a.payload.invoice_date));
  const toReview = receivedInvoices.filter(invoice => receivedKey(invoice) === 'review').length;
  const needsChanges = invoices.filter(invoice => statusKey(invoice) === 'revision').length;
  const overdueCount = invoices.filter(invoice => statusKey(invoice) === 'overdue').length;
  const invoiceCsv = () => downloadCsv('workspace-invoices.csv', [['Number', 'Kind', 'Customer', 'Date', 'Due', 'Worker or fund payable AUD', 'GST AUD', 'Paid AUD', 'Balance AUD', 'Status'],
    ...visibleInvoices.map(invoice => [invoice.number, invoice.kind, invoice.payload.customer?.name || '', invoice.payload.invoice_date, invoice.payload.due_date,
      invoice.calculation.payable, invoice.calculation.gst, invoice.paid, invoice.balance, invoice.status])]);
  const expenseCsv = () => downloadCsv('workspace-expenses.csv', [['Supplier', 'Description', 'Incurred', 'Paid', 'Gross AUD', 'GST AUD', 'Creditable business use %', 'Estimated GST credit AUD', 'Reference'],
    ...expenses.map(expense => [expense.supplier, expense.description, expense.incurred_on, expense.paid_on || '', expense.amount, expense.gst_amount, expense.business_use_percent, expense.gst_credit, expense.reference])]);

  if (editor?.kind === 'invoice') return <Box data-ct-tokens="" sx={{ maxWidth: 1600, mx: 'auto' }}><InvoiceComposer key={editor.value?.id ?? 'new'} initial={editor.value} prefillShiftId={editor.prefillShiftId} previous={serviceInvoices[0]} customers={customers} items={items} onClose={() => setEditor(null)} onSaved={refreshAfterSave} /></Box>;

  const headerPills = receivedMode
    ? (toReview ? <Pill tone="amber" label={`${toReview} to review`} title="Invoices waiting for you to approve or ask for changes" /> : null)
    : <>{overdueCount ? <Pill tone="red" label={`${overdueCount} overdue`} title="Past their due date and not paid" /> : null}{needsChanges ? <Pill tone="amber" label={`${needsChanges} need changes`} title="The pharmacy asked for a corrected invoice" /> : null}</>;

  const invoiceRow = (invoice: FinanceInvoice) => {
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
        <Button variant="outlined" disabled={busy} startIcon={isInvoice ? <Pencil size={15} /> : <Download size={15} />} onClick={() => { if (isInvoice) viewInvoice(invoice); else void run(async () => download(await finance.pdf(invoice.id), `${invoice.number}.pdf`)); }} sx={{ minHeight: 40, minWidth: 96 }}>
          {isInvoice ? (financeStatus(invoice) === 'Revision requested' ? 'Fix' : 'Open') : 'PDF'}
        </Button>
        <Tooltip title="More actions">
          <IconButton aria-label={`More actions for ${invoice.number}`} disabled={busy} onClick={event => setMenu({ anchor: event.currentTarget, invoice })} sx={{ width: 40, height: 40, border: '1px solid var(--ct-border-color)', borderRadius: '12px' }}>
            <MoreHorizontal size={18} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>;
  };

  const receivedRow = (invoice: FinanceInvoice) => {
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
          <IconButton aria-label={`Download ${invoice.number} PDF`} disabled={busy} onClick={() => void run(async () => download(await finance.receivedPdf(invoice.id), `${invoice.number}-v${invoice.version}.pdf`))} sx={{ width: 40, height: 40, border: '1px solid var(--ct-border-color)', borderRadius: '12px' }}>
            <Download size={17} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>;
  };

  const shown = historyDocument || historyInvoice;
  const reviewInvoice = historyInvoice;
  const reviewKey = reviewInvoice ? receivedKey(reviewInvoice) : null;
  const historicalReview = reviewInvoice?.is_current === false;

  return <Box data-ct-tokens="" sx={{ maxWidth: 1600, mx: 'auto' }}>
    <PageHeader
      title="Invoices"
      subtitle={receivedMode
        ? 'Invoices locums and contractors send for shifts at your pharmacy. Check each one, then approve it for payment or ask for changes.'
        : 'Create, send and track invoices for your shifts. Your customers, expenses and GST worksheet are here too.'}
      actions={<>
        {headerPills}
        <Button variant="outlined" disabled={busy || loading} startIcon={busy ? <CircularProgress size={15} color="inherit" /> : <RefreshCw size={15} />} onClick={() => void run(load, 'Up to date.')} sx={{ minHeight: 44 }}>Refresh</Button>
        {!receivedMode && <Button variant="contained" disabled={loading || busy} startIcon={<Plus size={16} />} onClick={() => { changeTool('invoices'); setEditor({ kind: 'invoice' }); }} sx={{ minHeight: 44 }}>New invoice</Button>}
      </>}
    >
      {availableTools.length > 1 ? <Tabs value={tool} variant="scrollable" scrollButtons={false} onChange={(_, value: string) => changeTool(value)} aria-label="Finance tools" sx={{ borderBottom: '1px solid var(--ct-border-color)' }}>
        {availableTools.map(value => <Tab key={value} value={value} label={labels[value]} id={`finance-tab-${value}`} aria-controls={`finance-panel-${value}`} />)}
      </Tabs> : null}
    </PageHeader>

    <Stack spacing={2} role="tabpanel" id={`finance-panel-${tool}`} aria-labelledby={availableTools.length > 1 ? `finance-tab-${tool}` : undefined}>
      {error && <Alert severity="error" onClose={() => setError('')} role="alert">{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')} role="status">{notice}</Alert>}

      {loading ? <DashboardContentState kind="loading" title={receivedMode ? 'Loading received invoices' : 'Loading your invoices'} /> : loadFailed ? (
        <DashboardContentState kind="error" title={receivedMode ? "Received invoices didn't load" : "Your invoices didn't load"} description={`Nothing has changed. Check your connection and try again. (${loadFailed})`} actionLabel="Try again" onAction={() => setAttempt(n => n + 1)} />
      ) : <>
        {tool === 'invoices' && <>
          {invoices.length ? <Stack spacing={1.25}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 13.5 }}>Totals by invoice date</Typography>
              <TextField select size="small" value={snapshotTimeframe} onChange={event => setSnapshotTimeframe(event.target.value as InvoiceTimeframe)} inputProps={{ 'aria-label': 'Time frame for totals' }} sx={{ width: 160 }}>
                {INVOICE_TIMEFRAME_OPTIONS.map(option => <MenuItem key={option.value} value={option.value}>{timeframeLabel(option.value)}</MenuItem>)}
              </TextField>
            </Stack>
            <MetricStrip label="Invoice totals" items={[
              { label: 'Drafts', value: dollars(stats.draftTotal), caption: `${countOf(i => i.status === 'draft')} not sent yet`, icon: <FileText />, tone: 'violet', onClick: () => setInvoiceStatus('saved') },
              { label: 'Awaiting payment', value: dollars(stats.awaitingPayment), caption: 'Sent and still owed', icon: <Send />, tone: 'blue', onClick: () => setInvoiceStatus('sent') },
              { label: 'Overdue', value: dollars(stats.overdueTotal), caption: `${countOf(i => Boolean(i.overdue))} past the due date`, icon: <AlertTriangle />, tone: 'magenta', onClick: () => setInvoiceStatus('overdue') },
              { label: 'Received', value: dollars(stats.paymentsReceived), caption: `${timeframeLabel(snapshotTimeframe)}`, icon: <Wallet />, tone: 'cyan', onClick: () => setInvoiceStatus('paid') },
            ]} />
          </Stack> : null}
          <Panel title="Your invoices" action={invoices.length ? <Button startIcon={<Download size={15} />} onClick={invoiceCsv} disabled={!visibleInvoices.length}>Export CSV</Button> : undefined}>
            {invoices.length ? <>
              <Tabs value={invoiceStatus} onChange={(_, next: StatusKey) => setInvoiceStatus(next)} variant="scrollable" scrollButtons={false} aria-label="Invoice status" sx={{ mb: 2, minHeight: 40 }}>
                {statusTabs.map(([key, label]) => <Tab key={key} value={key} label={`${label} ${statusCount(key)}`} sx={{ minHeight: 40 }} />)}
              </Tabs>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'minmax(220px, 2fr) minmax(180px, 1.2fr) 170px 170px auto' }, alignItems: 'center', mb: 1 }}>
                <TextField size="small" label="Search" placeholder="Number, customer or reference" value={search} onChange={event => setSearch(event.target.value)} sx={{ gridColumn: { xs: 'auto', sm: '1 / -1', lg: 'auto' } }} />
                <TextField select size="small" label="Customer" value={customerFilter} onChange={event => setCustomerFilter(event.target.value)}>
                  <MenuItem value="all">All customers</MenuItem>{customers.map(customer => <MenuItem key={customer.id} value={String(customer.id)}>{customer.name}</MenuItem>)}
                </TextField>
                <TextField size="small" type="date" label="Issued from" InputLabelProps={{ shrink: true }} value={fromDate} onChange={event => setFromDate(event.target.value)} />
                <TextField size="small" type="date" label="Issued to" InputLabelProps={{ shrink: true }} value={toDate} onChange={event => setToDate(event.target.value)} />
                {filtersActive ? <Button onClick={resetFilters} startIcon={<X size={15} />} sx={{ justifySelf: 'start' }}>Clear filters</Button> : <span />}
              </Box>
              {visibleInvoices.length
                ? <Box component="ul" aria-label="Invoices" aria-busy={busy} sx={{ listStyle: 'none', m: 0, p: 0 }}>{visibleInvoices.map(invoiceRow)}</Box>
                : <Empty title="No invoices match" detail="Change the status, customer, dates or search to see more." actionLabel="Clear filters" onAction={resetFilters} />}
            </> : <Empty title="No invoices yet" detail="Create one from a shift you worked, or start a blank invoice. Nothing is emailed until you choose to send it." actionLabel="New invoice" onAction={() => setEditor({ kind: 'invoice' })} />}
          </Panel>
        </>}

        {tool === 'received' && <Panel title="Received invoices">
          {receivedInvoices.length ? <>
            <Tabs value={receivedFilter} onChange={(_, next: ReceivedKey) => setReceivedFilter(next)} variant="scrollable" scrollButtons={false} aria-label="Invoice review status" sx={{ mb: 2, minHeight: 40 }}>
              {receivedTabs.map(([key, label, hint]) => <Tab key={key} value={key} title={hint || undefined} label={`${label} ${key === 'all' ? searchedReceived.length : searchedReceived.filter(invoice => receivedKey(invoice) === key).length}`} sx={{ minHeight: 40 }} />)}
            </Tabs>
            <TextField size="small" label="Search" placeholder="Contractor, number or reference" value={search} onChange={event => setSearch(event.target.value)} sx={{ mb: 1, maxWidth: { md: 420 } }} />
            {visibleReceived.length
              ? <Box component="ul" aria-label="Received invoices" aria-busy={busy} sx={{ listStyle: 'none', m: 0, p: 0 }}>{visibleReceived.map(receivedRow)}</Box>
              : <Empty title="Nothing here" detail={search ? 'No invoices match your search.' : 'No invoices are in this group right now.'} actionLabel={search ? 'Clear search' : 'Show all'} onAction={() => { setSearch(''); setReceivedFilter('all'); }} />}
          </> : <Empty title="No invoices yet" detail="When a locum or contractor sends an invoice for a shift at your pharmacy, it appears here for you to check and approve." />}
        </Panel>}

        {tool === 'customers' && <Panel title="Customers" action={<Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => setEditor({ kind: 'customer' })}>Add customer</Button>}>
          {customers.length ? <>
            <TextField size="small" label="Search" placeholder="Name or ABN" value={search} onChange={event => setSearch(event.target.value)} sx={{ mb: 1, maxWidth: { md: 420 } }} />
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>{customers.filter(customer => matches(customer.name, customer.abn, customer.legal_name)).map(customer => <Box component="li" key={customer.id} sx={{ py: 2, borderTop: '1px solid var(--ct-border-color)', '&:first-of-type': { borderTop: 'none' } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center"><Typography sx={rowTitle}>{customer.name}</Typography>{!customer.active && <Pill label="Archived" />}</Stack>
                  <Typography sx={rowMeta}>{[customer.email || 'No invoice email', `${customer.payment_terms_days}-day terms`, customer.abn ? `ABN ${customer.abn}` : 'No ABN'].join(' · ')}</Typography>
                  {customer.address ? <Typography sx={rowMeta}>{customer.address}</Typography> : null}
                  {customer.abn_checked_at && <Typography sx={{ ...rowMeta, mt: 0.5 }}>ABN check {formatDay(customer.abn_checked_at)}: {String(customer.abn_result?.entity_name || 'name not returned')}, {String(customer.abn_result?.abn_status || 'status not returned')}. This doesn't change your own GST setting.</Typography>}
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                  <Button variant="outlined" onClick={() => setEditor({ kind: 'customer', value: customer })}>Edit</Button>
                  <Tooltip title={customer.abn ? 'Look up this ABN on the Australian Business Register' : 'Add an ABN first'}><span><Button disabled={!customer.abn || busy} onClick={() => void run(async () => { await finance.lookupAbn(customer.id); await load(); }, 'ABN details fetched. Check the business name matches; a lookup does not prove who owns the ABN.')}>Check ABN</Button></span></Tooltip>
                </Stack>
              </Stack>
            </Box>)}</Box>
          </> : <Empty title="No customers yet" detail="Save each pharmacy or business you bill once: legal name, ABN, invoice email and payment terms." actionLabel="Add customer" onAction={() => setEditor({ kind: 'customer' })} />}
        </Panel>}

        {tool === 'items' && <Panel title="Saved items" action={<Stack direction="row" spacing={1}>{!items.length && <Button disabled={busy} onClick={() => void run(async () => { await finance.seedItems(); await load(); }, 'Starter items added. Check the rates and GST before you use them.')}>Add starter items</Button>}<Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => setEditor({ kind: 'item' })}>Add item</Button></Stack>}>
          {items.length ? <TableContainer><Table aria-label="Saved items"><TableHead><TableRow><TableCell>Item</TableCell><TableCell>Category</TableCell><TableCell align="right">Price</TableCell><TableCell>GST and super</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{items.filter(item => matches(item.code, item.name, item.category)).map(item => <TableRow key={item.id}>
              <TableCell><Typography sx={{ ...rowTitle, fontSize: 14 }}>{item.name}</Typography><Typography sx={{ ...rowMeta, fontSize: 12.5 }}>{item.code}{!item.active ? ' · Archived' : ''}</Typography></TableCell>
              <TableCell>{item.category.replace(/([A-Z])/g, ' $1').trim()}<Typography sx={{ ...rowMeta, fontSize: 12.5 }}>Per {item.unit.toLowerCase()}</Typography></TableCell>
              <TableCell align="right">{dollars(item.unit_price)}</TableCell>
              <TableCell>{item.tax_code === 'GST' ? 'GST 10%' : item.tax_code === 'GST_FREE' ? 'GST-free' : item.tax_code === 'INPUT_TAXED' ? 'Input taxed' : 'No GST'}<Typography sx={{ ...rowMeta, fontSize: 12.5 }}>{item.super_eligible ? 'Counts for super' : 'No super'}</Typography></TableCell>
              <TableCell align="right"><Button onClick={() => setEditor({ kind: 'item', value: item })}>Edit</Button></TableCell>
            </TableRow>)}</TableBody></Table></TableContainer>
            : <Empty title="Save your rates once" detail="Add starter items for hours, travel, accommodation and super, then set your prices and GST." />}
        </Panel>}

        {tool === 'expenses' && <Panel title="Expenses" action={<Stack direction="row" spacing={1}>{expenses.length ? <Button startIcon={<Download size={15} />} onClick={expenseCsv}>Export CSV</Button> : null}<Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => setEditor({ kind: 'expense' })}>Add expense</Button></Stack>}>
          <Typography sx={{ ...rowMeta, mb: 1.5 }}>Receipts are private to you. PDF, PNG or JPEG up to 5 MB each, 50 MB in total. Nothing is read automatically or claimed for you.</Typography>
          {expenses.length ? <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>{expenses.filter(expense => matches(expense.supplier, expense.description, expense.reference)).map(expense => <Box component="li" key={expense.id} sx={{ py: 2, borderTop: '1px solid var(--ct-border-color)', '&:first-of-type': { borderTop: 'none' } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center"><Typography sx={rowTitle}>{expense.supplier}</Typography><Pill tone={expense.paid_on ? 'green' : 'amber'} label={expense.paid_on ? 'Paid' : 'Unpaid'} /></Stack>
                <Typography sx={rowMeta}>{[expense.description, formatDay(expense.incurred_on), `GST credit estimate ${dollars(expense.gst_credit)}`].filter(Boolean).join(' · ')}</Typography>
                {expense.receipts.length ? <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>{expense.receipts.map(receipt => <Button key={receipt.id} size="small" startIcon={<Download size={14} />} disabled={busy} onClick={() => void run(async () => download(await finance.receipt(receipt.id), receipt.filename))}>{receipt.filename}</Button>)}</Stack> : null}
              </Box>
              <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flexShrink: 0 }}>
                <Typography sx={{ ...amountSx, fontSize: 17, mr: 1 }}>{dollars(expense.amount)}</Typography>
                <Button variant="outlined" onClick={() => setEditor({ kind: 'expense', value: expense })}>Edit</Button>
                <Button component="label" disabled={busy}>Attach receipt<input type="file" hidden accept="application/pdf,image/png,image/jpeg" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { await finance.uploadReceipt(expense.id, file, file.name); await load(); }, 'Receipt attached.'); }} /></Button>
              </Stack>
            </Stack>
          </Box>)}</Box> : <Empty title="No expenses yet" detail="Record travel, accommodation, registration, training and other business costs, with their receipts." actionLabel="Add expense" onAction={() => setEditor({ kind: 'expense' })} />}
        </Panel>}

        {tool === 'bas' && <Panel title="GST worksheet">
          <Stack spacing={2.5}>
            <Alert severity="warning">A starting point only: not a full BAS, not lodged for you and not tax advice. Older invoices and unsupported adjustments are left out.</Alert>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1.4fr auto' }, alignItems: 'center' }}>
              <TextField type="date" label="Period start" InputLabelProps={{ shrink: true }} value={periodStart} onChange={event => { setPeriodStart(event.target.value); setWorksheet(null); }} />
              <TextField type="date" label="Period end" InputLabelProps={{ shrink: true }} value={periodEnd} onChange={event => { setPeriodEnd(event.target.value); setWorksheet(null); }} />
              <TextField select label="GST basis" value={basis} onChange={event => { setBasis(event.target.value as 'cash' | 'accrual'); setWorksheet(null); }}><MenuItem value="cash">Cash: payments received</MenuItem><MenuItem value="accrual">Accrual: invoices issued</MenuItem></TextField>
              <Button variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={15} color="inherit" /> : undefined} onClick={() => void run(async () => setWorksheet(await finance.worksheet(periodStart, periodEnd, basis)))}>Calculate</Button>
            </Box>
            {worksheet && <>
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 1, columnGap: 2, maxWidth: 520 }}>
                {[['G1 · Total sales', worksheet.G1], ['1A · GST on sales', worksheet['1A']], ['1B · GST credits (estimate)', worksheet['1B']], ['GST to pay or refund (estimate)', worksheet.estimated_gst_net]].map(([label, value]) => <Box key={label} sx={{ display: 'contents' }}>
                  <Typography component="dt" sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>{label}</Typography>
                  <Typography component="dd" sx={{ m: 0, textAlign: 'right', color: 'var(--ct-text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{dollars(value)}</Typography>
                </Box>)}
              </Box>
              <Typography sx={rowMeta}>Older invoices left out: {worksheet.excluded_legacy_invoice_count}. Expenses to check for receipts: {worksheet.expenses_needing_evidence.length || 'none'}. These checks don't mean the period is ready to lodge.</Typography>
              {worksheet.warnings.map(warning => <Typography key={warning} sx={rowMeta}>{warning}</Typography>)}
              <Button startIcon={<Download size={15} />} sx={{ alignSelf: 'flex-start' }} onClick={() => downloadCsv('gst-worksheet-DRAFT.csv', [['DRAFT ONLY', 'Not a complete BAS'], ['Start', worksheet.start], ['End', worksheet.end], ['Basis', worksheet.basis], ['G1', worksheet.G1], ['1A', worksheet['1A']], ['1B', worksheet['1B']], ['Estimated GST net', worksheet.estimated_gst_net], ['Excluded legacy invoices', worksheet.excluded_legacy_invoice_count]])}>Download worksheet (CSV)</Button>
            </>}
          </Stack>
        </Panel>}
      </>}
    </Stack>

    <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)} slotProps={{ list: { dense: true } }}>
      {menu && (() => {
        const invoice = menu.invoice; const isInvoice = invoice.kind === 'invoice';
        const item = (icon: ReactNode, label: string, onClick: () => void, disabled = false, hint?: string) =>
          <MenuItem disabled={disabled} onClick={onClick} sx={{ minHeight: 44 }}><ListItemIcon sx={{ color: 'var(--ct-text-secondary)' }}>{icon}</ListItemIcon><ListItemText primary={label} secondary={hint} /></MenuItem>;
        return [
          item(<History size={17} />, 'History', () => openHistory(invoice)),
          item(<Download size={17} />, 'Download PDF', () => { setMenu(null); void run(async () => download(await finance.pdf(invoice.id), `${invoice.number}.pdf`)); }),
          item(<Mail size={17} />, 'Email to customer', () => ask({ title: `Email ${invoice.number} to ${invoice.payload.customer?.name || 'the customer'}?`, body: `The saved PDF (revision ${invoice.version}) goes to ${invoice.payload.customer?.email || 'the customer, but no invoice email is saved for them'}. If you change it later, you can send the new revision.`, confirmLabel: 'Send email', busyLabel: 'Sending…', action: async () => { const result = await finance.send(invoice.id, invoice.version); setNotice(result.detail); await load(); } })),
          item(<Copy size={17} />, 'Duplicate', () => { const key = crypto.randomUUID(); ask({ title: `Duplicate ${invoice.number}?`, body: 'Creates a new draft with the same customer and lines. Shift links, payments and email history are not copied.', confirmLabel: 'Duplicate', busyLabel: 'Duplicating…', action: async () => { const result = await finance.duplicate(invoice.id, key); await load(); setEditor({ kind: 'invoice', value: result }); } }); }, !isInvoice),
          <Divider key="divider" />,
          item(<CheckCircle2 size={17} />, 'Mark as paid', () => ask({ title: `Mark ${invoice.number} as paid?`, body: 'Use this when the full amount has arrived. You can still edit the invoice later if something needs correcting.', confirmLabel: 'Mark as paid', busyLabel: 'Saving…', action: async () => { await finance.markPaid(invoice.id, invoice.version); await load(); } }), invoice.status === 'paid'),
          item(<CircleDollarSign size={17} />, 'Record a payment', () => { setEditor({ kind: 'payment', value: invoice }); setMenu(null); }, Number(invoice.balance || '0') <= 0, Number(invoice.balance || '0') <= 0 ? 'Nothing owed' : 'Optional, for part payments'),
          item(<PiggyBank size={17} />, 'Create super request', () => ask({ title: 'Create a separate super request?', body: 'Creates a linked request for the super amount, paid to your fund. Your service payment stays separate.', confirmLabel: 'Create request', busyLabel: 'Creating…', action: async () => { await finance.superDocument(invoice.id, invoice.version); await load(); } }), !isInvoice || invoice.payload.super_mode !== 'separate' || Boolean(invoice.super_document_id), invoice.super_document_id ? 'Already created' : invoice.payload.super_mode !== 'separate' ? 'Set super to "separate" first' : undefined),
        ];
      })()}
    </Menu>

    <Drawer anchor="right" open={Boolean(historyInvoice)} onClose={closeHistory} PaperProps={{ 'data-ct-tokens': '', sx: { width: { xs: '100%', sm: 680 }, bgcolor: 'var(--ct-page-bg)', backgroundImage: 'none' } } as object} aria-labelledby="finance-review-title">
      {reviewInvoice && shown && <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5} sx={{ px: { xs: 2, sm: 3 }, pt: 2.5, pb: 2, borderBottom: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography id="finance-review-title" component="h2" sx={{ color: 'var(--ct-text-primary)', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 24 }}>{reviewInvoice.number}</Typography>
              <FinanceStatusPill invoice={reviewInvoice} />
            </Stack>
            <Typography sx={rowMeta}>{receivedMode ? `From ${reviewInvoice.payload.issuer_name}` : `To ${reviewInvoice.payload.customer?.name || 'customer'}`} · {dollars(reviewInvoice.calculation.payable)} · {dueText(reviewInvoice)}</Typography>
          </Box>
          <IconButton aria-label="Close" onClick={closeHistory} disabled={busy} sx={{ width: 44, height: 44 }}><X size={20} /></IconButton>
        </Stack>
        <Stack spacing={2} sx={{ px: { xs: 2, sm: 3 }, py: 2.5, flex: 1 }}>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
          {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
          {historicalReview && <Alert severity="info">The contractor saved a newer version but hasn't sent it yet. This is the last one they sent, so it can't be approved or changed here.</Alert>}
          {receivedMode && reviewKey === 'waiting' && reviewInvoice.last_review_note ? <Alert severity="warning">You asked for changes: {reviewInvoice.last_review_note}</Alert> : null}
          {!receivedMode && reviewInvoice.has_unsent_revision && <Alert severity="info">You have a newer saved version that hasn't been sent. The pharmacy only sees sent versions.</Alert>}
          {historyDocument && <Alert severity="info" action={<Button color="inherit" onClick={() => setHistoryDocument(null)}>Show current</Button>}>You're looking at revision {historyDocument.version}.</Alert>}
          <InvoiceDocument invoice={shown} onCopy={copy} />
          <Panel title="History">
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
          </Panel>
        </Stack>
        <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} justifyContent="flex-end" sx={{ position: 'sticky', bottom: 0, px: { xs: 2, sm: 3 }, py: 1.75, borderTop: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)' }}>
          {receivedMode ? <>
            <Button variant="outlined" disabled={busy || historicalReview || reviewInvoice.status === 'paid'} onClick={() => setReviewAction({ invoice: reviewInvoice, kind: 'paid', note: '' })} sx={{ minHeight: 44 }}>Mark as paid</Button>
            <Button variant="outlined" color="warning" disabled={busy || historicalReview} onClick={() => setReviewAction({ invoice: reviewInvoice, kind: 'revise', note: '' })} sx={{ minHeight: 44 }}>Ask for changes</Button>
            <Tooltip title={reviewInvoice.status === 'paid' ? 'Already paid' : reviewKey === 'approved' ? 'Already approved' : ''}><span style={{ display: 'flex' }}>
              <Button fullWidth variant="contained" startIcon={<CheckCircle2 size={16} />} disabled={busy || historicalReview || reviewKey === 'approved' || reviewInvoice.status === 'paid'} onClick={() => setReviewAction({ invoice: reviewInvoice, kind: 'approve', note: '' })} sx={{ minHeight: 44 }}>Approve for payment</Button>
            </span></Tooltip>
          </> : <>
            <Button variant="outlined" startIcon={<Download size={15} />} disabled={busy} onClick={() => void run(async () => download(await finance.pdf(reviewInvoice.id), `${reviewInvoice.number}.pdf`))} sx={{ minHeight: 44 }}>Download PDF</Button>
            {reviewInvoice.kind === 'invoice' && <Button variant="contained" startIcon={<Pencil size={15} />} onClick={() => { const value = reviewInvoice; closeHistory(); viewInvoice(value); }} sx={{ minHeight: 44 }}>Open invoice</Button>}
          </>}
        </Stack>
      </Box>}
    </Drawer>

    {editor?.kind === 'customer' && <CustomerEditor initial={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    {editor?.kind === 'item' && <ItemEditor initial={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    {editor?.kind === 'expense' && <ExpenseEditor initial={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    {editor?.kind === 'payment' && <PaymentEditor invoice={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}

    <Dialog open={Boolean(reviewAction)} onClose={() => { if (!busy) setReviewAction(null); }} maxWidth="sm" fullWidth aria-labelledby="finance-review-action-title">
      {reviewAction && (() => {
        const { invoice, kind } = reviewAction; const who = invoice.payload.issuer_name || 'the contractor';
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
              value={reviewAction.note} onChange={event => setReviewAction(current => current ? { ...current, note: event.target.value } : null)} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button disabled={busy} onClick={() => setReviewAction(null)}>Cancel</Button>
            <Button variant="contained" color={kind === 'revise' ? 'warning' : 'primary'} disabled={busy || (kind === 'revise' && !reviewAction.note.trim())} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={() => void run(async () => {
              if (kind === 'revise') await finance.requestRevision(invoice.id, invoice.version, reviewAction.note.trim());
              else if (kind === 'paid') await finance.markReceivedPaid(invoice.id, invoice.version, reviewAction.note.trim());
              else await finance.approveForPayment(invoice.id, invoice.version, reviewAction.note.trim());
              setReviewAction(null); await load();
            }, copyFor.done)}>{busy ? copyFor.busyLabel : copyFor.label}</Button>
          </DialogActions>
        </>;
      })()}
    </Dialog>

    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} destructive={false} busy={busy}
      body={<>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{confirmation?.body}</>}
      confirmLabel={confirmation?.confirmLabel ?? 'Confirm'} busyLabel={confirmation?.busyLabel ?? 'Working…'}
      onClose={() => { if (!busy) setConfirmation(null); }}
      onConfirm={() => void run(async () => { await confirmation?.action(); setConfirmation(null); })} />

    <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast('')} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
  </Box>;
}
