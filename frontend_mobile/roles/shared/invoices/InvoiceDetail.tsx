import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  HelperText,
  IconButton,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import {
  getInvoiceDetail,
  getInvoicePdfUrl,
  sendInvoiceEmail,
  updateInvoice,
} from '@chemisttasker/shared-core';

type LineItem = {
  id?: number | string;
  description: string;
  category_code: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total?: number;
  gst_applicable?: boolean;
  super_applicable?: boolean;
};

type Invoice = {
  id: number;
  external: boolean;
  issuer_first_name?: string;
  issuer_last_name?: string;
  issuer_abn?: string;
  issuer_email?: string;
  gst_registered?: boolean;
  super_rate_snapshot?: number;
  super_fund_name?: string;
  super_usi?: string;
  super_member_number?: string;
  bank_account_name?: string;
  bsb?: string;
  account_number?: string;
  cc_emails?: string;
  invoice_date?: string;
  due_date?: string;
  pharmacy_name_snapshot?: string;
  pharmacy_address_snapshot?: string;
  pharmacy_abn_snapshot?: string;
  bill_to_first_name?: string;
  bill_to_last_name?: string;
  bill_to_email?: string;
  bill_to_abn?: string;
  custom_bill_to_name?: string;
  custom_bill_to_address?: string;
  status?: string;
  reference?: string;
  total_amount?: number | string;
  subtotal?: number;
  gst_amount?: number;
  super_amount?: number;
  line_items?: LineItem[];
};

const defaultLine = (): LineItem => ({
  id: `new-${Date.now()}`,
  description: '',
  category_code: 'ProfessionalServices',
  unit: 'Hours',
  quantity: 1,
  unit_price: 0,
  discount: 0,
  total: 0,
  gst_applicable: true,
  super_applicable: true,
});

type Props = { basePath?: string };

