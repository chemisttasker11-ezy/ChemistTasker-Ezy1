import { AuDateField, AuDateTimeField } from '../../components/AuDateField';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { ArrowLeft, Building2, Calculator, Check, ChevronDown, History, ListChecks, Plus, Trash2, Zap } from 'lucide-react';
import { createFinanceDraft, finance, financeDueDate, financeItemLine, type FinanceCalculation, type FinanceCategory, type FinanceCustomer, type FinanceDraft, type FinanceInternalSource, type FinanceInvoice, type FinanceItem, type FinanceLine, type FinanceTaxCode } from '@chemisttasker/shared-core';
import { CustomerEditor, ItemEditor } from './Editors';
import { dollars, errorMessage } from './helpers';
import { FinanceStatusPill, taxLabels } from './financeParts';
import PageHeader from '../../components/ui/PageHeader';
import { Pill } from '../../components/ui/Pill';
import { InvoiceSection, formatDay } from '../dashboard/sidebar/Invoices/invoiceParts';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 };
const lineColumns = 'minmax(200px, 2.4fr) 150px .7fr 1fr 1fr 1.1fr 1fr 44px';
const muted = { color: 'var(--ct-text-secondary)', fontSize: 13.5 } as const;
const accordion = { border: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)', borderRadius: 'var(--ct-card-radius) !important', boxShadow: 'none' } as const;
const categoryName = (category: string) => category.replace(/([A-Z])/g, ' $1').trim();

