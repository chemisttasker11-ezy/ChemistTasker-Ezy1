import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TextField,
  Button,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import AuthLayout from '../layouts/AuthLayout'; // Import the new layout
import { passwordResetConfirm } from '@chemisttasker/shared-core';
import { setRobotsMeta } from '../utils/seo';
import { useAuth } from '../contexts/AuthContext';

export default function ResetPasswordPage() {
  useEffect(() => {
    setRobotsMeta('noindex,follow');
    return () => setRobotsMeta();
  }, []);

  // --- All logic is unchanged ---
  const { uid, token } = useParams<{ uid: string; token: string }>();
  const navigate       = useNavigate();
  const { logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await passwordResetConfirm({
        uid: uid ?? '',
        token: token ?? '',
        new_password1: newPassword,
        new_password2: confirmPassword,
      });
      logout();
      navigate('/login');
    } catch {
      setError('Failed to reset password. The link may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Set a New Password">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <form onSubmit={handleSubmit}>
        <TextField fullWidth margin="normal" label="New Password" type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} InputProps={{ endAdornment: ( <InputAdornment position="end"> <IconButton onClick={() => setShowPassword((show) => !show)} edge="end"> {showPassword ? <VisibilityOff /> : <Visibility />} </IconButton> </InputAdornment> ), }} />
        <TextField fullWidth margin="normal" label="Confirm New Password" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} InputProps={{ endAdornment: ( <InputAdornment position="end"> <IconButton onClick={() => setShowConfirmPassword((show) => !show)} edge="end"> {showConfirmPassword ? <VisibilityOff /> : <Visibility />} </IconButton> </InputAdornment> ), }} />
        <Button fullWidth type="submit" variant="contained" disabled={loading} sx={{ mt: 2, py: 1.5, backgroundColor: '#00a99d', '&:hover': {backgroundColor: '#00877d'} }}>
          {loading ? <CircularProgress size={24} color="inherit" /> : 'Reset Password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