export default function InvoiceDetail({ basePath }: Props) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const segments = useSegments();
  const role = (segments[0] as string) || 'pharmacist';
  const resolvedBase = basePath || `/${role}/invoice`;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [snackbar, setSnackbar] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = (await getInvoiceDetail(Number(id))) as Invoice;
      setInvoice(data);
      const items = Array.isArray(data.line_items) ? data.line_items : [];
      setLineItems(
        items.map(li => ({
          ...li,
          quantity: Number(li.quantity ?? 0),
          unit_price: Number(li.unit_price ?? 0),
          discount: Number(li.discount ?? 0),
          total: Number(li.total ?? 0),
        })),
      );
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const recalc = useCallback((li: LineItem) => {
    const total =
      Number(li.quantity || 0) * Number(li.unit_price || 0) * (1 - Number(li.discount || 0) / 100);
    return { ...li, total: Math.round(total * 100) / 100 };
  }, []);

  const updateItem = (lineId: string | number, changes: Partial<LineItem>) => {
    setLineItems(items =>
      items.map(li => (li.id === lineId ? recalc({ ...li, ...changes }) : li)),
    );
  };
  const addItem = () => setLineItems(items => [...items, defaultLine()]);
  const removeItem = (lineId: string | number) =>
    setLineItems(items => items.filter(li => li.id !== lineId));

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((acc, li) => acc + Number(li.total || 0), 0);
    const gst =
      (invoice?.gst_registered
        ? lineItems
            .filter(
              li =>
                li.gst_applicable !== false &&
                !['Superannuation', 'Transportation', 'Accommodation'].includes(
                  li.category_code,
                ),
            )
            .reduce((acc, li) => acc + Number(li.total || 0), 0) * 0.1
        : 0) || 0;
    const superAmt =
      lineItems.find(li => li.category_code === 'Superannuation')?.total ?? invoice?.super_amount ?? 0;
    const total = subtotal + gst + Number(superAmt || 0);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      gst: Math.round(gst * 100) / 100,
      superAmt: Math.round(Number(superAmt || 0) * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [invoice?.gst_registered, invoice?.super_amount, lineItems]);

  const handleSave = async () => {
    if (!invoice) return;
    setSaving(true);
    try {
      await updateInvoice(invoice.id, {
        external: invoice.external,
        issuer_first_name: invoice.issuer_first_name,
        issuer_last_name: invoice.issuer_last_name,
        issuer_abn: invoice.issuer_abn,
        issuer_email: invoice.issuer_email,
        gst_registered: invoice.gst_registered,
        super_rate_snapshot: invoice.super_rate_snapshot,
        super_fund_name: invoice.super_fund_name,
        super_usi: invoice.super_usi,
        super_member_number: invoice.super_member_number,
        bank_account_name: invoice.bank_account_name,
        bsb: invoice.bsb,
        account_number: invoice.account_number,
        cc_emails: invoice.cc_emails,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        pharmacy_name_snapshot: invoice.pharmacy_name_snapshot,
        pharmacy_address_snapshot: invoice.pharmacy_address_snapshot,
        pharmacy_abn_snapshot: invoice.pharmacy_abn_snapshot,
        bill_to_first_name: invoice.bill_to_first_name,
        bill_to_last_name: invoice.bill_to_last_name,
        bill_to_email: invoice.bill_to_email,
        bill_to_abn: invoice.bill_to_abn,
        custom_bill_to_name: invoice.custom_bill_to_name,
        custom_bill_to_address: invoice.custom_bill_to_address,
        line_items: lineItems.map(li => ({
          ...li,
          quantity: Number(li.quantity || 0),
          unit_price: Number(li.unit_price || 0),
          discount: Number(li.discount || 0),
          total: Number(li.total || 0),
        })),
      } as any);
      setSnackbar('Invoice saved');
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleSendEmail = async () => {
    if (!invoice) return;
    setSending(true);
    try {
      await sendInvoiceEmail(invoice.id);
      setInvoice((current) => (current ? { ...current, status: 'sent' } : current));
      setSnackbar('Email sent');
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!invoice) return;
    setUpdatingStatus(true);
    try {
      await updateInvoice(invoice.id, { status: 'paid' } as any);
      setInvoice((current) => (current ? { ...current, status: 'paid' } : current));
      setSnackbar('Invoice marked as paid');
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to update invoice');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleOpenPdf = () => {
    if (!invoice?.id) return;
    const url = getInvoicePdfUrl(invoice.id);
    Linking.openURL(url).catch(() => setSnackbar('Unable to open PDF'));
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!invoice) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.header}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
          <Text variant="titleMedium" style={styles.headerTitle}>
            Invoice
          </Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.errorBox}>
          <Text variant="titleMedium">Unable to load invoice</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" onPress={() => router.back()} />
        <Text variant="titleLarge" style={styles.headerTitle}>
          Invoice #{invoice.id}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.statusRow}>
              <Chip
                style={[styles.statusChip, { backgroundColor: statusStyle(invoice.status).bg }]}
                textStyle={{ color: statusStyle(invoice.status).fg, fontWeight: '600' }}
              >
                {invoice.status || 'Unknown'}
              </Chip>
              <Text variant="titleMedium">{invoice.reference || '—'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text>Invoice date</Text>
              <Text>{invoice.invoice_date || '—'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text>Due date</Text>
              <Text>{invoice.due_date || '—'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text>Total</Text>
              <Text variant="titleMedium">${totals.total.toFixed(2)}</Text>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Issuer
            </Text>
            <TextInput
              label="First name"
              mode="outlined"
              value={invoice.issuer_first_name || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, issuer_first_name: v })}
              style={styles.input}
            />
            <TextInput
              label="Last name"
              mode="outlined"
              value={invoice.issuer_last_name || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, issuer_last_name: v })}
              style={styles.input}
            />
            <TextInput
              label="Email"
              mode="outlined"
              value={invoice.issuer_email || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, issuer_email: v })}
              style={styles.input}
            />
            <TextInput
              label="ABN"
              mode="outlined"
              value={invoice.issuer_abn || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, issuer_abn: v })}
              style={styles.input}
            />
            <TextInput
              label="CC emails"
              mode="outlined"
              value={invoice.cc_emails || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, cc_emails: v })}
              style={styles.input}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Billing
            </Text>
            {invoice.external ? (
              <>
                <TextInput
                  label="Bill to name"
                  mode="outlined"
                  value={invoice.custom_bill_to_name || ''}
                  onChangeText={v => setInvoice(cur => cur && { ...cur, custom_bill_to_name: v })}
                  style={styles.input}
                />
                <TextInput
                  label="Bill to address"
                  mode="outlined"
                  value={invoice.custom_bill_to_address || ''}
                  onChangeText={v => setInvoice(cur => cur && { ...cur, custom_bill_to_address: v })}
                  style={styles.input}
                />
              </>
            ) : (
              <>
                <TextInput
                  label="Pharmacy name snapshot"
                  mode="outlined"
                  value={invoice.pharmacy_name_snapshot || ''}
                  onChangeText={v => setInvoice(cur => cur && { ...cur, pharmacy_name_snapshot: v })}
                  style={styles.input}
                />
                <TextInput
                  label="Pharmacy address snapshot"
                  mode="outlined"
                  value={invoice.pharmacy_address_snapshot || ''}
                  onChangeText={v =>
                    setInvoice(cur => cur && { ...cur, pharmacy_address_snapshot: v })
                  }
                  style={styles.input}
                  multiline
                />
                <TextInput
                  label="Pharmacy ABN snapshot"
                  mode="outlined"
                  value={invoice.pharmacy_abn_snapshot || ''}
                  onChangeText={v => setInvoice(cur => cur && { ...cur, pharmacy_abn_snapshot: v })}
                  style={styles.input}
                />
                <TextInput
                  label="Bill to first name"
                  mode="outlined"
                  value={invoice.bill_to_first_name || ''}
                  onChangeText={v => setInvoice(cur => cur && { ...cur, bill_to_first_name: v })}
                  style={styles.input}
                />
                <TextInput
                  label="Bill to last name"
                  mode="outlined"
                  value={invoice.bill_to_last_name || ''}
                  onChangeText={v => setInvoice(cur => cur && { ...cur, bill_to_last_name: v })}
                  style={styles.input}
                />
              </>
            )}
            <TextInput
              label="Bill to email"
              mode="outlined"
              value={invoice.bill_to_email || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, bill_to_email: v })}
              style={styles.input}
            />
            <TextInput
              label="Bill to ABN"
              mode="outlined"
              value={invoice.bill_to_abn || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, bill_to_abn: v })}
              style={styles.input}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Bank & Super
            </Text>
            <TextInput
              label="Bank account name"
              mode="outlined"
              value={invoice.bank_account_name || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, bank_account_name: v })}
              style={styles.input}
            />
            <TextInput
              label="BSB"
              mode="outlined"
              value={invoice.bsb || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, bsb: v })}
              style={styles.input}
            />
            <TextInput
              label="Account number"
              mode="outlined"
              value={invoice.account_number || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, account_number: v })}
              style={styles.input}
            />
            <TextInput
              label="Super rate snapshot (%)"
              mode="outlined"
              value={String(invoice.super_rate_snapshot ?? '')}
              onChangeText={v =>
                setInvoice(cur => cur && { ...cur, super_rate_snapshot: Number(v) || 0 })
              }
              style={styles.input}
              keyboardType="numeric"
            />
            <TextInput
              label="Super fund name"
              mode="outlined"
              value={invoice.super_fund_name || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, super_fund_name: v })}
              style={styles.input}
            />
            <TextInput
              label="Super USI"
              mode="outlined"
              value={invoice.super_usi || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, super_usi: v })}
              style={styles.input}
            />
            <TextInput
              label="Super member number"
              mode="outlined"
              value={invoice.super_member_number || ''}
              onChangeText={v => setInvoice(cur => cur && { ...cur, super_member_number: v })}
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
            {lineItems.map(li => (
              <View key={li.id} style={styles.lineItem}>
                <View style={styles.lineHeaderRow}>
                  <Chip compact>{li.category_code}</Chip>
                  <IconButton icon="delete" size={18} onPress={() => removeItem(li.id!)} />
                </View>
                <TextInput
                  label="Description"
                  mode="outlined"
                  value={li.description}
                  onChangeText={v => updateItem(li.id!, { description: v })}
                  style={styles.input}
                />
                <TextInput
                  label="Category"
                  mode="outlined"
                  value={li.category_code}
                  onChangeText={v => updateItem(li.id!, { category_code: v })}
                  style={styles.input}
                />
                <View style={styles.rowInputs}>
                  <TextInput
                    label="Quantity"
                    mode="outlined"
                    value={String(li.quantity)}
                    onChangeText={v => updateItem(li.id!, { quantity: Number(v) || 0 })}
                    keyboardType="numeric"
                    style={styles.halfInput}
                  />
                  <TextInput
                    label="Unit price"
                    mode="outlined"
                    value={String(li.unit_price)}
                    onChangeText={v => updateItem(li.id!, { unit_price: Number(v) || 0 })}
                    keyboardType="numeric"
                    style={styles.halfInput}
                  />
                </View>
                <View style={styles.rowInputs}>
                  <TextInput
                    label="Discount (%)"
                    mode="outlined"
                    value={String(li.discount)}
                    onChangeText={v => updateItem(li.id!, { discount: Number(v) || 0 })}
                    keyboardType="numeric"
                    style={styles.halfInput}
                  />
                  <TextInput
                    label="Total"
                    mode="outlined"
                    value={String(li.total ?? 0)}
                    editable={false}
                    style={styles.halfInput}
                  />
                </View>
              </View>
            ))}
            <HelperText type="info" visible>
              Totals are recalculated locally. GST applies to non-super/non-transport/non-accommodation items.
            </HelperText>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Totals
            </Text>
            <View style={styles.detailRow}>
              <Text>Subtotal</Text>
              <Text>${totals.subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text>GST</Text>
              <Text>${totals.gst.toFixed(2)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text>Superannuation</Text>
              <Text>${totals.superAmt.toFixed(2)}</Text>
            </View>
            <Divider style={{ marginVertical: 6 }} />
            <View style={styles.detailRow}>
              <Text variant="titleMedium">Total</Text>
              <Text variant="titleMedium">${totals.total.toFixed(2)}</Text>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.actions}>
          <Button
            mode="contained"
            icon="content-save"
            onPress={handleSave}
            loading={saving}
            style={styles.actionBtn}
          >
            Save
          </Button>
          <Button
            mode="outlined"
            icon="email-outline"
            onPress={handleSendEmail}
            loading={sending}
            style={styles.actionBtn}
          >
            Send email
          </Button>
          {['sent', 'pending'].includes(String(invoice.status || '').toLowerCase()) ? (
            <Button
              mode="outlined"
              icon="cash-check"
              onPress={handleMarkPaid}
              loading={updatingStatus}
              style={styles.actionBtn}
            >
              Mark as paid
            </Button>
          ) : null}
          <Button mode="outlined" icon="file-pdf-box" onPress={handleOpenPdf} style={styles.actionBtn}>
            Open PDF
          </Button>
        </View>
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}

const statusStyle = (status?: string) => {
  const base = { bg: '#EEF2FF', fg: '#4338CA' };
  if (!status) return base;
  const key = status.toLowerCase();
  if (key === 'paid') return { bg: '#DCFCE7', fg: '#166534' };
  if (key === 'sent' || key === 'pending') return { bg: '#FEF3C7', fg: '#92400E' };
  if (key === 'draft') return { bg: '#E0E7FF', fg: '#4338CA' };
  if (key === 'overdue') return { bg: '#FEE2E2', fg: '#B91C1C' };
  return base;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusChip: { alignSelf: 'flex-start' },
  input: { marginTop: 8 },
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
  actions: { flexDirection: 'column', gap: 10, marginBottom: 24, marginTop: 12 },
  actionBtn: { marginHorizontal: 12 },
  errorBox: { padding: 16 },
});
