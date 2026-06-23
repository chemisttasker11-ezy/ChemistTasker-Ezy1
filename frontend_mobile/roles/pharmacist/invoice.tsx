import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text, Card, Button, ActivityIndicator, Chip, IconButton, FAB } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { getInvoices } from '@chemisttasker/shared-core';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

type Invoice = {
  id: number;
  status?: string;
  total_amount?: string;
  reference?: string;
  created_at?: string;
  updated_at?: string;
};

export default function PharmacistInvoiceScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInvoices();
      setItems(Array.isArray(data) ? data : ((data as any)?.results ?? []));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to load invoices');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="headlineMedium" style={styles.headerTitle}>Invoices</Text>
          <Text variant="bodyMedium" style={styles.headerSubtitle}>Manage your payments</Text>
        </View>
        <IconButton
          icon="plus-circle"
          size={28}
          iconColor="#6366F1"
          onPress={() => router.push('/pharmacist/invoice/new' as any)}
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : error ? (
        <Card mode="outlined" style={styles.errorCard}>
          <Card.Content style={styles.errorContent}>
            <IconButton icon="alert-circle" size={32} iconColor="#EF4444" />
            <Text variant="titleMedium" style={{ color: '#EF4444' }}>Error loading invoices</Text>
            <Text variant="bodyMedium" style={styles.muted}>{error}</Text>
            <Button mode="contained" buttonColor="#6366F1" style={{ marginTop: 12 }} onPress={load}>
              Retry
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push(`/pharmacist/invoice/${item.id}` as any)}
            >
              <Card style={styles.invoiceCard}>
                <Card.Content style={styles.cardContent}>
                  <View style={styles.row}>
                    <View style={styles.iconBox}>
                      <IconButton icon="file-document-outline" size={24} iconColor="#6366F1" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleMedium" style={styles.invoiceTitle}>
                        Invoice #{item.id}
                      </Text>
                      <Text variant="bodySmall" style={styles.date}>
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Date N/A'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="titleMedium" style={styles.amount}>
                        {item.total_amount || '$0.00'}
                      </Text>
                      <Chip
                        compact
                        style={[styles.statusChip, { backgroundColor: getStatusBg(item.status) }]}
                        textStyle={{ color: getStatusColor(item.status), fontSize: 11, fontWeight: '600' }}
                      >
                        {item.status || 'Unknown'}
                      </Chip>
                    </View>
                  </View>
                </Card.Content>
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <IconButton icon="file-document-remove-outline" size={64} iconColor="#E5E7EB" />
              <Text variant="titleMedium" style={styles.emptyTitle}>No invoices found</Text>
              <Text variant="bodyMedium" style={styles.emptyDesc}>
                Your invoices will appear here once generated.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: {
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    color: '#6B7280',
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceCard: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  cardContent: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invoiceTitle: {
    fontWeight: '600',
    color: '#111827',
  },
  date: {
    color: '#6B7280',
  },
  amount: {
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  statusChip: {
    height: 24,
    alignItems: 'center',
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#374151',
    fontWeight: '600',
    marginTop: 16,
  },
  emptyDesc: {
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
});
