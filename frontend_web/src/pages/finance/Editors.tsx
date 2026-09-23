import { useState, useRef, useEffect, type ReactNode, type FormEvent } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { finance, type FinanceCustomer, type FinanceCustomerInput, type FinanceItem, type FinanceItemInput,
  type FinanceInvoice, type FinanceDraft, type FinanceCalculation, type FinanceExpense, type FinanceExpenseInput,
  type FinanceTaxCode, type FinanceCategory, type FinanceUnit } from '@chemisttasker/shared-core';
import { today, dueDate, dollars, errorMessage } from './helpers';

const taxes: FinanceTaxCode[] = ['GST', 'GST_FREE', 'INPUT_TAXED', 'OUT_OF_SCOPE'];
const categories: FinanceCategory[] = ['ProfessionalServices', 'Superannuation', 'Transportation', 'Accommodation', 'Miscellaneous'];
const taxLabel: Record<FinanceTaxCode, string> = { GST: 'GST 10%', GST_FREE: 'GST-free', INPUT_TAXED: 'Input taxed', OUT_OF_SCOPE: 'Out of scope / not registered' };
const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 };

function FormDialog({ title, children, onClose, onSave, label = 'Save' }: {
  title: string; children: ReactNode; onClose: () => void; onSave: () => Promise<void>; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setError('');
    try { await onSave(); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { submitting.current = false; setBusy(false); }
  };
  return <Dialog open maxWidth="sm" fullWidth onClose={() => { if (!busy && window.confirm('Close this form and discard unsaved changes?')) onClose(); }}>
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: 'inherit' }}>
      <DialogTitle>{title}</DialogTitle><DialogContent><Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0 }}><Stack spacing={3} sx={{ pt: 1 }}>
        {error && <Alert severity="error" role="alert">{error}</Alert>}{children}
      </Stack></Box></DialogContent><DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button disabled={busy} onClick={() => { if (window.confirm('Discard unsaved changes?')) onClose(); }}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving...' : label}</Button>
      </DialogActions>
    </Box>
  </Dialog>;
}

export function CustomerEditor({ initial, onClose, onSaved }: { initial?: FinanceCustomer; onClose: () => void; onSaved: (saved: FinanceCustomer) => Promise<void> }) {
  const [value, setValue] = useState<FinanceCustomerInput>(initial || { name: '', legal_name: '', abn: '', contact_name: '',
    email: '', phone: '', address: '', payment_terms_days: 14, notes: '', active: true });
  const field = (key: 'name' | 'legal_name' | 'abn' | 'contact_name' | 'email' | 'phone' | 'address' | 'notes', label: string, required = false) =>
    <TextField key={key} label={label} required={required} value={value[key]} type={key === 'email' ? 'email' : 'text'}
      multiline={key === 'address' || key === 'notes'} onChange={event => setValue({ ...value, [key]: event.target.value })} />;
  return <FormDialog title={initial ? 'Edit customer / store' : 'New customer / store'} onClose={onClose} onSave={async () => { const saved = await finance.saveCustomer(value, initial?.id); await onSaved(saved); }}>
    <Alert severity="info">Each store can have its own contact, address and terms, even when several stores share an ABN. Run the ABN check after saving.</Alert>
    <Box sx={grid}>{field('name', 'Store / trading name', true)}{field('legal_name', 'Legal entity name')}{field('abn', 'Customer ABN')}
      {field('contact_name', 'Accounts contact')}{field('email', 'Invoice email')}{field('phone', 'Phone')}
      <TextField label="Payment terms (days)" type="number" inputProps={{ min: 0, max: 365 }} value={value.payment_terms_days}
        onChange={event => setValue({ ...value, payment_terms_days: Number(event.target.value) })} />{field('address', 'Billing address')}</Box>
    {field('notes', 'Private customer notes')}<FormControlLabel control={<Checkbox checked={value.active} onChange={event => setValue({ ...value, active: event.target.checked })} />} label="Active customer" />
  </FormDialog>;
}