export default function InvoiceComposer({ initial, prefillShiftId, previous, customers, items, onClose, onSaved }: {
  initial?: FinanceInvoice; prefillShiftId?: number; previous?: FinanceInvoice; customers: FinanceCustomer[]; items: FinanceItem[]; onClose: () => void; onSaved: () => Promise<void>;
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
  const errorRef = useRef<HTMLDivElement>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const submitting = useRef(false);
  const [businessOpen, setBusinessOpen] = useState(!value.issuer_name);
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [breakMinutes, setBreak] = useState('0');
  const [hours, setHours] = useState(''); const [hoursBusy, setHoursBusy] = useState(false); const [hoursError, setHoursError] = useState('');
  const [internalSources, setInternalSources] = useState<FinanceInternalSource[]>([]);
  const [selectedInternalSource, setSelectedInternalSource] = useState<FinanceInternalSource | null>(null);
  const customer = customerOptions.find(c => c.id === value.customer_id);
  const snapshotCustomer = (item: FinanceCustomer) => ({
    name: item.name, legal_name: item.legal_name, address: item.address, abn: item.abn,
    email: item.email, contact_name: item.contact_name,
  });
  const invoiceCustomer = value.customer || (customer ? snapshotCustomer(customer) : undefined);
  const changeCustomer = (key: keyof NonNullable<FinanceDraft['customer']>, next: string) => setValue(current => ({
    ...current,
    customer: {
      ...(current.customer || (customer ? snapshotCustomer(customer) : { name: '', legal_name: '', address: '', abn: '', email: '', contact_name: '' })),
      [key]: next,
    },
  }));
  const internalSource = initial?.source === 'internal' || Boolean(value.source_assignment_ids?.length);
  const change = <K extends keyof FinanceDraft,>(key: K, next: FinanceDraft[K]) => setValue(current => ({ ...current, [key]: next }));
  const changeLine = (index: number, patch: Partial<FinanceLine>) => change('lines', value.lines.map((line, i) => i === index ? { ...line, ...patch } : line));
  const dirty = JSON.stringify(value) !== original.current;
  const close = () => { if (busy) return; if (dirty) setDiscarding(true); else onClose(); };
  const showError = (message: string) => { setError(message); window.setTimeout(() => errorRef.current?.focus(), 0); };
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
      if (prefillShiftId) {
        // Opened from a shift (e.g. Shift history → Create invoice): start from that accepted shift.
        const source = sources.find(item => item.shift_id === prefillShiftId);
        if (source) void applyInternalSource(source);
        else setError("That shift can't be invoiced from here yet: it needs an accepted ABN booking that hasn't been invoiced. You can still create the invoice below.");
      }
      setValue(current => {
        const next = {
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
        };
        // Prefilled business details are the starting point, not an unsaved change.
        if (JSON.stringify(current) === original.current) original.current = JSON.stringify(next);
        return next;
      });
    }).catch(failure => setError(`Your saved business details didn't load. You can still fill them in. ${errorMessage(failure)}`));
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
  const customerMissing = attempted && !value.customer_id;
  const issuerMissing = attempted && !value.issuer_name.trim();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    setAttempted(true);
    if (!value.customer_id) { showError('Choose who this invoice is for.'); return; }
    if (!value.issuer_name.trim()) { setBusinessOpen(true); showError('Add your business name under Business details.'); return; }
    if (!value.lines.length) { showError('Add at least one item you are billing for.'); return; }
    submitting.current = true; setBusy(true); setError('');
    try { await finance.saveInvoice(value, initial?.id); await onSaved(); onClose(); }
    catch (failure) { showError(`The invoice wasn't saved. ${errorMessage(failure)}`); }
    finally { submitting.current = false; setBusy(false); }
  };
  const field = (key: 'issuer_name' | 'issuer_abn' | 'issuer_address' | 'bank_account_name' | 'bsb' | 'account_number' | 'super_fund_name' | 'super_usi' | 'super_member_number' | 'notes' | 'reference', label: string) => <TextField label={label} value={value[key]} multiline={key === 'notes' || key === 'issuer_address'} minRows={key === 'notes' ? 3 : undefined} onChange={event => change(key, event.target.value)} />;
  const addItem = (item: FinanceItem) => { change('lines', [...value.lines, financeItemLine(item)]); setSelectedItem(null); };
  const blankLine = (patch: Partial<FinanceLine> = {}): FinanceLine => ({ item_id: null, description: '', category_code: 'Miscellaneous', unit: 'Item', quantity: '1.00', unit_price: '0.00', discount: '0.00', tax_code: 'OUT_OF_SCOPE', super_eligible: false, worked_on: null, ...patch });
  const hourLines = value.lines.map((line, index) => ({ line, index })).filter(({ line }) => /hour/i.test(line.unit || ''));
  const calculateHours = async () => {
    setHoursBusy(true); setHoursError('');
    try { setHours((await finance.shiftHours({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), break_minutes: Number(breakMinutes) })).hours); }
    catch (failure) { setHours(''); setHoursError(errorMessage(failure)); }
    finally { setHoursBusy(false); }
  };
  const amount = (raw: string | undefined) => raw !== undefined ? dollars(raw) : calculating ? 'Calculating…' : value.lines.length ? 'Not yet' : dollars('0');
  const openRequests = initial?.review_requests?.filter(request => !request.resolved_at) ?? [];

  return <Box component="form" onSubmit={submit} noValidate sx={{ maxWidth: 1280, mx: 'auto' }}>
    <PageHeader
      title={initial ? `Invoice ${initial.number}` : 'New invoice'}
      subtitle={initial ? `Revision ${initial.version}. Saving keeps a copy of every revision.` : 'Nothing is saved until you press Save invoice.'}
      actions={<Button variant="outlined" startIcon={<ArrowLeft size={16} />} onClick={close} disabled={busy} sx={{ minHeight: 44 }}>Back to invoices</Button>}
    >
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {initial ? <FinanceStatusPill invoice={initial} /> : <Pill label="Not saved yet" tone="neutral" />}
        {internalSource && <Pill label="From a ChemistTasker shift" tone="violet" title="The pharmacy comes from the accepted shift. Date, hours, rate, description and tax stay editable." />}
      </Stack>
    </PageHeader>

    <Stack spacing={2} sx={{ mt: 3 }}>
      {error && <Alert ref={errorRef} tabIndex={-1} severity="error" role="alert" onClose={() => setError('')}>{error}</Alert>}
      {openRequests.map(request => (
        <Alert key={request.id} severity="warning">
          <strong>{request.requested_by_name} asked for changes:</strong> {request.note}
        </Alert>
      ))}

      <Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
        <Stack spacing={2} useFlexGap>
          {!initial && internalSources.length > 0 && (
            <InvoiceSection icon={<Zap />} tone="violet" title="Start from a ChemistTasker shift">
              <Typography sx={{ ...muted, mb: 1.5 }}>Fills in the pharmacy, date, hours, rate and your business details. You can change them before saving.</Typography>
              <Autocomplete options={internalSources} value={selectedInternalSource}
                getOptionLabel={source => `${source.pharmacy.name} · ${formatDay(source.date)} · ${source.hours} h × ${dollars(source.rate)}`}
                isOptionEqualToValue={(a, b) => a.assignment_id === b.assignment_id}
                onChange={(_, next) => void applyInternalSource(next)}
                renderInput={props => <TextField {...props} label="Accepted shift" placeholder="Choose a shift" />} />
            </InvoiceSection>
          )}

          <InvoiceSection icon={<Building2 />} tone="blue" title="Customer and dates">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(300px, 420px)' }, gap: { xs: 3, md: 6 } }}>
              <Stack spacing={2}>
                <Autocomplete disabled={internalSource} options={customerOptions.filter(c => c.active)} value={customer || null} getOptionLabel={c => c.name} isOptionEqualToValue={(a, b) => a.id === b.id}
                  onChange={(_, next) => setValue(current => ({ ...current, customer_id: next?.id || 0, customer: next ? snapshotCustomer(next) : undefined, due_date: financeDueDate(current.invoice_date, next?.payment_terms_days ?? 14) }))}
                  renderInput={props => <TextField {...props} required label="Customer" placeholder="Search customers or stores" error={customerMissing}
                    helperText={customerMissing ? 'Choose who this invoice is for.' : internalSource ? 'Set by the accepted shift.' : undefined} />} />
                {!internalSource && <Button startIcon={<Plus size={16} />} onClick={() => setInline('customer')} sx={{ alignSelf: 'flex-start', minHeight: 40 }}>New customer</Button>}
                <Box>
                  <Typography sx={{ ...muted, fontSize: 12.5 }}>Billing address</Typography>
                  <Typography sx={{ color: invoiceCustomer?.address ? 'var(--ct-text-primary)' : 'var(--ct-text-secondary)', fontSize: 14.5, whiteSpace: 'pre-line', mt: .5 }}>{invoiceCustomer?.address || 'Choose a customer to see their billing details.'}</Typography>
                  {invoiceCustomer?.abn && <Typography sx={{ ...muted, mt: .5 }}>ABN {invoiceCustomer.abn}</Typography>}
                </Box>
                {invoiceCustomer && <Accordion sx={accordion}>
                  <AccordionSummary expandIcon={<ChevronDown size={18} />}><Box><Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>Change bill-to details</Typography><Typography sx={{ ...muted, fontSize: 12.5 }}>For this invoice only. The saved customer stays the same.</Typography></Box></AccordionSummary>
                  <AccordionDetails><Stack spacing={1.5}>
                    <TextField size="small" label="Bill-to name" value={invoiceCustomer.name} onChange={e => changeCustomer('name', e.target.value)} />
                    <TextField size="small" label="Legal name" value={invoiceCustomer.legal_name} onChange={e => changeCustomer('legal_name', e.target.value)} />
                    <TextField size="small" label="ABN" value={invoiceCustomer.abn} onChange={e => changeCustomer('abn', e.target.value)} />
                    <TextField size="small" label="Accounts contact" value={invoiceCustomer.contact_name} onChange={e => changeCustomer('contact_name', e.target.value)} />
                    <TextField size="small" type="email" label="Invoice email" value={invoiceCustomer.email} onChange={e => changeCustomer('email', e.target.value)} />
                    <TextField size="small" multiline minRows={2} label="Billing address" value={invoiceCustomer.address} onChange={e => changeCustomer('address', e.target.value)} />
                  </Stack></AccordionDetails>
                </Accordion>}
              </Stack>
              <Box sx={grid}>
                <TextField label="Invoice number" value={initial?.number || 'Given when saved'} slotProps={{ input: { readOnly: true } }} />
                {field('reference', 'Customer PO or reference')}
                <AuDateField required label="Issue date" value={value.invoice_date} onChange={isoValue => { const date = isoValue; setValue(current => ({ ...current, invoice_date: date, due_date: financeDueDate(date, customer?.payment_terms_days ?? 14) })); }} />
                <AuDateField required label="Due date" value={value.due_date} helperText={`${customer?.payment_terms_days ?? 14}-day terms`} onChange={isoValue => change('due_date', isoValue)} />
                <TextField select label="Prices you enter are" value={value.price_mode} sx={{ gridColumn: { sm: '1 / -1' } }} onChange={event => change('price_mode', event.target.value as FinanceDraft['price_mode'])}><MenuItem value="exclusive">Before GST</MenuItem><MenuItem value="inclusive">Including GST</MenuItem></TextField>
              </Box>
            </Box>
          </InvoiceSection>

          <InvoiceSection icon={<ListChecks />} tone="magenta" title="Work and costs">
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
              <Autocomplete sx={{ flex: 1, maxWidth: { md: 380 } }} options={itemOptions.filter(i => i.active)} value={selectedItem} getOptionLabel={i => i.code ? `${i.code} · ${i.name}` : i.name} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, next) => { if (next) addItem(next); }} renderInput={props => <TextField {...props} label="Add a saved item" placeholder="Search your items" />} />
              <Stack direction="row" spacing={1}>
                <Button startIcon={<Plus size={16} />} onClick={() => change('lines', [...value.lines, blankLine()])} sx={{ minHeight: 44 }}>Blank line</Button>
                <Button startIcon={<Plus size={16} />} onClick={() => setInline('item')} sx={{ minHeight: 44 }}>New saved item</Button>
              </Stack>
            </Stack>
            {!value.lines.length && <Box sx={{ textAlign: 'center', py: 4, px: 2, border: '1px dashed var(--ct-border-color)', borderRadius: 3 }}>
              <Typography sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>Add the work you're billing for</Typography>
              <Typography sx={{ ...muted, mt: .5 }}>Pick a saved item above, or add a blank line.</Typography>
              {attempted && <Typography role="alert" sx={{ color: 'var(--ct-status-red-fg)', fontSize: 13.5, mt: 1 }}>An invoice needs at least one line.</Typography>}
            </Box>}
            <Stack spacing={{ xs: 1.5, lg: 0 }}>
              {value.lines.map((line, index) => {
                const label = line.description?.trim() || `Line ${index + 1}`;
                const remove = <Tooltip title={line.source_assignment_id ? 'Lines from a shift stay on the invoice. Change their values instead.' : ''}>
                  <span><IconButton aria-label={`Remove ${label}`} disabled={Boolean(line.source_assignment_id)} onClick={() => change('lines', value.lines.filter((_, i) => i !== index))} sx={{ width: 44, height: 44 }}><Trash2 size={18} /></IconButton></span>
                </Tooltip>;
                return <Box key={`${index}-${line.source_assignment_id ?? line.item_id ?? 'adhoc'}`} component="section" aria-label={label}
                  sx={{ p: { xs: 1.5, lg: 1.5 }, border: { xs: '1px solid var(--ct-border-color)', lg: 0 }, borderBottom: { lg: '1px solid var(--ct-border-color)' }, borderRadius: { xs: 3, lg: 0 } }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ display: { lg: 'none' }, mb: 1.5 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>Line {index + 1}</Typography>
                    <Stack direction="row" alignItems="center" spacing={1}><Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{amount(preview?.lines[index]?.gross)}</Typography>{remove}</Stack>
                  </Stack>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: lineColumns }, gap: 1, alignItems: 'start' }}>
                    <TextField label="Description" sx={{ gridColumn: { xs: '1 / -1', lg: 'auto' } }} value={line.description || ''} onChange={e => changeLine(index, { description: e.target.value })} multiline />
                    <AuDateField label="Work date" value={line.worked_on || ''} onChange={isoValue => changeLine(index, { worked_on: isoValue || null })} />
                    <TextField label="Qty" value={line.quantity} inputProps={{ inputMode: 'decimal' }} onChange={e => changeLine(index, { quantity: e.target.value })} />
                    <TextField label="Unit" value={line.unit || ''} onChange={e => changeLine(index, { unit: e.target.value })} />
                    <TextField label="Unit price" value={line.unit_price} inputProps={{ inputMode: 'decimal' }} onChange={e => changeLine(index, { unit_price: e.target.value })} />
                    {/* Discount stays in the data model (and the backend maths) for the marketplace; workers don't set it here. */}
                    <TextField select label="GST" value={line.tax_code || 'OUT_OF_SCOPE'} onChange={e => changeLine(index, { tax_code: e.target.value as FinanceTaxCode })}>{Object.entries(taxLabels).map(([key, name]) => <MenuItem key={key} value={key}>{name}</MenuItem>)}</TextField>
                    <Box sx={{ display: { xs: 'none', lg: 'block' }, textAlign: 'right', pt: .25 }}><Typography sx={{ ...muted, fontSize: 12 }}>Amount</Typography><Typography sx={{ fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{amount(preview?.lines[index]?.gross)}</Typography></Box>
                    <Box sx={{ display: { xs: 'none', lg: 'block' }, pt: .5 }}>{remove}</Box>
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mt: 1 }}>
                    <TextField select size="small" label="Category" value={line.category_code || 'Miscellaneous'} onChange={e => changeLine(index, { category_code: e.target.value as FinanceCategory })} sx={{ width: { xs: '100%', sm: 260 } }}>
                      {(['ProfessionalServices', 'Transportation', 'Accommodation', 'Miscellaneous', 'Superannuation'] as FinanceCategory[]).map(category => <MenuItem key={category} value={category}>{categoryName(category)}</MenuItem>)}
                    </TextField>
                    <FormControlLabel control={<Checkbox checked={line.super_eligible || false} onChange={e => changeLine(index, { super_eligible: e.target.checked })} />} label={<Typography sx={{ fontSize: 13.5 }}>Count towards super</Typography>} />
                    {line.source_assignment_id && <Pill label="From the shift" tone="violet" title="The original accepted hours and rate are kept on record, whatever you change here." />}
                  </Stack>
                </Box>;
              })}
            </Stack>

            <Accordion sx={{ ...accordion, mt: 2 }}>
              <AccordionSummary expandIcon={<ChevronDown size={18} />}><Stack direction="row" spacing={1} alignItems="center"><Calculator size={18} color="var(--ct-accent-strong)" /><Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>Work out hours from start and finish</Typography></Stack></AccordionSummary>
              <AccordionDetails><Stack spacing={2}>
                <Typography sx={{ ...muted, fontSize: 12.5 }}>Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Check this for interstate shifts.</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 180px auto' }, gap: 2, alignItems: 'start' }}>
                  <AuDateTimeField label="Start" value={start} onChange={isoValue => { setStart(isoValue); setHours(''); }} />
                  <AuDateTimeField label="Finish" value={end} onChange={isoValue => { setEnd(isoValue); setHours(''); }} />
                  <TextField label="Unpaid break (min)" type="number" inputProps={{ min: 0, max: 1440 }} value={breakMinutes} onChange={e => { setBreak(e.target.value); setHours(''); }} />
                  <Button variant="outlined" disabled={!start || !end || hoursBusy} onClick={() => void calculateHours()} startIcon={hoursBusy ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ minHeight: 56 }}>{hoursBusy ? 'Working out' : 'Work out hours'}</Button>
                </Box>
                {hoursError && <Alert severity="error">{hoursError}</Alert>}
                {hours && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap aria-live="polite">
                  <Typography sx={{ fontWeight: 600 }}>{hours} hours</Typography>
                  {hourLines.map(({ line, index }) => <Button key={index} variant="contained" size="small" startIcon={<Check size={14} />} onClick={() => changeLine(index, { quantity: hours })} sx={{ minHeight: 40 }}>Use on {line.description?.trim() || `line ${index + 1}`}</Button>)}
                  <Button size="small" startIcon={<Plus size={14} />} onClick={() => change('lines', [...value.lines, blankLine({ unit: 'Hours', quantity: hours, category_code: 'ProfessionalServices' })])} sx={{ minHeight: 40 }}>Add as a new line</Button>
                </Stack>}
              </Stack></AccordionDetails>
            </Accordion>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 340px' }, gap: { xs: 3, md: 6 }, mt: 3 }}>
              <Stack spacing={1}>{field('notes', 'Notes to customer')}<Typography sx={{ ...muted, fontSize: 12.5 }}>Printed on the invoice.</Typography></Stack>
              <Box component="dl" aria-live="polite" sx={{ m: 0, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 1, columnGap: 2, alignContent: 'start' }}>
                {([['Subtotal', preview?.subtotal], ['GST', preview?.gst], ['Super (paid to the fund)', preview?.super]] as [string, string | undefined][]).map(([name, raw]) => <Box key={name} sx={{ display: 'contents' }}>
                  <Typography component="dt" sx={muted}>{name}</Typography>
                  <Typography component="dd" sx={{ m: 0, textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{amount(raw)}</Typography>
                </Box>)}
                <Box sx={{ gridColumn: '1 / -1', borderTop: '1px solid var(--ct-border-color)' }} />
                <Typography component="dt" sx={{ fontWeight: 600 }}>Invoice total</Typography>
                <Typography component="dd" sx={{ m: 0, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{amount(preview?.payable)}</Typography>
                {!preview && !calculating && value.lines.length > 0 && <Typography sx={{ ...muted, fontSize: 12.5, gridColumn: '1 / -1' }}>Totals appear once a customer is chosen and each line has a quantity and price.</Typography>}
              </Box>
            </Box>
          </InvoiceSection>

          <Accordion expanded={businessOpen} onChange={(_, open) => setBusinessOpen(open)} sx={accordion}>
            <AccordionSummary expandIcon={<ChevronDown size={18} />}><Box><Typography sx={{ fontWeight: 600 }}>Business details and GST</Typography><Typography sx={{ ...muted, fontSize: 12.5 }}>{value.issuer_name ? `${value.issuer_name} · ${value.gst_registered ? 'GST registered' : 'Not GST registered'}` : 'Add your business name and ABN'}</Typography></Box></AccordionSummary>
            <AccordionDetails><Box sx={grid}>
              <TextField required label="Business name" value={value.issuer_name} error={issuerMissing} helperText={issuerMissing ? 'Add the name that goes on the invoice.' : undefined} onChange={event => change('issuer_name', event.target.value)} />
              {field('issuer_abn', 'Your ABN')}{field('issuer_address', 'Business address')}
              <TextField select label="Business structure" value={value.issuer_entity_type || 'sole_trader'} onChange={e => change('issuer_entity_type', e.target.value as 'sole_trader' | 'company')}><MenuItem value="sole_trader">Sole trader</MenuItem><MenuItem value="company">Company</MenuItem></TextField>
            </Box><FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={value.gst_registered} onChange={e => change('gst_registered', e.target.checked)} />} label="I'm registered for GST" /></AccordionDetails>
          </Accordion>
          <Accordion sx={accordion}>
            <AccordionSummary expandIcon={<ChevronDown size={18} />}><Box><Typography sx={{ fontWeight: 600 }}>Where to pay you</Typography><Typography sx={{ ...muted, fontSize: 12.5 }}>{value.bsb && value.account_number ? `BSB ${value.bsb} · account ending ${value.account_number.slice(-3)}` : 'Add your bank details so the customer can pay'}</Typography></Box></AccordionSummary>
            <AccordionDetails><Box sx={grid}>{field('bank_account_name', 'Account name')}{field('bsb', 'BSB')}{field('account_number', 'Account number')}</Box></AccordionDetails>
          </Accordion>
          <Accordion sx={accordion}>
            <AccordionSummary expandIcon={<ChevronDown size={18} />}><Box><Typography sx={{ fontWeight: 600 }}>Superannuation</Typography><Typography sx={{ ...muted, fontSize: 12.5 }}>{value.super_mode === 'none' ? 'Optional. Not included.' : value.super_mode === 'summary' ? 'Shown on this invoice' : 'Sent as a separate request'}</Typography></Box></AccordionSummary>
            <AccordionDetails><Stack spacing={2}>
              <Typography sx={muted}>Super is paid to your fund, separately from your payment. Check you're eligible and the agreed rate.</Typography>
              <Box sx={grid}>
                <TextField select label="How to show super" value={value.super_mode} onChange={e => change('super_mode', e.target.value as FinanceDraft['super_mode'])}><MenuItem value="none">Don't include super</MenuItem><MenuItem value="summary">Show on this invoice</MenuItem><MenuItem value="separate">Separate contribution request</MenuItem></TextField>
                <TextField label="Rate (%)" value={value.super_rate} inputProps={{ inputMode: 'decimal' }} onChange={e => change('super_rate', e.target.value)} />
                {field('super_fund_name', 'Fund name')}{field('super_usi', 'Fund USI')}{field('super_member_number', 'Member number')}
              </Box>
              <FormControlLabel control={<Checkbox checked={value.super_confirmed} onChange={e => change('super_confirmed', e.target.checked)} />} label="I've checked eligibility, what counts towards super and the rate" />
              <Typography sx={{ ...muted, fontSize: 12.5 }}>A super line you add yourself replaces the automatic amount.</Typography>
            </Stack></AccordionDetails>
          </Accordion>

          {initial?.revisions?.length ? <InvoiceSection icon={<History />} tone="cyan" title="Revision history">
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {initial.revisions.map((revision, index) => <Stack component="li" key={revision.version} direction="row" justifyContent="space-between" gap={2} sx={{ py: 1.25, borderTop: index ? '1px solid var(--ct-border-color)' : 'none' }}>
                <Box><Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>Revision {revision.version}</Typography><Typography sx={muted}>{new Date(revision.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · {revision.invoice_status.charAt(0).toUpperCase() + revision.invoice_status.slice(1).replaceAll('_', ' ')}</Typography></Box>
                <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{dollars(revision.calculation.payable)}</Typography>
              </Stack>)}
            </Box>
          </InvoiceSection> : null}
        </Stack>
      </Box>
    </Stack>

    <Paper elevation={0} sx={{ position: 'sticky', bottom: { xs: 8, md: 16 }, zIndex: 20, mt: 3, px: { xs: 2, md: 2.5 }, py: 1.25, border: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)', borderRadius: 'var(--ct-card-radius)', boxShadow: '0 12px 32px rgba(6, 18, 58, 0.12)' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 12.5 }}>{calculating ? 'Updating total' : 'Invoice total'}</Typography>
          <Typography aria-live="polite" sx={{ color: 'var(--ct-text-primary)', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{preview ? dollars(preview.payable) : value.lines.length ? '…' : dollars('0')}</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={close} disabled={busy} sx={{ minHeight: 46, display: { xs: 'none', sm: 'inline-flex' } }}>Cancel</Button>
          <Button variant="contained" type="submit" disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Check size={16} />} sx={{ minHeight: 46, px: 3 }}>
            {busy ? 'Saving…' : initial ? 'Save revision' : 'Save invoice'}
          </Button>
        </Stack>
      </Stack>
    </Paper>

    <ConfirmDialog open={discarding} title="Discard your changes?" body="You have changes that aren't saved. Leaving now loses them." confirmLabel="Discard changes" busyLabel="Discarding" busy={false}
      onConfirm={() => { setDiscarding(false); onClose(); }} onClose={() => setDiscarding(false)} />
    {inline === 'customer' && <CustomerEditor onClose={() => setInline(null)} onSaved={async saved => { setCustomers(current => [...current, saved]); setValue(current => ({ ...current, customer_id: saved.id, customer: snapshotCustomer(saved), due_date: financeDueDate(current.invoice_date, saved.payment_terms_days) })); await onSaved(); }} />}
    {inline === 'item' && <ItemEditor onClose={() => setInline(null)} onSaved={async saved => { setItems(current => [...current, saved]); addItem(saved); await onSaved(); }} />}
  </Box>;
}
