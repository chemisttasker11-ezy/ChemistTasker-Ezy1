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
};

const CARD_COPY = [
  {
    key: 'draftTotal',
    title: 'Total Draft Amount',
    accent: '#6366F1',
  },
  {
    key: 'pendingTotal',
    title: 'Total Pending Amount',
    accent: '#F59E0B',
  },
  {
    key: 'revenueTotal',
    title: 'Revenue T.Y.',
    accent: '#10B981',
  },
] as const;

export default function InvoiceStatsCards({
  invoices,
  timeframe,
  onTimeframeChange,
}: Props) {
  const filtered = filterInvoicesByTimeframe(invoices, timeframe);
  const stats = buildInvoiceStats(filtered);
  const timeframeLabel =
    INVOICE_TIMEFRAME_OPTIONS.find((option) => option.value === timeframe)?.label ?? 'This Year';

  return (
    <Stack spacing={2.5} mb={3}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Invoice Snapshot
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Totals update from the selected time frame.
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
                  px: 2,
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
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(3, minmax(0, 1fr))',
          },
        }}
      >
        {CARD_COPY.map((card) => (
          <Paper
            key={card.key}
            elevation={0}
            sx={{
              p: 2.25,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(246,248,252,0.94) 100%)',
            }}
          >
            <Typography variant="body2" color="text.secondary" mb={1}>
              {card.title}
            </Typography>
            <Typography variant="h5" fontWeight={800} color={card.accent}>
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
