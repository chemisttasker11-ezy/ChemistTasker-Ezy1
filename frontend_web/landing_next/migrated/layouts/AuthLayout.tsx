import type { ReactNode } from 'react';
import { Box, Container, Paper, Typography } from '@mui/material';

export default function AuthLayout({
  children,
  title,
  maxWidth = 'sm',
  noCard = false,
  showTitle = true,
}: {
  children: ReactNode;
  title: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  noCard?: boolean;
  showTitle?: boolean;
}) {
  if (noCard) {
    return (
      <Container maxWidth={maxWidth} sx={{ py: { xs: 2.5, md: 4 } }}>
        {showTitle && (
          <Typography variant="h4" component="h2" sx={{ mb: 3, textAlign: 'center' }}>
            {title}
          </Typography>
        )}
        {children}
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Box
        className="ct-auth-shell"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(280px,.82fr) minmax(0,1.18fr)' },
          overflow: 'hidden',
          border: '1px solid #E5ECF7',
          borderRadius: { xs: 3, md: 4 },
          bgcolor: '#fff',
          boxShadow: '0 24px 64px rgba(6,18,58,.09)',
        }}
      >
        <Box
          component="aside"
          sx={{
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: 480,
            p: { md: 3.5, lg: 5 },
            color: '#fff',
            background:
              'linear-gradient(145deg,#061B54 0%,#361E82 67%,#60146D 100%)',
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FFFFFF' }}>
              ChemistTasker
            </Typography>
            <Typography variant="h3" sx={{ mt: 2, color: '#fff', maxWidth: 360 }}>
              Your pharmacy workspace, ready when you are.
            </Typography>
            <Typography sx={{ mt: 2, color: '#FFFFFF', lineHeight: 1.75, maxWidth: 390 }}>
              Sign in to manage shifts, people and your pharmacy work.
            </Typography>
          </Box>

        </Box>

        <Box sx={{ p: { xs: 2.25, sm: 3.5, md: 5.5 }, minWidth: 0 }}>
          {showTitle && (
            <Box sx={{ mb: 3.5 }}>
              <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 30, md: 36 }, mb: 1 }}>
                {title}
              </Typography>
            </Box>
          )}
          <Paper elevation={0} sx={{ p: 0, border: 0, boxShadow: 'none!important', bgcolor: 'transparent' }}>
            {children}
          </Paper>
        </Box>
      </Box>
    </Container>
  );
}
