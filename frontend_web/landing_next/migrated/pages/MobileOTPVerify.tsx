import {returnDestination,finishDestination,announceSession} from '../../shared/browser-session';
import React, { useEffect, useState } from 'react';
import { canSkipOverseasMobileCheck, skipMobileOverseas } from '@chemisttasker/shared-core';
import { Link as RouterLink } from '@/public/navigation';
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
import apiClient from '../utils/apiClient';
import { mobileRequestOtp, mobileResendOtp } from '@chemisttasker/shared-core';
import { useAuth } from '../contexts/AuthContext';

export default function MobileOTPVerify() {
  const { user, setUser, login } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [username, setUsername]   = useState('');
  const [mobile, setMobile]   = useState('');
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState('');
  const [error, setError]     = useState('');
  const [identityLocked, setIdentityLocked] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name || user.firstName || '');
    setLastName(user.last_name || user.lastName || '');
    setUsername(user.username || '');
    setMobile(user.mobile_number || '');
  }, [user]);

  const extractError = (err: unknown, fallback: string) => {
    const anyErr = err as any;
    const data = anyErr?.response?.data ?? anyErr?.payload;
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
      const sent: any = await mobileRequestOtp({
        first_name: firstName,
        last_name: lastName,
        username,
        mobile_number: mobile,
      });
      if (sent?.debug_otp) setOtp(sent.debug_otp);
      setStatus(sent?.debug_otp ? `Test mode: no SMS sent. Your code is ${sent.debug_otp}.` : 'We sent a code to your mobile.');
      setResendCooldown(30);
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
      const resp = await apiClient.post('/users/mobile/verify-otp/', { otp });
      const data = resp.data;
      if (data?.access && data?.refresh && data?.user && typeof login === 'function') {
        login(data.access, data.refresh, data.user);
      }
      announceSession('login');
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
          : data?.user || prev
      );
      setStatus('Mobile verified! Redirecting...');
      setTimeout(() => finishDestination(returnDestination()||'/dashboard'), 800);
    } catch (err) {
      setError(extractError(err, 'Verification failed.'));
    } finally {
      setLoading(false);
    }
  };

  const canSkipOverseas = canSkipOverseasMobileCheck(user);
  // Overseas newcomers without an Australian mobile: keep the legal name, skip the code, verify with photo ID instead.
  const handleSkipOverseas = async () => {
    setError('');
    setStatus('');
    setLoading(true);
    try {
      // Same authenticated shared-core operation as Expo; the current user is present when this action is visible.
      await skipMobileOverseas({ first_name: firstName, last_name: lastName, username });
      setUser((prev) => (prev ? { ...prev, first_name: firstName, last_name: lastName, username, mobile_check_skipped: true } : prev));
      setStatus('Done. Next, upload photo ID to verify your profile.');
      setTimeout(() => window.location.assign('/dashboard/explorer/onboarding?step=identity'), 800);
    } catch (err) {
      setError(extractError(err, 'Could not skip the mobile check.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setStatus('');
    setLoading(true);
    try {
      const resent: any = await mobileResendOtp({});
      if (resent?.debug_otp) setOtp(resent.debug_otp);
      setStatus(resent?.debug_otp ? `Test mode: no SMS sent. Your code is ${resent.debug_otp}.` : 'A new code has been sent to your mobile.');
      setResendCooldown(30);
    } catch (err) {
      setError(extractError(err, 'Could not resend code.'));
    } finally {
      setLoading(false);
    }
  };

  return (
      <AuthLayout title="Mobile Verification">
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="body1" sx={{ color: '#243451', lineHeight: 1.55 }}>
            Enter your mobile details and use the code we send to confirm your number.
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
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={loading || identityLocked}
            />

            <TextField
              fullWidth
              margin="normal"
              label="Last Legal Name"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={loading || identityLocked}
            />

            <TextField
              fullWidth
              margin="normal"
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading || identityLocked}
            />

            <TextField
              fullWidth
              margin="normal"
              label="Mobile Number"
              type="tel"
              autoComplete="tel"
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
                sx={{ py: 1.25, borderColor: '#5222B8', color: '#5222B8' }}
              >
                {loading ? <CircularProgress size={22} /> : 'Send Code'}
              </Button>
            </Box>

            <TextField
              fullWidth
              margin="normal"
              label="Verification code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              autoComplete="one-time-code"
              inputProps={{ inputMode: 'numeric' }}
              required
            />
          </Stack>

          <Box mt={3}>
            <Button
              fullWidth
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify'}
            </Button>
          </Box>
        </form>

        <Box mt={2} textAlign="center">
          <Link component="button" onClick={handleResend} disabled={loading || resendCooldown > 0} color="primary.main">
            {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend code'}
          </Link>
        </Box>

        {canSkipOverseas && (
          <Box sx={{ mt: 3, p: 2, borderRadius: 3, border: '1px solid rgba(148,163,184,0.35)' }}>
            <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Joining from overseas?</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              No Australian mobile yet? Fill in your legal name and username above, then skip this step. You will verify with photo ID instead, and your profile shows an Overseas label.
            </Typography>
            <Button fullWidth variant="outlined" onClick={handleSkipOverseas} disabled={loading || !firstName || !lastName || !username}>
              Skip and verify with photo ID
            </Button>
          </Box>
        )}

        <Typography variant="body2" mt={3} textAlign="center">
          Back to{' '}
          <Link component={RouterLink} to="/login" fontWeight="bold" color="#5222B8">
            Login
          </Link>
        </Typography>
      </AuthLayout>
  );
}
