import { useMemo, type ReactNode } from 'react';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';

/**
 * Compact accounting surfaces, scoped so other dashboards keep their theme.
 * Only density changes here (small fields, tighter table rows, aligned figures); shapes, colours and type
 * come from the shared dashboard theme so finance looks like the rest of the product.
 */
export default function FinanceTheme({ children }: { children: ReactNode }) {
  const parent = useTheme();
  const theme = useMemo(() => createTheme(parent, {
    components: {
      MuiButton: { styleOverrides: { root: { minHeight: 40, whiteSpace: 'nowrap' } } },
      MuiTextField: { defaultProps: { size: 'small', variant: 'outlined', fullWidth: true, InputLabelProps: { shrink: true } } },
      MuiOutlinedInput: { styleOverrides: { root: { fontSize: 14 }, input: { paddingTop: 10, paddingBottom: 10 } } },
      MuiTableCell: { styleOverrides: { root: { padding: '13px 16px', fontVariantNumeric: 'tabular-nums' }, head: { whiteSpace: 'nowrap' } } },
    },
  }), [parent]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
