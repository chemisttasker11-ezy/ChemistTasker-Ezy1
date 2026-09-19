import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent,
  DialogTitle, Menu, MenuItem, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { finance, financeStatus, type FinanceCustomer, type FinanceItem, type FinanceInvoice, type FinanceExpense, type FinanceWorksheet } from '@chemisttasker/shared-core';
import { CustomerEditor, ItemEditor, ExpenseEditor, PaymentEditor } from './Editors';
import InvoiceComposer from './InvoiceComposer';
import { today, dollars, download, downloadCsv, errorMessage } from './helpers';

type Editor = { kind: 'customer'; value?: FinanceCustomer } | { kind: 'item'; value?: FinanceItem }
  | { kind: 'invoice'; value?: FinanceInvoice } | { kind: 'expense'; value?: FinanceExpense }
  | { kind: 'payment'; value: FinanceInvoice };
const workerTools = ['invoices', 'customers', 'items', 'expenses', 'bas', 'existing'] as const;
const ownerTools = ['received', 'existing'] as const;
const labels: Record<string, string> = { invoices: 'Invoices', received: 'Received invoices', customers: 'Customers & stores', items: 'Saved items', expenses: 'Expenses & receipts', bas: 'GST / BAS workspace', existing: 'Existing tools' };
function Empty({ title, detail }: { title: string; detail: string }) {
  return <Box sx={{ py: 6, textAlign: 'center' }}><Typography variant="h6">{title}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{detail}</Typography></Box>;
}

