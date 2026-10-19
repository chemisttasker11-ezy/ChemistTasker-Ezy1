import { ahpraStatusMessage } from '@chemisttasker/shared-core';
import { Alert, Box, Button, Typography } from '@mui/material';
import { useAhpra } from '../contexts/AhpraContext';

export default function AhpraStatus() {
  const { summary, error, busy, seconds, recheck } = useAhpra();
  if (!summary) return null;
  const message = ahpraStatusMessage(summary);
  const label = summary.registration_status || ({ ok: 'Verified', pending: 'Check pending', suspended: 'Account paused', not_found: 'Not found' } as const)[summary.state];
  return <Box sx={{ my: 2 }}>
    <Alert severity={summary.state === 'suspended' || summary.state === 'not_found' ? 'error' : 'info'}>
      <Typography fontWeight={600}>AHPRA: {label}</Typography>
      {message && <Typography>{message}</Typography>}
    </Alert>
    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    <Button variant="outlined" sx={{ mt: 1 }} disabled={busy || seconds > 0} onClick={() => void recheck()}>
      {busy ? 'Queuing check...' : seconds > 0 ? `Re-check in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Re-check'}
    </Button>
  </Box>;
}
