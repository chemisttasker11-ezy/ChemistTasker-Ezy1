import { ahpraStatusMessage } from '@chemisttasker/shared-core';
import { Alert, Box, Button, Typography } from '@mui/material';
import { useAhpra } from '../contexts/AhpraContext';

export interface AhpraStatusProps {
  submitLabel?: string;
}

export default function AhpraStatus({ submitLabel }: AhpraStatusProps = {}) {
  const { summary, error, busy, seconds, recheck } = useAhpra();
  if (!summary) return null;
  const message = ahpraStatusMessage(summary);
  const label = summary.registration_status || ({ ok: 'Verified', pending: 'Check pending', suspended: summary.frozen ? 'Account paused' : 'Registration suspended', not_found: 'Not found', unreadable: 'Not verified' } as const)[summary.state];
  const attemptsExhausted = summary.state === 'unreadable' && summary.attempts >= 3;
  const isBlocked = summary.state === 'suspended' || summary.state === 'not_found';

  let hint = '';
  if (summary.state === 'not_found') {
    hint = submitLabel
      ? `Fix the number above, press "${submitLabel}", then Re-check.`
      : 'Fix the number above, submit it, then Re-check.';
  } else if (summary.state === 'suspended') {
    hint = submitLabel
      ? `Contact AHPRA to resolve status, or update your number above and press "${submitLabel}".`
      : 'Contact AHPRA to resolve status, or update your number and submit.';
  }

  return (
    <Box sx={{ my: 2 }}>
      <Alert
        severity={isBlocked ? 'error' : 'info'}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          '& .MuiAlert-message': { width: '100%' },
        }}
      >
        <Typography fontWeight={600}>AHPRA: {label}</Typography>
        {message && <Typography variant="body2" sx={{ mt: 0.5 }}>{message}</Typography>}
        {summary.state === 'unreadable' && summary.contact_support && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>Still not working?</Typography>
        )}
        {hint && (
          <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500, color: 'text.primary' }}>
            {hint}
          </Typography>
        )}
        <Box
          sx={{
            mt: 1.5,
            pt: 1,
            borderTop: '1px solid',
            borderColor: isBlocked ? 'error.light' : 'info.light',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          {seconds > 0 ? (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: 2,
                py: 1,
                bgcolor: 'rgba(51, 65, 85, 0.08)',
                border: '1px solid',
                borderColor: 'rgba(51, 65, 85, 0.25)',
                borderRadius: 1,
                color: '#334155',
                fontWeight: 600,
                fontSize: '0.875rem',
                minHeight: 44,
                width: { xs: '100%', sm: 'auto' },
                boxSizing: 'border-box',
              }}
            >
              Re-check in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </Box>
          ) : (
            <Button
              variant={isBlocked ? 'contained' : 'outlined'}
              color={isBlocked ? 'primary' : 'inherit'}
              disabled={busy || attemptsExhausted}
              onClick={() => void recheck()}
              sx={{
                minHeight: 44,
                width: { xs: '100%', sm: 'auto' },
                fontWeight: 600,
              }}
            >
              {busy ? 'Queuing check...' : 'Re-check'}
            </Button>
          )}
          {summary.state === 'unreadable' && summary.contact_support && (
            <Button href="/#contact"sx={{ minHeight: 44 }}>Contact us now</Button>
          )}
        </Box>
      </Alert>
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
}
