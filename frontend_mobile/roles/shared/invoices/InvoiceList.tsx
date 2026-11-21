import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Card, IconButton, Menu, Snackbar, Text } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import {
  deleteInvoice,
  fetchAllPages,
  getInvoices,
  reportInvoiceIssue,
  sendInvoiceEmail,
  updateInvoice,
} from '@chemisttasker/shared-core';
import { shareLegacyInvoicePdf } from './shareLegacyInvoicePdf';
import { useAuth } from '@/context/AuthContext';
import MobileInvoiceStats from './MobileInvoiceStats';
import { colors, font, radius, space, touch } from '@/constants/tokens';
import FinanceWorkspace from './FinanceWorkspace';
import {
  filterInvoicesByTimeframe,
  formatInvoiceCurrency,
  type InvoiceTimeframe,
} from './invoiceStats';

type Invoice = {
  id: number;
  invoice_date?: string;
  created_at?: string;
  total?: number | string;
  total_amount?: number | string;
  status?: string;
  reference?: string;
  issuer_first_name?: string;
  issuer_last_name?: string;
  issuer_email?: string;
  finance_record_id?: number | null;
};

const PAGE_SIZE = 10;

// DRF collection pagination is server-owned. Never report an empty invoice
// history when page two or a later page has not been fetched.
export async function fetchCompleteLegacyInvoices(): Promise<Invoice[]> {
  const visited = new Set<string>();
  return fetchAllPages<Invoice>(async (page) => {
    if (page > 100) throw new Error('Invoice history exceeds the available page limit. Please narrow the server query.');
    const data = await getInvoices({ page });
    if (Array.isArray(data)) return data as Invoice[];
    if (!data || !Array.isArray(data.results)) throw new Error('Unexpected legacy invoice list response.');
    if (data.next) {
      if (visited.has(data.next)) throw new Error('Legacy invoice pagination repeated a page.');
      visited.add(data.next);
    }
    return { results: data.results as Invoice[], next: data.next };
  });
}

type Props = { basePath?: string };

export default function InvoiceList({ basePath }: Props) {
  const segments = useSegments();
  const managerWorkspace = ['owner', 'organization', 'admin'].includes(String(segments[0] || '').toLowerCase());
  return (
    <FinanceWorkspace
      receivedMode={managerWorkspace}
      existingTools={(header) => <LegacyInvoiceList basePath={basePath} header={header} />}
    />
  );
}

