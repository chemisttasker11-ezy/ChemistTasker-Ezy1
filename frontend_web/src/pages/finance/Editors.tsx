import { AuDateField } from '../../components/AuDateField';
import { useState, useRef, type ReactNode, type FormEvent } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { finance, type FinanceCustomer, type FinanceCustomerInput, type FinanceItem, type FinanceItemInput,
  type FinanceInvoice, type FinanceExpense, type FinanceExpenseInput,
  type FinanceTaxCode, type FinanceCategory, type FinanceUnit } from '@chemisttasker/shared-core';
import { today, dollars, errorMessage } from './helpers';

const taxes: FinanceTaxCode[] = ['GST', 'GST_FREE', 'INPUT_TAXED', 'OUT_OF_SCOPE'];
const categories: FinanceCategory[] = ['ProfessionalServices', 'Superannuation', 'Transportation', 'Accommodation', 'Miscellaneous'];
const taxLabel: Record<FinanceTaxCode, string> = { GST: 'GST 10%', GST_FREE: 'GST-free', INPUT_TAXED: 'Input taxed', OUT_OF_SCOPE: 'Out of scope / not registered' };
const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 };

function FormDialog({ title, children, value, onClose, onSave, label = 'Save' }: {
  title: string; children: ReactNode; value: unknown; onClose: () => void; onSave: () => Promise<void>; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const original = useRef(JSON.stringify(value));
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setError('');
    try { await onSave(); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { submitting.current = false; setBusy(false); }
  };
  const close = () => { if (busy) return; if (JSON.stringify(value) !== original.current) setDiscarding(true); else onClose(); };
  return <><Dialog open maxWidth="sm" fullWidth onClose={close} aria-labelledby="finance-form-title">
    <Box component="form" onSubmit={submit} noValidate sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: 'inherit' }}>
      <DialogTitle id="finance-form-title" sx={{ fontWeight: 600 }}>{title}</DialogTitle><DialogContent><Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}><Stack spacing={2.5} sx={{ pt: 1 }}>
        {error && <Alert severity="error" role="alert">{error}</Alert>}{children}
      </Stack></Box></DialogContent><DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--ct-border-color)' }}>
        <Button disabled={busy} onClick={close} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ minHeight: 44 }}>{busy ? 'Saving…' : label}</Button>
      </DialogActions>
    </Box>
  </Dialog>
  <ConfirmDialog open={discarding} title="Discard your changes?" body="You have changes that aren't saved. Closing now loses them." confirmLabel="Discard changes" busyLabel="Discarding" busy={false}
    onConfirm={() => { setDiscarding(false); onClose(); }} onClose={() => setDiscarding(false)} /></>;
}

export function CustomerEditor({ initial, onClose, onSaved }: { initial?: FinanceCustomer; onClose: () => void; onSaved: (saved: FinanceCustomer) => Promise<void> }) {
  const [value, setValue] = useState<FinanceCustomerInput>(initial || { name: '', legal_name: '', abn: '', contact_name: '',
    email: '', phone: '', address: '', payment_terms_days: 14, notes: '', active: true });
  const field = (key: 'name' | 'legal_name' | 'abn' | 'contact_name' | 'email' | 'phone' | 'address' | 'notes', label: string, required = false) =>
    <TextField key={key} label={label} required={required} value={value[key]} type={key === 'email' ? 'email' : 'text'}
      multiline={key === 'address' || key === 'notes'} onChange={event => setValue({ ...value, [key]: event.target.value })} />;
  return <FormDialog value={value} title={initial ? 'Edit customer / store' : 'New customer / store'} onClose={onClose} onSave={async () => { const saved = await finance.saveCustomer(value, initial?.id); await onSaved(saved); }}>
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
  return <FormDialog value={value} title={initial ? 'Edit saved item' : 'New reusable item'} onClose={onClose} onSave={async () => { const saved = await finance.saveItem(value, initial?.id); await onSaved(saved); }}>
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

export function ExpenseEditor({ initial, onClose, onSaved }: { initial?: FinanceExpense; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState<FinanceExpenseInput>(initial || { request_key: crypto.randomUUID(), version: 1, supplier: '', description: '', category: 'Other', incurred_on: today(), paid_on: null,
    amount: '', gst_amount: '0.00', tax_code: 'OUT_OF_SCOPE', business_use_percent: '100.00', gst_registered: false, evidence_confirmed: false, reimbursable: false, reference: '', notes: '' });
  const text = (key: 'supplier' | 'description' | 'category' | 'amount' | 'gst_amount' | 'business_use_percent' | 'reference' | 'notes', label: string, required = false) =>
    <TextField key={key} required={required} label={label} value={value[key]} onChange={event => setValue({ ...value, [key]: event.target.value })} />;
  return <FormDialog value={value} title={initial ? `Edit expense #${initial.id}` : 'New expense'} onClose={onClose} onSave={async () => { await finance.saveExpense(value, initial?.id); await onSaved(); }}>
    <Alert severity="info">Record the actual receipt GST, not an assumed 10% of the total. Save first, then attach receipts. Expense recording does not automatically bill the customer.</Alert>
    <Box sx={grid}>{text('supplier', 'Supplier', true)}{text('description', 'Description', true)}{text('category', 'Category', true)}{text('reference', 'Supplier invoice / reference')}
      <AuDateField required label="Incurred date" value={value.incurred_on} onChange={isoValue => setValue({ ...value, incurred_on: isoValue })} />
      <AuDateField label="Paid in full on (blank if unpaid)" value={value.paid_on || ''} onChange={isoValue => setValue({ ...value, paid_on: isoValue || null })} />
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
  const amount = Number(value.amount);
  const amountError = !value.amount.trim() || !(amount > 0) ? 'Enter the amount you received.'
    : amount > Number(invoice.balance) ? `That's more than the ${dollars(invoice.balance)} still owed.` : '';
  const fundMissing = invoice.kind === 'super_request' && !value.fund_payment_confirmed;
  const partial = !amountError && amount < Number(invoice.balance);
  return <FormDialog value={value} title="Record a payment" label="Record payment" onClose={onClose} onSave={async () => {
    if (amountError) throw new Error(amountError);
    if (fundMissing) throw new Error('Confirm the payment went to the super fund.');
    await finance.payment(invoice.id, value); await onSaved();
  }}>
    <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'var(--ct-page-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
      <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>Still owed on {invoice.number}</Typography>
      <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{dollars(invoice.balance)}</Typography>
    </Box>
    <Box sx={grid}>
      <TextField label="Amount received" required value={value.amount} inputProps={{ inputMode: 'decimal' }} error={Boolean(amountError) && value.amount !== invoice.balance}
        InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
        helperText={value.amount !== invoice.balance && amountError ? amountError : partial ? `Part payment. ${dollars(Number(invoice.balance) - amount)} will still be owed.` : 'Record only money that has arrived.'}
        onChange={event => setValue({ ...value, amount: event.target.value })} />
      <AuDateField label="Date received" required value={value.date} onChange={isoValue => setValue({ ...value, date: isoValue })} />
      <TextField label="Reference (optional)" placeholder="Bank or fund reference" value={value.reference} sx={{ gridColumn: { sm: '1 / -1' } }} onChange={event => setValue({ ...value, reference: event.target.value })} />
    </Box>
    {invoice.kind === 'super_request' && <FormControlLabel control={<Checkbox checked={value.fund_payment_confirmed} onChange={event => setValue({ ...value, fund_payment_confirmed: event.target.checked })} />} label="This payment went to the super fund, not to me" />}
  </FormDialog>;
}
