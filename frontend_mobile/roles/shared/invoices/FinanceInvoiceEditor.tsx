import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Checkbox, Chip, Divider, IconButton, List, Surface, Text, TextInput, useTheme } from 'react-native-paper';
import { createFinanceDraft, finance, financeDueDate, financeItemLine, type FinanceCalculation, type FinanceCustomer, type FinanceDraft, type FinanceInvoice, type FinanceItem, type FinanceLine } from '@chemisttasker/shared-core';

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
  const [businessOpen, setBusinessOpen] = useState(!value.issuer_name);
  const [query, setQuery] = useState('');
  const change = <K extends keyof FinanceDraft,>(key: K, next: FinanceDraft[K]) => setValue(current => ({ ...current, [key]: next }));
  const changeLine = (index: number, patch: Partial<FinanceLine>) => change('lines', value.lines.map((line, i) => i === index ? { ...line, ...patch } : line));
  const close = () => { if (busy) return; if (JSON.stringify(value) === original.current) onClose(); else Alert.alert('Discard changes?', 'Your unsaved invoice changes will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: onClose }]); };
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
  const customer = customers.find(c => c.id === value.customer_id);
  const internalSource = initial?.source === 'internal';
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderColor: theme.colors.outlineVariant }}><IconButton icon="arrow-left" accessibilityLabel="Back to invoices" onPress={close} disabled={busy} /><Text variant="titleLarge" style={{ flex: 1 }}>{initial ? initial.number : 'Create invoice'}</Text><Button mode="contained" loading={busy} disabled={busy} onPress={save}>Save draft</Button></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
      {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text>}
      {internalSource ? (
        <Surface elevation={0} style={{ padding: 12, borderRadius: 8, backgroundColor: theme.colors.secondaryContainer }}>
          <Text style={{ color: theme.colors.onSecondaryContainer }}>
            Accepted-shift invoice: the pharmacy/customer and accepted labour rows are locked. Reimbursements and reviewed super remain editable.
          </Text>
        </Surface>
      ) : null}
      <Surface elevation={0} style={{ padding: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
        <Chip style={{ alignSelf: 'flex-start', marginBottom: 16 }}>Draft</Chip>
        <Button mode="outlined" icon="account-outline" disabled={internalSource} onPress={() => { setCustomerOpen(!customerOpen); setItemOpen(false); setQuery(''); }}>{customer?.name || 'Select customer'}</Button>
        {customerOpen && <View><TextInput mode="outlined" dense label="Search customers" value={query} onChangeText={setQuery} />{customers.filter(c => c.active && c.name.toLowerCase().includes(query.toLowerCase())).map(c => <List.Item key={c.id} title={c.name} onPress={() => { setValue(current => ({ ...current, customer_id: c.id, due_date: financeDueDate(current.invoice_date, c.payment_terms_days) })); setCustomerOpen(false); }} />)}{!customers.length && <Text style={{ padding: 12 }}>Add a customer from Customers before creating an invoice.</Text>}</View>}
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginVertical: 16 }}>{customer?.address || 'Customer billing address'}</Text>
        {field('reference', 'Customer PO / reference')}
        {field('invoice_date', 'Issue date (YYYY-MM-DD)')}{field('due_date', 'Due date (YYYY-MM-DD)')}
        <View style={{ flexDirection: 'row', gap: 8 }}><Chip selected={value.price_mode === 'exclusive'} onPress={() => change('price_mode', 'exclusive')}>GST exclusive</Chip><Chip selected={value.price_mode === 'inclusive'} onPress={() => change('price_mode', 'inclusive')}>GST inclusive</Chip></View>
      </Surface>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text variant="titleMedium" style={{ flex: 1 }}>Items & services</Text><Button icon="plus" onPress={() => { setItemOpen(!itemOpen); setCustomerOpen(false); setQuery(''); }}>Add item</Button></View>
      {itemOpen && <Surface elevation={0} style={{ borderRadius: 8, padding: 12 }}><TextInput mode="outlined" dense label="Search items" value={query} onChangeText={setQuery} />{items.filter(i => i.active && `${i.code} ${i.name}`.toLowerCase().includes(query.toLowerCase())).map(item => <List.Item key={item.id} title={item.name} description={`${item.code} · ${money(item.unit_price)} / ${item.unit}`} onPress={() => { change('lines', [...value.lines, financeItemLine(item)]); setItemOpen(false); }} />)}{!items.length && <Text>Add saved items from the Items tab.</Text>}</Surface>}
      {!value.lines.length && <Text style={{ padding: 24, textAlign: 'center', color: theme.colors.onSurfaceVariant }}>Add the work you’re billing for.</Text>}
      {value.lines.map((line, index) => <Surface key={`${index}-${line.item_id}`} elevation={0} style={{ padding: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text variant="titleSmall" style={{ flex: 1 }}>Item {index + 1}</Text>{line.locked ? <Chip compact>Accepted shift · locked</Chip> : null}<IconButton icon="delete-outline" disabled={line.locked} accessibilityLabel={`Remove item ${index + 1}`} onPress={() => change('lines', value.lines.filter((_, i) => i !== index))} /></View>
        <TextInput mode="outlined" dense label="Description" value={line.description || ''} disabled={line.locked} onChangeText={description => changeLine(index, { description })} />
        <View style={{ flexDirection: 'row', gap: 12, marginVertical: 12 }}>{(['quantity', 'unit_price', 'discount'] as const).map((key, i) => <TextInput key={key} mode="outlined" dense style={{ flex: 1 }} keyboardType="decimal-pad" disabled={line.locked} label={['Qty', 'Rate', 'Disc %'][i]} value={line[key]} onChangeText={text => changeLine(index, { [key]: text })} />)}</View>
        <TextInput mode="outlined" dense label="Work date (YYYY-MM-DD)" value={line.worked_on || ''} disabled={line.locked} onChangeText={worked_on => changeLine(index, { worked_on })} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{(['GST', 'GST_FREE', 'INPUT_TAXED', 'OUT_OF_SCOPE'] as const).map((tax, i) => <Chip key={tax} selected={line.tax_code === tax} disabled={line.locked} onPress={() => changeLine(index, { tax_code: tax })}>{['GST 10%', 'GST-free', 'Input taxed', 'No GST'][i]}</Chip>)}</View>
        <Checkbox.Item label="Include in reviewed super base" disabled={line.locked} status={line.super_eligible ? 'checked' : 'unchecked'} onPress={() => changeLine(index, { super_eligible: !line.super_eligible })} />
        <Text style={{ textAlign: 'right', fontWeight: '700' }}>{preview?.lines[index] ? money(preview.lines[index].gross) : 'Pending'}</Text>
      </Surface>)}
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
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Saving creates a draft. Review and issue it before sending.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
