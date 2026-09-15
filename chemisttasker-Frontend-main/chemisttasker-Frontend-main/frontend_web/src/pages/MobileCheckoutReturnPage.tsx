import { useEffect, useMemo } from 'react';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';

const MOBILE_SCHEME = 'frontendmobile://';

export default function MobileCheckoutReturnPage() {
  const deepLink = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const path = (params.get('path') || '').replace(/^\/+/, '');
    params.delete('path');
    const query = params.toString();
    return `${MOBILE_SCHEME}${path}${query ? `?${query}` : ''}`;
  }, []);

  useEffect(() => {
    if (!deepLink) return;
    window.location.href = deepLink;
  }, [deepLink]);

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper sx={{ p: 4, borderRadius: 4 }}>
        <Stack spacing={2}>
          <Typography variant="h4" fontWeight={800}>
            Returning to the app
          </Typography>
          <Typography color="text.secondary">
            If the ChemistTasker app did not open automatically, use the button below.
          </Typography>
          <Box>
            <Button variant="contained" href={deepLink}>
              Open ChemistTasker
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}
