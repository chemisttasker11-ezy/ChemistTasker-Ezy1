import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Checkbox, Chip, Divider, IconButton, List, Surface, Text, TextInput, useTheme } from 'react-native-paper';
import { DatePickerInput, TimePickerModal } from 'react-native-paper-dates';
import { createFinanceDraft, finance, financeDueDate, financeItemLine, financeStatus, type FinanceCalculation, type FinanceCategory, type FinanceCustomer, type FinanceCustomerInput, type FinanceDraft, type FinanceInternalSource, type FinanceInvoice, type FinanceItem, type FinanceLine, type FinanceTaxCode } from '@chemisttasker/shared-core';
import { dateFromIso, isoDate } from '@/features/parity/utils';

const money = (value: string) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(value));

export default function FinanceInvoiceEditor({ initial, previous, customers, items, onClose, onSaved, requestKey }: {
  initial?: FinanceInvoice; previous?: FinanceInvoice; customers: FinanceCustomer[]; items: FinanceItem[]; onClose: () => void; onSaved: () => Promise<void>; requestKey: string;
}) {
  const theme = useTheme();
  const [value, setValue] = useState<FinanceDraft>(() => initial ? { ...initial.payload, version: initial.version, request_key: initial.request_key } : createFinanceDraft(requestKey, previous));
  const original = useRef(JSON.stringify(value));
  const [busy, setBusy] = useState(false); const running = useRef(false);
  const [error, setError] = useState(''); const [preview, setPreview] = useState<FinanceCalculation | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false); const [itemOpen, setItemOpen] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<FinanceCustomer[]>(customers);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerAbn, setNewCustomerAbn] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerTerms, setNewCustomerTerms] = useState('14');
  const [itemOptions, setItemOptions] = useState<FinanceItem[]>(items);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('Item');
  const [newItemPrice, setNewItemPrice] = useState('0.00');
  const [newItemCategory, setNewItemCategory] = useState<FinanceCategory>('Miscellaneous');
  const [newItemTax, setNewItemTax] = useState<FinanceTaxCode>('OUT_OF_SCOPE');
  const [businessOpen, setBusinessOpen] = useState(!value.issuer_name);
  const [query, setQuery] = useState('');
  const [internalSources, setInternalSources] = useState<FinanceInternalSource[]>([]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [hoursStart, setHoursStart] = useState<Date | undefined>(undefined);
  const [hoursEnd, setHoursEnd] = useState<Date | undefined>(undefined);
  const [timeTarget, setTimeTarget] = useState<'start' | 'end' | null>(null);
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [computedHours, setComputedHours] = useState('');
  const change = <K extends keyof FinanceDraft,>(key: K, next: FinanceDraft[K]) => setValue(current => ({ ...current, [key]: next }));
  const snapshotCustomer = (item: FinanceCustomer) => ({
    name: item.name, legal_name: item.legal_name, address: item.address, abn: item.abn,
    email: item.email, contact_name: item.contact_name,
  });
  const changeCustomer = (key: keyof NonNullable<FinanceDraft['customer']>, next: string) => setValue(current => ({
    ...current,
    customer: {
      ...(current.customer || { name: '', legal_name: '', address: '', abn: '', email: '', contact_name: '' }),
      [key]: next,
    },
  }));
  const changeLine = (index: number, patch: Partial<FinanceLine>) => change('lines', value.lines.map((line, i) => i === index ? { ...line, ...patch } : line));
  const close = () => { if (busy) return; if (JSON.stringify(value) === original.current) onClose(); else Alert.alert('Discard changes?', 'Your unsaved invoice changes will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: onClose }]); };
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
    }).catch((e: any) => setError(e.message || 'Unable to load invoice defaults.'));
    return () => { active = false; };
  }, [initial]);
  useEffect(() => { setCustomerOptions(customers); }, [customers]);
  useEffect(() => { setItemOptions(items); }, [items]);
  const saveNewCustomer = async () => {
    const name = newCustomerName.trim();
    if (!name) { setError('Enter a customer or store name.'); return; }
    setBusy(true); setError('');
    try {
      const input: FinanceCustomerInput = {
        name,
        legal_name: '',
        abn: newCustomerAbn.trim(),
        contact_name: '',
        email: newCustomerEmail.trim(),
        phone: '',
        address: newCustomerAddress.trim(),
        payment_terms_days: Math.max(0, Number(newCustomerTerms) || 14),
        notes: '',
        active: true,
      };
      const saved = await finance.saveCustomer(input);
      setCustomerOptions(current => [...current, saved]);
      setValue(current => ({
        ...current,
        customer_id: saved.id,
        customer: snapshotCustomer(saved),
        due_date: financeDueDate(current.invoice_date, saved.payment_terms_days),
      }));
      setNewCustomerName('');
      setNewCustomerEmail('');
      setNewCustomerAbn('');
      setNewCustomerAddress('');
      setNewCustomerTerms('14');
      setNewCustomerOpen(false);
      setCustomerOpen(false);
      await onSaved();
    } catch (e: any) {
      setError(e.message || 'Unable to create the customer.');
    } finally {
      setBusy(false);
    }
  };
  const calculateHours = async () => {
    if (!hoursStart || !hoursEnd) { setError('Enter a start and end date/time first.'); return; }
    setBusy(true); setError('');
    try {
      if (hoursEnd <= hoursStart) {
        setError('End date/time must be after the start date/time.');
        return;
      }
      const result = await finance.shiftHours({
        start: hoursStart.toISOString(),
        end: hoursEnd.toISOString(),
        break_minutes: Number(breakMinutes) || 0,
      });
      setComputedHours(String(result.hours));
    } catch (e: any) {
      setError(e.message || 'Unable to calculate shift hours.');
    } finally {
      setBusy(false);
    }
  };
  const saveNewItem = async () => {
    const name = newItemName.trim();
    const unit = newItemUnit.trim() || 'Item';
    if (!name) { setError('Enter an item name before saving it to your list.'); return; }
    setBusy(true); setError('');
    try {
      const saved = await finance.saveItem({
        code: '',
        name,
        category: newItemCategory,
        unit,
        unit_price: newItemPrice || '0.00',
        tax_code: newItemTax,
        super_eligible: false,
        active: true,
      });
      setItemOptions(current => [...current, saved]);
      setValue(current => ({ ...current, lines: [...current.lines, financeItemLine(saved)] }));
      setNewItemName('');
      setNewItemUnit('Item');
      setNewItemPrice('0.00');
      setNewItemCategory('Miscellaneous');
      setNewItemTax('OUT_OF_SCOPE');
      setNewItemOpen(false);
      setItemOpen(false);
    } catch (e: any) {
      setError(e.message || 'Unable to save the new item.');
    } finally {
      setBusy(false);
    }
  };
  const applyInternalSource = async (source: FinanceInternalSource) => {
    setBusy(true); setError('');
    try {
      setValue(await finance.internalPrefill([source.assignment_id]));
      setSourceOpen(false);
    } catch (e: any) {
      setError(e.message || 'Unable to prefill this shift.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true; setPreview(null);
    if (!value.lines.length) return;
    const timer = setTimeout(() => { finance.preview(value).then(result => { if (active) setPreview(result); }).catch(() => {}); }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [value]);
  const save = async () => {
    if (running.current) return;
    if (!value.customer_id || !value.issuer_name.trim() || !value.lines.length) { setError('Select a customer, enter your business name and add an item.'); setBusinessOpen(true); return; }
    running.current = true; setBusy(true); setError('');
    try { await finance.saveInvoice(value, initial?.id); await onSaved(); onClose(); } catch (e: any) { setError(e.message || 'Unable to save invoice.'); } finally { running.current = false; setBusy(false); }
  };
  const field = (key: keyof FinanceDraft, label: string, decimal = false) => <TextInput key={key} mode="outlined" dense label={label} value={String(value[key] ?? '')} disabled={busy} keyboardType={decimal ? 'decimal-pad' : 'default'} onChangeText={text => change(key, text as never)} style={{ marginBottom: 12 }} />;
  const customer = customerOptions.find(c => c.id === value.customer_id) || (value.customer ? {
    id: value.customer_id, payment_terms_days: 14, phone: '', notes: '', active: true, ...value.customer,
  } as FinanceCustomer : undefined);
  const internalSource = initial?.source === 'internal' || Boolean(value.source_assignment_ids?.length);
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderColor: theme.colors.outlineVariant }}><IconButton icon="arrow-left" accessibilityLabel="Back to invoices" onPress={close} disabled={busy} /><View style={{ flex: 1 }}><Text variant="titleLarge">{initial ? initial.number : 'New invoice'}</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{initial ? `Revision ${initial.version} · ${financeStatus(initial)}` : 'Unsaved until you press Save invoice'}</Text></View><Button mode="contained" loading={busy} disabled={busy} onPress={save}>{initial ? 'Save revision' : 'Save invoice'}</Button></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
      {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text>}
      {!initial && internalSources.length ? <Surface elevation={0} style={{ padding: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
        <Text variant="titleMedium">Start from an internal ABN shift</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginVertical: 8 }}>Pharmacy, shift hours/rate and onboarding details are prefilled. Nothing is saved yet.</Text>
        <Button mode="outlined" icon="briefcase-outline" onPress={() => setSourceOpen(!sourceOpen)}>Choose accepted shift</Button>
        {sourceOpen ? <View style={{ marginTop: 8 }}>{internalSources.map(source => <List.Item key={source.assignment_id} title={source.pharmacy.name} description={`${source.date} · ${source.start_time}–${source.end_time} · ${source.hours}h × ${source.rate}`} onPress={() => void applyInternalSource(source)} />)}</View> : null}
      </Surface> : null}
      {initial?.review_requests?.filter(request => !request.resolved_at).map(request => <Surface key={request.id} elevation={0} style={{ padding: 12, borderRadius: 8, backgroundColor: theme.colors.errorContainer }}><Text style={{ color: theme.colors.onErrorContainer, fontWeight: '700' }}>Revision requested</Text><Text style={{ color: theme.colors.onErrorContainer }}>{request.note}</Text></Surface>)}
      {internalSource ? (
        <Surface elevation={0} style={{ padding: 12, borderRadius: 8, backgroundColor: theme.colors.secondaryContainer }}>
          <Text style={{ color: theme.colors.onSecondaryContainer }}>
            Internal ChemistTasker invoice: pharmacy and original shift terms are prefilled. You may correct actual hours/rate/date/description/tax values; every Save creates a revision while preserving the original shift snapshot.
          </Text>
        </Surface>
      ) : null}
      <Surface elevation={0} style={{ padding: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
        <Chip style={{ alignSelf: 'flex-start', marginBottom: 16 }}>{initial ? financeStatus(initial) : 'Unsaved'}</Chip>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button mode="outlined" icon="account-outline" disabled={internalSource} onPress={() => { setCustomerOpen(!customerOpen); setNewCustomerOpen(false); setItemOpen(false); setQuery(''); }}>{customer?.name || 'Select customer'}</Button>
          {!internalSource ? <Button mode="text" icon="account-plus-outline" onPress={() => { setNewCustomerOpen(!newCustomerOpen); setCustomerOpen(false); setItemOpen(false); }}>Create customer</Button> : null}
        </View>
        {customerOpen && <View><TextInput mode="outlined" dense label="Search customers" value={query} onChangeText={setQuery} />{customerOptions.filter(c => c.active && c.name.toLowerCase().includes(query.toLowerCase())).map(c => <List.Item key={c.id} title={c.name} description={c.email || c.abn || undefined} onPress={() => { setValue(current => ({ ...current, customer_id: c.id, customer: snapshotCustomer(c), due_date: financeDueDate(current.invoice_date, c.payment_terms_days) })); setCustomerOpen(false); }} />)}{!customerOptions.length && <Text style={{ padding: 12 }}>No saved customers yet. Create one here without losing this invoice.</Text>}</View>}
        {newCustomerOpen ? <Surface elevation={0} style={{ marginTop: 12, borderRadius: 10, padding: 12, gap: 10, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
          <Text variant="titleSmall">Create customer / store</Text>
          <TextInput mode="outlined" dense label="Store / trading name *" value={newCustomerName} onChangeText={setNewCustomerName} />
          <TextInput mode="outlined" dense keyboardType="email-address" autoCapitalize="none" label="Invoice email" value={newCustomerEmail} onChangeText={setNewCustomerEmail} />
          <TextInput mode="outlined" dense label="Customer ABN" value={newCustomerAbn} onChangeText={setNewCustomerAbn} />
          <TextInput mode="outlined" dense multiline label="Billing address" value={newCustomerAddress} onChangeText={setNewCustomerAddress} />
          <TextInput mode="outlined" dense keyboardType="numeric" label="Payment terms (days)" value={newCustomerTerms} onChangeText={setNewCustomerTerms} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button disabled={busy} onPress={() => setNewCustomerOpen(false)}>Cancel</Button>
            <Button mode="contained" loading={busy} disabled={busy || !newCustomerName.trim()} onPress={() => void saveNewCustomer()}>Save & use</Button>
          </View>
        </Surface> : null}
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginVertical: 16 }}>{value.customer?.address || customer?.address || 'Customer billing address'}</Text>
        {value.customer ? <List.Accordion title="Invoice recipient details" description="Optional overrides for this invoice only">
          <View style={{ padding: 12 }}>
            <TextInput mode="outlined" dense label="Bill-to name" value={value.customer.name} onChangeText={text => changeCustomer('name', text)} style={{ marginBottom: 10 }} />
            <TextInput mode="outlined" dense label="Legal name" value={value.customer.legal_name} onChangeText={text => changeCustomer('legal_name', text)} style={{ marginBottom: 10 }} />
            <TextInput mode="outlined" dense label="ABN" value={value.customer.abn} onChangeText={text => changeCustomer('abn', text)} style={{ marginBottom: 10 }} />
            <TextInput mode="outlined" dense label="Accounts contact" value={value.customer.contact_name} onChangeText={text => changeCustomer('contact_name', text)} style={{ marginBottom: 10 }} />
            <TextInput mode="outlined" dense keyboardType="email-address" autoCapitalize="none" label="Invoice email" value={value.customer.email} onChangeText={text => changeCustomer('email', text)} style={{ marginBottom: 10 }} />
            <TextInput mode="outlined" dense multiline label="Billing address" value={value.customer.address} onChangeText={text => changeCustomer('address', text)} />
          </View>
        </List.Accordion> : null}
        {field('reference', 'Customer PO / reference')}
        <View style={{ gap: 12 }}>
          <DatePickerInput
            locale="en-AU"
            label="Issue date"
            value={dateFromIso(value.invoice_date)}
            onChange={(date) => date && change('invoice_date', isoDate(date))}
            inputMode="start"
            disabled={busy}
          />
          <DatePickerInput
            locale="en-AU"
            label="Due date"
            value={dateFromIso(value.due_date)}
            onChange={(date) => date && change('due_date', isoDate(date))}
            inputMode="start"
            disabled={busy}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}><Chip selected={value.price_mode === 'exclusive'} onPress={() => change('price_mode', 'exclusive')}>GST exclusive</Chip><Chip selected={value.price_mode === 'inclusive'} onPress={() => change('price_mode', 'inclusive')}>GST inclusive</Chip></View>
      </Surface>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Text variant="titleMedium" style={{ flex: 1 }}>Items & services</Text><Button compact icon="plus" onPress={() => change('lines', [...value.lines, { item_id: null, description: '', category_code: 'Miscellaneous', unit: 'Item', quantity: '1.00', unit_price: '0.00', discount: '0.00', tax_code: 'OUT_OF_SCOPE', super_eligible: false, worked_on: null }])}>Ad-hoc row</Button><Button compact icon="playlist-plus" onPress={() => { setItemOpen(!itemOpen); setNewItemOpen(false); setCustomerOpen(false); setQuery(''); }}>Saved item</Button><Button compact icon="plus-box-outline" onPress={() => { setNewItemOpen(!newItemOpen); setItemOpen(false); setCustomerOpen(false); }}>Add new saved item</Button></View>
      {itemOpen && <Surface elevation={0} style={{ borderRadius: 8, padding: 12 }}><TextInput mode="outlined" dense label="Search items" value={query} onChangeText={setQuery} />{itemOptions.filter(i => i.active && `${i.code} ${i.name}`.toLowerCase().includes(query.toLowerCase())).map(item => <List.Item key={item.id} title={item.name} description={`${item.code ? `${item.code} · ` : ''}${money(item.unit_price)} / ${item.unit}`} onPress={() => { setValue(current => ({ ...current, lines: [...current.lines, financeItemLine(item)] })); setItemOpen(false); }} />)}{!itemOptions.length && <Text style={{ padding: 8 }}>No saved items yet. Use “Add new saved item”, or add an ad-hoc row.</Text>}</Surface>}
      {newItemOpen && <Surface elevation={0} style={{ borderRadius: 8, padding: 12, gap: 10 }}>
        <Text variant="titleSmall">Add reusable item</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>These are defaults only. Description, unit, price and tax can still be changed freely on this invoice.</Text>
        <TextInput mode="outlined" dense label="Item name *" value={newItemName} onChangeText={setNewItemName} />
        <View style={{ flexDirection: 'row', gap: 8 }}><TextInput mode="outlined" dense style={{ flex: 1 }} label="Unit" value={newItemUnit} onChangeText={setNewItemUnit} /><TextInput mode="outlined" dense style={{ flex: 1 }} keyboardType="decimal-pad" label="Default price" value={newItemPrice} onChangeText={setNewItemPrice} /></View>
        <Text variant="labelMedium">Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['ProfessionalServices', 'Transportation', 'Accommodation', 'Miscellaneous', 'Superannuation'] as FinanceCategory[]).map(category => <Chip key={category} compact selected={newItemCategory === category} onPress={() => setNewItemCategory(category)}>{category.replace(/([A-Z])/g, ' $1').trim()}</Chip>)}</View>
        <Text variant="labelMedium">Tax default</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['GST', 'GST_FREE', 'INPUT_TAXED', 'OUT_OF_SCOPE'] as FinanceTaxCode[]).map((tax, i) => <Chip key={tax} compact selected={newItemTax === tax} onPress={() => setNewItemTax(tax)}>{['GST 10%', 'GST-free', 'Input taxed', 'N-T / not taxable'][i]}</Chip>)}</View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}><Button disabled={busy} onPress={() => setNewItemOpen(false)}>Cancel</Button><Button mode="contained" loading={busy} disabled={busy || !newItemName.trim()} onPress={() => void saveNewItem()}>Save & add</Button></View>
      </Surface>}
      {!value.lines.length && <Text style={{ padding: 24, textAlign: 'center', color: theme.colors.onSurfaceVariant }}>Add the work you’re billing for.</Text>}
      {value.lines.map((line, index) => <Surface key={`${index}-${line.item_id}`} elevation={0} style={{ padding: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text variant="titleSmall" style={{ flex: 1 }}>Item {index + 1}</Text>{line.source_assignment_id ? <Chip compact>Shift source · revision tracked</Chip> : null}<IconButton icon="delete-outline" disabled={Boolean(line.source_assignment_id)} accessibilityLabel={`Remove item ${index + 1}`} onPress={() => change('lines', value.lines.filter((_, i) => i !== index))} /></View>
        <TextInput mode="outlined" dense label="Description" value={line.description || ''} onChangeText={description => changeLine(index, { description })} />
        <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}><TextInput mode="outlined" dense style={{ flex: 1 }} keyboardType="decimal-pad" label="Qty" value={line.quantity} onChangeText={text => changeLine(index, { quantity: text })} /><TextInput mode="outlined" dense style={{ flex: 1 }} label="Unit" value={line.unit || ''} onChangeText={unit => changeLine(index, { unit })} /><TextInput mode="outlined" dense style={{ flex: 1 }} keyboardType="decimal-pad" label="Rate" value={line.unit_price} onChangeText={text => changeLine(index, { unit_price: text })} /></View>
        <TextInput mode="outlined" dense label="Discount %" keyboardType="decimal-pad" value={line.discount} onChangeText={discount => changeLine(index, { discount })} />
        <DatePickerInput
          locale="en-AU"
          label="Work date"
          value={dateFromIso(line.worked_on || undefined)}
          onChange={(date) => changeLine(index, { worked_on: date ? isoDate(date) : null })}
          inputMode="start"
          disabled={busy}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{(['GST', 'GST_FREE', 'INPUT_TAXED', 'OUT_OF_SCOPE'] as const).map((tax, i) => <Chip key={tax} selected={line.tax_code === tax} onPress={() => changeLine(index, { tax_code: tax })}>{['GST 10%', 'GST-free', 'Input taxed', 'N-T / not taxable'][i]}</Chip>)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {(['ProfessionalServices', 'Transportation', 'Accommodation', 'Miscellaneous', 'Superannuation'] as FinanceCategory[]).map(category => (
            <Chip key={category} compact selected={line.category_code === category} onPress={() => changeLine(index, { category_code: category })}>
              {category.replace(/([A-Z])/g, ' $1').trim()}
            </Chip>
          ))}
        </View>
        <Checkbox.Item label="Include in reviewed super base" status={line.super_eligible ? 'checked' : 'unchecked'} onPress={() => changeLine(index, { super_eligible: !line.super_eligible })} />
        <Text style={{ textAlign: 'right', fontWeight: '700' }}>{preview?.lines[index] ? money(preview.lines[index].gross) : 'Pending'}</Text>
      </Surface>)}
      <Surface elevation={0} style={{ padding: 16, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.outlineVariant, gap: 10 }}>
        <Text variant="titleMedium">Calculate shift hours</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Choose the local date and time for the work performed. Confirm the pharmacy timezone for interstate work.</Text>
        <DatePickerInput
          locale="en-AU"
          label="Start date"
          value={hoursStart}
          onChange={(date) => {
            if (!date) return setHoursStart(undefined);
            const next = new Date(date);
            next.setHours(hoursStart?.getHours() ?? 9, hoursStart?.getMinutes() ?? 0, 0, 0);
            setHoursStart(next);
          }}
          inputMode="start"
          disabled={busy}
        />
        <Button mode="outlined" icon="clock-outline" disabled={busy || !hoursStart} onPress={() => setTimeTarget('start')}>
          {hoursStart ? `Start time · ${hoursStart.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}` : 'Choose start date first'}
        </Button>
        <DatePickerInput
          locale="en-AU"
          label="End date"
          value={hoursEnd}
          onChange={(date) => {
            if (!date) return setHoursEnd(undefined);
            const next = new Date(date);
            next.setHours(hoursEnd?.getHours() ?? 17, hoursEnd?.getMinutes() ?? 0, 0, 0);
            setHoursEnd(next);
          }}
          inputMode="start"
          disabled={busy}
        />
        <Button mode="outlined" icon="clock-outline" disabled={busy || !hoursEnd} onPress={() => setTimeTarget('end')}>
          {hoursEnd ? `End time · ${hoursEnd.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}` : 'Choose end date first'}
        </Button>
        <TimePickerModal
          visible={timeTarget !== null}
          onDismiss={() => setTimeTarget(null)}
          onConfirm={({ hours, minutes }) => {
            const current = timeTarget === 'start' ? hoursStart : hoursEnd;
            if (current) {
              const next = new Date(current);
              next.setHours(hours, minutes, 0, 0);
              if (timeTarget === 'start') setHoursStart(next);
              else setHoursEnd(next);
            }
            setTimeTarget(null);
          }}
          hours={(timeTarget === 'start' ? hoursStart : hoursEnd)?.getHours() ?? 9}
          minutes={(timeTarget === 'start' ? hoursStart : hoursEnd)?.getMinutes() ?? 0}
          label="Select time"
          locale="en"
        />
        <TextInput mode="outlined" dense keyboardType="numeric" label="Unpaid break (minutes)" value={breakMinutes} onChangeText={setBreakMinutes} />
        <Button mode="outlined" disabled={busy || !hoursStart || !hoursEnd} onPress={() => void calculateHours()}>Calculate hours</Button>
        {computedHours ? <Text variant="bodyMedium"><Text style={{ fontWeight: '800' }}>{computedHours} billable hours.</Text> Enter this quantity on the relevant professional-services item.</Text> : null}
      </Surface>
      <Surface elevation={0} style={{ padding: 16, borderRadius: 8 }}>
        {field('notes', 'Notes to customer')}
        {[['Subtotal', preview?.subtotal], ['GST', preview?.gst], ['Invoice total', preview?.payable], ['Super contribution', preview?.super]].map(([label, amount]) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}><Text style={{ fontWeight: label === 'Invoice total' ? '700' : '400' }}>{label}</Text><Text style={{ fontVariant: ['tabular-nums'] }}>{amount !== undefined ? money(amount) : value.lines.length ? 'Pending' : '$0.00'}</Text></View>)}
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Super is paid separately to the fund.</Text>
      </Surface>
      <List.Accordion title="Business details & GST" expanded={businessOpen} onPress={() => setBusinessOpen(!businessOpen)}><View style={{ padding: 12 }}>{field('issuer_name', 'Business name *')}{field('issuer_abn', 'Your ABN')}{field('issuer_address', 'Business address')}<View style={{ flexDirection: 'row', gap: 8 }}><Chip selected={value.issuer_entity_type !== 'company'} onPress={() => change('issuer_entity_type', 'sole_trader')}>Sole trader</Chip><Chip selected={value.issuer_entity_type === 'company'} onPress={() => change('issuer_entity_type', 'company')}>Company</Chip></View><Checkbox.Item label="I am registered for GST for this supply" status={value.gst_registered ? 'checked' : 'unchecked'} onPress={() => change('gst_registered', !value.gst_registered)} /></View></List.Accordion>
      <Divider />
      <List.Accordion title="Payment details"><View style={{ padding: 12 }}>{field('bank_account_name', 'Account name')}{field('bsb', 'BSB')}{field('account_number', 'Account number')}</View></List.Accordion>
      <Divider />
      <List.Accordion title="Superannuation"><View style={{ padding: 12, gap: 12 }}><Text>Review eligibility and rate. Contributions go to the fund, separately from service payments.</Text>{(['none', 'summary', 'separate'] as const).map((mode, i) => <Chip key={mode} selected={value.super_mode === mode} onPress={() => change('super_mode', mode)}>{['No super calculation', 'Summary on invoice', 'Separate contribution request'][i]}</Chip>)}{field('super_rate', 'Reviewed rate %', true)}{field('super_fund_name', 'Fund name')}{field('super_usi', 'Fund USI')}{field('super_member_number', 'Member number')}<Checkbox.Item label="I reviewed eligibility, calculation base and rate" status={value.super_confirmed ? 'checked' : 'unchecked'} onPress={() => change('super_confirmed', !value.super_confirmed)} /></View></List.Accordion>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Save keeps the invoice editable. Send is a separate action. Editing a sent or paid invoice and saving creates a new revision for re-review/resend.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
