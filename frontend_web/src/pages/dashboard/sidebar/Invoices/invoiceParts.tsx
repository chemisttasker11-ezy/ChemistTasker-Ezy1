// Shared presentation for the invoice detail and invoice editor pages. Pure UI: the pages own data and maths.
import type { ReactNode } from 'react';
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import IconTile, { type Tone } from '../../../../components/ui/IconTile';
import { Pill, type ShiftTone } from '../../shiftCenter/ShiftCentreParts';

export const CATEGORY_CHOICES = [
  { code: 'ProfessionalServices', label: 'Professional services' },
  { code: 'Superannuation', label: 'Superannuation' },
  { code: 'Transportation', label: 'Transportation' },
  { code: 'Accommodation', label: 'Accommodation' },
  { code: 'Miscellaneous', label: 'Miscellaneous reimbursements' },
];
export const UNIT_CHOICES = ['Hours', 'Lump Sum'];
export const categoryLabel = (code?: string) => CATEGORY_CHOICES.find((c) => c.code === code)?.label || code || 'Item';

export const money = (value: unknown) =>
  Number(value || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });

export const formatDay = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Draft / Sent / Paid, plus Overdue when a sent invoice is past its due date. */
export function invoiceStatus(status?: string | null, dueDate?: string | null): { label: string; tone: ShiftTone; hint: string } {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return { label: 'Paid', tone: 'green', hint: 'Payment recorded' };
  if (s === 'sent' || s === 'pending') {
    const due = dueDate ? new Date(`${String(dueDate).slice(0, 10)}T23:59:59`) : null;
    if (due && !Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return { label: 'Overdue', tone: 'red', hint: 'Past its due date and not marked paid' };
    return { label: 'Sent', tone: 'amber', hint: 'Waiting for payment' };
  }
  return { label: 'Draft', tone: 'neutral', hint: 'Not sent yet' };
}

export function StatusPill({ status, dueDate }: { status?: string | null; dueDate?: string | null }) {
  const s = invoiceStatus(status, dueDate);
  return <Pill label={s.label} tone={s.tone} title={s.hint} />;
}

export function InvoiceSection({
  icon,
  tone,
  title,
  action,
  children,
}: {
  icon?: ReactNode;
  tone?: Tone;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label={title}
      sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 'var(--ct-card-radius)', borderColor: 'var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)', boxShadow: 'none', minWidth: 0 }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
          {icon ? <IconTile icon={icon} tone={tone ?? 'violet'} size={36} /> : null}
          <Typography component="h2" sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 16.5 }}>{title}</Typography>
        </Stack>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

