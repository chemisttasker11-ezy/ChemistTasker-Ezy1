import { Button, Stack, Typography } from '@mui/material';
import AuthLayout from '../layouts/AuthLayout';

/** Recovery stays in the entry bundle so a failed route chunk can still render it. */
export default function RouteErrorState() {
  return (
    <AuthLayout title="This page couldn’t load" showTitle={false}>
      <Stack component="main" role="alert" spacing={3} alignItems="center" textAlign="center">
        <Typography component="h1" variant="h4" sx={{ textWrap: 'balance', overflowWrap: 'anywhere' }}>
          This page couldn’t load
        </Typography>
        <Typography color="text.secondary">
          Check your connection, then reload this page to try again. Unsaved edits may be lost.
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' } }}>
          Reload page
        </Button>
      </Stack>
    </AuthLayout>
  );
}
