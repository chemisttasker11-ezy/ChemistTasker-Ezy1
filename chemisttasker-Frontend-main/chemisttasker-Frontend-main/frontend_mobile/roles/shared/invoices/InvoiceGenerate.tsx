import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  HelperText,
  IconButton,
  Menu,
  SegmentedButtons,
  Snackbar,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import {
  generateInvoice,
  getMyHistoryShifts,
  getOnboarding,
  previewInvoice,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';

type Shift = {
  id: number;
  pharmacy_detail?: { id: number; name: string; abn?: string; street_address?: string; suburb?: string; state?: string; postcode?: string };
  created_by_first_name?: string;
  created_by_last_name?: string;
  created_by_email?: string;
  bill_to_abn?: string;
  role_needed?: string;
  start_datetime?: string;
  end_datetime?: string;
};

type LineItem = {
  id?: string | number;
  shiftSlotId?: number;
  date?: string;
  start_time?: string;
  end_time?: string;
  description: string;
  category_code: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total?: number;
  gst_applicable?: boolean;
  super_applicable?: boolean;
  locked?: boolean;
};

const CATEGORY_CHOICES = [
  { code: 'ProfessionalServices', label: 'Professional services' },
  { code: 'Superannuation', label: 'Superannuation' },
  { code: 'Transportation', label: 'Transportation' },
  { code: 'Accommodation', label: 'Accommodation' },
  { code: 'Miscellaneous', label: 'Miscellaneous' },
];
const UNIT_CHOICES = ['Hours', 'Lump Sum'];

const defaultLineItem = (): LineItem => ({
  id: String(Date.now()),
  description: '',
  category_code: 'ProfessionalServices',
  unit: 'Lump Sum',
  quantity: 1,
  unit_price: 0,
  discount: 0,
  total: 0,
});

type Props = { basePath?: string };

export default function InvoiceGenerate({ basePath }: Props) {
  const router = useRouter();
  const segments = useSegments();
  const role = (segments[0] as string) || 'pharmacist';
  const resolvedBase = basePath || `/${role}/invoice`;
  const { user } = useAuth();

  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<'internal' | 'external'>('internal');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState('');

  // Shifts and preview
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [categoryMenuFor, setCategoryMenuFor] = useState<string | number | null>(null);
  const [unitMenuFor, setUnitMenuFor] = useState<string | number | null>(null);

  // Core fields
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [gstRegistered, setGstRegistered] = useState(true);

  // Issuer / banking
  const [issuerFirstName, setIssuerFirstName] = useState('');
  const [issuerLastName, setIssuerLastName] = useState('');
  const [issuerAbn, setIssuerAbn] = useState('');
  const issuerEmail = user?.email ?? '';
  const [superRateSnapshot, setSuperRateSnapshot] = useState<number>(10);
  const [superFundName, setSuperFundName] = useState('');
  const [superUsi, setSuperUsi] = useState('');
  const [superMemberNumber, setSuperMemberNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bsb, setBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ccEmails, setCcEmails] = useState('');

  // Snapshots
  const [pharmacyNameSnapshot, setPharmacyNameSnapshot] = useState('');
  const [pharmacyAddressSnapshot, setPharmacyAddressSnapshot] = useState('');
  const [pharmacyAbnSnapshot, setPharmacyAbnSnapshot] = useState('');
  const [billToFirstName, setBillToFirstName] = useState('');
  const [billToLastName, setBillToLastName] = useState('');
  const [billToEmail, setBillToEmail] = useState('');
  const [billToAbn, setBillToAbn] = useState('');
  const [customBillToName, setCustomBillToName] = useState('');
  const [customBillToAddress, setCustomBillToAddress] = useState('');

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([defaultLineItem()]);

  const loadOnboarding = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const onboarding = await getOnboarding((user.role || 'pharmacist').toLowerCase());
      setIssuerFirstName(onboarding?.first_name || '');
      setIssuerLastName(onboarding?.last_name || '');
      setIssuerAbn(onboarding?.abn || '');
      if (onboarding?.bank_account_name) setBankAccountName(onboarding.bank_account_name);
      if (onboarding?.bsb) setBsb(onboarding.bsb);
      if (onboarding?.account_number) setAccountNumber(onboarding.account_number);
      if (onboarding?.super_fund_name) setSuperFundName(onboarding.super_fund_name);
      if (onboarding?.super_usi) setSuperUsi(onboarding.super_usi);
      if (onboarding?.super_member_number) setSuperMemberNumber(onboarding.super_member_number);
      if (onboarding?.super_rate_snapshot)
        setSuperRateSnapshot(Number(onboarding.super_rate_snapshot));
      if (onboarding?.gst_registered !== undefined)
        setGstRegistered(!!onboarding.gst_registered);
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to load onboarding');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadShifts = useCallback(async () => {
    if (mode !== 'internal') return;
    setLoadingShifts(true);
    try {
      const res = await getMyHistoryShifts({ payment_preference: 'ABN' });
      const arr = Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [];
      setShifts(arr);
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to load shifts');
    } finally {
      setLoadingShifts(false);
    }
  }, [mode]);

  useEffect(() => {
    void loadOnboarding();
  }, [loadOnboarding]);

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

  const selectedShift = useMemo(
    () => shifts.find(s => s.id === selectedShiftId) || null,
    [selectedShiftId, shifts],
  );

  const fetchPreview = useCallback(
    async (shiftId: number) => {
      setPreviewLoading(true);
      try {
        const res = await previewInvoice(shiftId);
        const items = Array.isArray((res as any)?.line_items)
          ? (res as any).line_items
          : Array.isArray(res)
          ? (res as any)
          : [];

        const mapped = items.map((li: any, idx: number) => ({
          id: li.id || `${shiftId}-${idx}`,
          shiftSlotId: li.shiftSlotId,
          date: li.date || '',
          start_time: li.start_time || '',
          end_time: li.end_time || '',
          description: li.description || li.category || 'Shift line item',
          category_code: li.category_code || li.category || 'ProfessionalServices',
          unit: li.unit || 'Hours',
          quantity: Number(li.quantity ?? 1),
          unit_price: Number(li.unit_price ?? 0),
          discount: Number(li.discount ?? 0),
          locked: li.category_code === 'Superannuation' || li.category === 'Superannuation',
        }));
        setLineItems(mapped);

        if (selectedShift) {
          const addressParts = [
            selectedShift.pharmacy_detail?.street_address,
            selectedShift.pharmacy_detail?.suburb,
            selectedShift.pharmacy_detail?.state,
            selectedShift.pharmacy_detail?.postcode,
          ].filter(Boolean);
          setPharmacyNameSnapshot(selectedShift.pharmacy_detail?.name || '');
          setPharmacyAbnSnapshot(selectedShift.pharmacy_detail?.abn || '');
          setPharmacyAddressSnapshot(addressParts.join(', '));
          setBillToFirstName(selectedShift.created_by_first_name || '');
          setBillToLastName(selectedShift.created_by_last_name || '');
          setBillToEmail(selectedShift.created_by_email || '');
          setBillToAbn(selectedShift.bill_to_abn || '');
        }
      } catch (err: any) {
        setSnackbar(err?.message || 'Failed to load preview');
      } finally {
        setPreviewLoading(false);
      }
    },
    [selectedShift],
  );

  useEffect(() => {
    if (mode === 'internal' && selectedShiftId) {
      void fetchPreview(selectedShiftId);
    } else if (mode === 'external') {
      setLineItems([defaultLineItem()]);
    }
  }, [mode, selectedShiftId, fetchPreview]);

  const recalcLine = useCallback((li: LineItem) => {
    const total = Number(li.quantity || 0) * Number(li.unit_price || 0) * (1 - Number(li.discount || 0) / 100);
    return { ...li, total: Math.round(total * 100) / 100 };
  }, []);

  const calcHours = (date?: string, start?: string, end?: string) => {
    if (!date || !start || !end) return 0;
    const startValue = new Date(`${date}T${start}`);
    const endValue = new Date(`${date}T${end}`);
    if (Number.isNaN(startValue.getTime()) || Number.isNaN(endValue.getTime())) return 0;
    const diffMs = endValue.getTime() - startValue.getTime();
    return diffMs > 0 ? Math.round((diffMs / 3600000) * 100) / 100 : 0;
  };

  const updateRow = (lineId: string | number, field: keyof LineItem, value: any) => {
    setLineItems(items => {
      const next = items.map(li => {
        if (li.id !== lineId) return li;
        const updated = { ...li, [field]: value };
        if (field === 'start_time' || field === 'end_time' || field === 'date') {
          updated.quantity = calcHours(updated.date, updated.start_time, updated.end_time);
        }
        if (field === 'category_code' && ['Transportation', 'Accommodation'].includes(value)) {
          updated.quantity = 1;
        }
        return recalcLine(updated);
      });
      return next;
    });
  };

  const withSuperAndGst = useCallback(
    (items: LineItem[]): LineItem[] => {
      const mapped = items.map(recalcLine).map(li => ({
        ...li,
        gst_applicable: !['Superannuation', 'Transportation', 'Accommodation'].includes(
          li.category_code,
        ),
        super_applicable: li.category_code !== 'Superannuation',
      }));
      const hasSuper = mapped.some(li => li.category_code === 'Superannuation');
      if (!hasSuper && superRateSnapshot) {
        const profSubtotal = mapped
          .filter(li => li.category_code === 'ProfessionalServices')
          .reduce((acc, li) => acc + Number(li.total || 0), 0);
        const superAmt = Math.round((profSubtotal * (superRateSnapshot / 100)) * 100) / 100;
        if (superAmt > 0) {
          mapped.push({
            id: `super-${Date.now()}`,
            description: 'Superannuation',
            category_code: 'Superannuation',
            unit: 'Lump Sum',
            quantity: 1,
            unit_price: superAmt,
            discount: 0,
            total: superAmt,
            gst_applicable: false,
            super_applicable: false,
            locked: true,
          });
        }
      }
      return mapped;
    },
    [recalcLine, superRateSnapshot],
  );

  const displayLineItems = useMemo(() => withSuperAndGst(lineItems), [lineItems, withSuperAndGst]);

  const totals = useMemo(() => {
    const subtotal = displayLineItems.reduce((acc, li) => acc + Number(li.total || 0), 0);
    const gst = gstRegistered
      ? displayLineItems
          .filter(li => li.gst_applicable !== false && li.category_code !== 'Superannuation')
          .reduce((acc, li) => acc + Number(li.total || 0), 0) * 0.1
      : 0;
    const superAmt =
      displayLineItems.find(li => li.category_code === 'Superannuation')?.total || 0;
    const total = subtotal + gst + Number(superAmt || 0);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      gst: Math.round(gst * 100) / 100,
      superAmt: Math.round(Number(superAmt || 0) * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [displayLineItems, gstRegistered]);

  const addItem = () => setLineItems(items => [...items, defaultLineItem()]);
  const removeItem = (id: string | number) =>
    setLineItems(items => items.filter(li => li.id !== id));

  const validate = () => {
    if (mode === 'internal' && !selectedShiftId) {
      Alert.alert('Missing info', 'Select a shift to generate an internal invoice');
      return false;
    }
    if (!issuerFirstName || !issuerLastName || !issuerAbn) {
      Alert.alert('Missing info', 'Issuer details are required');
      return false;
    }
    if (!bankAccountName || !bsb || !accountNumber) {
      Alert.alert('Missing info', 'Banking details are required');
      return false;
    }
    if (mode === 'external' && (!customBillToName || !billToEmail)) {
      Alert.alert('Missing info', 'Bill-to name and email are required for external invoices');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const itemsForSubmit = withSuperAndGst(lineItems).map(li => {
        const baseDescription = li.description?.trim();
        const canDescribe =
          li.category_code === 'ProfessionalServices' && li.date && li.start_time && li.end_time;
        const startLabel = li.start_time ? li.start_time.slice(0, 5) : '';
        const endLabel = li.end_time ? li.end_time.slice(0, 5) : '';
        const description = baseDescription || (canDescribe
          ? `${li.date} ${startLabel}-${endLabel}`
          : '');
        return {
          description,
          category_code: li.category_code,
          unit: li.unit,
          quantity: Number(li.quantity || 0),
          unit_price: Number(li.unit_price || 0),
          discount: Number(li.discount || 0),
          total: Number(li.total || 0),
          gst_applicable: li.gst_applicable !== false,
          super_applicable: li.super_applicable !== false,
        };
      });

      const fd = new FormData();
      fd.append('issuer_first_name', issuerFirstName);
      fd.append('issuer_last_name', issuerLastName);
      fd.append('issuer_email', issuerEmail);
      fd.append('issuer_abn', issuerAbn);
      fd.append('gst_registered', gstRegistered ? 'true' : 'false');
      fd.append('super_rate_snapshot', String(superRateSnapshot));
      fd.append('super_fund_name', superFundName);
      fd.append('super_usi', superUsi);
      fd.append('super_member_number', superMemberNumber);
      fd.append('bank_account_name', bankAccountName);
      fd.append('bsb', bsb);
      fd.append('account_number', accountNumber);
      fd.append('cc_emails', ccEmails);
      fd.append('invoice_date', invoiceDate);
      fd.append('due_date', dueDate);

      if (mode === 'internal' && selectedShift) {
        fd.append('pharmacy', String(selectedShift.pharmacy_detail?.id || ''));
        fd.append('shift_ids', JSON.stringify([selectedShift.id]));
        fd.append('pharmacy_name_snapshot', pharmacyNameSnapshot);
        fd.append('pharmacy_address_snapshot', pharmacyAddressSnapshot);
        fd.append('pharmacy_abn_snapshot', pharmacyAbnSnapshot);
        fd.append('bill_to_first_name', billToFirstName);
        fd.append('bill_to_last_name', billToLastName);
        fd.append('bill_to_email', billToEmail);
        fd.append('bill_to_abn', billToAbn);
      } else {
        fd.append('external', 'true');
        fd.append('custom_bill_to_name', customBillToName);
        fd.append('custom_bill_to_address', customBillToAddress);
        fd.append('bill_to_email', billToEmail);
        fd.append('bill_to_abn', billToAbn);
      }

      fd.append('line_items', JSON.stringify(itemsForSubmit));

      await generateInvoice(fd as any);
      setSnackbar('Invoice generated');
      router.replace(resolvedBase as any);
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to generate invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" onPress={() => router.back()} />
        <Text variant="titleLarge" style={styles.headerTitle}>
          Generate Invoice
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Invoice Type
            </Text>
            <SegmentedButtons
              value={mode}
              onValueChange={value => setMode(value as 'internal' | 'external')}
              buttons={[
                { value: 'internal', label: 'Internal' },
                { value: 'external', label: 'External' },
              ]}
              style={{ marginTop: 8 }}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Dates
            </Text>
            <TextInput
              label="Invoice date (YYYY-MM-DD)"
              value={invoiceDate}
              onChangeText={setInvoiceDate}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Due date (YYYY-MM-DD)"
              value={dueDate}
              onChangeText={setDueDate}
              mode="outlined"
              style={styles.input}
            />
          </Card.Content>
        </Card>

        {mode === 'internal' && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Select shift
              </Text>
              {loadingShifts ? (
                <ActivityIndicator style={{ marginTop: 12 }} />
              ) : (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {shifts.map(s => (
                    <Chip
                      key={s.id}
                      mode={selectedShiftId === s.id ? 'flat' : 'outlined'}
                      selected={selectedShiftId === s.id}
                      onPress={() => setSelectedShiftId(s.id)}
                    >
                      {s.pharmacy_detail?.name || 'Shift'} #{s.id}
                    </Chip>
                  ))}
                  {!shifts.length && (
                    <Text variant="bodyMedium" style={styles.subdued}>
                      No completed shifts found.
                    </Text>
                  )}
                </View>
              )}
              {previewLoading && (
                <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator />
                  <Text>Loading preview...</Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}

        {mode === 'external' && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                External bill-to
              </Text>
              <TextInput
                label="Bill to name"
                value={customBillToName}
                onChangeText={setCustomBillToName}
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Bill to address"
                value={customBillToAddress}
                onChangeText={setCustomBillToAddress}
                mode="outlined"
                style={styles.input}
                multiline
              />
              <TextInput
                label="Bill to email"
                value={billToEmail}
                onChangeText={setBillToEmail}
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Bill to ABN"
                value={billToAbn}
                onChangeText={setBillToAbn}
                mode="outlined"
                style={styles.input}
              />
            </Card.Content>
          </Card>
        )}

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Issuer & bank
            </Text>
            <TextInput
              label="First name"
              value={issuerFirstName}
              onChangeText={setIssuerFirstName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Last name"
              value={issuerLastName}
              onChangeText={setIssuerLastName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Email"
              value={issuerEmail}
              disabled
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="ABN"
              value={issuerAbn}
              onChangeText={setIssuerAbn}
              mode="outlined"
              style={styles.input}
            />
            <View style={styles.switchRow}>
              <Text>GST registered</Text>
              <Switch value={gstRegistered} onValueChange={setGstRegistered} />
            </View>
            <TextInput
              label="Bank account name"
              value={bankAccountName}
              onChangeText={setBankAccountName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput label="BSB" value={bsb} onChangeText={setBsb} mode="outlined" style={styles.input} />
            <TextInput
              label="Account number"
              value={accountNumber}
              onChangeText={setAccountNumber}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="CC emails (comma separated)"
              value={ccEmails}
              onChangeText={setCcEmails}
              mode="outlined"
              style={styles.input}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Super details
            </Text>
            <TextInput
              label="Super rate snapshot (%)"
              value={String(superRateSnapshot)}
              onChangeText={v => setSuperRateSnapshot(Number(v) || 0)}
              mode="outlined"
              style={styles.input}
              keyboardType="numeric"
            />
            <TextInput
              label="Super fund name"
              value={superFundName}
              onChangeText={setSuperFundName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Super USI"
              value={superUsi}
              onChangeText={setSuperUsi}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Super member number"
              value={superMemberNumber}
              onChangeText={setSuperMemberNumber}
              mode="outlined"
              style={styles.input}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.lineHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Line items
              </Text>
              <IconButton icon="plus" onPress={addItem} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.cell, styles.cellCategory]}>Category</Text>
                  <Text style={[styles.cell, styles.cellDate]}>Date</Text>
                  <Text style={[styles.cell, styles.cellTime]}>Start</Text>
                  <Text style={[styles.cell, styles.cellTime]}>End</Text>
                  <Text style={[styles.cell, styles.cellHours]}>Hours</Text>
                  <Text style={[styles.cell, styles.cellUnit]}>Unit</Text>
                  <Text style={[styles.cell, styles.cellPrice]}>Price</Text>
                  <Text style={[styles.cell, styles.cellDiscount]}>Discount</Text>
                  <Text style={[styles.cell, styles.cellAmount]}>Amount</Text>
                  <View style={[styles.cell, styles.cellAction]} />
                </View>
                {displayLineItems.map(li => {
                  const isProfessional = li.category_code === 'ProfessionalServices';
                  const disablePrice = Boolean(li.shiftSlotId) || li.category_code === 'Superannuation';
                  const disableRow = li.category_code === 'Superannuation';
                  const hoursLabel = isProfessional
                    ? li.quantity.toFixed(2)
                    : ['Transportation', 'Accommodation'].includes(li.category_code)
                    ? '1.00'
                    : '';

                  return (
                    <View key={li.id} style={styles.tableRow}>
                      <View style={[styles.cell, styles.cellCategory]}>
                        <Menu
                          visible={categoryMenuFor === li.id}
                          onDismiss={() => setCategoryMenuFor(null)}
                          anchor={
                            <Button
                              mode="outlined"
                              onPress={() => setCategoryMenuFor(li.id!)}
                              disabled={disableRow}
                              style={styles.selectButton}
                            >
                              {CATEGORY_CHOICES.find(c => c.code === li.category_code)?.label || 'Select'}
                            </Button>
                          }
                        >
                          {CATEGORY_CHOICES.map(choice => (
                            <Menu.Item
                              key={choice.code}
                              onPress={() => {
                                setCategoryMenuFor(null);
                                updateRow(li.id!, 'category_code', choice.code);
                              }}
                              title={choice.label}
                            />
                          ))}
                        </Menu>
                      </View>

                      {isProfessional ? (
                        <>
                          <TextInput
                            value={li.date || ''}
                            onChangeText={text => updateRow(li.id!, 'date', text)}
                            mode="outlined"
                            style={[styles.cell, styles.cellDate]}
                            placeholder="YYYY-MM-DD"
                            dense
                          />
                          <TextInput
                            value={li.start_time?.slice(0, 5) || ''}
                            onChangeText={text => updateRow(li.id!, 'start_time', text ? `${text}:00` : '')}
                            mode="outlined"
                            style={[styles.cell, styles.cellTime]}
                            placeholder="HH:MM"
                            dense
                          />
                          <TextInput
                            value={li.end_time?.slice(0, 5) || ''}
                            onChangeText={text => updateRow(li.id!, 'end_time', text ? `${text}:00` : '')}
                            mode="outlined"
                            style={[styles.cell, styles.cellTime]}
                            placeholder="HH:MM"
                            dense
                          />
                          <Text style={[styles.cell, styles.cellHours]}>{hoursLabel}</Text>
                        </>
                      ) : (
                        <>
                          <View style={[styles.cell, styles.cellDate]} />
                          <View style={[styles.cell, styles.cellTime]} />
                          <View style={[styles.cell, styles.cellTime]} />
                          <Text style={[styles.cell, styles.cellHours]}>{hoursLabel}</Text>
                        </>
                      )}

                      <View style={[styles.cell, styles.cellUnit]}>
                        <Menu
                          visible={unitMenuFor === li.id}
                          onDismiss={() => setUnitMenuFor(null)}
                          anchor={
                            <Button
                              mode="outlined"
                              onPress={() => setUnitMenuFor(li.id!)}
                              disabled={disableRow}
                              style={styles.selectButton}
                            >
                              {li.unit || 'Unit'}
                            </Button>
                          }
                        >
                          {UNIT_CHOICES.map(unit => (
                            <Menu.Item
                              key={unit}
                              onPress={() => {
                                setUnitMenuFor(null);
                                updateRow(li.id!, 'unit', unit);
                              }}
                              title={unit}
                            />
                          ))}
                        </Menu>
                      </View>

                      <TextInput
                        value={String(li.unit_price)}
                        onChangeText={text => updateRow(li.id!, 'unit_price', Number(text) || 0)}
                        mode="outlined"
                        style={[styles.cell, styles.cellPrice]}
                        keyboardType="numeric"
                        dense
                        disabled={disablePrice}
                      />
                      <TextInput
                        value={String(li.discount)}
                        onChangeText={text => updateRow(li.id!, 'discount', Number(text) || 0)}
                        mode="outlined"
                        style={[styles.cell, styles.cellDiscount]}
                        keyboardType="numeric"
                        dense
                        disabled={disableRow}
                      />
                      <Text style={[styles.cell, styles.cellAmount]}>
                        {li.total?.toFixed(2) ?? '0.00'}
                      </Text>
                      <View style={[styles.cell, styles.cellAction]}>
                        <IconButton icon="delete" size={18} onPress={() => removeItem(li.id!)} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <HelperText type="info" visible>
              Line items follow the web table. Super is auto-inserted when needed.
            </HelperText>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Totals
            </Text>
            <View style={styles.totalRow}>
              <Text>Subtotal</Text>
              <Text>${totals.subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>GST</Text>
              <Text>${totals.gst.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>Superannuation</Text>
              <Text>${totals.superAmt.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text variant="titleMedium">Total</Text>
              <Text variant="titleMedium">${totals.total.toFixed(2)}</Text>
            </View>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={submitting}
          style={{ marginBottom: 24, marginHorizontal: 12 }}
        >
          Generate invoice
        </Button>
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: { fontWeight: '700' },
  content: { padding: 12, gap: 12 },
  card: { borderRadius: 14, backgroundColor: '#FFFFFF' },
  sectionTitle: { fontWeight: '700' },
  input: { marginTop: 8 },
  switchRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineItem: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  rowInputs: { flexDirection: 'row', gap: 10, marginTop: 8 },
  halfInput: { flex: 1 },
  tableScroll: { marginTop: 6 },
  table: { minWidth: 920 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableHeader: { backgroundColor: '#F3F4F6' },
  cell: { paddingHorizontal: 6, paddingVertical: 4 },
  cellCategory: { width: 180 },
  cellDate: { width: 120 },
  cellTime: { width: 90 },
  cellHours: { width: 70, textAlign: 'center' },
  cellUnit: { width: 90 },
  cellPrice: { width: 110 },
  cellDiscount: { width: 100 },
  cellAmount: { width: 110, textAlign: 'right' },
  cellAction: { width: 44 },
  selectButton: { alignSelf: 'flex-start' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  subdued: { color: '#6B7280' },
});