export default function FinanceWorkspace({ existingTools, receivedMode = false }: { existingTools?: ReactNode; receivedMode?: boolean }) {
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
  const running = useRef(false);
  const [invoiceStatus, setInvoiceStatus] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; invoice: FinanceInvoice } | null>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; body: string; action: () => Promise<unknown> } | null>(null);
  const [reviewAction, setReviewAction] = useState<{ invoice: FinanceInvoice; kind: 'approve' | 'revise' | 'paid'; note: string } | null>(null);
  const [worksheet, setWorksheet] = useState<FinanceWorksheet | null>(null);
  const [periodStart, setPeriodStart] = useState(`${Number(today().slice(0, 4)) - (Number(today().slice(5, 7)) < 7 ? 1 : 0)}-07-01`);
  const [periodEnd, setPeriodEnd] = useState(today()); const [basis, setBasis] = useState<'cash' | 'accrual'>('cash');

  const load = async () => {
    if (receivedMode) {
      setReceivedInvoices(await finance.receivedInvoices());
      return;
    }
    const [nextCustomers, nextItems, nextInvoices, nextExpenses] = await Promise.all([finance.customers(), finance.items(), finance.invoices(), finance.expenses()]);
    setCustomers(nextCustomers); setItems(nextItems); setInvoices(nextInvoices); setExpenses(nextExpenses); setWorksheet(null);
  };
  useEffect(() => {
    let active = true;
    const request = receivedMode
      ? finance.receivedInvoices().then(inv => { if (active) setReceivedInvoices(inv); })
      : Promise.all([finance.customers(), finance.items(), finance.invoices(), finance.expenses()]).then(([c, i, inv, exp]) => {
          if (active) { setCustomers(c); setItems(i); setInvoices(inv); setExpenses(exp); }
        });
    request.catch(failure => { if (active) setError(errorMessage(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [receivedMode]);
  const run = async (action: () => Promise<unknown>, success = '') => {
    if (running.current) return; running.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); if (success) setNotice(success); } catch (failure) { setError(errorMessage(failure)); } finally { running.current = false; setBusy(false); }
  };
  const refreshAfterSave = async () => {
    // A failed list refresh must not turn a successful create into a retryable form.
    setNotice('Saved to your account.');
    try { await load(); } catch (failure) { setError(`Saved successfully, but the list could not refresh. Use Refresh. ${errorMessage(failure)}`); }
  };
  const changeTool = (value: string) => { const next = new URLSearchParams(params); next.set('tool', value); setParams(next); setSearch(''); };
  const ask = (title: string, body: string, action: () => Promise<unknown>) => { setError(''); setMenu(null); setConfirmation({ title, body, action }); };
  const matches = (...values: (string | undefined)[]) => values.join(' ').toLowerCase().includes(search.toLowerCase());
  const serviceInvoices = invoices.filter(invoice => invoice.kind === 'invoice' && !invoice.voided);
  const totalCents = (key: 'balance' | 'paid') => serviceInvoices.reduce((sum, invoice) => sum + Math.round(Number(invoice[key]) * 100), 0) / 100;
  const viewInvoice = (invoice: FinanceInvoice) => setEditor({ kind: 'invoice', value: invoice });
  const visibleInvoices = invoices.filter(invoice => {
    const displayStatus = financeStatus(invoice).toLowerCase();
    const statusMatch = invoiceStatus === 'all'
      || (invoiceStatus === 'saved' && displayStatus === 'saved')
      || (invoiceStatus === 'sent' && ['sent', 'part paid', 'approved for payment'].includes(displayStatus))
      || (invoiceStatus === 'revision' && displayStatus === 'revision requested')
      || (invoiceStatus === 'overdue' && displayStatus === 'overdue')
      || (invoiceStatus === 'paid' && displayStatus === 'paid');
    return statusMatch && (customerFilter === 'all' || String(invoice.payload.customer_id) === customerFilter)
      && (!fromDate || invoice.payload.invoice_date >= fromDate) && (!toDate || invoice.payload.invoice_date <= toDate)
      && matches(invoice.number, invoice.payload.customer?.name, invoice.payload.reference, invoice.status, invoice.review_status);
  });
  const visibleReceived = receivedInvoices.filter(invoice =>
    matches(invoice.number, invoice.payload.issuer_name, invoice.payload.reference, invoice.status, invoice.review_status)
  );
  const invoiceCsv = () => downloadCsv('workspace-invoices.csv', [['Number', 'Kind', 'Customer', 'Date', 'Due', 'Worker or fund payable AUD', 'GST AUD', 'Paid AUD', 'Balance AUD', 'Status'],
    ...visibleInvoices.map(invoice => [invoice.number, invoice.kind, invoice.payload.customer?.name || '', invoice.payload.invoice_date, invoice.payload.due_date,
      invoice.calculation.payable, invoice.calculation.gst, invoice.paid, invoice.balance, invoice.status])]);
  const expenseCsv = () => downloadCsv('workspace-expenses.csv', [['Supplier', 'Description', 'Incurred', 'Paid', 'Gross AUD', 'GST AUD', 'Creditable business use %', 'Estimated GST credit AUD', 'Reference'],
    ...expenses.map(expense => [expense.supplier, expense.description, expense.incurred_on, expense.paid_on || '', expense.amount, expense.gst_amount, expense.business_use_percent, expense.gst_credit, expense.reference])]);

  if (editor?.kind === 'invoice') return <Container maxWidth="xl" sx={{ py: 2 }}><InvoiceComposer key={editor.value?.id ?? 'new'} initial={editor.value} previous={serviceInvoices[0]} customers={customers} items={items} onClose={() => setEditor(null)} onSaved={refreshAfterSave} /></Container>;

  return <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
    <Stack spacing={2.5}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box><Typography variant="h4">Invoices & finances</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Manage invoices, customers and business expenses.</Typography></Box>
        <Stack direction="row" spacing={1}><Button disabled={busy || loading} onClick={() => void run(load, 'Workspace refreshed.')}>Refresh</Button>
          {!receivedMode && <Button variant="contained" disabled={loading || busy} onClick={() => { changeTool('invoices'); setEditor({ kind: 'invoice' }); }}>New invoice</Button>}</Stack>
      </Box>
      {error && <Alert severity="error" onClose={() => setError('')} role="alert">{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')} role="status">{notice}</Alert>}
      <Paper variant="outlined" sx={{ borderRadius: '8px', overflow: 'hidden' }}>
        <Tabs value={tool} variant="scrollable" scrollButtons="auto" onChange={(_, value: string) => changeTool(value)} aria-label="Finance tools">
          {availableTools.map(value => <Tab key={value} value={value} label={labels[value]} id={`finance-tab-${value}`} aria-controls={`finance-panel-${value}`} />)}
        </Tabs>
        <Box role="tabpanel" id={`finance-panel-${tool}`} aria-labelledby={`finance-tab-${tool}`} sx={{ p: { xs: 2, md: 3 } }}>
          {tool === 'invoices' && <>
            <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" sx={{ mb: 3, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              {[['Balance due', dollars(totalCents('balance'))], ['Payments received', dollars(totalCents('paid'))], ['Overdue', dollars(serviceInvoices.filter(i => financeStatus(i) === 'Overdue').reduce((sum, i) => sum + Number(i.balance), 0))]].map(([label, amount]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums', color: label === 'Overdue' ? 'error.main' : 'text.primary' }}>{amount}</Typography></Box>)}
            </Stack>
            <Tabs value={invoiceStatus} onChange={(_, next) => setInvoiceStatus(next)} variant="scrollable" scrollButtons="auto" aria-label="Invoice status" sx={{ mb: 3, minHeight: 40 }}>
              {[['all', 'All invoices'], ['saved', 'Saved'], ['sent', 'Sent / approved'], ['revision', 'Revision requested'], ['overdue', 'Overdue'], ['paid', 'Paid']].map(([key, label]) => <Tab key={key} value={key} label={label} />)}
            </Tabs>
          </>}
          {loading && tool !== 'existing' ? <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading finance records" /></Box> : <>
            {['invoices', 'customers', 'items', 'expenses'].includes(tool) && <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField size="small" label="Search" placeholder={tool === 'invoices' ? 'Invoice number, customer or reference' : 'Search records'} value={search} onChange={event => setSearch(event.target.value)} sx={{ flexGrow: 1, width: 'auto', minWidth: 180 }} />
              {tool === 'customers' && <Button variant="outlined" onClick={() => setEditor({ kind: 'customer' })}>Add customer</Button>}
              {tool === 'items' && <><Button disabled={busy} onClick={() => void run(async () => { await finance.seedItems(); await load(); }, 'Starter items saved. Review rates and tax settings before use.')}>Add starter items</Button><Button variant="outlined" onClick={() => setEditor({ kind: 'item' })}>Add item</Button></>}
              {tool === 'expenses' && <><Button onClick={expenseCsv}>Export CSV</Button><Button variant="outlined" onClick={() => setEditor({ kind: 'expense' })}>Add expense</Button></>}
              {tool === 'invoices' && <Button onClick={invoiceCsv}>Export CSV</Button>}
            </Box>}
            {tool === 'invoices' && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <TextField select size="small" label="Customer" value={customerFilter} onChange={event => setCustomerFilter(event.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="all">All customers</MenuItem>{customers.map(customer => <MenuItem key={customer.id} value={String(customer.id)}>{customer.name}</MenuItem>)}
              </TextField>
              <TextField size="small" type="date" label="Invoice date from" InputLabelProps={{ shrink: true }} value={fromDate} onChange={event => setFromDate(event.target.value)} />
              <TextField size="small" type="date" label="Invoice date to" InputLabelProps={{ shrink: true }} value={toDate} onChange={event => setToDate(event.target.value)} />
              <Button onClick={() => { setInvoiceStatus('all'); setCustomerFilter('all'); setFromDate(''); setToDate(''); setSearch(''); }}>Reset filters</Button>
            </Stack>}
            {tool === 'invoices' && <TableContainer><Table aria-label="Workspace invoices"><TableHead><TableRow><TableCell>Document</TableCell><TableCell>Customer</TableCell><TableCell>Due</TableCell><TableCell align="right">Payable / balance</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell></TableRow></TableHead>
              <TableBody>{visibleInvoices.map(invoice => <TableRow key={invoice.id} hover>
                <TableCell><Button sx={{ minWidth: 0, p: 0, minHeight: 32 }} onClick={() => { if (invoice.kind === 'invoice') viewInvoice(invoice); else void run(async () => download(await finance.pdf(invoice.id), `${invoice.number}.pdf`)); }}>{invoice.number}</Button><Typography variant="caption" display="block" color="text.secondary">{invoice.kind === 'super_request' ? 'Fund contribution request' : `Revision ${invoice.version} · ${invoice.payload.invoice_date}`}</Typography></TableCell>
                <TableCell>{invoice.payload.customer?.name}</TableCell><TableCell>{invoice.payload.due_date}{financeStatus(invoice) === 'Overdue' && <Chip label="Overdue" size="small" color="warning" sx={{ ml: 1 }} />}</TableCell>
                <TableCell align="right">{dollars(invoice.calculation.payable)}<Typography variant="caption" display="block">Balance {dollars(invoice.balance)}</Typography></TableCell>
                <TableCell><Chip label={financeStatus(invoice)} color={invoice.status === 'paid' ? 'success' : invoice.review_status === 'REVISION_REQUESTED' ? 'warning' : 'default'} size="small" />{invoice.delivery_status && <Typography variant="caption" display="block">Latest email: {invoice.delivery_status}</Typography>}</TableCell>
                <TableCell><Button aria-label={`Actions for ${invoice.number}`} disabled={busy} onClick={event => setMenu({ anchor: event.currentTarget, invoice })}>Actions</Button></TableCell>
              </TableRow>)}</TableBody></Table></TableContainer>}
            {tool === 'invoices' && invoices.length > 0 && !visibleInvoices.length && <Empty title="No matching documents" detail="Adjust the status, customer, dates or search to see your invoices." />}
            {tool === 'received' && <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Internal invoices are created from ChemistTasker ABN shifts. Review the current revision, request corrections when actual hours/rates differ, approve it for payment, or mark it paid. Earlier revisions remain in the audit trail.
              </Alert>
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}><TextField size="small" label="Search received invoices" value={search} onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} /></Box>
              <TableContainer><Table aria-label="Received internal invoices"><TableHead><TableRow><TableCell>Invoice / contractor</TableCell><TableCell>Pharmacy</TableCell><TableCell align="right">Payable</TableCell><TableCell>Status</TableCell><TableCell>Review</TableCell></TableRow></TableHead>
                <TableBody>{visibleReceived.map(invoice => <TableRow key={invoice.id} hover>
                  <TableCell><Typography fontWeight={800}>{invoice.number}</Typography><Typography variant="body2">{invoice.payload.issuer_name}</Typography><Typography variant="caption" color="text.secondary">Revision {invoice.version} · {invoice.payload.invoice_date}</Typography></TableCell>
                  <TableCell>{invoice.payload.customer?.name}<Typography variant="caption" display="block">{invoice.payload.reference}</Typography></TableCell>
                  <TableCell align="right">{dollars(invoice.calculation.payable)}<Button size="small" sx={{ display: 'block', ml: 'auto' }} onClick={() => void run(async () => download(await finance.receivedPdf(invoice.id), `${invoice.number}.pdf`))}>PDF</Button></TableCell>
                  <TableCell><Chip size="small" label={financeStatus(invoice)} color={invoice.status === 'paid' ? 'success' : invoice.review_status === 'REVISION_REQUESTED' ? 'warning' : 'default'} />{invoice.last_review_note && <Typography variant="caption" display="block" sx={{ mt: .5, maxWidth: 260 }}>{invoice.last_review_note}</Typography>}</TableCell>
                  <TableCell><Stack direction="row" spacing={.5} flexWrap="wrap"><Button size="small" variant="contained" onClick={() => setReviewAction({ invoice, kind: 'approve', note: '' })}>Approve</Button><Button size="small" color="warning" onClick={() => setReviewAction({ invoice, kind: 'revise', note: '' })}>Request revision</Button><Button size="small" disabled={invoice.status === 'paid'} onClick={() => setReviewAction({ invoice, kind: 'paid', note: '' })}>Mark paid</Button></Stack></TableCell>
                </TableRow>)}</TableBody>
              </Table></TableContainer>
              {!receivedInvoices.length && <Empty title="No received invoices yet" detail="Internal invoices will appear here after the contractor sends them to the pharmacy." />}
            </>}
            {tool === 'invoices' && !invoices.length && <Empty title="Start with your first external invoice" detail="Save a customer and reusable items, then draft an invoice. Nothing is emailed until you confirm sending." />}
            {tool === 'customers' && <Stack spacing={2}>{customers.filter(customer => matches(customer.name, customer.abn, customer.legal_name)).map(customer => <Paper key={customer.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}><Box><Typography fontWeight={700}>{customer.name} {!customer.active && '(Archived)'}</Typography><Typography variant="body2">{customer.email || 'No invoice email'} | {customer.payment_terms_days}-day terms</Typography><Typography variant="body2" color="text.secondary">ABN {customer.abn || 'not supplied'} | {customer.address}</Typography></Box>
                <Stack direction="row" spacing={1}><Button onClick={() => setEditor({ kind: 'customer', value: customer })}>Edit</Button><Button disabled={!customer.abn || busy} onClick={() => void run(async () => { await finance.lookupAbn(customer.id); await load(); }, 'ABR details fetched. Review the entity; lookup is not ownership verification.')}>Check ABN</Button></Stack></Box>
              {customer.abn_checked_at && <Alert severity="info" sx={{ mt: 2 }}>ABR: {String(customer.abn_result?.entity_name || '')} | {String(customer.abn_result?.abn_status || '')} | Checked {new Date(customer.abn_checked_at).toLocaleDateString('en-AU')}. Customer registration does not set your invoice GST.</Alert>}
            </Paper>)}{!customers.length && <Empty title="Keep your store contacts in one place" detail="Store names, legal entities, ABNs, invoice emails and payment terms are saved for reuse." />}</Stack>}
            {tool === 'items' && <TableContainer><Table aria-label="Saved item catalogue"><TableHead><TableRow><TableCell>Item</TableCell><TableCell>Category / unit</TableCell><TableCell>Default price</TableCell><TableCell>Tax / super base</TableCell><TableCell>Actions</TableCell></TableRow></TableHead>
              <TableBody>{items.filter(item => matches(item.code, item.name, item.category)).map(item => <TableRow key={item.id}><TableCell>{item.code} - {item.name}{!item.active && <Chip size="small" label="Archived" sx={{ ml: 1 }} />}</TableCell><TableCell>{item.category}<br />{item.unit}</TableCell><TableCell>{dollars(item.unit_price)}</TableCell><TableCell>{item.tax_code}<br />Super base: {item.super_eligible ? 'Yes' : 'No'}</TableCell><TableCell><Button onClick={() => setEditor({ kind: 'item', value: item })}>Edit</Button></TableCell></TableRow>)}</TableBody></Table>
              {!items.length && <Empty title="Save your rates once" detail="Add starter items for labour, transport, accommodation and super, then set your prices and tax treatment." />}</TableContainer>}
            {tool === 'expenses' && <Stack spacing={2}><Alert severity="info">Receipts are private, authenticated downloads. Maximum 5 MB per PDF/PNG/JPEG; initial account allowance 50 MB. No OCR or automatic tax claim is performed.</Alert>
              {expenses.filter(expense => matches(expense.supplier, expense.description, expense.reference)).map(expense => <Paper key={expense.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}><Box><Typography fontWeight={700}>{expense.supplier} - {dollars(expense.amount)}</Typography><Typography>{expense.description}</Typography><Typography variant="body2" color="text.secondary">{expense.incurred_on} | {expense.paid_on ? `Paid ${expense.paid_on}` : 'Unpaid'} | GST credit estimate {dollars(expense.gst_credit)}</Typography></Box>
                  <Stack direction="row" spacing={1}><Button onClick={() => setEditor({ kind: 'expense', value: expense })}>Edit</Button><Button component="label" disabled={busy}>Attach receipt<input type="file" hidden accept="application/pdf,image/png,image/jpeg" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { await finance.uploadReceipt(expense.id, file, file.name); await load(); }, 'Receipt attached securely.'); }} /></Button></Stack></Box>
                <Stack direction="row" spacing={1} flexWrap="wrap">{expense.receipts.map(receipt => <Button key={receipt.id} size="small" disabled={busy} onClick={() => void run(async () => download(await finance.receipt(receipt.id), receipt.filename))}>{receipt.filename}</Button>)}</Stack>
              </Paper>)}{!expenses.length && <Empty title="Keep expenses separate from sales" detail="Capture travel, accommodation, registration, training and other business costs with supporting receipts." />}
            </Stack>}
            {tool === 'bas' && <Stack spacing={3}><Alert severity="warning">GST worksheet foundation only - not a complete BAS calculator, a lodgement service or tax advice. Legacy invoices and unsupported adjustments are excluded.</Alert>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}><TextField type="date" label="Period start" InputLabelProps={{ shrink: true }} value={periodStart} onChange={event => { setPeriodStart(event.target.value); setWorksheet(null); }} /><TextField type="date" label="Period end" InputLabelProps={{ shrink: true }} value={periodEnd} onChange={event => { setPeriodEnd(event.target.value); setWorksheet(null); }} />
                <TextField select label="GST accounting basis" value={basis} onChange={event => { setBasis(event.target.value as 'cash' | 'accrual'); setWorksheet(null); }}><MenuItem value="cash">Cash - recorded payments</MenuItem><MenuItem value="accrual">Accrual - issued invoices</MenuItem></TextField>
                <Button variant="outlined" disabled={busy} onClick={() => void run(async () => setWorksheet(await finance.worksheet(periodStart, periodEnd, basis)))}>Calculate worksheet</Button></Box>
              {worksheet && <><TableContainer><Table><TableBody>{[['G1 - included sales', worksheet.G1], ['1A - GST on sales', worksheet['1A']], ['1B - estimated GST credits', worksheet['1B']], ['Estimated GST net (not total BAS)', worksheet.estimated_gst_net]].map(([label, value]) => <TableRow key={label}><TableCell>{label}</TableCell><TableCell align="right">{dollars(value)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
                <Alert severity="warning">Excluded legacy invoices: {worksheet.excluded_legacy_invoice_count}. Expenses requiring evidence review: {worksheet.expenses_needing_evidence.join(', ') || 'none flagged'}. These checks do not establish lodgement readiness.</Alert>
                {worksheet.warnings.map(warning => <Typography key={warning} variant="body2" color="text.secondary">{warning}</Typography>)}
                <Button onClick={() => downloadCsv('gst-worksheet-DRAFT.csv', [['DRAFT ONLY', 'Not a complete BAS'], ['Start', worksheet.start], ['End', worksheet.end], ['Basis', worksheet.basis], ['G1', worksheet.G1], ['1A', worksheet['1A']], ['1B', worksheet['1B']], ['Estimated GST net', worksheet.estimated_gst_net], ['Excluded legacy invoices', worksheet.excluded_legacy_invoice_count]])}>Export draft worksheet</Button></>}
            </Stack>}
            {tool === 'existing' && existingTools}
          </>}
        </Box>
      </Paper>
    </Stack>
    <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
      <MenuItem disabled={menu?.invoice.kind !== 'invoice'} onClick={() => { if (menu) viewInvoice(menu.invoice); setMenu(null); }}>Edit invoice</MenuItem>
      <MenuItem disabled={menu?.invoice.kind !== 'invoice'} onClick={() => { if (!menu) return; const invoice = menu.invoice; const key = crypto.randomUUID(); ask('Duplicate invoice?', 'Creates a new editable external invoice without shift links, payment history or send history.', async () => { const result = await finance.duplicate(invoice.id, key); await load(); setEditor({ kind: 'invoice', value: result }); }); }}>Duplicate</MenuItem>
      <MenuItem onClick={() => { if (!menu) return; const invoice = menu.invoice; setMenu(null); void run(async () => download(await finance.pdf(invoice.id), `${invoice.number}.pdf`)); }}>Download PDF</MenuItem>
      <MenuItem onClick={() => { if (!menu) return; const invoice = menu.invoice; ask(`Send ${invoice.number} revision ${invoice.version}?`, `Email the current saved PDF to ${invoice.payload.customer?.email || '(no saved email)'}. If you edit and save later, the next revision can be sent again.`, async () => { const result = await finance.send(invoice.id, invoice.version); setNotice(result.detail); await load(); }); }}>Send email</MenuItem>
      <MenuItem disabled={menu?.invoice.kind !== 'invoice' || menu?.invoice.status === 'paid'} onClick={() => { if (!menu) return; const invoice = menu.invoice; ask('Mark invoice paid?', 'This is a manual status. You can still edit the invoice later if a correction is required.', async () => { await finance.markPaid(invoice.id, invoice.version); await load(); }); }}>Mark paid</MenuItem>
      <MenuItem disabled={menu?.invoice.kind !== 'invoice' || menu?.invoice.payload.super_mode !== 'separate' || Boolean(menu?.invoice.super_document_id)} onClick={() => { if (!menu) return; const invoice = menu.invoice; ask('Create separate super request?', 'Creates a linked contribution request. Super remains separate from worker payable.', async () => { await finance.superDocument(invoice.id, invoice.version); await load(); }); }}>Create linked super request</MenuItem>
      <MenuItem disabled={Number(menu?.invoice.balance || '0') <= 0} onClick={() => { if (menu) setEditor({ kind: 'payment', value: menu.invoice }); setMenu(null); }}>Record payment</MenuItem>
    </Menu>
    {editor?.kind === 'customer' && <CustomerEditor initial={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    {editor?.kind === 'item' && <ItemEditor initial={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    {editor?.kind === 'expense' && <ExpenseEditor initial={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    {editor?.kind === 'payment' && <PaymentEditor invoice={editor.value} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />}
    <Dialog open={Boolean(reviewAction)} onClose={() => { if (!busy) setReviewAction(null); }} maxWidth="sm" fullWidth>
      <DialogTitle>{reviewAction?.kind === 'revise' ? 'Request invoice revision' : reviewAction?.kind === 'paid' ? 'Mark invoice paid' : 'Approve invoice for payment'}</DialogTitle>
      <DialogContent>
        {reviewAction?.kind === 'revise' && <Alert severity="warning" sx={{ mb: 2 }}>Tell the contractor what needs correcting—hours, finish time, rate, item, GST treatment or another detail. Their next Save creates a new revision.</Alert>}
        <TextField autoFocus fullWidth multiline minRows={3} label={reviewAction?.kind === 'revise' ? 'Revision note *' : 'Optional note'} value={reviewAction?.note || ''} onChange={event => setReviewAction(current => current ? { ...current, note: event.target.value } : null)} />
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setReviewAction(null)}>Cancel</Button><Button variant="contained" color={reviewAction?.kind === 'revise' ? 'warning' : 'primary'} disabled={busy || (reviewAction?.kind === 'revise' && !reviewAction.note.trim())} onClick={() => void run(async () => {
        if (!reviewAction) return;
        if (reviewAction.kind === 'revise') await finance.requestRevision(reviewAction.invoice.id, reviewAction.invoice.version, reviewAction.note.trim());
        else if (reviewAction.kind === 'paid') await finance.markReceivedPaid(reviewAction.invoice.id, reviewAction.invoice.version, reviewAction.note.trim());
        else await finance.approveForPayment(reviewAction.invoice.id, reviewAction.invoice.version, reviewAction.note.trim());
        setReviewAction(null); await load();
      }, reviewAction?.kind === 'revise' ? 'Revision request sent to the contractor.' : reviewAction?.kind === 'paid' ? 'Invoice marked paid.' : 'Invoice approved for payment.')}>Confirm</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(confirmation)} onClose={() => { if (!busy) setConfirmation(null); }} maxWidth="sm" fullWidth>
      <DialogTitle>{confirmation?.title}</DialogTitle><DialogContent>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Typography>{confirmation?.body}</Typography></DialogContent><DialogActions>
        <Button disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button variant="contained" disabled={busy} onClick={() => void run(async () => { await confirmation?.action(); setConfirmation(null); })}>{busy ? 'Working...' : 'Confirm'}</Button>
      </DialogActions>
    </Dialog>
  </Container>;
}
