import { ReactNode, useMemo } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  GlobalStyles,
  ThemeProvider,
  CssBaseline,
  createTheme,
} from '@mui/material';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  noCard?: boolean;
  showTitle?: boolean;
}

export default function AuthLayout({
  children,
  title,
  maxWidth = 'sm',
  noCard = false,
  showTitle = true,
}: AuthLayoutProps) {
  // Local, hard-light theme ONLY for auth pages (doesn't affect dashboards)
  const authTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'light',
          background: { default: '#F7F9FC', paper: '#FFFFFF' },
          text: { primary: '#06123A', secondary: '#5E6B8D' },
          divider: '#E5ECF7',
          primary: { main: '#5222B8', dark: '#40168F' },
          secondary: { main: '#D600C8' },
        },
        shape: { borderRadius: 12 },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              ':root': { colorScheme: 'light' },
              html: { backgroundColor: '#F7F9FC' },
              body: { backgroundColor: '#F7F9FC', color: '#06123A' },
              '#root': { backgroundColor: '#F7F9FC' },
            },
          },
          MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
              root: {
                border: '1px solid #E5ECF7',
                backgroundImage: 'none',
                borderRadius: 18,
                boxShadow: '0 14px 42px rgba(6,18,58,.07)',
              },
            },
          },
        },
        typography: {
          fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
          h1: { fontFamily: 'Outfit, Inter, sans-serif', fontWeight: 600 },
          h2: { fontFamily: 'Outfit, Inter, sans-serif', fontWeight: 600 },
          h3: { fontFamily: 'Outfit, Inter, sans-serif', fontWeight: 600 },
          h4: { fontFamily: 'Outfit, Inter, sans-serif', fontWeight: 600 },
          h5: { fontFamily: 'Outfit, Inter, sans-serif', fontWeight: 600 },
          h6: { fontFamily: 'Outfit, Inter, sans-serif', fontWeight: 600 },
        },
      }),
    []
  );

  return (
    <ThemeProvider theme={authTheme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          'html, body, #root': {
            height: '100%',
            width: '100%',
            overflow: 'auto',
          },
        }}
      />

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          minHeight: '100vh',
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: { xs: 4, md: 6 },
          px: { xs: 1, sm: 2 },
          background: 'radial-gradient(ellipse at 5% 15%, rgba(0,189,210,.07), transparent 38%), radial-gradient(ellipse at 95% 85%, rgba(109,40,217,.07), transparent 40%), #F7F9FC',
        }}
      >

        <Container maxWidth={maxWidth} sx={{ position: 'relative', zIndex: 2 }}>
          {noCard ? (
            children
          ) : (
            <Paper
              sx={{
                p: { xs: 3, sm: 4 },
                width: '100%',
                bgcolor: '#FFFFFF',
              }}
            >
              {showTitle && (
                <Typography
                  variant="h4"
                  textAlign="center"
                  mb={3}
                  fontWeight={600}
                  sx={{ color: 'text.primary' }}
                >
                  {title}
                </Typography>
              )}
              {children}
            </Paper>
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}
