import React, { useState } from 'react';
import { useNavigate, Link as RouterLink, useLocation } from 'react-router-dom';
import axios from 'axios';
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
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import AuthLayout from '../layouts/AuthLayout'; // Import the new layout
import PublicLogoTopBar from '../components/PublicLogoTopBar';

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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    try {
      await axios.post(
        `${API_BASE_URL}${API_ENDPOINTS.verifyOtp}`,
        { email, otp },
        { withCredentials: true }
      );
      setStatus('Verification successful! Redirecting...');
      setTimeout(() => navigate('/login', { state: { email } }), 800);

    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || 'Verification failed. Please check your code.');
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
      await axios.post(`${API_BASE_URL}${API_ENDPOINTS.resendOtp}`, { email }, { withCredentials: true });
      setStatus('A new code has been sent to your email.');
    } catch (err) {
      setError('Could not resend code. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PublicLogoTopBar />
      <AuthLayout title="Email Verification">
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
            Confirm your email
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This is the email verification step. We ask for it after registration, or when you try to log in before your email has been verified. Enter the code sent to your inbox to activate email login for this account.
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {status && <Alert severity="success" sx={{ mb: 2 }}>{status}</Alert>}
        <form onSubmit={handleVerify}>
          <Stack spacing={1.5}>
            <TextField fullWidth margin="normal" label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <TextField fullWidth margin="normal" label="Enter OTP Code" value={otp} onChange={e => setOtp(e.target.value)} required />
          </Stack>
          <Box mt={3}>
            <Button fullWidth type="submit" variant="contained" disabled={loading} sx={{ py: 1.5, backgroundColor: '#00a99d', '&:hover': {backgroundColor: '#00877d'} }}>
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
