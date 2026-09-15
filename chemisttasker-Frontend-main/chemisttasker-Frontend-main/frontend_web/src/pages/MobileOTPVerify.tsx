import React, { useEffect, useState } from 'react';
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
import { useAuth } from '../contexts/AuthContext';

export default function MobileOTPVerify() {
  const { user, setUser } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [username, setUsername]   = useState('');
  const [mobile, setMobile]   = useState('');
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState('');
  const [error, setError]     = useState('');
  const [identityLocked, setIdentityLocked] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name || user.firstName || '');
    setLastName(user.last_name || user.lastName || '');
    setUsername(user.username || '');
    setMobile(user.mobile_number || '');
  }, [user]);

  const extractError = (err: unknown, fallback: string) => {
    const anyErr = err as any;
    const data = anyErr?.response?.data;
    if (typeof data?.detail === 'string' && data.detail) return data.detail;
    if (typeof data?.error === 'string' && data.error) return data.error;
    if (data && typeof data === 'object') {
      const firstValue = Object.values(data)[0];
      if (Array.isArray(firstValue) && typeof firstValue[0] === 'string') return firstValue[0];
      if (typeof firstValue === 'string') return firstValue;
    }
    return fallback;
  };

  const requestCode = async () => {
    setError('');
    setStatus('');
    setLoading(true);
    try {
      await apiClient.post('/users/mobile/request-otp/', {
        first_name: firstName,
        last_name: lastName,
        username,
        mobile_number: mobile,
      });
      setStatus('We sent a code to your mobile.');
    } catch (err) {
      setError(extractError(err, 'Failed to send code.'));
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
      setIdentityLocked(true);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              first_name: firstName,
              last_name: lastName,
              username,
              mobile_number: mobile,
              is_mobile_verified: true,
            }
          : prev
      );
      setStatus('Mobile verified! Redirecting...');
      setTimeout(() => window.location.assign('/login'), 800);
    } catch (err) {
      setError(extractError(err, 'Verification failed.'));
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
      setError(extractError(err, 'Could not resend code.'));
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
            This step happens after email verification and login when your mobile number has not been verified yet. We use it to lock your legal name, username, and mobile number for account security.
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {status && <Alert severity="success" sx={{ mb: 2 }}>{status}</Alert>}

        <form onSubmit={handleVerify}>
          <Stack spacing={1.5}>
            <TextField
              fullWidth
              margin="normal"
              label="First Legal Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={loading || identityLocked}
            />

            <TextField
              fullWidth
              margin="normal"
              label="Last Legal Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={loading || identityLocked}
            />

            <TextField
              fullWidth
              margin="normal"
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading || identityLocked}
            />

            <TextField
              fullWidth
              margin="normal"
              label="Mobile Number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="e.g., 041x xxx xxx"
              required
              disabled={loading || identityLocked}
            />

            <Box mt={1}>
              <Button
                fullWidth
                type="button"
                onClick={requestCode}
                variant="outlined"
                disabled={loading || !mobile || !firstName || !lastName || !username}
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
