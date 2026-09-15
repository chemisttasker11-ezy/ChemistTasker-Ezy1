import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text, TouchableRipple } from 'react-native-paper';
import {
  buildInvoiceStats,
  filterInvoicesByTimeframe,
  formatInvoiceCurrency,
  INVOICE_TIMEFRAMES,
  type InvoiceSummaryItem,
  type InvoiceTimeframe,
} from './invoiceStats';

type Props = {
  invoices: InvoiceSummaryItem[];
  timeframe: InvoiceTimeframe;
  onTimeframeChange: (value: InvoiceTimeframe) => void;
};

const CARD_COPY = [
  { key: 'draftTotal', title: 'Total Draft Amount', accent: '#4F46E5' },
  { key: 'pendingTotal', title: 'Total Pending Amount', accent: '#D97706' },
  { key: 'revenueTotal', title: 'Revenue T.Y.', accent: '#059669' },
] as const;

export default function MobileInvoiceStats({ invoices, timeframe, onTimeframeChange }: Props) {
  const filtered = filterInvoicesByTimeframe(invoices, timeframe);
  const stats = buildInvoiceStats(filtered);

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={styles.title}>
            Invoice Snapshot
          </Text>
          <Text variant="bodySmall" style={styles.subtitle}>
            Responsive totals for the selected period
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {INVOICE_TIMEFRAMES.map((option) => {
          const active = option.value === timeframe;
          return (
            <TouchableRipple
              key={option.value}
              borderless
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => onTimeframeChange(option.value)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{option.label}</Text>
            </TouchableRipple>
          );
        })}
      </ScrollView>

      <View style={styles.grid}>
        {CARD_COPY.map((card) => (
          <Card key={card.key} style={styles.card} mode="contained">
            <Card.Content>
              <Text variant="bodySmall" style={styles.cardLabel}>
                {card.title}
              </Text>
              <Text variant="titleLarge" style={[styles.cardValue, { color: card.accent }]}>
                {formatInvoiceCurrency(stats[card.key])}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: 8,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    color: '#6B7280',
    marginTop: 2,
  },
  filters: {
    gap: 8,
    paddingRight: 12,
  },
  filterChip: {
    minWidth: 64,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterText: {
    color: '#374151',
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    minWidth: '31%',
    flexGrow: 1,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardLabel: {
    color: '#6B7280',
    marginBottom: 8,
  },
  cardValue: {
    fontWeight: '800',
  },
});
