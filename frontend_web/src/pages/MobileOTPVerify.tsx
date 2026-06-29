import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
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
import AuthLayout from '../layouts/AuthLayout';
import PublicLogoTopBar from '../components/PublicLogoTopBar';
import apiClient from '../utils/apiClient';

export default function MobileOTPVerify() {
  const [mobile, setMobile]   = useState('');
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState('');
  const [error, setError]     = useState('');

  const requestCode = async () => {
    setError('');
    setStatus('');
    setLoading(true);
    try {
      await apiClient.post('/users/mobile/request-otp/', { mobile_number: mobile });
      setStatus('We sent a code to your mobile.');
    } catch (err) {
      const anyErr = err as any;
      setError(anyErr?.response?.data?.error || anyErr?.response?.data?.detail || 'Failed to send code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    try {
      await apiClient.post('/users/mobile/verify-otp/', { otp });
      setStatus('Mobile verified! Redirecting...');
      setTimeout(() => window.location.assign('/login'), 800);
    } catch (err) {
      const anyErr = err as any;
      setError(anyErr?.response?.data?.error || anyErr?.response?.data?.detail || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setStatus('');
    setLoading(true);
    try {
      await apiClient.post('/users/mobile/resend-otp/', {});
      setStatus('A new code has been sent to your mobile.');
    } catch (err) {
      const anyErr = err as any;
      setError(anyErr?.response?.data?.error || anyErr?.response?.data?.detail || 'Could not resend code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PublicLogoTopBar />
      <AuthLayout title="Mobile Verification">
        <Box
          sx={{
            mb: 3,
            p: 2.25,
            borderRadius: 3,
            background: 'linear-gradient(135deg, rgba(0,169,157,0.12), rgba(15,23,42,0.04))',
            border: '1px solid rgba(148,163,184,0.22)',
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            Confirm your mobile number
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Request a code, then enter it below to verify the mobile number linked to your account.
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {status && <Alert severity="success" sx={{ mb: 2 }}>{status}</Alert>}

        <form onSubmit={handleVerify}>
          <Stack spacing={1.5}>
            <TextField
              fullWidth
              margin="normal"
              label="Mobile Number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="e.g., 041x xxx xxx"
              required
            />

            <Box mt={1}>
              <Button
                fullWidth
                type="button"
                onClick={requestCode}
                variant="outlined"
                disabled={loading || !mobile}
                sx={{ py: 1.25, borderColor: '#00a99d', color: '#00a99d' }}
              >
                {loading ? <CircularProgress size={22} /> : 'Send Code'}
              </Button>
            </Box>

            <TextField
              fullWidth
              margin="normal"
              label="Enter OTP Code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          </Stack>

          <Box mt={3}>
            <Button
              fullWidth
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ py: 1.5, backgroundColor: '#00a99d', '&:hover': { backgroundColor: '#00877d' } }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify'}
            </Button>
          </Box>
        </form>

        <Box mt={2} textAlign="center">
          <Link component="button" onClick={handleResend} disabled={loading} color="#00a99d">
            Resend Code
          </Link>
        </Box>

        <Typography variant="body2" mt={3} textAlign="center">
          Back to{' '}
          <Link component={RouterLink} to="/login" fontWeight="bold" color="#00a99d">
            Login
          </Link>
        </Typography>
      </AuthLayout>
    </>
  );
}