export function ItemEditor({ initial, onClose, onSaved }: { initial?: FinanceItem; onClose: () => void; onSaved: (saved: FinanceItem) => Promise<void> }) {
  const [value, setValue] = useState<FinanceItemInput>(initial || { code: '', name: '', category: 'ProfessionalServices', unit: 'Hours', unit_price: '0.00', tax_code: 'OUT_OF_SCOPE', super_eligible: false, active: true });
  return <FormDialog title={initial ? 'Edit saved item' : 'New reusable item'} onClose={onClose} onSave={async () => { const saved = await finance.saveItem(value, initial?.id); await onSaved(saved); }}>
    <Alert severity="info">Item defaults are copied onto invoice rows only. You can freely change description, unit, price and tax treatment on each invoice without changing this saved item. Review GST treatment rather than assuming all pharmacy work is GST-free.</Alert>
    <Box sx={grid}>
      <TextField label="Item code (optional)" value={value.code} helperText="Only for your own catalogue/search. One-off invoice rows do not need a code." onChange={event => setValue({ ...value, code: event.target.value })} />
      <TextField label="Item name" required value={value.name} onChange={event => setValue({ ...value, name: event.target.value })} />
      <TextField select label="Category" value={value.category} onChange={event => { const category = event.target.value as FinanceCategory; setValue({ ...value, category,
        ...(category === 'Superannuation' ? { tax_code: 'OUT_OF_SCOPE' as const, super_eligible: false, unit: 'Lump Sum' as const } : {}) }); }}>
        {categories.map(category => <MenuItem key={category} value={category}>{category}</MenuItem>)}
      </TextField>
      <TextField label="Default unit" value={value.unit} placeholder="Hours, km, each, visit…" onChange={event => setValue({ ...value, unit: event.target.value as FinanceUnit })} />
      <TextField label="Default unit price (AUD)" required inputProps={{ inputMode: 'decimal' }} value={value.unit_price} onChange={event => setValue({ ...value, unit_price: event.target.value })} />
      <TextField select label="Default tax treatment" value={value.tax_code} disabled={value.category === 'Superannuation'} onChange={event => setValue({ ...value, tax_code: event.target.value as FinanceTaxCode })}>
        {taxes.map(tax => <MenuItem key={tax} value={tax}>{taxLabel[tax]}</MenuItem>)}
      </TextField>
    </Box>
    <FormControlLabel control={<Checkbox checked={value.super_eligible} disabled={value.category === 'Superannuation'} onChange={event => setValue({ ...value, super_eligible: event.target.checked })} />} label="Include this item's net amount in the reviewed super calculation base" />
    <FormControlLabel control={<Checkbox checked={value.active} onChange={event => setValue({ ...value, active: event.target.checked })} />} label="Active item" />
  </FormDialog>;
}

function newDraft(previous?: FinanceInvoice): FinanceDraft {
  const source = previous?.payload;
  return { request_key: crypto.randomUUID(), customer_id: 0, invoice_date: today(), due_date: dueDate(today(), 14),
    issuer_name: source?.issuer_name || '', issuer_entity_type: source?.issuer_entity_type || 'sole_trader', issuer_abn: source?.issuer_abn || '', issuer_address: source?.issuer_address || '',
    gst_registered: source?.gst_registered || false, price_mode: source?.price_mode || 'exclusive', super_mode: 'none', super_rate: '12.00', super_confirmed: false,
    bank_account_name: source?.bank_account_name || '', bsb: source?.bsb || '', account_number: source?.account_number || '',
    super_fund_name: source?.super_fund_name || '', super_usi: source?.super_usi || '', super_member_number: source?.super_member_number || '',
    reference: '', notes: '', lines: [] };
}

