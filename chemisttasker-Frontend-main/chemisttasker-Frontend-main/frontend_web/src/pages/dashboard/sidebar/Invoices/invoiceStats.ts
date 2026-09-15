export type InvoiceTimeframe = '30d' | '90d' | 'this_year' | 'all';

export type InvoiceSummaryItem = {
  status?: string | null;
  total?: number | string | null;
  total_amount?: number | string | null;
  invoice_date?: string | null;
  created_at?: string | null;
};

export const INVOICE_TIMEFRAME_OPTIONS: Array<{
  value: InvoiceTimeframe;
  label: string;
}> = [
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

const getInvoiceDate = (invoice: InvoiceSummaryItem) => {
  const source = invoice.invoice_date || invoice.created_at;
  if (!source) return null;
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeStatus = (status?: string | null) => String(status || '').trim().toLowerCase();

export const isPendingInvoiceStatus = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  return normalized === 'sent' || normalized === 'pending';
};

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
    const days = timeframe === '30d' ? 30 : 90;
    start.setDate(start.getDate() - days);
  }

  return invoices.filter((invoice) => {
    const invoiceDate = getInvoiceDate(invoice);
    return invoiceDate ? invoiceDate >= start : false;
  });
};

export const buildInvoiceStats = (invoices: InvoiceSummaryItem[]) => {
  const draftTotal = invoices
    .filter((invoice) => normalizeStatus(invoice.status) === 'draft')
    .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0);

  const pendingTotal = invoices
    .filter((invoice) => isPendingInvoiceStatus(invoice.status))
    .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0);

  const revenueTotal = invoices
    .filter((invoice) => normalizeStatus(invoice.status) === 'paid')
    .reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0);

  return {
    draftTotal,
    pendingTotal,
    revenueTotal,
  };
};
