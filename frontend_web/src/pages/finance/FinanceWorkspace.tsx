import { AuDateField } from '../../components/AuDateField';
import { finance, financeStatus, type FinanceCustomer, type FinanceExpense, type FinanceInvoice, type FinanceItem, type FinanceWorksheet } from '@chemisttasker/shared-core';
import {
  Alert, Box, Button, CircularProgress,
  Divider,
  ListItemIcon, ListItemText, Menu, MenuItem, Snackbar, Stack, Tab,
  Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow,
  Tabs,
  TextField, Tooltip, Typography
} from '@mui/material';
import {
  AlertTriangle, CheckCircle2, CircleDollarSign,
  Copy, Download, FileText, History, Mail,
  PiggyBank, Plus, RefreshCw, Send, Wallet, X
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardContentState from '../../components/dashboard/DashboardContentState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import MetricStrip from '../../components/ui/MetricStrip';
import PageHeader from '../../components/ui/PageHeader';
import { Pill } from '../../components/ui/Pill';
import SectionCard from '../../components/ui/SectionCard';
import { formatDay } from '../dashboard/sidebar/Invoices/invoiceParts';
import { buildInvoiceStats, filterInvoicesByTimeframe, INVOICE_TIMEFRAME_OPTIONS, type InvoiceTimeframe } from '../dashboard/sidebar/Invoices/invoiceStats';
import { CustomerEditor, ExpenseEditor, ItemEditor, PaymentEditor } from './Editors';
import { dollars, download, downloadCsv, errorMessage, today } from './helpers';
import InvoiceComposer from './InvoiceComposer';

import { receivedKey, receivedOrder, receivedTabs, statusKey, statusTabs, type ReceivedKey, type StatusKey } from './invoiceFilters';
import InvoiceReviewDialog from './InvoiceReviewDialog';
import InvoiceReviewDrawer, { type ReviewAction } from './InvoiceReviewDrawer';
import { Empty, InvoiceRow, ReceivedInvoiceRow, rowTitle, rowMeta, amountSx } from './InvoiceRows';
import { useFinanceData } from './useFinanceData';

type Editor = { kind: 'customer'; value?: FinanceCustomer } | { kind: 'item'; value?: FinanceItem }
  | { kind: 'invoice'; value?: FinanceInvoice; prefillShiftId?: number } | { kind: 'expense'; value?: FinanceExpense }
  | { kind: 'payment'; value: FinanceInvoice };
type Confirmation = { title: string; body: string; confirmLabel: string; busyLabel: string; action: () => Promise<unknown> };
const workerTools = ['invoices', 'customers', 'items', 'expenses', 'bas'] as const;
const ownerTools = ['received'] as const;
const labels: Record<string, string> = { invoices: 'Invoices', received: 'Received invoices', customers: 'Customers', items: 'Saved items', expenses: 'Expenses', bas: 'GST worksheet' };
const timeframeLabel = (value: InvoiceTimeframe) => ({ '30d': 'Last 30 days', '90d': 'Last 90 days', this_year: 'This year', all: 'All time' }[value]);

export default function FinanceWorkspace({ receivedMode = false }: { receivedMode?: boolean }) {
  const [params, setParams] = useSearchParams();
  const availableTools = receivedMode ? ownerTools : workerTools;
  const requested = params.get('tool');
  const tool = availableTools.find(value => value === requested) || (receivedMode ? 'received' : 'invoices');
  const { customers, items, invoices, receivedInvoices, expenses, loading, loadFailed, reload, retry } = useFinanceData(receivedMode);
  const [busy, setBusy] = useState(false);
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
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [worksheet, setWorksheet] = useState<FinanceWorksheet | null>(null);
  const [periodStart, setPeriodStart] = useState(`${Number(today().slice(0, 4)) - (Number(today().slice(5, 7)) < 7 ? 1 : 0)}-07-01`);
  const [periodEnd, setPeriodEnd] = useState(today()); const [basis, setBasis] = useState<'cash' | 'accrual'>('cash');

  const load = async () => { await reload(); setWorksheet(null); };
  useEffect(() => {
    if (receivedMode) setHistoryInvoice(current => current ? receivedInvoices.find(invoice => invoice.id === current.id) ?? null : null);
  }, [receivedMode, receivedInvoices]);
  const run = async (action: () => Promise<unknown>, success = '') => {
    if (running.current) return; running.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); if (success) setNotice(success); } catch (failure) { setError(errorMessage(failure)); } finally { running.current = false; setBusy(false); }
  };
  const refreshAfterMutation = async (success = 'Saved.') => {
    setNotice(success);
    try { await load(); } catch (failure) { setError(`The change was saved, but the list didn't refresh. Use Refresh. ${errorMessage(failure)}`); }
  };
  const refreshAfterSave = () => refreshAfterMutation();
  const copy = (label: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => setToast(`${label} copied`), () => setToast(`Couldn't copy the ${label.toLowerCase()}`));
  };
  // The URL owns which invoice is open: ?invoice=<id> (composer for the issuer, review for the recipient),
  // ?shift=<id> (or ?shiftId=) a new invoice prefilled from that accepted shift, ?new=1 a blank one. Links work on
  // first load and while the page is open; a link that arrives during a failed load opens after Try again.
  const linkInvoice = params.get('invoice');
  const linkShift = params.get('shift') ?? params.get('shiftId');
  const linkNew = params.get('new');
  const linkKey = `${linkInvoice ?? ''}|${linkShift ?? ''}|${linkNew ?? ''}`;
  const linkRequest = useRef(0);
  useEffect(() => () => { linkRequest.current += 1; }, []);
  const setLink = (link: { invoice?: string | number; shift?: string | number; new?: boolean } | null) => {
    const opening = Boolean(link);
    setParams(current => {
      const next = new URLSearchParams(current);
      ['invoice', 'shift', 'shiftId', 'new'].forEach(key => next.delete(key));
      if (link && !receivedMode) next.delete('tool'); // the composer belongs to the Invoices tool
      if (link?.invoice != null) next.set('invoice', String(link.invoice));
      else if (link?.shift != null) next.set('shift', String(link.shift));
      else if (link?.new) next.set('new', '1');
      return next;
    }, { replace: !opening });
  };
  useEffect(() => {
    const request = ++linkRequest.current;
    if (!linkInvoice && !linkShift && !linkNew) {
      setEditor(current => current?.kind === 'invoice' ? null : current);
      if (receivedMode) { setHistoryInvoice(null); setHistoryDocument(null); }
      return;
    }
    if (loading || loadFailed) return; // Kept in the URL; handled once the list has loaded.
    const matches = (invoice: FinanceInvoice) => String(invoice.id) === linkInvoice || String(invoice.invoice_id) === linkInvoice;
    if (receivedMode) {
      if (!linkInvoice) return;
      const found = receivedInvoices.find(matches);
      if (found) { setHistoryInvoice(found); setHistoryDocument(null); }
      else { setError(`Invoice ${linkInvoice} isn't in your received invoices. It may have been replaced by a newer revision.`); setLink(null); }
      return;
    }
    if (linkInvoice) {
      const found = invoices.find(matches);
      if (found) { setEditor({ kind: 'invoice', value: found }); return; }
      finance.invoice(linkInvoice)
        .then(value => { if (request === linkRequest.current) setEditor({ kind: 'invoice', value }); })
        .catch(() => { if (request === linkRequest.current) { setError(`Invoice ${linkInvoice} couldn't be opened. It may have been removed.`); setLink(null); } });
      return;
    }
    setEditor({ kind: 'invoice', prefillShiftId: linkShift ? Number(linkShift) : undefined });
    // Re-runs when the link or the loaded lists change; the editor and review state follow the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkKey, loading, loadFailed, invoices, receivedInvoices]);
  const changeTool = (value: string) => { const next = new URLSearchParams(params); next.set('tool', value); setParams(next); setSearch(''); };
  const ask = (confirm: Confirmation) => { setError(''); setMenu(null); setConfirmation(confirm); };
  // Pharmacy side: the review panel follows ?invoice= like the issuer's composer. The issuer's history panel is local.
  const openHistory = (invoice: FinanceInvoice) => { setMenu(null); if (receivedMode) setLink({ invoice: invoice.id }); else { setHistoryInvoice(invoice); setHistoryDocument(null); } };
  const closeHistory = () => { if (busy) return; if (receivedMode) setLink(null); else { setHistoryInvoice(null); setHistoryDocument(null); } };
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
  const viewInvoice = (invoice: FinanceInvoice) => setLink({ invoice: invoice.id });
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

  if (editor?.kind === 'invoice') return <Box data-ct-tokens="" sx={{ maxWidth: 1600, mx: 'auto' }}><InvoiceComposer key={linkKey} initial={editor.value} prefillShiftId={editor.prefillShiftId} previous={serviceInvoices[0]} customers={customers} items={items} onClose={() => setLink(null)} onSaved={refreshAfterSave} /></Box>;

  const headerPills = receivedMode
    ? (toReview ? <Pill tone="amber" label={`${toReview} to review`} title="Invoices waiting for you to approve or ask for changes" /> : null)
    : <>{overdueCount ? <Pill tone="red" label={`${overdueCount} overdue`} title="Past their due date and not paid" /> : null}{needsChanges ? <Pill tone="amber" label={`${needsChanges} need changes`} title="The pharmacy asked for a corrected invoice" /> : null}</>;

  return <Box data-ct-tokens="" sx={{ maxWidth: 1600, mx: 'auto' }}>
    <PageHeader
      title="Invoices"
      subtitle={receivedMode
        ? 'Invoices locums and contractors send for shifts at your pharmacy. Check each one, then approve it for payment or ask for changes.'
        : 'Create, send and track invoices for your shifts. Your customers, expenses and GST worksheet are here too.'}
      actions={<>
        {headerPills}
        <Button variant="outlined" disabled={busy || loading} startIcon={busy ? <CircularProgress size={15} color="inherit" /> : <RefreshCw size={15} />} onClick={() => void run(load, 'Up to date.')} sx={{ minHeight: 44 }}>Refresh</Button>
        {!receivedMode && <Button variant="contained" disabled={loading || busy} startIcon={<Plus size={16} />} onClick={() => setLink({ new: true })} sx={{ minHeight: 44 }}>New invoice</Button>}
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
        <DashboardContentState kind="error" title={receivedMode ? "Received invoices didn't load" : "Your invoices didn't load"} description={`Nothing has changed. Check your connection and try again. (${loadFailed})`} actionLabel="Try again" onAction={retry} />
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
          <SectionCard dense title="Your invoices" action={invoices.length ? <Button startIcon={<Download size={15} />} onClick={invoiceCsv} disabled={!visibleInvoices.length}>Export CSV</Button> : undefined}>
            {invoices.length ? <>
              <Tabs value={invoiceStatus} onChange={(_, next: StatusKey) => setInvoiceStatus(next)} variant="scrollable" scrollButtons={false} aria-label="Invoice status" sx={{ mb: 2, minHeight: 40 }}>
                {statusTabs.map(([key, label]) => <Tab key={key} value={key} label={`${label} ${statusCount(key)}`} sx={{ minHeight: 40 }} />)}
              </Tabs>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'minmax(220px, 2fr) minmax(180px, 1.2fr) 170px 170px auto' }, alignItems: 'center', mb: 1 }}>
                <TextField size="small" label="Search" placeholder="Number, customer or reference" value={search} onChange={event => setSearch(event.target.value)} sx={{ gridColumn: { xs: 'auto', sm: '1 / -1', lg: 'auto' } }} />
                <TextField select size="small" label="Customer" value={customerFilter} onChange={event => setCustomerFilter(event.target.value)}>
                  <MenuItem value="all">All customers</MenuItem>{customers.map(customer => <MenuItem key={customer.id} value={String(customer.id)}>{customer.name}</MenuItem>)}
                </TextField>
                <AuDateField size="small" label="Issued from" value={fromDate} onChange={isoValue => setFromDate(isoValue)} />
                <AuDateField size="small" label="Issued to" value={toDate} onChange={isoValue => setToDate(isoValue)} />
                {filtersActive ? <Button onClick={resetFilters} startIcon={<X size={15} />} sx={{ justifySelf: 'start' }}>Clear filters</Button> : <span />}
              </Box>
              {visibleInvoices.length
                ? <Box component="ul" aria-label="Invoices" aria-busy={busy} sx={{ listStyle: 'none', m: 0, p: 0 }}>{visibleInvoices.map(invoice => <InvoiceRow key={invoice.id} invoice={invoice} busy={busy} viewInvoice={viewInvoice}
                    onPdf={value => void run(async () => download(await finance.pdf(value.id), `${value.number}.pdf`))}
                    onMenu={(anchor, value) => setMenu({ anchor, invoice: value })} />)}</Box>
                : <Empty title="No invoices match" detail="Change the status, customer, dates or search to see more." actionLabel="Clear filters" onAction={resetFilters} />}
            </> : <Empty title="No invoices yet" detail="Create one from a shift you worked, or start a blank invoice. Nothing is emailed until you choose to send it." actionLabel="New invoice" onAction={() => setLink({ new: true })} />}
          </SectionCard>
        </>}

        {tool === 'received' && <SectionCard dense title="Received invoices">
          {receivedInvoices.length ? <>
            <Tabs value={receivedFilter} onChange={(_, next: ReceivedKey) => setReceivedFilter(next)} variant="scrollable" scrollButtons={false} aria-label="Invoice review status" sx={{ mb: 2, minHeight: 40 }}>
              {receivedTabs.map(([key, label, hint]) => <Tab key={key} value={key} title={hint || undefined} label={`${label} ${key === 'all' ? searchedReceived.length : searchedReceived.filter(invoice => receivedKey(invoice) === key).length}`} sx={{ minHeight: 40 }} />)}
            </Tabs>
            <TextField size="small" label="Search" placeholder="Contractor, number or reference" value={search} onChange={event => setSearch(event.target.value)} sx={{ mb: 1, maxWidth: { md: 420 } }} />
            {visibleReceived.length
              ? <Box component="ul" aria-label="Received invoices" aria-busy={busy} sx={{ listStyle: 'none', m: 0, p: 0 }}>{visibleReceived.map(invoice => <ReceivedInvoiceRow key={invoice.id} invoice={invoice} busy={busy} openHistory={openHistory}
                  onPdf={value => void run(async () => download(await finance.receivedPdf(value.id), `${value.number}-v${value.version}.pdf`))} />)}</Box>
              : <Empty title="Nothing here" detail={search ? 'No invoices match your search.' : 'No invoices are in this group right now.'} actionLabel={search ? 'Clear search' : 'Show all'} onAction={() => { setSearch(''); setReceivedFilter('all'); }} />}
          </> : <Empty title="No invoices yet" detail="When a locum or contractor sends an invoice for a shift at your pharmacy, it appears here for you to check and approve." />}
        </SectionCard>}

        {tool === 'customers' && <SectionCard dense title="Customers" action={<Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => setEditor({ kind: 'customer' })}>Add customer</Button>}>
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
                  <Tooltip title={customer.abn ? 'Look up this ABN on the Australian Business Register' : 'Add an ABN first'}><span><Button disabled={!customer.abn || busy} onClick={() => void run(async () => { await finance.lookupAbn(customer.id); await refreshAfterMutation(); }, 'ABN details fetched. Check the business name matches; a lookup does not prove who owns the ABN.')}>Check ABN</Button></span></Tooltip>
                </Stack>
              </Stack>
            </Box>)}</Box>
          </> : <Empty title="No customers yet" detail="Save each pharmacy or business you bill once: legal name, ABN, invoice email and payment terms." actionLabel="Add customer" onAction={() => setEditor({ kind: 'customer' })} />}
        </SectionCard>}

        {tool === 'items' && <SectionCard dense title="Saved items" action={<Stack direction="row" spacing={1}>{!items.length && <Button disabled={busy} onClick={() => void run(async () => { await finance.seedItems(); await refreshAfterMutation(); }, 'Starter items added. Check the rates and GST before you use them.')}>Add starter items</Button>}<Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => setEditor({ kind: 'item' })}>Add item</Button></Stack>}>
          {items.length ? <TableContainer><Table aria-label="Saved items"><TableHead><TableRow><TableCell>Item</TableCell><TableCell>Category</TableCell><TableCell align="right">Price</TableCell><TableCell>GST and super</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{items.filter(item => matches(item.code, item.name, item.category)).map(item => <TableRow key={item.id}>
              <TableCell><Typography sx={{ ...rowTitle, fontSize: 14 }}>{item.name}</Typography><Typography sx={{ ...rowMeta, fontSize: 12.5 }}>{item.code}{!item.active ? ' · Archived' : ''}</Typography></TableCell>
              <TableCell>{item.category.replace(/([A-Z])/g, ' $1').trim()}<Typography sx={{ ...rowMeta, fontSize: 12.5 }}>Per {item.unit.toLowerCase()}</Typography></TableCell>
              <TableCell align="right">{dollars(item.unit_price)}</TableCell>
              <TableCell>{item.tax_code === 'GST' ? 'GST 10%' : item.tax_code === 'GST_FREE' ? 'GST-free' : item.tax_code === 'INPUT_TAXED' ? 'Input taxed' : 'No GST'}<Typography sx={{ ...rowMeta, fontSize: 12.5 }}>{item.super_eligible ? 'Counts for super' : 'No super'}</Typography></TableCell>
              <TableCell align="right"><Button onClick={() => setEditor({ kind: 'item', value: item })}>Edit</Button></TableCell>
            </TableRow>)}</TableBody></Table></TableContainer>
            : <Empty title="Save your rates once" detail="Add starter items for hours, travel, accommodation and super, then set your prices and GST." />}
        </SectionCard>}

        {tool === 'expenses' && <SectionCard dense title="Expenses" action={<Stack direction="row" spacing={1}>{expenses.length ? <Button startIcon={<Download size={15} />} onClick={expenseCsv}>Export CSV</Button> : null}<Button variant="outlined" startIcon={<Plus size={15} />} onClick={() => setEditor({ kind: 'expense' })}>Add expense</Button></Stack>}>
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
                <Button component="label" disabled={busy}>Attach receipt<input type="file" hidden accept="application/pdf,image/png,image/jpeg" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { await finance.uploadReceipt(expense.id, file, file.name); await refreshAfterMutation(); }, 'Receipt attached.'); }} /></Button>
              </Stack>
            </Stack>
          </Box>)}</Box> : <Empty title="No expenses yet" detail="Record travel, accommodation, registration, training and other business costs, with their receipts." actionLabel="Add expense" onAction={() => setEditor({ kind: 'expense' })} />}
        </SectionCard>}

        {tool === 'bas' && <SectionCard dense title="GST worksheet">
          <Stack spacing={2.5}>
            <Alert severity="warning">A starting point only: not a full BAS, not lodged for you and not tax advice. Older invoices and unsupported adjustments are left out.</Alert>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1.4fr auto' }, alignItems: 'center' }}>
              <AuDateField label="Period start" value={periodStart} onChange={isoValue => { setPeriodStart(isoValue); setWorksheet(null); }} />
              <AuDateField label="Period end" value={periodEnd} onChange={isoValue => { setPeriodEnd(isoValue); setWorksheet(null); }} />
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
        </SectionCard>}
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
          item(<Mail size={17} />, 'Email to customer', () => ask({ title: `Email ${invoice.number} to ${invoice.payload.customer?.name || 'the customer'}?`, body: `The saved PDF (revision ${invoice.version}) goes to ${invoice.payload.customer?.email || 'the customer, but no invoice email is saved for them'}. If you change it later, you can send the new revision.`, confirmLabel: 'Send email', busyLabel: 'Sending…', action: async () => { const result = await finance.send(invoice.id, invoice.version); await refreshAfterMutation(result.detail); } })),
          item(<Copy size={17} />, 'Duplicate', () => { const key = crypto.randomUUID(); ask({ title: `Duplicate ${invoice.number}?`, body: 'Creates a new draft with the same customer and lines. Shift links, payments and email history are not copied.', confirmLabel: 'Duplicate', busyLabel: 'Duplicating…', action: async () => { const result = await finance.duplicate(invoice.id, key); await refreshAfterMutation(); setLink({ invoice: result.id }); } }); }, !isInvoice),
          <Divider key="divider" />,
          item(<CheckCircle2 size={17} />, 'Mark as paid', () => ask({ title: `Mark ${invoice.number} as paid?`, body: 'Use this when the full amount has arrived. You can still edit the invoice later if something needs correcting.', confirmLabel: 'Mark as paid', busyLabel: 'Saving…', action: async () => { await finance.markPaid(invoice.id, invoice.version); await refreshAfterMutation(); } }), invoice.status === 'paid'),
          item(<CircleDollarSign size={17} />, 'Record a payment', () => { setEditor({ kind: 'payment', value: invoice }); setMenu(null); }, Number(invoice.balance || '0') <= 0, Number(invoice.balance || '0') <= 0 ? 'Nothing owed' : 'Optional, for part payments'),
          item(<PiggyBank size={17} />, 'Create super request', () => ask({ title: 'Create a separate super request?', body: 'Creates a linked request for the super amount, paid to your fund. Your service payment stays separate.', confirmLabel: 'Create request', busyLabel: 'Creating…', action: async () => { await finance.superDocument(invoice.id, invoice.version); await refreshAfterMutation(); } }), !isInvoice || invoice.payload.super_mode !== 'separate' || Boolean(invoice.super_document_id), invoice.super_document_id ? 'Already created' : invoice.payload.super_mode !== 'separate' ? 'Set super to "separate" first' : undefined),
        ];
      })()}
    </Menu>

    <InvoiceReviewDrawer reviewInvoice={historyInvoice} historyDocument={historyDocument} receivedMode={receivedMode} busy={busy} error={error} notice={notice}
      onClose={closeHistory} clearError={() => setError('')} clearNotice={() => setNotice('')} clearDocument={() => setHistoryDocument(null)}
      copy={copy} openRevision={openRevision} downloadRevision={downloadRevision} onReview={setReviewAction}
      onPdf={value => void run(async () => download(await finance.pdf(value.id), `${value.number}.pdf`))}
      onOpenInvoice={value => { closeHistory(); viewInvoice(value); }} />

    {editor?.kind === 'customer' && <CustomerEditor initial={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    {editor?.kind === 'item' && <ItemEditor initial={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    {editor?.kind === 'expense' && <ExpenseEditor initial={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    {editor?.kind === 'payment' && <PaymentEditor invoice={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}

    <InvoiceReviewDialog action={reviewAction} busy={busy} error={error} onClose={() => { if (!busy) setReviewAction(null); }}
      onNote={note => setReviewAction(current => current ? { ...current, note } : null)}
      onConfirm={(action, success) => void run(async () => {
        const { invoice, kind, note } = action;
        if (kind === 'revise') await finance.requestRevision(invoice.id, invoice.version, note.trim());
        else if (kind === 'paid') await finance.markReceivedPaid(invoice.id, invoice.version, note.trim());
        else await finance.approveForPayment(invoice.id, invoice.version, note.trim());
        setReviewAction(null); await refreshAfterMutation(success);
      }, success)} />

    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} destructive={false} busy={busy}
      body={<>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{confirmation?.body}</>}
      confirmLabel={confirmation?.confirmLabel ?? 'Confirm'} busyLabel={confirmation?.busyLabel ?? 'Working…'}
      onClose={() => { if (!busy) setConfirmation(null); }}
      onConfirm={() => void run(async () => { await confirmation?.action(); setConfirmation(null); })} />

    <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast('')} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
  </Box>;
}
