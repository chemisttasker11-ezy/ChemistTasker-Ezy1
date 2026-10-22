import { useEffect, useState } from 'react';
import { useNavigate, Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Typography,
  TextField,
  Button,
  Box,
  CircularProgress,
  Alert,
  Link,
  InputAdornment,
  IconButton,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { API_BASE_URL } from '../constants/api';
import { browserLoginSession } from '@chemisttasker/shared-core';
import { hasOrganizationAccess } from '@chemisttasker/shared-core';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout from '../layouts/AuthLayout';
import PublicLogoTopBar from '../components/PublicLogoTopBar';
import { resolveDashboardPath } from '../utils/dashboardPath';
import { getOwnerSetupStatus } from '../utils/ownerSetup';
import { setRobotsMeta } from '../utils/seo';

const PERSONA_KEY_PREFIX = 'ct-active-persona';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  useEffect(() => {
    setRobotsMeta('noindex,follow');
    return () => setRobotsMeta();
  }, []);

  // All your state and logic functions are unchanged
  const [email, setEmail]       = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await browserLoginSession(
        { baseUrl: API_BASE_URL },
        { email: email.toLowerCase(), password, remember_me: rememberMe },
      );
      const { access, refresh, user: userInfo } = data;
      if (!access || !userInfo) {
        throw new Error('Login response is missing the authenticated session');
      }

      // The refresh credential remains in the HttpOnly cookie for web clients.
      // Only the short-lived access token is intentionally exposed to JS memory.
      if (userInfo?.id != null) localStorage.removeItem(`${PERSONA_KEY_PREFIX}:${userInfo.id}`);
      login(access, refresh || '', userInfo, rememberMe);

      if (!userInfo?.is_mobile_verified && !userInfo?.mobile_check_skipped) {
        navigate('/mobile-verify');
        return;
      }

      if (hasOrganizationAccess(userInfo) && !['OWNER', 'PHARMACIST', 'OTHER_STAFF', 'EXPLORER'].includes(userInfo.role)) {
        navigate('/dashboard/organization/overview');
        return;
      }

      if (userInfo?.role === 'OWNER') {
        const ownerSetup = await getOwnerSetupStatus(userInfo);
        if (ownerSetup.nextPath) {
          navigate(ownerSetup.nextPath);
          return;
        }
      }

      navigate(resolveDashboardPath(userInfo.role));
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err) {
        const status = Number((err as any).status);
        if (status >= 500) {
          setError('Service is temporarily unavailable. Please try again shortly.');
          return;
        }
        const data = (err as any)?.payload ?? (err as any)?.response?.data;
        const code = data?.code;
        const msg =
          data?.detail ||
          (Array.isArray(data?.email)
            ? data?.email[0]
            : data?.message) ||
          'Login failed. Please check your credentials.';
        setError(msg);

        if (
          code === "email_not_verified" ||
          (msg && msg.toLowerCase().includes("verify your email"))
        ) {
          navigate("/otp-verify", { state: { email: email.toLowerCase() } });
        }

      } else {
        setError('Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PublicLogoTopBar />
      <AuthLayout title="Welcome Back">
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleLogin}>
        <TextField
          fullWidth
          margin="normal"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value.toLowerCase())}
          autoComplete="username"
        />

        <TextField
          fullWidth
          margin="normal"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowPassword((show) => !show)}
                  edge="end"
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              sx={{
                color: '#00a99d',
                '&.Mui-checked': { color: '#00a99d' },
              }}
            />
          }
          label="Keep me signed in"
          sx={{ mt: 1 }}
        />

        <Box mt={3}>
          <Button
            fullWidth
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{ 
              py: 1.5,
              backgroundColor: '#00a99d', // Themed button color
              '&:hover': {
                  backgroundColor: '#00877d'
              }
            }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Login'}
          </Button>
        </Box>
        </form>

        <Box mt={2} textAlign="center">
          <Link component={RouterLink} to="/password-reset" color="#00a99d">
            Forgot Password?
          </Link>
        </Box>

        <Typography variant="body2" mt={3} textAlign="center">
          Don&apos;t have an account?{' '}
          <Link component={RouterLink} to="/register" fontWeight="bold" color="#00a99d">
            Register
          </Link>
        </Typography>

        <Typography variant="caption" mt={2} display="block" textAlign="center" color="text.secondary">
          By using ChemistTasker, you agree to the{" "}
          <Link component={RouterLink} to="/terms-of-service" color="#00a99d">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link component={RouterLink} to="/privacy-policy" color="#00a99d">
            Privacy Policy
          </Link>
          .
        </Typography>
      </AuthLayout>
    </>
  );
}
