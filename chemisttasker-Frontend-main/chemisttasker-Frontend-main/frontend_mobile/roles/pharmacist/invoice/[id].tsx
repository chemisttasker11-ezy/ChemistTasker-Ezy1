import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Linking, ScrollView } from 'react-native';
import { Text, Card, ActivityIndicator, Button, IconButton, Chip, Divider } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getInvoiceDetail, getInvoicePdfUrl, sendInvoiceEmail } from '@chemisttasker/shared-core';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

type InvoiceDetail = {
  id: number;
  status?: string;
  total_amount?: string;
  reference?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export default function PharmacistInvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getInvoiceDetail(Number(id));
      setInvoice(data as any);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to load invoice');
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSendEmail = useCallback(async () => {
    if (!id) return;
    setSending(true);
    try {
      await sendInvoiceEmail(Number(id));
      // Maybe show a success message
    } catch (err: any) {
      setError(err?.message || 'Failed to send invoice email');
    } finally {
      setSending(false);
    }
  }, [id]);

  const handleOpenPdf = () => {
    if (!invoice?.id) return;
    const url = getInvoicePdfUrl(invoice.id);
    if (url) {
      Linking.openURL(url);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'overdue':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getStatusBg = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return '#D1FAE5';
      case 'pending':
        return '#FEF3C7';
      case 'overdue':
        return '#FEE2E2';
      default:
        return '#F3F4F6';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (error || !invoice) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.header}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
          <Text variant="titleMedium" style={styles.headerTitle}>Error</Text>
          <View style={{ width: 48 }} />
        </View>
        <Card mode="outlined" style={styles.errorCard}>
          <Card.Content style={styles.errorContent}>
            <IconButton icon="alert-circle" size={32} iconColor="#EF4444" />
            <Text variant="titleMedium" style={{ color: '#EF4444' }}>Unable to load invoice</Text>
            <Text variant="bodySmall" style={styles.muted}>{error}</Text>
            <Button mode="contained" buttonColor="#6366F1" style={{ marginTop: 12 }} onPress={load}>
              Retry
            </Button>
          </Card.Content>
        </Card>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" onPress={() => router.back()} />
        <Text variant="titleMedium" style={styles.headerTitle}>Invoice Details</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.mainCard}>
          <LinearGradient
            colors={['#EEF2FF', '#FFFFFF']}
            style={styles.gradientHeader}
          >
            <View style={styles.invoiceIcon}>
              <IconButton icon="file-document-outline" size={32} iconColor="#6366F1" />
            </View>
            <Text variant="headlineSmall" style={styles.invoiceId}>Invoice #{invoice.id}</Text>
            <Chip
              style={[styles.statusChip, { backgroundColor: getStatusBg(invoice.status) }]}
              textStyle={{ color: getStatusColor(invoice.status), fontWeight: '600' }}
            >
              {invoice.status || 'Unknown'}
            </Chip>
          </LinearGradient>

          <Card.Content style={styles.cardContent}>
            <View style={styles.detailRow}>
              <Text variant="bodyMedium" style={styles.label}>Reference</Text>
              <Text variant="bodyLarge" style={styles.value}>{invoice.reference || '--'}</Text>
            </View>
            <Divider style={styles.divider} />

            <View style={styles.detailRow}>
              <Text variant="bodyMedium" style={styles.label}>Total Amount</Text>
              <Text variant="headlineSmall" style={styles.amount}>{invoice.total_amount || '--'}</Text>
            </View>
            <Divider style={styles.divider} />

            <View style={styles.detailRow}>
              <Text variant="bodyMedium" style={styles.label}>Created Date</Text>
              <Text variant="bodyMedium" style={styles.value}>
                {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : '--'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text variant="bodyMedium" style={styles.label}>Last Updated</Text>
              <Text variant="bodyMedium" style={styles.value}>
                {invoice.updated_at ? new Date(invoice.updated_at).toLocaleDateString() : '--'}
              </Text>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.actions}>
          <Button
            mode="contained"
            icon="file-pdf-box"
            buttonColor="#6366F1"
            style={styles.actionButton}
            contentStyle={styles.actionButtonContent}
            onPress={handleOpenPdf}
          >
            Download PDF
          </Button>
          <Button
            mode="outlined"
            icon="email-outline"
            textColor="#6366F1"
            style={styles.actionButton}
            contentStyle={styles.actionButtonContent}
            onPress={handleSendEmail}
            loading={sending}
            disabled={sending}
          >
            Email Invoice
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerTitle: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  content: {
    padding: 20,
  },
  mainCard: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  gradientHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  invoiceIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  invoiceId: {
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  statusChip: {
    height: 28,
  },
  cardContent: {
    padding: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: {
    color: '#6B7280',
  },
  value: {
    fontWeight: '600',
    color: '#111827',
  },
  amount: {
    fontWeight: 'bold',
    color: '#111827',
  },
  divider: {
    marginVertical: 12,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    borderRadius: 12,
    borderColor: '#6366F1',
  },
  actionButtonContent: {
    height: 48,
  },
  errorCard: {
    margin: 20,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  errorContent: {
    alignItems: 'center',
    gap: 8,
  },
  muted: {
    color: '#6B7280',
    textAlign: 'center',
  },
});