/** Label + value pairs for read-only views. */
export function Facts({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: number }) {
  const shown = items.filter((i) => i.value !== undefined && i.value !== null && i.value !== '');
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${columns}, minmax(0, 1fr))` } }}>
      {shown.map((i) => (
        <Box key={i.label} sx={{ minWidth: 0 }}>
          <Typography component="dt" sx={{ color: 'var(--ct-text-secondary)', fontSize: 12.5 }}>{i.label}</Typography>
          <Typography component="dd" sx={{ m: 0, color: 'var(--ct-text-primary)', fontSize: 14.5, fontWeight: 500, overflowWrap: 'anywhere' }}>{i.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export type Totals = {
  subtotal: number;
  transportation: number;
  accommodation: number;
  gst: number;
  superRate: number;
  superAmount: number;
  grandTotal: number;
};

export function TotalsBreakdown({ totals, gstRegistered }: { totals: Totals; gstRegistered: boolean }) {
  const rows: [string, number][] = [
    ['Subtotal', totals.subtotal],
    ['Transportation', totals.transportation],
    ['Accommodation', totals.accommodation],
    [gstRegistered ? 'GST (10%)' : 'GST (not registered)', totals.gst],
    [`Super (${totals.superRate}%)`, totals.superAmount],
  ];
  return (
    <Box>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 0.75, columnGap: 2 }}>
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: 'contents' }}>
            <Typography component="dt" sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>{label}</Typography>
            <Typography component="dd" sx={{ m: 0, color: 'var(--ct-text-primary)', fontSize: 14, fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(value)}</Typography>
          </Box>
        ))}
      </Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid var(--ct-border-color)' }}>
        <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 15 }}>Total</Typography>
        <Typography sx={{ color: 'var(--ct-accent-strong)', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 28, fontVariantNumeric: 'tabular-nums' }}>{money(totals.grandTotal)}</Typography>
      </Stack>
    </Box>
  );
}

/* ---------- line items ---------- */

export type LineItemRow = {
  id?: string | number;
  category_code?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  unit?: string;
  quantity?: number;
  unit_price?: number;
  discount?: number;
  total?: number;
  description?: string;
};

type Field = 'category_code' | 'date' | 'start_time' | 'end_time' | 'unit' | 'quantity' | 'unit_price';

const inputSx = { '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: 'var(--ct-surface-bg)' }, '& .MuiOutlinedInput-input': { px: 1.25, fontVariantNumeric: 'tabular-nums' } } as const;
const toTime = (raw: string) => (raw ? `${raw}:00` : '00:00:00');


/** Editable line items: a table on desktop, one card per item on phones. */
export function LineItemsEditor({
  items,
  onChange,
  onAdd,
  onRemove,
  canEdit = true,
}: {
  items: LineItemRow[];
  onChange: (idx: number, field: Field, value: string | number) => void;
  onAdd?: () => void;
  onRemove?: (idx: number) => void;
  canEdit?: boolean;
}) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up(1400));

  const fields = (li: LineItemRow, idx: number) => {
    const isSuper = li.category_code === 'Superannuation';
    const timed = li.category_code === 'ProfessionalServices';
    return {
      category: (
        <TextField select size="small" fullWidth label={desktop ? undefined : 'Category'} value={li.category_code || ''} onChange={(e) => onChange(idx, 'category_code', e.target.value)} disabled={!canEdit || isSuper} sx={inputSx} inputProps={{ 'aria-label': 'Category' }}>
          {CATEGORY_CHOICES.map((c) => <MenuItem key={c.code} value={c.code}>{c.label}</MenuItem>)}
        </TextField>
      ),
      date: timed ? <TextField size="small" type="date" fullWidth label={desktop ? undefined : 'Date'} InputLabelProps={{ shrink: true }} value={li.date || ''} onChange={(e) => onChange(idx, 'date', e.target.value)} disabled={!canEdit} sx={inputSx} inputProps={{ 'aria-label': 'Date' }} /> : null,
      start: timed ? <TextField size="small" type="time" fullWidth label={desktop ? undefined : 'Start'} InputLabelProps={{ shrink: true }} value={li.start_time?.slice(0, 5) || '00:00'} onChange={(e) => onChange(idx, 'start_time', toTime(e.target.value))} disabled={!canEdit} sx={inputSx} inputProps={{ 'aria-label': 'Start time' }} /> : null,
      end: timed ? <TextField size="small" type="time" fullWidth label={desktop ? undefined : 'End'} InputLabelProps={{ shrink: true }} value={li.end_time?.slice(0, 5) || '00:00'} onChange={(e) => onChange(idx, 'end_time', toTime(e.target.value))} disabled={!canEdit} sx={inputSx} inputProps={{ 'aria-label': 'End time' }} /> : null,
      unit: (
        <TextField select size="small" fullWidth label={desktop ? undefined : 'Unit'} value={li.unit || ''} onChange={(e) => onChange(idx, 'unit', e.target.value)} disabled={!canEdit} sx={inputSx} inputProps={{ 'aria-label': 'Unit' }}>
          {UNIT_CHOICES.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
        </TextField>
      ),
      quantity: (
        <Tooltip title={timed ? 'Paid hours. Start and end are for information, so take out any unpaid break.' : isSuper ? 'Set from the super rate' : ''}>
          <TextField
            size="small"
            type="number"
            fullWidth
            label={desktop ? undefined : 'Quantity'}
            inputProps={{ step: 0.25, min: 0, 'aria-label': 'Quantity' }}
            value={Number(li.quantity ?? 0)}
            onChange={(e) => onChange(idx, 'quantity', +e.target.value)}
            disabled={!canEdit || isSuper}
            sx={inputSx}
          />
        </Tooltip>
      ),
      price: <TextField size="small" type="number" fullWidth label={desktop ? undefined : 'Price ($)'} inputProps={{ step: 0.01, min: 0, 'aria-label': 'Price' }} value={li.unit_price ?? 0} onChange={(e) => onChange(idx, 'unit_price', +e.target.value)} disabled={!canEdit || isSuper} sx={inputSx} />,
      remove:
        canEdit && onRemove ? (
          <Tooltip title="Remove line">
            <IconButton aria-label={`Remove ${categoryLabel(li.category_code)} line`} onClick={() => onRemove(idx)} size="small" sx={{ color: 'var(--ct-text-secondary)', '&:hover': { color: 'error.main' } }}>
              <Trash2 size={17} />
            </IconButton>
          </Tooltip>
        ) : null,
    };
  };

  const addButton =
    canEdit && onAdd ? (
      <Button startIcon={<Plus size={16} />} onClick={onAdd} sx={{ minHeight: 40, alignSelf: 'flex-start' }}>
        Add line item
      </Button>
    ) : null;

  if (items.length === 0) {
    return (
      <Stack spacing={1.5} alignItems="flex-start">
        <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>No line items yet. Add hours, travel, accommodation or other costs.</Typography>
        {addButton}
      </Stack>
    );
  }

  if (desktop) {
    const cols = 'minmax(160px, 1.3fr) 150px 264px 106px 80px 96px 92px 36px';
    const head = ['Category', 'Date', 'Time', 'Unit', 'Quantity', 'Price', 'Amount', ''];
    return (
      <Stack spacing={1.5}>
        <Box role="table" aria-label="Line items" sx={{ overflowX: 'auto' }}>
          <Box role="row" sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1, px: 1, py: 1, borderRadius: '10px', bgcolor: 'var(--ct-subtle-bg)', minWidth: 1040 }}>
            {head.map((h, i) => (
              <Typography key={i} role="columnheader" sx={{ color: 'var(--ct-text-secondary)', fontSize: 12.5, fontWeight: 600, textAlign: i === 6 ? 'right' : 'left' }}>{h}</Typography>
            ))}
          </Box>
          {items.map((li, idx) => {
            const f = fields(li, idx);
            return (
              <Box role="row" key={li.id ?? idx} sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1, alignItems: 'center', px: 1, py: 1, borderBottom: '1px solid var(--ct-border-color)', minWidth: 1040 }}>
                <Box role="cell">{f.category}</Box>
                <Box role="cell">{f.date}</Box>
                <Stack role="cell" direction="row" spacing={0.75}>{f.start}{f.end}</Stack>
                <Box role="cell">{f.unit}</Box>
                <Box role="cell">{f.quantity}</Box>
                <Box role="cell">{f.price}</Box>
                <Box role="cell" sx={{ textAlign: 'right' }}>
                  <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{money(li.total)}</Typography>
                </Box>
                <Box role="cell" sx={{ textAlign: 'right' }}>{f.remove}</Box>
              </Box>
            );
          })}
        </Box>
        {addButton}
      </Stack>
    );
  }

  return (
    <Stack spacing={1.25}>
      <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      {items.map((li, idx) => {
        const f = fields(li, idx);
        return (
          <Box key={li.id ?? idx} sx={{ p: 1.5, borderRadius: '14px', border: '1px solid var(--ct-border-color)' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
              <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 14.5 }}>{categoryLabel(li.category_code)}</Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(li.total)}</Typography>
                {f.remove}
              </Stack>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
              <Box sx={{ gridColumn: '1 / -1' }}>{f.category}</Box>
              {f.date ? <Box sx={{ gridColumn: '1 / -1' }}>{f.date}</Box> : null}
              {f.start}
              {f.end}
              {f.unit}
              {f.quantity}
              <Box sx={{ gridColumn: '1 / -1' }}>{f.price}</Box>
            </Box>
          </Box>
        );
      })}
      </Box>
      {addButton}
    </Stack>
  );
}

/** Read-only line items for the invoice recipient. */
export function LineItemsReadOnly({ items }: { items: LineItemRow[] }) {
  if (!items.length) return <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 14 }}>This invoice has no line items.</Typography>;
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Line items">
      {items.map((li, idx) => {
        const timed = li.category_code === 'ProfessionalServices' && li.date;
        const when = timed ? `${formatDay(li.date)} · ${li.start_time?.slice(0, 5) || ''}–${li.end_time?.slice(0, 5) || ''}` : '';
        const qty = li.unit === 'Hours' ? `${Number(li.quantity || 0).toFixed(2)} h × ${money(li.unit_price)}` : li.unit === 'Lump Sum' ? `Lump sum ${money(li.unit_price)}` : '';
        return (
          <Stack
            component="li"
            key={li.id ?? idx}
            direction="row"
            spacing={2}
            justifyContent="space-between"
            alignItems="flex-start"
            sx={{ py: 1.5, borderTop: idx ? '1px solid var(--ct-border-color)' : 'none' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 14.5 }}>{categoryLabel(li.category_code)}</Typography>
              <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 13.5 }}>
                {[when, qty].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 600, fontSize: 14.5, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{money(li.total)}</Typography>
          </Stack>
        );
      })}
    </Box>
  );
}
