import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

import KioskPage from '../pages/attendance/KioskPage';
import '../index.css';

const theme = createTheme({
  palette: { mode: 'dark', primary: { main: '#67D8E8' }, background: { default: '#0F172A', paper: '#1E293B' }, text: { primary: '#F8FAFC', secondary: '#CBD5E1' } },
  typography: { fontFamily: '"Segoe UI", Arial, sans-serif', button: { textTransform: 'none', fontWeight: 650 } },
  components: { MuiButton: { styleOverrides: { root: { minHeight: 48, '&.Mui-disabled': { color: '#A7B4C7', backgroundColor: '#263449' } } } }, MuiInputLabel: { styleOverrides: { root: { color: '#CBD5E1' } } } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}><CssBaseline /><KioskPage /></ThemeProvider>
  </React.StrictMode>,
);
