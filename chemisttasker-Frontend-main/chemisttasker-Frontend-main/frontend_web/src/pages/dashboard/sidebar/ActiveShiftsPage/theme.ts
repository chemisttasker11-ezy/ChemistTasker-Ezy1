import { createTheme } from '@mui/material/styles';

// Inject Inter font from Google Fonts
if (typeof document !== 'undefined') {
    const fontStyle = document.createElement('style');
    fontStyle.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    `;
    document.head.appendChild(fontStyle);
}

export const customTheme = createTheme({
    palette: {
        primary: { main: '#6D28D9', light: '#8B5CF6', dark: '#5B21B6' },
        secondary: { main: '#10B981', light: '#6EE7B7', dark: '#047857' },
        success: { main: '#10B981', light: '#E0F2F1', dark: '#047857' },
        error: { main: '#EF4444', light: '#FEE2E2', dark: '#B91C1C' },
        warning: { main: '#F59E0B', light: '#FFFBEB', dark: '#B45309' },
        info: { main: '#0EA5E9', light: '#E0F2FE', dark: '#0284C7' },
        background: { default: '#F9FAFB', paper: '#FFFFFF' },
    },
    typography: { fontFamily: "'Inter', sans-serif" },
    components: {
        MuiButton: {
            styleOverrides: {
                root: { borderRadius: '8px', textTransform: 'none', fontWeight: 600, boxShadow: 'none' },
                containedPrimary: {
                    color: 'white',
                    background: 'linear-gradient(to right, #8B5CF6, #6D28D9)',
                    '&:hover': { background: 'linear-gradient(to right, #A78BFA, #8B5CF6)' },
                },
                containedSecondary: { color: 'white' },
            },
        },
        MuiCard: {
            styleOverrides: { root: { borderRadius: '16px', border: '1px solid #E5E7EB' } },
        },
    },
});
