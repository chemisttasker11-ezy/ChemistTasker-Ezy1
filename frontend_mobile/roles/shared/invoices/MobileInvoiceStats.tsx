import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { ResponsiveSegmentedButtons } from '@/components/ui/ResponsiveSegmentedButtons';
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
  mode?: 'sent' | 'received';
};

const CARD_COPY = [
  { key: 'draftTotal', title: 'Total Draft Amount', accent: '#5222B8' },
  { key: 'pendingTotal', title: 'Total Pending Amount', accent: '#D97706' },
  { key: 'revenueTotal', title: 'Revenue T.Y.', accent: '#059669' },
] as const;

export default function MobileInvoiceStats({ invoices, timeframe, onTimeframeChange, mode = 'sent' }: Props) {
  const filtered = filterInvoicesByTimeframe(invoices, timeframe);
  const stats = buildInvoiceStats(filtered);
  const cards = mode === 'received'
    ? [
        { key: 'paidTotal', title: 'Paid', accent: '#059669' },
        { key: 'unpaidTotal', title: 'Unpaid', accent: '#D97706' },
      ] as const
    : CARD_COPY;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={styles.title}>
            Invoice Snapshot
          </Text>
          <Text variant="bodySmall" style={styles.subtitle}>
            {mode === 'received'
              ? 'Payment status for invoices sent to you'
              : 'Responsive totals for the selected period'}
          </Text>
        </View>
      </View>

      <ResponsiveSegmentedButtons
        value={timeframe}
        onValueChange={(value) => onTimeframeChange(value as InvoiceTimeframe)}
        buttons={INVOICE_TIMEFRAMES.map((option) => ({ value: option.value, label: ({ '30d': 'Last 30 days', '90d': 'Last 90 days', this_year: 'This year', all: 'All time' })[option.value] }))}
      />

      <View style={styles.grid}>
        {cards.map((card) => (
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
    color: '#06214A',
  },
  subtitle: {
    color: '#59677E',
    marginTop: 2,
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
    borderColor: '#E6EAF2',
  },
  cardLabel: {
    color: '#59677E',
    marginBottom: 8,
  },
  cardValue: {
    fontWeight: '800',
  },
});
