import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import { mobileAppLinks } from '@/public/routes';

const MOBILE_SCHEME = 'frontendmobile://';

export default function MobileCheckoutReturnPage() {
  const [showFallback, setShowFallback] = useState(false);

  const deepLink = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const path = (params.get('path') || '').replace(/^\/+/, '');
    params.delete('path');
    const query = params.toString();
    return `${MOBILE_SCHEME}${path}${query ? `?${query}` : ''}`;
  }, []);

  const platform = useMemo(() => {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    return 'web';
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowFallback(true), 1800);
    window.location.href = deepLink;
    return () => window.clearTimeout(timer);
  }, [deepLink]);

  const storeHref =
    platform === 'android'
      ? mobileAppLinks.googlePlay
      : platform === 'ios'
        ? mobileAppLinks.appStore
        : null;

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 5, md: 9 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 4.5 }, borderRadius: 4, boxShadow: '0 18px 48px rgba(6,18,58,.07)' }}>
        <Stack spacing={2.25}>
          <Box sx={{ width: 54, height: 54, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: '#EFE7FF', color: '#5222B8' }}>
            <PhoneIphoneIcon />
          </Box>
          <Typography variant="h4">Returning to ChemistTasker</Typography>
          <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
            We are trying to reopen the ChemistTasker app and return you to your workspace.
          </Typography>

          {!showFallback ? (
            <Alert severity="info" role="status">Opening the app…</Alert>
          ) : (
            <>
              <Alert severity="info">
                If the app did not open, choose the next step below. Your checkout return details remain in the handoff link.
              </Alert>
              <Stack spacing={1.25}>
                <Button variant="contained" href={deepLink}>
                  Try opening ChemistTasker again
                </Button>
                {storeHref && (
                  <Button variant="outlined" href={storeHref} target="_blank" rel="noreferrer" endIcon={<OpenInNewIcon />}>
                    {platform === 'android' ? 'Open Google Play' : 'Open the App Store'}
                  </Button>
                )}
                <Button variant="text" href="/dashboard">
                  Continue on the web instead
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
