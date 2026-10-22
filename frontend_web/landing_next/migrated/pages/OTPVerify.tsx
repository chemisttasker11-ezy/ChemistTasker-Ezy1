import React, { useEffect, useState } from 'react';
import { useNavigate, Link as RouterLink, useLocation } from '@/public/navigation';
import {
  TextField,
  Button,
  Box,
  CircularProgress,
  Alert,
  Link,
  Typography,
  Stack,
} from '@mui/material';
import { API_BASE_URL } from '../constants/api';
import { browserVerifyEmailOtp, browserResendEmailOtp } from '@chemisttasker/shared-core';
import AuthLayout from '../layouts/AuthLayout'; // Import the new layout

export default function OTPVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  // --- All logic is unchanged ---
  const emailFromState = location.state?.email || '';
  const [email, setEmail] = useState(emailFromState);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    try {
      await browserVerifyEmailOtp({ baseUrl: API_BASE_URL }, email, otp);
      setStatus('Verification successful! Redirecting...');
      setTimeout(() => navigate('/login', { state: { email } }), 800);

    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err) {
        setError((err as any)?.payload?.detail || 'Verification failed. Please check your code.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setStatus('');
    setLoading(true);
    try {
      await browserResendEmailOtp({ baseUrl: API_BASE_URL }, email);
      setStatus('A new code has been sent to your email.');
      setResendCooldown(30);
    } catch (err) {
      setError('Could not resend code. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
      <AuthLayout title="Email Verification">
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="body1" sx={{ color: '#243451', lineHeight: 1.55 }}>
            Enter the code sent to your email address to continue.
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {status && <Alert severity="success" sx={{ mb: 2 }}>{status}</Alert>}
        <form onSubmit={handleVerify}>
          <Stack spacing={1.5}>
            <TextField fullWidth margin="normal" label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            <TextField fullWidth margin="normal" label="Verification code" value={otp} onChange={e => setOtp(e.target.value)} required autoComplete="one-time-code" inputProps={{ inputMode: 'numeric' }} />
          </Stack>
          <Box mt={3}>
            <Button fullWidth type="submit" variant="contained" disabled={loading} sx={{ py: 1.5 }}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify'}
            </Button>
          </Box>
        </form>
        <Box mt={2} textAlign="center">
          <Link component="button" onClick={handleResend} disabled={loading || resendCooldown > 0} color="primary.main">
            {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend code'}
          </Link>
        </Box>
        <Typography variant="body2" mt={3} textAlign="center">
          Back to{' '}
          <Link component={RouterLink} to="/login" fontWeight="bold" color="#5222B8">
            Login
          </Link>
        </Typography>
      </AuthLayout>
  );
}
