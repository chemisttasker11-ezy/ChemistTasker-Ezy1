import type { ReactNode } from 'react';
import { ThemeProvider, type Theme } from '@mui/material/styles';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

/** Merges plain objects key by key; everything else (functions, arrays, class instances) is replaced. */
function deepmerge<T>(target: T, source: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  Object.entries(source).forEach(([key, value]) => {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepmerge(out[key], value) : value;
  });
  return out as T;
}

/**
 * Compact accounting surfaces, scoped so other dashboards keep their theme.
 * Only density changes here (small fields, tighter table rows, aligned figures); shapes, colours and type
 * come from the shared dashboard theme so finance looks like the rest of the product.
 */
const densityComponents = {
  MuiButton: { styleOverrides: { root: { minHeight: 40, whiteSpace: 'nowrap' } } },
  MuiTextField: { defaultProps: { size: 'small', variant: 'outlined', fullWidth: true, InputLabelProps: { shrink: true } } },
  MuiOutlinedInput: { styleOverrides: { root: { fontSize: 14 }, input: { paddingTop: 10, paddingBottom: 10 } } },
  MuiTableCell: { styleOverrides: { root: { padding: '13px 16px', fontVariantNumeric: 'tabular-nums' }, head: { whiteSpace: 'nowrap' } } },
};

// A function theme receives the dashboard theme as-is. Handing ThemeProvider a whole theme object made
// MUI re-derive the palette from defaults (blue #1976D2, orange #ED6C02), which failed contrast.
const withFinanceDensity = (outer: Theme): Theme => deepmerge(outer, { components: densityComponents });

export default function FinanceTheme({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={withFinanceDensity}>{children}</ThemeProvider>;
}
