import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Box, Button, Checkbox, Chip, Divider, FormControlLabel, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { createFinanceDraft, finance, financeDueDate, financeItemLine, financeStatus, type FinanceCalculation, type FinanceCategory, type FinanceCustomer, type FinanceDraft, type FinanceInternalSource, type FinanceInvoice, type FinanceItem, type FinanceLine, type FinanceTaxCode } from '@chemisttasker/shared-core';
import { CustomerEditor, ItemEditor } from './Editors';
import { dollars, errorMessage } from './helpers';

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 };
const taxLabels: Record<FinanceTaxCode, string> = { GST: 'GST 10%', GST_FREE: 'GST-free', INPUT_TAXED: 'Input taxed', OUT_OF_SCOPE: 'N-T / not taxable' };

export default function InvoiceComposer({ initial, previous, customers, items, onClose, onSaved }: {
  initial?: FinanceInvoice; previous?: FinanceInvoice; customers: FinanceCustomer[]; items: FinanceItem[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState<FinanceDraft>(() => initial ? { ...initial.payload, version: initial.version, request_key: initial.request_key } : createFinanceDraft(crypto.randomUUID(), previous));
  const original = useRef(JSON.stringify(value));
  const [customerOptions, setCustomers] = useState(customers);
  const [itemOptions, setItems] = useState(items);
  const [inline, setInline] = useState<'customer' | 'item' | null>(null);
  const [selectedItem, setSelectedItem] = useState<FinanceItem | null>(null);
  const [preview, setPreview] = useState<FinanceCalculation | null>(initial?.calculation || null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [businessOpen, setBusinessOpen] = useState(!value.issuer_name);
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [breakMinutes, setBreak] = useState('0');
  const [hours, setHours] = useState('');
  const [internalSources, setInternalSources] = useState<FinanceInternalSource[]>([]);
  const [selectedInternalSource, setSelectedInternalSource] = useState<FinanceInternalSource | null>(null);
  const customer = customerOptions.find(c => c.id === value.customer_id);
  const internalSource = initial?.source === 'internal' || Boolean(value.source_assignment_ids?.length);
  const change = <K extends keyof FinanceDraft,>(key: K, next: FinanceDraft[K]) => setValue(current => ({ ...current, [key]: next }));
  const changeLine = (index: number, patch: Partial<FinanceLine>) => change('lines', value.lines.map((line, i) => i === index ? { ...line, ...patch } : line));
  const close = () => { if (!busy && (JSON.stringify(value) === original.current || window.confirm('Discard unsaved invoice changes?'))) onClose(); };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (JSON.stringify(value) !== original.current) event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [value]);
  useEffect(() => {
    if (initial) return;
    let active = true;
    Promise.all([finance.invoiceDefaults(), finance.internalSources()]).then(([defaults, sources]) => {
      if (!active) return;
      setInternalSources(sources);
      setValue(current => ({
        ...current,
        issuer_name: current.issuer_name || defaults.issuer_name,
        issuer_abn: current.issuer_abn || defaults.issuer_abn,
        issuer_address: current.issuer_address || defaults.issuer_address,
        gst_registered: current.gst_registered || defaults.gst_registered,
        bank_account_name: current.bank_account_name || defaults.bank_account_name,
        bsb: current.bsb || defaults.bsb,
        account_number: current.account_number || defaults.account_number,
        super_fund_name: current.super_fund_name || defaults.super_fund_name,
        super_usi: current.super_usi || defaults.super_usi,
        super_member_number: current.super_member_number || defaults.super_member_number,
        super_rate: defaults.super_rate || current.super_rate,
      }));
    }).catch(failure => setError(errorMessage(failure)));
    return () => { active = false; };
  }, [initial]);
  const applyInternalSource = async (source: FinanceInternalSource | null) => {
    setSelectedInternalSource(source);
    if (!source) return;
    try {
      const draft = await finance.internalPrefill([source.assignment_id]);
      setValue(draft);
      if (draft.customer && !customerOptions.some(item => item.id === draft.customer_id)) {
        setCustomers(current => [...current, {
          id: draft.customer_id, name: draft.customer!.name, legal_name: draft.customer!.legal_name,
          abn: draft.customer!.abn, contact_name: draft.customer!.contact_name, email: draft.customer!.email,
          phone: '', address: draft.customer!.address, payment_terms_days: 14, notes: '', active: true,
        }]);
      }
    } catch (failure) { setError(errorMessage(failure)); }
  };
  useEffect(() => {
    let active = true;
    setPreview(null);
    if (!value.lines.length) { setCalculating(false); return; }
    setCalculating(true);
    const timer = window.setTimeout(() => {
      finance.preview(value).then(result => { if (active) setPreview(result); }).catch(() => { /* Save presents full validation; partial typing does not interrupt the editor. */ }).finally(() => { if (active) setCalculating(false); });
    }, 450);
    return () => { active = false; window.clearTimeout(timer); };
  }, [value]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!value.customer_id) { setError('Select a customer to save this invoice.'); return; }
    if (!value.issuer_name.trim()) { setBusinessOpen(true); setError('Enter your business name in Business details.'); return; }
    if (!value.lines.length) { setError('Add at least one item to the invoice.'); return; }
    submitting.current = true; setBusy(true); setError('');
    try { await finance.saveInvoice(value, initial?.id); await onSaved(); onClose(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { submitting.current = false; setBusy(false); }
  };
  const field = (key: 'issuer_name' | 'issuer_abn' | 'issuer_address' | 'bank_account_name' | 'bsb' | 'account_number' | 'super_fund_name' | 'super_usi' | 'super_member_number' | 'notes' | 'reference', label: string) => <TextField label={label} value={value[key]} multiline={key === 'notes' || key === 'issuer_address'} minRows={key === 'notes' ? 3 : undefined} onChange={event => change(key, event.target.value)} />;
  const addItem = (item: FinanceItem) => { change('lines', [...value.lines, financeItemLine(item)]); setSelectedItem(null); };
  return <Box component="form" onSubmit={submit} noValidate sx={{ maxWidth: 1280, mx: 'auto', pb: 4 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ position: 'sticky', top: 0, zIndex: 5, bgcolor: 'background.default', py: 2, flexWrap: 'wrap' }}>
      <Stack direction="row" alignItems="center" spacing={1}><IconButton aria-label="Back to invoices" onClick={close} disabled={busy}><ArrowBackIcon /></IconButton><Box><Typography variant="h4">{initial ? `Invoice ${initial.number}` : 'Create invoice'}</Typography><Typography variant="caption" color="text.secondary">{initial ? `Revision ${initial.version}` : 'Nothing is stored until Save invoice'}</Typography></Box><Chip label={initial ? financeStatus(initial) : 'Unsaved'} size="small" color={initial?.review_status === 'REVISION_REQUESTED' ? 'warning' : initial?.status === 'paid' ? 'success' : 'default'} /></Stack>
      <Stack direction="row" spacing={1}><Button onClick={close} disabled={busy}>Cancel</Button><Button variant="contained" type="submit" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save new revision' : 'Save invoice'}</Button></Stack>
    </Stack>
    {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}
    {initial?.review_requests?.filter(request => !request.resolved_at).map(request => (
      <Alert key={request.id} severity="warning" sx={{ mb: 2 }}>
        <strong>Revision requested by {request.requested_by_name}:</strong> {request.note}
      </Alert>
    ))}
    {!initial && internalSources.length > 0 && (
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3 }}>
        <Typography fontWeight={800}>Start from an internal ChemistTasker shift</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Pharmacy details, shift date/hours/rate and your onboarding business details are prefilled. Nothing is saved until you press Save invoice.</Typography>
        <Autocomplete options={internalSources} value={selectedInternalSource}
          getOptionLabel={source => `${source.pharmacy.name} · ${source.date} · ${source.hours}h × ${source.rate}`}
          isOptionEqualToValue={(a,b) => a.assignment_id === b.assignment_id}
          onChange={(_, next) => void applyInternalSource(next)}
          renderInput={props => <TextField {...props} label="Accepted ABN shift" placeholder="Choose shift to prefill" />} />
      </Paper>
    )}
    {internalSource && (
      <Alert severity="info" sx={{ mb: 2 }}>
        This invoice comes from accepted ChemistTasker shift terms. The pharmacy is fixed by the accepted shift, but invoice date/hours/rate/description/tax values remain editable. Every save creates an auditable revision while the original shift snapshot is preserved.
      </Alert>
    )}
    <Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: '8px' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(300px, 380px)' }, gap: { xs: 3, md: 8 }, mb: 3 }}>
        <Stack spacing={2}>
          <Autocomplete disabled={internalSource} options={customerOptions.filter(c => c.active)} value={customer || null} getOptionLabel={c => c.name} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, next) => setValue(current => ({ ...current, customer_id: next?.id || 0, due_date: financeDueDate(current.invoice_date, next?.payment_terms_days ?? 14) }))} renderInput={props => <TextField {...props} label="Customer *" placeholder="Search customers or stores" />} />
          <Button disabled={internalSource} startIcon={<AddIcon />} onClick={() => setInline('customer')} sx={{ alignSelf: 'flex-start' }}>Create customer</Button>
          <Box sx={{ minHeight: 72 }}><Typography variant="caption" color="text.secondary">Billing address</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-line', mt: .5 }}>{customer?.address || 'Select a customer to see billing details.'}</Typography>{customer?.abn && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>ABN {customer.abn}</Typography>}</Box>
        </Stack>
        <Box sx={grid}>
          <TextField label="Invoice number" value={initial?.number || 'Assigned when saved'} slotProps={{ input: { readOnly: true } }} />
          {field('reference', 'Customer PO / reference')}
          <TextField type="date" label="Issue date *" value={value.invoice_date} onChange={event => { const date = event.target.value; setValue(current => ({ ...current, invoice_date: date, due_date: financeDueDate(date, customer?.payment_terms_days ?? 14) })); }} />
          <TextField type="date" label="Due date *" value={value.due_date} onChange={event => change('due_date', event.target.value)} />
          <TextField select label="Amounts are" value={value.price_mode} onChange={event => change('price_mode', event.target.value as FinanceDraft['price_mode'])}><MenuItem value="exclusive">GST exclusive</MenuItem><MenuItem value="inclusive">GST inclusive</MenuItem></TextField>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>AUD · {customer?.payment_terms_days ?? 14}-day payment terms</Typography>
        </Box>
      </Box>
      <Divider sx={{ mb: 3 }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>Items & services</Typography>
        <Autocomplete sx={{ width: { xs: '100%', sm: 320 } }} options={itemOptions.filter(i => i.active)} value={selectedItem} getOptionLabel={i => i.code ? `${i.code} · ${i.name}` : i.name} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, next) => { if (next) addItem(next); }} renderInput={props => <TextField {...props} label="Add saved item" placeholder="Search your catalogue" />} />
        <Button startIcon={<AddIcon />} onClick={() => change('lines', [...value.lines, { item_id: null, description: '', category_code: 'Miscellaneous', unit: 'Item', quantity: '1.00', unit_price: '0.00', discount: '0.00', tax_code: 'OUT_OF_SCOPE', super_eligible: false, worked_on: null }])}>Blank row</Button>
        <Button startIcon={<AddIcon />} onClick={() => setInline('item')}>Save new item</Button>
      </Stack>
      <Box sx={{ display: { xs: 'none', lg: 'grid' }, gridTemplateColumns: 'minmax(180px, 2.2fr) 1.1fr .7fr 1fr 1fr .8fr 1.1fr 1fr 40px', gap: 1, p: 1.5, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>{['Description', 'Work date', 'Qty', 'Unit', 'Unit price', 'Discount %', 'Tax code', 'Amount', ''].map((label, i) => <Typography key={i} variant="caption" fontWeight={700}>{label}</Typography>)}</Box>
      {!value.lines.length && <Box sx={{ textAlign: 'center', py: 5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}><Typography fontWeight={600}>Add the work you’re billing for</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Choose a saved item, or add a free-entry row without saving a catalogue item.</Typography></Box>}
      {value.lines.map((line, index) => <Box key={`${index}-${line.source_assignment_id ?? line.item_id ?? 'adhoc'}`} sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 2 }}>
        {line.source_assignment_id && <Chip size="small" label="From ChemistTasker shift · source link preserved · values editable" sx={{ mb: 1 }} />}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'minmax(180px, 2.2fr) 1.1fr .7fr 1fr 1fr .8fr 1.1fr 1fr 40px' }, gap: 1, alignItems: 'start', '& .MuiInputBase-root': { fontSize: 13 } }}>
          <TextField label="Description" sx={{ gridColumn: { xs: '1 / -1', lg: 'auto' } }} value={line.description || ''} onChange={e => changeLine(index, { description: e.target.value })} multiline />
          <TextField type="date" label="Work date" value={line.worked_on || ''} onChange={e => changeLine(index, { worked_on: e.target.value || null })} />
          <TextField label={line.unit || 'Quantity'} value={line.quantity} inputProps={{ inputMode: 'decimal' }} onChange={e => changeLine(index, { quantity: e.target.value })} />
          <TextField label="Unit" value={line.unit || ''} onChange={e => changeLine(index, { unit: e.target.value })} />
          <TextField label="Unit price" value={line.unit_price} inputProps={{ inputMode: 'decimal' }} onChange={e => changeLine(index, { unit_price: e.target.value })} />
          <TextField label="Discount %" value={line.discount} inputProps={{ inputMode: 'decimal' }} onChange={e => changeLine(index, { discount: e.target.value })} />
          <TextField select label="Tax code" value={line.tax_code || 'OUT_OF_SCOPE'} onChange={e => changeLine(index, { tax_code: e.target.value as FinanceTaxCode })}>{Object.entries(taxLabels).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField>
          <Typography sx={{ py: 1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{preview?.lines[index] ? dollars(preview.lines[index].gross) : 'Pending'}</Typography>
          <IconButton aria-label={`Remove item ${index + 1}`} disabled={Boolean(line.source_assignment_id)} title={line.source_assignment_id ? 'Internal source rows stay attached; edit their values instead.' : 'Remove row'} onClick={() => change('lines', value.lines.filter((_, i) => i !== index))}><DeleteOutlineIcon fontSize="small" /></IconButton>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mt: 1 }}>
          <TextField select size="small" label="Category" value={line.category_code || 'Miscellaneous'} onChange={e => changeLine(index, { category_code: e.target.value as FinanceCategory })} sx={{ minWidth: 210 }}>
            {(['ProfessionalServices', 'Transportation', 'Accommodation', 'Miscellaneous', 'Superannuation'] as FinanceCategory[]).map(category => <MenuItem key={category} value={category}>{category.replace(/([A-Z])/g, ' $1').trim()}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Checkbox size="small" checked={line.super_eligible || false} onChange={e => changeLine(index, { super_eligible: e.target.checked })} />} label={<Typography variant="caption">Include in reviewed super base</Typography>} />
          {line.source_assignment_id && <Typography variant="caption" color="text.secondary">Original accepted hours/rate remain in the source snapshot for audit.</Typography>}
        </Stack>
      </Box>)}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 340px' }, gap: { xs: 3, md: 8 }, mt: 3 }}>
        <Stack spacing={1}>{field('notes', 'Notes to customer')}<Typography variant="caption" color="text.secondary">Save keeps the invoice editable. Sending changes the status to Sent; later edits create a new revision for re-review.</Typography></Stack>
        <Stack spacing={1.5} aria-live="polite">{[['Subtotal', preview?.subtotal], ['GST', preview?.gst], ['Invoice total', preview?.payable], ['Super contribution', preview?.super]].map(([label, amount]) => <Stack key={label} direction="row" justifyContent="space-between" sx={{ ...(label === 'Invoice total' ? { borderTop: '1px solid', borderColor: 'divider', pt: 1.5, fontWeight: 700 } : {}) }}><Typography fontWeight="inherit" variant="body2">{label}</Typography><Typography fontWeight="inherit" variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{amount !== undefined ? dollars(amount) : value.lines.length ? 'Pending' : dollars('0')}</Typography></Stack>)}<Typography variant="caption" color="text.secondary">{calculating ? 'Updating totals…' : preview ? 'Totals up to date. Super is paid separately to the fund.' : value.lines.length ? 'Complete the invoice details to calculate totals.' : 'All amounts in Australian dollars.'}</Typography></Stack>
      </Box>
    </Paper>
    <Stack spacing={2} sx={{ mt: 2, '& .MuiAccordion-root': { border: '1px solid', borderColor: 'divider', boxShadow: 'none', borderRadius: '8px !important', '&:before': { display: 'none' } } }}>
      <Accordion expanded={businessOpen} onChange={(_, open) => setBusinessOpen(open)} disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Box><Typography fontWeight={650}>Business details & GST</Typography><Typography variant="caption" color="text.secondary">{value.issuer_name || 'Add your business name and ABN'}{value.issuer_name ? ` · ${value.gst_registered ? 'GST registered' : 'Not GST registered'}` : ''}</Typography></Box></AccordionSummary><AccordionDetails><Box sx={grid}>{field('issuer_name', 'Business name *')}{field('issuer_abn', 'Your ABN')}{field('issuer_address', 'Business address')}<TextField select label="Business structure" value={value.issuer_entity_type || 'sole_trader'} onChange={e => change('issuer_entity_type', e.target.value as 'sole_trader' | 'company')}><MenuItem value="sole_trader">Sole trader</MenuItem><MenuItem value="company">Company</MenuItem></TextField></Box><FormControlLabel control={<Checkbox checked={value.gst_registered} onChange={e => change('gst_registered', e.target.checked)} />} label="I am registered for GST for this supply" /></AccordionDetails></Accordion>
      <Accordion disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={650}>Payment details</Typography></AccordionSummary><AccordionDetails><Box sx={grid}>{field('bank_account_name', 'Account name')}{field('bsb', 'BSB')}{field('account_number', 'Account number')}</Box></AccordionDetails></Accordion>
      <Accordion disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={650}>Superannuation {value.super_mode !== 'none' ? '· Included' : '· Optional'}</Typography></AccordionSummary><AccordionDetails><Stack spacing={2}><Typography variant="body2" color="text.secondary">Review eligibility and the agreed rate. Contributions are paid to your fund, separately from your service payment.</Typography><Box sx={grid}><TextField select label="Presentation" value={value.super_mode} onChange={e => change('super_mode', e.target.value as FinanceDraft['super_mode'])}><MenuItem value="none">No super calculation</MenuItem><MenuItem value="summary">Summary on invoice</MenuItem><MenuItem value="separate">Separate contribution request</MenuItem></TextField><TextField label="Reviewed rate %" value={value.super_rate} onChange={e => change('super_rate', e.target.value)} />{field('super_fund_name', 'Fund name')}{field('super_usi', 'Fund USI')}{field('super_member_number', 'Member number')}</Box><FormControlLabel control={<Checkbox checked={value.super_confirmed} onChange={e => change('super_confirmed', e.target.checked)} />} label="I have reviewed the eligibility, calculation base and rate" /><Typography variant="caption">A manual super item replaces the automatic calculation.</Typography></Stack></AccordionDetails></Accordion>
      <Accordion disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={650}>Calculate shift hours</Typography></AccordionSummary><AccordionDetails><Stack spacing={2}><Typography variant="caption">Using {Intl.DateTimeFormat().resolvedOptions().timeZone}. Check the timezone for interstate shifts.</Typography><Box sx={grid}><TextField type="datetime-local" label="Start" value={start} onChange={e => setStart(e.target.value)} /><TextField type="datetime-local" label="End" value={end} onChange={e => setEnd(e.target.value)} /><TextField label="Unpaid break (minutes)" type="number" value={breakMinutes} onChange={e => setBreak(e.target.value)} /><Button disabled={!start || !end} onClick={async () => { try { const result = await finance.shiftHours({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), break_minutes: Number(breakMinutes) }); setHours(result.hours); } catch (e) { setError(errorMessage(e)); } }}>Calculate hours</Button></Box>{hours && <Typography>{hours} billable hours. Enter this quantity on your labour item.</Typography>}</Stack></AccordionDetails></Accordion>
    </Stack>
    </Box>
    {initial?.revisions?.length ? <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 2 }}>
      <Typography fontWeight={800}>Revision history</Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {initial.revisions.map(revision => <Stack key={revision.version} direction="row" justifyContent="space-between" gap={2}><Typography variant="body2">Revision {revision.version} · {new Date(revision.created_at).toLocaleString('en-AU')}</Typography><Typography variant="body2" color="text.secondary">{revision.invoice_status} · {dollars(revision.calculation.payable)}</Typography></Stack>)}
      </Stack>
    </Paper> : null}
    {inline === 'customer' && <CustomerEditor onClose={() => setInline(null)} onSaved={async saved => { setCustomers(current => [...current, saved]); setValue(current => ({ ...current, customer_id: saved.id, due_date: financeDueDate(current.invoice_date, saved.payment_terms_days) })); await onSaved(); }} />}
    {inline === 'item' && <ItemEditor onClose={() => setInline(null)} onSaved={async saved => { setItems(current => [...current, saved]); addItem(saved); await onSaved(); }} />}
  </Box>;
}
