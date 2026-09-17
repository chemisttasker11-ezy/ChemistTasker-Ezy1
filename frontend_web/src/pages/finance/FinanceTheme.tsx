import { useMemo, type ReactNode } from 'react';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';

/** Compact accounting surfaces, scoped so other dashboards keep their theme. */
export default function FinanceTheme({ children }: { children: ReactNode }) {
  const parent = useTheme();
  const theme = useMemo(() => createTheme(parent, {
    shape: { borderRadius: 6 },
    typography: { h4: { fontSize: '1.6rem', fontWeight: 700 }, h6: { fontSize: '1.05rem', fontWeight: 650 }, button: { textTransform: 'none', fontWeight: 600 } },
    components: {
      MuiPaper: { styleOverrides: { rounded: { borderRadius: 8 } } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 6, minHeight: 40, whiteSpace: 'nowrap' } } },
      MuiTextField: { defaultProps: { size: 'small', variant: 'outlined', fullWidth: true, InputLabelProps: { shrink: true } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 5, fontSize: 14 }, input: { paddingTop: 10, paddingBottom: 10 } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', minHeight: 48, fontSize: 14, padding: '12px 18px' } } },
      MuiTableCell: { styleOverrides: { root: { padding: '14px 16px', fontSize: 14, fontVariantNumeric: 'tabular-nums' }, head: { fontWeight: 650, backgroundColor: parent.palette.action.hover, whiteSpace: 'nowrap' } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 10 } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 5 } } },
    },
  }), [parent]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
