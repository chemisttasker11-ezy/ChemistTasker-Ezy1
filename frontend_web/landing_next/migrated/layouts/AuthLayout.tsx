import type { ReactNode } from 'react';
import { Box, Container, Paper, Stack, Typography } from '@mui/material';
import { CheckCircleOutline, LockOutlined, WorkOutline } from '@mui/icons-material';

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
            justifyContent: 'space-between',
            minHeight: 560,
            p: 5,
            color: '#fff',
            background:
              'radial-gradient(circle at 80% 20%, rgba(0,189,210,.28), transparent 34%), linear-gradient(145deg,#061B54 0%,#5222B8 60%,#B50BA8 100%)',
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .74 }}>
              ChemistTasker
            </Typography>
            <Typography variant="h3" sx={{ mt: 2, color: '#fff', maxWidth: 360 }}>
              One account. The right pharmacy workspace when you need it.
            </Typography>
            <Typography sx={{ mt: 2, color: 'rgba(255,255,255,.82)', lineHeight: 1.75, maxWidth: 390 }}>
              Sign in, create an account or restore access without losing the task that brought you here.
            </Typography>
          </Box>

          <Stack spacing={2.2}>
            {[
              [<WorkOutline key="work" />, 'Public shifts and talent stay easy to explore.'],
              [<CheckCircleOutline key="role" />, 'Your starting role does not prevent future memberships or admin workspaces.'],
              [<LockOutlined key="lock" />, 'Verification and permissions remain tied to the current account and workspace rules.'],
            ].map(([icon, label]) => (
              <Stack key={String(label)} direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={{ mt: .15, opacity: .9, '& svg': { fontSize: 20 } }}>{icon}</Box>
                <Typography sx={{ color: 'rgba(255,255,255,.88)', fontSize: 14, lineHeight: 1.55 }}>{label}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Box sx={{ p: { xs: 2.25, sm: 3.5, md: 5.5 }, minWidth: 0 }}>
          {showTitle && (
            <Box sx={{ mb: 3.5 }}>
              <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 30, md: 36 }, mb: 1 }}>
                {title}
              </Typography>
              <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
                Complete the details below to continue.
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
