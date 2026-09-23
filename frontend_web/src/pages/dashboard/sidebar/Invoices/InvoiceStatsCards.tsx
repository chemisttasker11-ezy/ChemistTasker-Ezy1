import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import {
  buildInvoiceStats,
  filterInvoicesByTimeframe,
  formatInvoiceCurrency,
  INVOICE_TIMEFRAME_OPTIONS,
  type InvoiceSummaryItem,
  type InvoiceTimeframe,
} from './invoiceStats';

type Props = {
  invoices: InvoiceSummaryItem[];
  timeframe: InvoiceTimeframe;
  onTimeframeChange: (value: InvoiceTimeframe) => void;
  mode?: 'sent' | 'received' | 'workspace';
  compact?: boolean;
};

const CARD_COPY = [
  {
    key: 'draftTotal',
    title: 'Total Draft Amount',
    accent: 'primary.main',
  },
  {
    key: 'pendingTotal',
    title: 'Total Pending Amount',
    accent: 'warning.main',
  },
  {
    key: 'revenueTotal',
    title: 'Revenue T.Y.',
    accent: 'success.main',
  },
] as const;

const WORKSPACE_CARD_COPY = [
  { key: 'draftTotal', title: 'Draft invoices', accent: 'primary.main' },
  { key: 'awaitingPayment', title: 'Awaiting payment', accent: 'warning.main' },
  { key: 'paymentsReceived', title: 'Paid against invoices', accent: 'success.main' },
  { key: 'overdueTotal', title: 'Overdue', accent: 'error.main' },
] as const;

export default function InvoiceStatsCards({
  invoices,
  timeframe,
  onTimeframeChange,
  mode = 'sent',
  compact = false,
}: Props) {
  const filtered = filterInvoicesByTimeframe(invoices, timeframe);
  const stats = buildInvoiceStats(filtered);
  const timeframeLabel =
    INVOICE_TIMEFRAME_OPTIONS.find((option) => option.value === timeframe)?.label ?? 'This Year';
  const cards = mode === 'workspace'
    ? WORKSPACE_CARD_COPY
    : mode === 'received'
    ? [
        { key: 'paidTotal', title: 'Paid', accent: 'success.main' },
        { key: 'unpaidTotal', title: 'Unpaid', accent: 'warning.main' },
      ] as const
    : CARD_COPY;

  return (
    <Stack spacing={compact ? 1.5 : 2.5} mb={compact ? 0 : 3}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={compact ? 1 : 1.5}
      >
        <Box>
          <Typography variant={compact ? 'subtitle2' : 'h6'} fontWeight={700}>
            {mode === 'workspace' ? 'Invoice overview' : 'Invoice Snapshot'}
          </Typography>
          <Typography variant={compact ? 'caption' : 'body2'} color="text.secondary">
            {mode === 'workspace'
              ? 'Non-overlapping totals grouped by invoice date for the selected time frame.'
              : mode === 'received'
              ? 'Review payment status for invoices sent to you.'
              : 'Totals update from the selected time frame.'}
          </Typography>
        </Box>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {INVOICE_TIMEFRAME_OPTIONS.map((option) => {
            const active = option.value === timeframe;
            return (
              <Button
                key={option.value}
                size="small"
                variant={active ? 'contained' : 'outlined'}
                onClick={() => onTimeframeChange(option.value)}
                sx={{
                  borderRadius: 999,
                  textTransform: 'none',
                  px: compact ? 1.25 : 2,
                  minWidth: compact ? 0 : undefined,
                  minHeight: 44,
                  boxShadow: 'none',
                }}
              >
                {option.label}
              </Button>
            );
          })}
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gap: compact ? 1 : 2,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: mode === 'workspace'
              ? 'repeat(4, minmax(0, 1fr))'
              : mode === 'received'
                ? 'repeat(2, minmax(0, 1fr))'
                : 'repeat(3, minmax(0, 1fr))',
          },
        }}
      >
        {cards.map((card) => (
          <Paper
            key={card.key}
            elevation={0}
            sx={{
              p: compact ? 1.25 : 2.25,
              borderRadius: compact ? 2 : 3,
              border: '1px solid',
              borderColor: 'divider',
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(246,248,252,0.94) 100%)',
            }}
          >
            <Typography variant={compact ? 'caption' : 'body2'} color="text.secondary" mb={compact ? .5 : 1} display="block">
              {card.title}
            </Typography>
            <Typography variant={compact ? 'h6' : 'h5'} fontWeight={800} color={card.accent} sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatInvoiceCurrency(stats[card.key])}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {timeframeLabel}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}
