import { createTheme } from '@mui/material/styles';
import './brand-fonts.css';
import { brandTokens } from './brandTokens';

// Extracted from PostShiftPage; scoped to this workflow, never a global reset.
export function createOwnerWorkflowTheme(mode: 'light' | 'dark') {
  const isDarkMode = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: isDarkMode ? '#C4B5FD' : brandTokens.purple, light: '#DDD6FE', dark: isDarkMode ? '#A78BFA' : '#40168F', contrastText: isDarkMode ? brandTokens.navy : '#FFFFFF' },
      secondary: { main: '#10B981', light: '#6EE7B7', dark: '#047857' },
      background: {
        default: isDarkMode ? '#07111f' : brandTokens.mist,
        paper: isDarkMode ? '#101b2f' : '#FFFFFF',
      },
      text: {
        primary: isDarkMode ? '#F8FAFC' : brandTokens.navy,
        secondary: isDarkMode ? '#CBD5E1' : brandTokens.body,
      },
      divider: isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(15, 23, 42, 0.12)',
    },
    typography: {
      fontFamily: brandTokens.fontBody,
      h4: { fontFamily: brandTokens.fontHeading, fontWeight: 600, fontSize: '2rem', lineHeight: 1.2 },
      h5: { fontFamily: brandTokens.fontHeading, fontWeight: 500, fontSize: '1.5rem', lineHeight: 1.3 },
      h6: { fontFamily: brandTokens.fontHeading, fontWeight: 600 },
      body1: { fontSize: '1rem', lineHeight: 1.6 },
      body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    },
    // sx radius 2/3/4 now resolves to practical 12/18/24px.
    shape: { borderRadius: 6 },
    components: {
      MuiButtonBase: {
        styleOverrides: { root: ({ theme }) => ({
          '&.Mui-focusVisible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 3 },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }) },
      },
      MuiPaper: {
        styleOverrides: {
          root: ({ theme }) => ({
            boxShadow: theme.palette.mode === 'dark'
              ? '0 18px 46px rgba(0,0,0,0.34)'
              : '0 16px 50px rgba(6,33,74,0.04)',
            backgroundImage: 'none',
            borderColor: theme.palette.divider,
          }),
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: 44,
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.78)' : theme.palette.background.paper,
            color: theme.palette.text.primary,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.32)' : 'rgba(15, 23, 42, 0.18)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.primary.light,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.primary.main,
            },
          }),
          input: ({ theme }) => ({
            color: theme.palette.text.primary,
            '&::placeholder': {
              color: theme.palette.text.secondary,
              opacity: 0.85,
            },
          }),
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.text.secondary,
            '&.Mui-focused': {
              color: theme.palette.primary.main,
            },
          }),
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.text.secondary,
          }),
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          label: ({ theme }) => ({
            color: theme.palette.text.primary,
          }),
        },
      },
      MuiSelect: {
        styleOverrides: {
          icon: ({ theme }) => ({
            color: theme.palette.text.secondary,
          }),
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            border: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.text.primary,
            minHeight: 44,
            '&:hover': {
              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(109, 40, 217, 0.18)' : 'rgba(109, 40, 217, 0.08)',
            },
          }),
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            borderColor: theme.palette.divider,
            backgroundImage: 'none',
          }),
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.84)' : '#F8FAFC',
            color: theme.palette.text.primary,
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderColor: theme.palette.divider,
            fontWeight: 500,
            '&.MuiChip-clickable': { minHeight: 44 },
          }),
          outlined: ({ theme }) => ({
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.72)' : '#FFFFFF',
          }),
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.mode === 'dark' ? '#94A3B8' : undefined,
          }),
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: 44,
            color: theme.palette.text.secondary,
            borderColor: theme.palette.divider,
            '&.Mui-selected': {
              color: `${theme.palette.common.white} !important`,
            },
          }),
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.92)' : undefined,
            color: theme.palette.text.primary,
          }),
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 10,
            minHeight: 44,
          },
        },
      },
      MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    },
  });
}
