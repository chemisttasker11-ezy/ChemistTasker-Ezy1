export type InvoiceTimeframe = '30d' | '90d' | 'this_year' | 'all';

export type InvoiceSummaryItem = {
  status?: string | null;
  total?: number | string | null;
  total_amount?: number | string | null;
  invoice_date?: string | null;
  created_at?: string | null;
};

export const INVOICE_TIMEFRAMES: Array<{ value: InvoiceTimeframe; label: string }> = [
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'this_year', label: 'T.Y.' },
  { value: 'all', label: 'All' },
];

const getInvoiceDate = (invoice: InvoiceSummaryItem) => {
  const source = invoice.invoice_date || invoice.created_at;
  if (!source) return null;
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeStatus = (status?: string | null) => String(status || '').trim().toLowerCase();

export const getInvoiceAmount = (invoice: InvoiceSummaryItem) => {
  const raw = invoice.total ?? invoice.total_amount ?? 0;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
};

export const formatInvoiceCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const filterInvoicesByTimeframe = <T extends InvoiceSummaryItem>(
  invoices: T[],
  timeframe: InvoiceTimeframe,
) => {
  if (timeframe === 'all') return invoices;

  const now = new Date();
  const start = new Date(now);

  if (timeframe === 'this_year') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - (timeframe === '30d' ? 30 : 90));
  }

  return invoices.filter((invoice) => {
    const invoiceDate = getInvoiceDate(invoice);
    return invoiceDate ? invoiceDate >= start : false;
  });
};

export const buildInvoiceStats = (invoices: InvoiceSummaryItem[]) => ({
  draftTotal: invoices
    .filter((invoice) => normalizeStatus(invoice.status) === 'draft')
    .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0),
  pendingTotal: invoices
    .filter((invoice) => ['sent', 'pending'].includes(normalizeStatus(invoice.status)))
    .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0),
  revenueTotal: invoices
    .filter((invoice) => normalizeStatus(invoice.status) === 'paid')
    .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0),
});
