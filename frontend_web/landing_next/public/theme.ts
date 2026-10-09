import { createTheme } from '@mui/material/styles';

export const publicTheme = createTheme({
  palette: {
    primary: { main: '#5222B8', dark: '#40168F', light: '#EFE7FF' },
    secondary: { main: '#D600C8', dark: '#A60B9C', light: '#FDE7F5' },
    info: { main: '#008DDB', light: '#E7F0FF' },
    success: { main: '#138A5B' },
    warning: { main: '#B86B00' },
    error: { main: '#C9364A' },
    background: { default: '#F7F9FC', paper: '#FFFFFF' },
    text: { primary: '#06123A', secondary: '#5E6B8D' },
    divider: '#E5ECF7',
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'Inter, sans-serif',
    h1: { fontFamily: 'Outfit, sans-serif', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1.05 },
    h2: { fontFamily: 'Outfit, sans-serif', fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.08 },
    h3: { fontFamily: 'Outfit, sans-serif', fontWeight: 600, letterSpacing: '-0.03em' },
    h4: { fontFamily: 'Outfit, sans-serif', fontWeight: 600, letterSpacing: '-0.025em' },
    h5: { fontFamily: 'Outfit, sans-serif', fontWeight: 600 },
    h6: { fontFamily: 'Outfit, sans-serif', fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 800 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 12,
          minHeight: 44,
          paddingInline: 20,
          boxShadow: 'none',
          '&:focus-visible': { outline: '3px solid #00BDD2', outlineOffset: 3 },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderColor: '#E5ECF7',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #E5ECF7',
          boxShadow: '0 12px 34px rgba(6, 18, 58, 0.06)',
          borderRadius: 22,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, fontWeight: 700, backgroundColor: '#F2EDFB', color: '#5222B8' },
        icon: { color: 'inherit' },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          background: '#FFFFFF',
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 2 },
        },
      },
    },
    MuiAlert: { styleOverrides: { root: { borderRadius: 14 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 22 } } },
    MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700 } } },
  },
});