export function InvoiceEditor({ initial, previous, customers, items, onClose, onSaved }: {
  initial?: FinanceInvoice; previous?: FinanceInvoice; customers: FinanceCustomer[]; items: FinanceItem[];
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState<FinanceDraft>(initial ? { ...initial.payload, version: initial.version, request_key: initial.request_key } : newDraft(previous));
  const [inlineEditor, setInlineEditor] = useState<'customer' | 'item' | null>(null);
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [itemOptions, setItemOptions] = useState(items);
  useEffect(() => setCustomerOptions(customers), [customers]);
  useEffect(() => setItemOptions(items), [items]);
  const latestDraft = useRef(value);
  latestDraft.current = value;
  const [preview, setPreview] = useState<FinanceCalculation | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [selectedItem, setSelectedItem] = useState('');
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [breakMinutes, setBreakMinutes] = useState('0');
  const [computedHours, setComputedHours] = useState('');
  const change = <K extends keyof FinanceDraft,>(key: K, next: FinanceDraft[K]) => { setValue(current => ({ ...current, [key]: next })); setPreview(null); };
  const text = (key: 'issuer_name' | 'issuer_abn' | 'issuer_address' | 'bank_account_name' | 'bsb' | 'account_number' | 'super_fund_name' | 'super_usi' | 'super_member_number' | 'reference' | 'notes', label: string, required = false) =>
    <TextField key={key} label={label} required={required} value={value[key]} multiline={key === 'notes' || key === 'issuer_address'} onChange={event => change(key, event.target.value)} />;
  const recalculate = async () => { setPreviewing(true); setPreviewError(''); try { const submitted = JSON.stringify(value); const result = await finance.preview(value); if (submitted === JSON.stringify(latestDraft.current)) setPreview(result); } catch (error) { setPreviewError(errorMessage(error)); } finally { setPreviewing(false); } };
  return <><FormDialog title={initial ? `Edit ${initial.number}` : 'New external-shift invoice'} label="Save draft" onClose={onClose}
    onSave={async () => { await finance.saveInvoice(value, initial?.id); await onSaved(); }}>
    <Alert severity="info">Saving creates a draft only. An issuer ABN is required before issuing. Review the document before sending; accepted internal shifts and historical snapshots are available in Invoices.</Alert>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">Customer and dates</Typography><Button onClick={() => setInlineEditor('customer')}>Create new customer</Button></Stack>
    <Box sx={grid}>
      <TextField select required label="Customer / store" value={value.customer_id || ''} onChange={event => { const id = Number(event.target.value); const customer = customerOptions.find(entry => entry.id === id); setValue({ ...value, customer_id: id, due_date: dueDate(value.invoice_date, customer?.payment_terms_days ?? 14) }); setPreview(null); }}>
        {customerOptions.filter(customer => customer.active).map(customer => <MenuItem key={customer.id} value={customer.id}>{customer.name}</MenuItem>)}
      </TextField>{text('reference', 'Reference / purchase order')}
      <TextField type="date" label="Invoice date" required InputLabelProps={{ shrink: true }} value={value.invoice_date} onChange={event => { const date = event.target.value; const terms = customerOptions.find(customer => customer.id === value.customer_id)?.payment_terms_days ?? 14; setValue(current => ({ ...current, invoice_date: date, due_date: date ? dueDate(date, terms) : '' })); setPreview(null); }} />
      <TextField type="date" label="Due date" required InputLabelProps={{ shrink: true }} value={value.due_date} onChange={event => change('due_date', event.target.value)} />
    </Box>
    <Divider /><Typography variant="h6">Your business and tax settings</Typography>
    <Box sx={grid}>{text('issuer_name', 'Issuer / business name', true)}
      <TextField select label="Issuer entity" value={value.issuer_entity_type || 'sole_trader'} onChange={event => change('issuer_entity_type', event.target.value as 'sole_trader' | 'company')}>
        <MenuItem value="sole_trader">Sole trader</MenuItem><MenuItem value="company">Company</MenuItem>
      </TextField>{text('issuer_abn', 'Your ABN')}{text('issuer_address', 'Your business address')}
      <TextField select label="Entered prices" value={value.price_mode} onChange={event => change('price_mode', event.target.value as FinanceDraft['price_mode'])}>
        <MenuItem value="exclusive">GST exclusive</MenuItem><MenuItem value="inclusive">GST inclusive</MenuItem>
      </TextField>
    </Box>
    <FormControlLabel control={<Checkbox checked={value.gst_registered} onChange={event => change('gst_registered', event.target.checked)} />} label="I am registered for GST for this supply (not the customer's registration)" />
    <Divider /><Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="h6">Saved items</Typography>
      <Button onClick={() => setInlineEditor('item')}>Create new item</Button></Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField select fullWidth label="Choose a saved item" value={selectedItem} onChange={event => setSelectedItem(event.target.value)}>
        {itemOptions.filter(item => item.active).map(item => <MenuItem key={item.id} value={item.id}>{item.code} - {item.name}</MenuItem>)}
      </TextField>
      <Button variant="outlined" disabled={!selectedItem} onClick={() => { const item = itemOptions.find(entry => entry.id === Number(selectedItem)); if (!item) return;
        change('lines', [...value.lines, { item_id: item.id, description: item.name, quantity: '1.00', unit_price: item.unit_price, discount: '0.00', tax_code: item.tax_code, super_eligible: item.super_eligible, worked_on: today(), category_code: item.category, unit: item.unit }]); }}>Add item</Button>
    </Stack>
    {!value.lines.length && <Alert severity="warning">Add a saved item, or create a new one without losing this draft.</Alert>}
    {value.lines.map((line, index) => <Box key={`${index}-${line.item_id}`} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Box sx={{ ...grid, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr 1fr' } }}>
        <TextField label="Description" required value={line.description || ''} onChange={event => change('lines', value.lines.map((entry, i) => i === index ? { ...entry, description: event.target.value } : entry))} />
        <TextField label={`Quantity (${line.unit || 'units'})`} required inputProps={{ inputMode: 'decimal' }} value={line.quantity} onChange={event => change('lines', value.lines.map((entry, i) => i === index ? { ...entry, quantity: event.target.value } : entry))} />
        <TextField label="Unit price" required inputProps={{ inputMode: 'decimal' }} value={line.unit_price} onChange={event => change('lines', value.lines.map((entry, i) => i === index ? { ...entry, unit_price: event.target.value } : entry))} />
        <TextField label="Discount %" inputProps={{ inputMode: 'decimal' }} value={line.discount} onChange={event => change('lines', value.lines.map((entry, i) => i === index ? { ...entry, discount: event.target.value } : entry))} />
        <TextField select label="Tax treatment" value={line.tax_code || 'OUT_OF_SCOPE'} onChange={event => change('lines', value.lines.map((entry, i) => i === index ? { ...entry, tax_code: event.target.value as FinanceTaxCode } : entry))}>
          {taxes.map(tax => <MenuItem key={tax} value={tax}>{taxLabel[tax]}</MenuItem>)}
        </TextField>
        <TextField type="date" label="Work / expense date" InputLabelProps={{ shrink: true }} value={line.worked_on || ''} onChange={event => change('lines', value.lines.map((entry, i) => i === index ? { ...entry, worked_on: event.target.value || null } : entry))} />
        <FormControlLabel control={<Checkbox checked={line.super_eligible || false} onChange={event => change('lines', value.lines.map((entry, i) => i === index ? { ...entry, super_eligible: event.target.checked } : entry))} />} label="Super base" />
        <Button color="error" onClick={() => change('lines', value.lines.filter((_, i) => i !== index))}>Remove item {index + 1}</Button>
      </Box>
    </Box>)}
    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
      <Typography fontWeight={600}>Shift-hours helper</Typography><Typography variant="body2" color="text.secondary">Times use your device time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. For work in another time zone, use the equivalent local instant. Includes overnight shifts; ambiguous daylight-saving times need review.</Typography>
      <Box sx={{ ...grid, mt: 2 }}><TextField type="datetime-local" label="Start" InputLabelProps={{ shrink: true }} value={start} onChange={event => setStart(event.target.value)} />
        <TextField type="datetime-local" label="End" InputLabelProps={{ shrink: true }} value={end} onChange={event => setEnd(event.target.value)} />
        <TextField type="number" label="Unpaid break (minutes)" inputProps={{ min: 0, max: 1440 }} value={breakMinutes} onChange={event => setBreakMinutes(event.target.value)} />
        <Button disabled={!start || !end || previewing} onClick={async () => { setPreviewing(true); try { const result = await finance.shiftHours({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), break_minutes: Number(breakMinutes) }); setComputedHours(result.hours); setPreviewError(''); } catch (error) { setPreviewError(errorMessage(error)); } finally { setPreviewing(false); } }}>Calculate hours</Button></Box>
      {computedHours && <Typography sx={{ mt: 1 }}>Billable hours: <strong>{computedHours}</strong>. Enter this quantity on the relevant labour item.</Typography>}
    </Box>
    <Divider /><Typography variant="h6">Superannuation</Typography>
    <Alert severity="warning">Eligibility is not automatic for every contractor. Confirm the agreed basis and relevant rate. A statutory contribution goes to the fund, not to the worker's bank account; it is not automatically taxable revenue.</Alert>
    <Box sx={grid}><TextField select label="Super presentation" value={value.super_mode} onChange={event => change('super_mode', event.target.value as FinanceDraft['super_mode'])}>
      <MenuItem value="none">No super calculation</MenuItem><MenuItem value="summary">Contribution summary on invoice</MenuItem><MenuItem value="separate">Separate linked contribution request</MenuItem>
    </TextField><TextField label="Reviewed super rate %" inputProps={{ inputMode: 'decimal' }} value={value.super_rate} onChange={event => change('super_rate', event.target.value)} />
      {text('super_fund_name', 'Super fund name')}{text('super_usi', 'Fund USI')}{text('super_member_number', 'Member number')}</Box>
    <FormControlLabel control={<Checkbox checked={value.super_confirmed} onChange={event => change('super_confirmed', event.target.checked)} />} label="I have reviewed the super eligibility, calculation base and rate" />
    <Typography variant="body2" color="text.secondary">A manually added Superannuation item replaces the automatic contribution calculation; it is not added a second time.</Typography>
    <Divider /><Typography variant="h6">Payment details and notes</Typography><Box sx={grid}>{text('bank_account_name', 'Bank account name')}{text('bsb', 'BSB (six digits)')}{text('account_number', 'Account number')}</Box>{text('notes', 'Invoice notes')}
    {previewError && <Alert severity="error">{previewError}</Alert>}
    <Button variant="outlined" disabled={previewing} onClick={() => void recalculate()}>{previewing ? 'Calculating...' : 'Calculate and review totals'}</Button>
    {preview && <Alert severity="success"><strong>Worker payable {dollars(preview.payable)}</strong> | GST {dollars(preview.gst)} | Separate fund contribution {dollars(preview.super)}. Totals calculated by the shared backend.</Alert>}
  </FormDialog>
    {inlineEditor === 'customer' && <CustomerEditor onClose={() => setInlineEditor(null)} onSaved={async saved => {
      setCustomerOptions(current => [...current, saved]);
      setValue(current => ({ ...current, customer_id: saved.id, due_date: dueDate(current.invoice_date, saved.payment_terms_days) }));
      setPreview(null); await onSaved();
    }} />}
    {inlineEditor === 'item' && <ItemEditor onClose={() => setInlineEditor(null)} onSaved={async saved => {
      setItemOptions(current => [...current, saved]); setSelectedItem(String(saved.id)); await onSaved();
    }} />}
  </>;
}

export function ExpenseEditor({ initial, onClose, onSaved }: { initial?: FinanceExpense; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState<FinanceExpenseInput>(initial || { request_key: crypto.randomUUID(), version: 1, supplier: '', description: '', category: 'Other', incurred_on: today(), paid_on: null,
    amount: '', gst_amount: '0.00', tax_code: 'OUT_OF_SCOPE', business_use_percent: '100.00', gst_registered: false, evidence_confirmed: false, reimbursable: false, reference: '', notes: '' });
  const text = (key: 'supplier' | 'description' | 'category' | 'amount' | 'gst_amount' | 'business_use_percent' | 'reference' | 'notes', label: string, required = false) =>
    <TextField key={key} required={required} label={label} value={value[key]} onChange={event => setValue({ ...value, [key]: event.target.value })} />;
  return <FormDialog title={initial ? `Edit expense #${initial.id}` : 'New expense'} onClose={onClose} onSave={async () => { await finance.saveExpense(value, initial?.id); await onSaved(); }}>
    <Alert severity="info">Record the actual receipt GST, not an assumed 10% of the total. Save first, then attach receipts. Expense recording does not automatically bill the customer.</Alert>
    <Box sx={grid}>{text('supplier', 'Supplier', true)}{text('description', 'Description', true)}{text('category', 'Category', true)}{text('reference', 'Supplier invoice / reference')}
      <TextField required type="date" label="Incurred date" InputLabelProps={{ shrink: true }} value={value.incurred_on} onChange={event => setValue({ ...value, incurred_on: event.target.value })} />
      <TextField type="date" label="Paid in full on (blank if unpaid)" InputLabelProps={{ shrink: true }} value={value.paid_on || ''} onChange={event => setValue({ ...value, paid_on: event.target.value || null })} />
      {text('amount', 'Total including GST (AUD)', true)}{text('gst_amount', 'GST shown on receipt', true)}{text('business_use_percent', 'Creditable business use %', true)}
      <TextField select label="Tax treatment" value={value.tax_code} onChange={event => setValue({ ...value, tax_code: event.target.value as FinanceTaxCode })}>{taxes.map(tax => <MenuItem key={tax} value={tax}>{taxLabel[tax]}</MenuItem>)}</TextField>
    </Box>
    <FormControlLabel control={<Checkbox checked={value.gst_registered} onChange={event => setValue({ ...value, gst_registered: event.target.checked })} />} label="I am registered for GST for this acquisition" />
    <FormControlLabel control={<Checkbox checked={value.evidence_confirmed} onChange={event => setValue({ ...value, evidence_confirmed: event.target.checked })} />} label="I hold the required valid tax invoice / evidence for this claim" />
    <FormControlLabel control={<Checkbox checked={value.reimbursable} onChange={event => setValue({ ...value, reimbursable: event.target.checked })} />} label="Potentially reimbursable by the customer (bill separately after review)" />
    {text('notes', 'Private notes')}
  </FormDialog>;
}

export function PaymentEditor({ invoice, onClose, onSaved }: { invoice: FinanceInvoice; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState({ request_key: crypto.randomUUID(), date: today(), amount: invoice.balance, reference: '', fund_payment_confirmed: false });
  return <FormDialog title={`Record payment - ${invoice.number}`} onClose={onClose} onSave={async () => { await finance.payment(invoice.id, value); await onSaved(); }}>
    <Typography>Outstanding {dollars(invoice.balance)}. Record actual receipts only; partial payments are supported.</Typography>
    <Box sx={grid}><TextField label="Amount (AUD)" required value={value.amount} onChange={event => setValue({ ...value, amount: event.target.value })} />
      <TextField label="Payment date" type="date" required InputLabelProps={{ shrink: true }} value={value.date} onChange={event => setValue({ ...value, date: event.target.value })} />
      <TextField label="Bank / fund reference" value={value.reference} onChange={event => setValue({ ...value, reference: event.target.value })} /></Box>
    {invoice.kind === 'super_request' && <FormControlLabel control={<Checkbox checked={value.fund_payment_confirmed} onChange={event => setValue({ ...value, fund_payment_confirmed: event.target.checked })} />} label="I confirmed this payment went to the super fund, not the worker" />}
  </FormDialog>;
}
