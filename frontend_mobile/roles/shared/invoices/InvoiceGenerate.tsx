import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  previewGeneratedInvoice,
  SUPER_GUARANTEE_PERCENT,
  type InvoiceGenerationPreview,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import {
  acceptedGenerationLines,
  customGenerationLine,
  editGenerationLine,
  generationDisplayLines,
  generationInput,
  GENERATION_CATEGORIES,
  type GeneratorLine,
} from './invoiceGeneration';

type Shift = {
  id: number;
  pharmacy_detail?: { id: number; name: string; abn?: string | null; street_address?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null } | null;
  created_by_first_name?: string;
  created_by_last_name?: string;
  created_by_email?: string;
  bill_to_abn?: string;
  role_needed?: string;
  start_datetime?: string;
  end_datetime?: string;
};

const UNIT_CHOICES = ['Hours', 'Lump Sum'];

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
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [loadedShiftId, setLoadedShiftId] = useState<number | null>(null);
  const [financialPreview, setFinancialPreview] = useState<{
    key: string; result?: InvoiceGenerationPreview; error?: string;
  } | null>(null);
  const [categoryMenuFor, setCategoryMenuFor] = useState<string | number | null>(null);
  const [unitMenuFor, setUnitMenuFor] = useState<string | number | null>(null);
  const editedDefaults = useRef(new Set<string>());
  const nextLineId = useRef(0);
  const saving = useRef(false);

  // Core fields
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [gstRegistered, setGstRegistered] = useState(true);

  // Issuer / banking
  const [issuerFirstName, setIssuerFirstName] = useState('');
  const [issuerLastName, setIssuerLastName] = useState('');
  const [issuerAbn, setIssuerAbn] = useState('');
  const issuerEmail = user?.email ?? '';
  const [superRateSnapshot, setSuperRateSnapshot] = useState(String(SUPER_GUARANTEE_PERCENT));
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
  const [lineItems, setLineItems] = useState<GeneratorLine[]>([]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    getOnboarding((user.role || 'pharmacist').toLowerCase()).then(onboarding => {
      if (!active) return;
      const apply = (key: string, value: unknown, setter: (value: string) => void) => {
        if (value != null && !editedDefaults.current.has(key)) setter(String(value));
      };
      apply('first_name', onboarding?.first_name, setIssuerFirstName);
      apply('last_name', onboarding?.last_name, setIssuerLastName);
      apply('abn', onboarding?.abn, setIssuerAbn);
      apply('bank_account_name', onboarding?.bank_account_name, setBankAccountName);
      apply('bsb', onboarding?.bsb, setBsb);
      apply('account_number', onboarding?.account_number, setAccountNumber);
      apply('super_fund_name', onboarding?.super_fund_name, setSuperFundName);
      apply('super_usi', onboarding?.super_usi, setSuperUsi);
      apply('super_member_number', onboarding?.super_member_number, setSuperMemberNumber);
      apply('super_rate_snapshot', onboarding?.super_rate_snapshot, setSuperRateSnapshot);
      if (onboarding?.gst_registered !== undefined && !editedDefaults.current.has('gst_registered'))
        setGstRegistered(!!onboarding.gst_registered);
    }).catch((err: any) => {
      if (active) setSnackbar(err?.message || 'Failed to load onboarding');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  const editDefault = (key: string, setter: (value: string) => void, value: string) => {
    editedDefaults.current.add(key);
    setter(value);
  };

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
    void loadShifts();
  }, [loadShifts]);

  const selectedShift = useMemo(
    () => shifts.find(s => s.id === selectedShiftId) || null,
    [selectedShiftId, shifts],
  );

  useEffect(() => {
    let active = true;
    setLoadedShiftId(null);
    setSourceError('');
    setLineItems(mode === 'external' ? [customGenerationLine(`custom-${++nextLineId.current}`, mode)] : []);
    if (mode !== 'internal' || !selectedShiftId) {
      setSourceLoading(false);
      return () => { active = false; };
    }
    setSourceLoading(true);
    previewInvoice(selectedShiftId).then(rows => {
      if (!active) return;
      setLineItems(acceptedGenerationLines(rows));
      setLoadedShiftId(selectedShiftId);
    }).catch((err: any) => {
      if (active) setSourceError(err?.message || 'Failed to load accepted shift terms');
    }).finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, [mode, selectedShiftId]);

  useEffect(() => {
    if (mode === 'internal' && selectedShift) {
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
  }, [mode, selectedShift]);

  const financialInput = useMemo(() => generationInput({
    mode, pharmacy: selectedShift?.pharmacy_detail?.id, shiftId: selectedShiftId ?? undefined,
    lines: lineItems, gstRegistered, superRate: superRateSnapshot,
  }), [mode, selectedShift, selectedShiftId, lineItems, gstRegistered, superRateSnapshot]);
  const previewKey = JSON.stringify(financialInput);
  const canPreview = mode === 'external' ? financialInput.line_items.length > 0
    : Boolean(selectedShiftId && selectedShift?.pharmacy_detail?.id && loadedShiftId === selectedShiftId);
  const currentPreview = canPreview && financialPreview?.key === previewKey ? financialPreview.result ?? null : null;
  const previewError = canPreview && financialPreview?.key === previewKey ? financialPreview.error : '';

  useEffect(() => {
    let active = true;
    setFinancialPreview(null);
    if (!canPreview) return () => { active = false; };
    const timer = setTimeout(() => {
      previewGeneratedInvoice(financialInput).then(result => {
        if (active) setFinancialPreview({ key: previewKey, result });
      }).catch((err: any) => {
        if (active) setFinancialPreview({ key: previewKey, error: err?.message || 'Unable to calculate this invoice' });
      });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [canPreview, financialInput, previewKey]);

  const displayLineItems = generationDisplayLines(lineItems, mode, currentPreview);
  const updateRow = (lineId: string, field: Parameters<typeof editGenerationLine>[1], value: string) =>
    setLineItems(items => items.map(line => line.id === lineId ? editGenerationLine(line, field, value) : line));
  const addItem = () => setLineItems(items => [...items, customGenerationLine(`custom-${++nextLineId.current}`, mode)]);
  const removeItem = (id: string) => setLineItems(items => items.filter(line => line.id !== id || line.origin !== 'custom'));

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
    if (!currentPreview || sourceLoading || loading || saving.current) return;
    if (!validate()) return;
    saving.current = true;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('issuer_first_name', issuerFirstName);
      fd.append('issuer_last_name', issuerLastName);
      fd.append('issuer_email', issuerEmail);
      fd.append('issuer_abn', issuerAbn);
      fd.append('gst_registered', financialInput.gst_registered ? 'true' : 'false');
      fd.append('super_rate_snapshot', financialInput.super_rate_snapshot);
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

      fd.append('line_items', JSON.stringify(financialInput.line_items));

      await generateInvoice(fd as any);
      setSnackbar('Invoice generated');
      router.replace(resolvedBase as any);
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to generate invoice');
    } finally {
      saving.current = false;
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

      <ScrollView contentContainerStyle={styles.content} pointerEvents={submitting ? 'none' : 'auto'}>
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
              {sourceLoading && (
                <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator />
                  <Text>Loading preview...</Text>
                </View>
              )}
              {!!sourceError && <HelperText type="error" visible>{sourceError}</HelperText>}
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
              onChangeText={value => editDefault('first_name', setIssuerFirstName, value)}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Last name"
              value={issuerLastName}
              onChangeText={value => editDefault('last_name', setIssuerLastName, value)}
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
              onChangeText={value => editDefault('abn', setIssuerAbn, value)}
              mode="outlined"
              style={styles.input}
            />
            <View style={styles.switchRow}>
              <Text>GST registered</Text>
              <Switch value={gstRegistered} onValueChange={value => {
                editedDefaults.current.add('gst_registered'); setGstRegistered(value);
              }} />
            </View>
            <TextInput
              label="Bank account name"
              value={bankAccountName}
              onChangeText={value => editDefault('bank_account_name', setBankAccountName, value)}
              mode="outlined"
              style={styles.input}
            />
            <TextInput label="BSB" value={bsb} onChangeText={value => editDefault('bsb', setBsb, value)} mode="outlined" style={styles.input} />
            <TextInput
              label="Account number"
              value={accountNumber}
              onChangeText={value => editDefault('account_number', setAccountNumber, value)}
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
              value={superRateSnapshot}
              onChangeText={value => editDefault('super_rate_snapshot', setSuperRateSnapshot, value)}
              mode="outlined"
              style={styles.input}
              keyboardType="numeric"
            />
            <TextInput
              label="Super fund name"
              value={superFundName}
              onChangeText={value => editDefault('super_fund_name', setSuperFundName, value)}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Super USI"
              value={superUsi}
              onChangeText={value => editDefault('super_usi', setSuperUsi, value)}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Super member number"
              value={superMemberNumber}
              onChangeText={value => editDefault('super_member_number', setSuperMemberNumber, value)}
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
              <IconButton icon="plus" onPress={addItem} disabled={mode === 'internal' && (!selectedShiftId || loadedShiftId !== selectedShiftId)} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.cell, styles.cellCategory]}>Category</Text>
                  <Text style={[styles.cell, styles.cellDescription]}>Description</Text>
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
                  const disableRow = li.locked || li.origin !== 'custom';
                  const hoursLabel = isProfessional
                    ? li.quantity
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
                              {GENERATION_CATEGORIES.find(c => c.code === li.category_code)?.label || 'Select'}
                            </Button>
                          }
                        >
                          {GENERATION_CATEGORIES.filter(choice => mode === 'external' || choice.code !== 'ProfessionalServices').map(choice => (
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

                      <TextInput
                        value={li.description}
                        onChangeText={value => updateRow(li.id, 'description', value)}
                        mode="outlined"
                        style={[styles.cell, styles.cellDescription]}
                        placeholder="Description"
                        accessibilityLabel="Line description"
                        dense
                        disabled={disableRow}
                      />

                      {isProfessional ? (
                        <>
                          <TextInput
                            value={li.date || ''}
                            onChangeText={text => updateRow(li.id!, 'date', text)}
                            mode="outlined"
                            style={[styles.cell, styles.cellDate]}
                            placeholder="YYYY-MM-DD"
                            dense
                            disabled={disableRow}
                          />
                          <TextInput
                            value={li.start_time?.slice(0, 5) || ''}
                            onChangeText={text => updateRow(li.id!, 'start_time', text ? `${text}:00` : '')}
                            mode="outlined"
                            style={[styles.cell, styles.cellTime]}
                            placeholder="HH:MM"
                            dense
                            disabled={disableRow}
                          />
                          <TextInput
                            value={li.end_time?.slice(0, 5) || ''}
                            onChangeText={text => updateRow(li.id!, 'end_time', text ? `${text}:00` : '')}
                            mode="outlined"
                            style={[styles.cell, styles.cellTime]}
                            placeholder="HH:MM"
                            dense
                            disabled={disableRow}
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
                        value={li.unit_price}
                        onChangeText={text => updateRow(li.id!, 'unit_price', text)}
                        mode="outlined"
                        style={[styles.cell, styles.cellPrice]}
                        keyboardType="numeric"
                        accessibilityLabel="Line unit price"
                        dense
                        disabled={disableRow}
                      />
                      <TextInput
                        value={li.discount}
                        onChangeText={text => updateRow(li.id!, 'discount', text)}
                        mode="outlined"
                        style={[styles.cell, styles.cellDiscount]}
                        keyboardType="numeric"
                        accessibilityLabel="Line discount"
                        dense
                        disabled={disableRow}
                      />
                      <Text style={[styles.cell, styles.cellAmount]}>
                        {li.total ?? '—'}
                      </Text>
                      <View style={[styles.cell, styles.cellAction]}>
                        <IconButton icon="delete" size={18} disabled={disableRow} onPress={() => removeItem(li.id!)} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <HelperText type="info" visible>
              {mode === 'internal' ? 'Accepted shift terms are read-only here. ' : ''}
              Use + to add extra items. Super is shown separately from the amount payable to you.
            </HelperText>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Totals
            </Text>
            {!currentPreview && !previewError && <HelperText type="info" visible>
              {canPreview ? 'Calculating invoice…' : mode === 'internal' ? 'Select a shift to preview this invoice.' : 'Add an item to preview this invoice.'}
            </HelperText>}
            {!!previewError && <HelperText type="error" visible>{previewError}</HelperText>}
            <View style={styles.totalRow}>
              <Text>Subtotal</Text>
              <Text>{currentPreview ? `$${currentPreview.subtotal}` : '—'}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>GST</Text>
              <Text>{currentPreview ? `$${currentPreview.gst_amount}` : '—'}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>Super contribution</Text>
              <Text>{currentPreview ? `$${currentPreview.super_amount}` : '—'}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text variant="titleMedium">Worker payable</Text>
              <Text variant="titleMedium">{currentPreview ? `$${currentPreview.total}` : '—'}</Text>
            </View>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!currentPreview || loading || sourceLoading || submitting}
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
  table: { minWidth: 1120 },
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
  cellDescription: { width: 200 },
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
