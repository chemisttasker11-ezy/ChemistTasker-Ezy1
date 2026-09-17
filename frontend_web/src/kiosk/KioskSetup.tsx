import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Divider, Paper, Stack, TextField, ThemeProvider, Typography, createTheme } from '@mui/material';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { QRCodeSVG } from 'qrcode.react';
import { pairDesktopKiosk, type DesktopKioskStatus } from './desktopBridge';
import { API_BASE_URL } from '../constants/api';

const setupTheme = createTheme({
  palette: { mode: 'light', primary: { main: '#5222B8' }, text: { primary: '#06214A', secondary: '#46566C' }, background: { default: '#F5F8FC', paper: '#FFFFFF' } },
  typography: { fontFamily: '"Segoe UI", Arial, sans-serif', button: { textTransform: 'none', fontWeight: 600 } },
  shape: { borderRadius: 12 },
  components: { MuiButton: { styleOverrides: { root: { minHeight: 48 }, contained: { boxShadow: 'none' } } }, MuiTextField: { defaultProps: { fullWidth: true, variant: 'outlined' } } },
});

export default function KioskSetup({ onPaired, initialError }: { onPaired: (status: DesktopKioskStatus) => void; initialError: string | null }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('Front counter');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paired, setPaired] = useState<DesktopKioskStatus | null>(null);
  const link = `frontendmobile://kiosk-link?source=kiosk&device_name=${encodeURIComponent(name.trim() || 'Front counter')}`;
  const valid = /^\d{6}$/.test(code) && /^\d{6}$/.test(pin) && pin === confirm && !!name.trim();
  const submit = async () => {
    if (!valid) return;
    setBusy(true); setError(null);
    try { setPaired(await pairDesktopKiosk({ pairingCode: code, deviceName: name.trim(), dashboardPin: pin, apiBaseUrl: API_BASE_URL, appVersion: '0.1.0' })); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  return <ThemeProvider theme={setupTheme}><Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', color: 'text.primary', p: { xs: 2, md: 5 }, display: 'grid', placeItems: 'center' }}>
    <Box sx={{ width: '100%', maxWidth: 1040 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}><StorefrontOutlined color="primary" /><Typography fontWeight={750}>ChemistTasker <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}> / Attendance terminal</Box></Typography></Stack>
      {paired ? <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}>
        <Typography variant="h4" fontWeight={700}>Terminal connected</Typography>
        <Typography variant="h6" sx={{ mt: 2 }}>{paired.pharmacy_name}</Typography>
        <Typography color="text.secondary" sx={{ my: 2 }}>{name} will record attendance for this pharmacy.</Typography>
        <Button variant="contained" onClick={() => onPaired(paired)}>Open attendance terminal</Button>
      </Paper> : <Paper variant="outlined" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' }, overflow: 'hidden', borderColor: '#D6DEEA' }}>
        <Stack spacing={2.5} sx={{ p: { xs: 3, md: 4 }, bgcolor: '#EEF2F8' }}>
          <Typography variant="h4" sx={{ fontWeight: 750, letterSpacing: '-0.03em' }}>Set up your pharmacy terminal</Typography>
          <Typography color="text.secondary">One terminal. One pharmacy. Your team can record attendance here, even during an outage after initial setup.</Typography>
          <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 2, alignSelf: 'flex-start' }}><QRCodeSVG value={link} size={164} title="Open terminal linking in the ChemistTasker mobile app" /></Box>
          <Typography fontWeight={700}>1. Scan with the owner's phone</Typography>
          <Typography color="text.secondary">Open the link in ChemistTasker, choose the pharmacy, and tap “Confirm pharmacy and create code”.</Typography>
          <Typography fontWeight={700}>2. Enter the code here</Typography>
          <Typography color="text.secondary">The code lasts 15 minutes and connects only one terminal. The phone must use the same ChemistTasker backend as this computer.</Typography>
        </Stack>
        <Box component="form" onSubmit={e => { e.preventDefault(); void submit(); }} sx={{ p: { xs: 3, md: 4 } }}>
          <Stack spacing={2.5}>
            <Typography variant="h5" fontWeight={700}>Connect this terminal</Typography>
            {(error || initialError) && <Alert severity="error">{error || initialError}</Alert>}
            <TextField label="Pairing code" helperText="Six digits from the owner's phone" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} autoFocus inputProps={{ inputMode: 'numeric', maxLength: 6, style: { fontSize: 26, letterSpacing: 8, fontWeight: 650 } }} />
            <TextField label="Terminal name" value={name} onChange={e => setName(e.target.value)} inputProps={{ maxLength: 100 }} disabled={busy} helperText="For example, Front counter or Staff room" />
            <Divider />
            <Stack direction="row" spacing={1} alignItems="center"><LockOutlined fontSize="small" /><Typography fontWeight={650}>Protect manager access</Typography></Stack>
            <Typography variant="body2" color="text.secondary">Choose a six-digit dashboard PIN. Staff use their own attendance PINs.</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Dashboard PIN" type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} inputProps={{ inputMode: 'numeric', maxLength: 6 }} helperText="Exactly 6 digits" />
              <TextField label="Confirm PIN" type="password" value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} inputProps={{ inputMode: 'numeric', maxLength: 6 }} error={!!confirm && pin !== confirm} helperText={confirm && pin !== confirm ? 'PINs do not match' : 'Enter the same PIN'} />
            </Stack>
            <Button type="submit" variant="contained" disabled={!valid || busy} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>{busy ? 'Connecting…' : 'Connect terminal'}</Button>
            {!valid && <Typography variant="caption" color="text.secondary">Enter the pairing code and matching six-digit dashboard PINs to continue.</Typography>}
          </Stack>
        </Box>
      </Paper>}
    </Box>
  </Box></ThemeProvider>;
}