function LegacyInvoiceList({ basePath, header }: Props & { header?: ReactNode }) {
  const { user } = useAuth();
  const shareAccount = React.useRef(user?.id);
  shareAccount.current = user?.id;
  const shareScope = React.useRef(0);
  React.useEffect(() => () => { shareScope.current += 1; }, [user?.id]);
  const router = useRouter();
  const segments = useSegments();
  const role = (segments[0] as string) || 'pharmacist';
  const resolvedBase = basePath || `/${role}/invoice`;
  const isReceivedMode = ['owner', 'organization', 'admin'].includes(String(role).toLowerCase());

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<string>('');
  const [loadError, setLoadError] = useState('');
  const requestGeneration = React.useRef(0);
  const [timeframe, setTimeframe] = useState<InvoiceTimeframe>('this_year');

  const load = useCallback(async () => {
    const gen = ++requestGeneration.current;
    setLoading(true);
    setLoadError('');
    try {
      const records = await fetchCompleteLegacyInvoices();
      if (gen !== requestGeneration.current) return;
      setInvoices(records);
    } catch (err: any) {
      if (gen !== requestGeneration.current) return;
      // Preserve the last good list instead of inventing an empty history.
      setLoadError(err?.message || 'Failed to load invoices');
    } finally {
      if (gen === requestGeneration.current) setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await load();
    setRefreshing(false);
  }, [load]);

  React.useEffect(() => {
    void load();
    return () => { requestGeneration.current += 1; };
  }, [load]);

  const sorted = useMemo(() => {
    return [...invoices].sort((a, b) => {
      const aDate = a.invoice_date || a.created_at || '';
      const bDate = b.invoice_date || b.created_at || '';
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [invoices]);

  const filtered = useMemo(
    () => filterInvoicesByTimeframe(sorted, timeframe),
    [sorted, timeframe],
  );

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

  React.useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [filtered.length, page]);

  const formatDate = (value?: string) =>
    value ? new Date(value).toLocaleDateString() : 'Date N/A';

  const amountFor = (item: Invoice) => {
    const val = (item.total as any) ?? (item.total_amount as any) ?? 0;
    const num = Number(val);
    return Number.isFinite(num) ? formatInvoiceCurrency(num) : String(val);
  };

  const [sharingPdfId, setSharingPdfId] = useState<number | null>(null);
  const sharingPdfRef = React.useRef(false);
  const onOpenPdf = async (id: number) => {
    if (sharingPdfRef.current) return;
    sharingPdfRef.current = true;
    setSharingPdfId(id);
    const generation = shareScope.current;
    const account = user?.id;
    try {
      await shareLegacyInvoicePdf(id, () => account != null && shareAccount.current === account && shareScope.current === generation);
    } catch (error: any) {
      setSnackbar(error?.message || 'Unable to open invoice PDF');
    } finally {
      sharingPdfRef.current = false;
      setSharingPdfId(null);
    }
  };

  const onSendEmail = async (id: number) => {
    try {
      const result = await sendInvoiceEmail(id);
      setInvoices((prev) => prev.map((invoice) => (
        invoice.id === id ? { ...invoice, status: result.status } : invoice
      )));
      setSnackbar(result.detail || 'Invoice email request accepted.');
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to send email');
    }
  };

  const onMarkPaid = async (id: number) => {
    try {
      await updateInvoice(id, { status: 'paid' } as any);
      setInvoices((prev) => prev.map((invoice) => (
        invoice.id === id ? { ...invoice, status: 'paid' } : invoice
      )));
      setSnackbar('Invoice marked as paid');
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to update invoice');
    }
  };

  const onMarkUnpaid = async (id: number) => {
    try {
      await updateInvoice(id, { status: 'sent' } as any);
      setInvoices((prev) => prev.map((invoice) => (
        invoice.id === id ? { ...invoice, status: 'sent' } : invoice
      )));
      setSnackbar('Invoice marked as unpaid');
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to update invoice');
    }
  };

  const canMarkPaid = (status?: string) => {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'sent' || normalized === 'pending';
  };

  const onDelete = (id: number) => {
    Alert.alert('Delete invoice', 'Are you sure you want to delete this invoice?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteInvoice(id);
            setInvoices(prev => prev.filter(inv => inv.id !== id));
            setSnackbar('Invoice deleted');
          } catch (err: any) {
            setSnackbar(err?.message || 'Failed to delete invoice');
          }
        },
      },
    ]);
  };

  const onReportIssue = async (id: number) => {
    try {
      await reportInvoiceIssue(id);
      setSnackbar('Issue reported to sender');
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to report invoice issue');
    }
  };

  const renderItem = ({ item }: { item: Invoice }) => {
    const financeManaged = Boolean(item.finance_record_id);
    const statusLabel = financeManaged && String(item.status || '').toLowerCase() === 'draft' ? 'Saved' : (item.status || 'Unknown');
    const useWorkspace = () => {
      setMenuFor(null);
      // finance_record_id is the managed record's primary key, not the
      // historical invoice id: open the first-party review drawer directly.
      if (!item.finance_record_id) return;
      router.push(`${resolvedBase}?invoice=${item.finance_record_id}` as any);
    };
    return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => financeManaged ? useWorkspace() : router.push(`${resolvedBase}/${item.id}` as any)}
    >
      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <IconButton icon="file-document-outline" size={22} iconColor="#4F46E5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={styles.title}>
                Invoice #{item.id}
              </Text>
              <Text variant="bodySmall" style={styles.sub}>
                {formatDate(item.invoice_date || item.created_at)}
              </Text>
              {isReceivedMode ? (
                <Text variant="bodySmall" style={styles.ref}>
                  From: {`${item.issuer_first_name || ''} ${item.issuer_last_name || ''}`.trim() || item.issuer_email || 'Sender'}
                </Text>
              ) : null}
              {item.reference ? (
                <Text variant="bodySmall" style={styles.ref}>
                  Ref: {item.reference}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text variant="titleMedium" style={styles.amount}>
                {amountFor(item)}
              </Text>
              <Text variant="labelMedium" style={[styles.status, statusStyle(item.status)]}>
                {statusLabel}
              </Text>
            </View>
            <Menu
              visible={menuFor === item.id}
              onDismiss={() => setMenuFor(null)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  size={22}
                  onPress={() => setMenuFor(item.id)}
                />
              }
            >
              {financeManaged ? (
                <Menu.Item
                  leadingIcon="information-outline"
                  title={`Open in ${isReceivedMode ? 'Received' : 'Invoices'}`}
                  onPress={useWorkspace}
                />
              ) : !isReceivedMode ? (
                <>
                  <Menu.Item
                    leadingIcon="pencil"
                    title="Edit"
                    onPress={() => {
                      setMenuFor(null);
                      router.push(`${resolvedBase}/${item.id}` as any);
                    }}
                  />
                  <Menu.Item
                    leadingIcon="email-send"
                    title="Send email"
                    disabled={String(item.status || '').toLowerCase() !== 'draft'}
                    onPress={() => {
                      setMenuFor(null);
                      void onSendEmail(item.id);
                    }}
                  />
                </>
              ) : null}
              {!financeManaged ? <Menu.Item
                leadingIcon={String(item.status || '').toLowerCase() === 'paid' ? 'undo' : 'cash-check'}
                title={String(item.status || '').toLowerCase() === 'paid' ? 'Mark as unpaid' : 'Mark as paid'}
                disabled={String(item.status || '').toLowerCase() !== 'paid' && !canMarkPaid(item.status)}
                onPress={() => {
                  setMenuFor(null);
                  if (String(item.status || '').toLowerCase() === 'paid') {
                    void onMarkUnpaid(item.id);
                  } else {
                    void onMarkPaid(item.id);
                  }
                }}
              /> : null}
              {financeManaged ? (
                <Menu.Item
                  leadingIcon="file-pdf-box"
                  title="View or share in Finance"
                  onPress={useWorkspace}
                />
              ) : (
                <Menu.Item
                  leadingIcon="file-pdf-box"
                  title={sharingPdfId === item.id ? 'Preparing PDF…' : 'Open PDF'}
                  disabled={sharingPdfId != null}
                  onPress={() => {
                    setMenuFor(null);
                    void onOpenPdf(item.id);
                  }}
                />
              )}
              {!financeManaged && (isReceivedMode ? (
                <Menu.Item
                  leadingIcon="alert-circle-outline"
                  title="Report issue to sender"
                  onPress={() => {
                    setMenuFor(null);
                    void onReportIssue(item.id);
                  }}
                />
              ) : (
                <Menu.Item
                  leadingIcon="delete"
                  title="Delete"
                  onPress={() => {
                    setMenuFor(null);
                    onDelete(item.id);
                  }}
                />
              ))}
            </Menu>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <FlatList
          data={loading && !refreshing ? [] : paginated}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ListHeaderComponent={<View>
            {header}
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text variant="headlineMedium" style={styles.headerTitle}>
            Invoices
          </Text>
          <Text variant="bodyMedium" style={styles.headerSubtitle}>
            {isReceivedMode
              ? 'Historical received-invoice tools; use Received for current review'
              : 'Historical invoice tools; use Invoices for current work'}
          </Text>
        </View>

      </View>
            {loading && !refreshing ? <View style={styles.loader}><ActivityIndicator size="large" color="#4F46E5" /></View> : null}
            {loadError ? <Card style={styles.errorCard}>
              <Card.Content style={{ gap: space.sm }}>
                <Text accessibilityRole="alert" variant="titleSmall" style={{ color: colors.status.red.fg }}>
                  Invoice history could not refresh
                </Text>
                <Text style={{ color: colors.textPrimary }}>{loadError}</Text>
                <Button mode="outlined" contentStyle={{ minHeight: touch.min }} onPress={() => void load()}>
                  Try again
                </Button>
              </Card.Content>
            </Card> : null}
            {!loading || refreshing ? <MobileInvoiceStats
              invoices={sorted}
              timeframe={timeframe}
              mode={isReceivedMode ? 'received' : 'sent'}
              onTimeframeChange={(value: InvoiceTimeframe) => {
                setPage(1);
                setTimeframe(value);
              }}
            /> : null}
          </View>}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (paginated.length < filtered.length) setPage(p => p + 1);
          }}
          ListEmptyComponent={loadError || (loading && !refreshing) ? undefined : (
            <View style={styles.empty}>
              <Text variant="titleMedium">No invoices yet</Text>
              <Text variant="bodyMedium" style={styles.sub}>
                {isReceivedMode
                  ? 'Received invoices from pharmacists will appear here.'
                  : 'Generated invoices will appear here.'}
              </Text>
            </View>
          )}
        />

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}

const statusStyle = (status?: string) => {
  const base = { backgroundColor: '#EEF2FF', color: '#4338CA' };
  if (!status) return base;
  const key = status.toLowerCase();
  if (key === 'paid') return { backgroundColor: '#DCFCE7', color: '#166534' };
  if (key === 'sent' || key === 'pending') return { backgroundColor: '#FEF3C7', color: '#B45309' };
  if (key === 'draft') return { backgroundColor: '#E0E7FF', color: '#4338CA' };
  if (key === 'overdue') return { backgroundColor: '#FEE2E2', color: '#B91C1C' };
  return base;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontFamily: font.outfit.medium, color: colors.textPrimary },
  headerSubtitle: { color: colors.textSecondary },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  card: { borderRadius: radius.card, backgroundColor: colors.surfaceBg, elevation: 0, borderWidth: 1, borderColor: colors.border },
  errorCard: { marginBottom: space.md, backgroundColor: colors.status.red.bg, borderColor: colors.status.red.fg, borderWidth: 1, borderRadius: radius.card },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  title: { fontWeight: '700', color: '#111827' },
  sub: { color: '#6B7280' },
  ref: { color: '#4B5563', marginTop: 2 },
  amount: { fontWeight: '700', color: '#111827' },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  empty: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
