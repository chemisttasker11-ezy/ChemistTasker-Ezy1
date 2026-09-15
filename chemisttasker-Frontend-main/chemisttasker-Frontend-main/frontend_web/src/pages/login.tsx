import { useEffect, useState } from 'react';
import { useNavigate, Link as RouterLink, useLocation } from 'react-router-dom';
import axios from 'axios';
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
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { ORG_ROLES } from '../constants/roles';
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
      const { data } = await axios.post(
        `${API_BASE_URL}${API_ENDPOINTS.login}`,
        { email: email.toLowerCase(), password, remember_me: rememberMe },
        { withCredentials: true }
      );
      const { access, refresh, user: userInfo } = data;
      if (!access || !refresh) {
        throw new Error('Both access and refresh tokens are required');
      }

      login(access, refresh, userInfo, rememberMe);

      if (!userInfo?.is_mobile_verified) {
        navigate('/mobile-verify');
        return;
      }

      const isOrgMember = Array.isArray(userInfo?.memberships)
        ? userInfo.memberships.some((m: any) => {
            const membershipRole = String(m?.role || '').toUpperCase();
            return ORG_ROLES.includes(membershipRole as any);
          })
        : false;

      if (isOrgMember || ORG_ROLES.includes(String(userInfo?.role || '').toUpperCase() as any)) {
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

      const personaKey =
        typeof userInfo?.id === 'number'
          ? `${PERSONA_KEY_PREFIX}:${userInfo.id}`
          : PERSONA_KEY_PREFIX;
      const storedPersona = personaKey ? localStorage.getItem(personaKey) : null;
      const adminAssignments = Array.isArray(userInfo?.admin_assignments)
        ? userInfo.admin_assignments
        : [];

      const findAssignmentById = (assignmentId: number) =>
        adminAssignments.find((assignment: any) => assignment?.id === assignmentId);

      let redirectPath: string | null = null;

      if (storedPersona?.startsWith('ADMIN:')) {
        const storedId = Number(storedPersona.split(':')[1]);
        const matchedAssignment = Number.isFinite(storedId) ? findAssignmentById(storedId) : null;
        const fallbackAssignment = adminAssignments.find(
          (assignment: any) => typeof assignment?.pharmacy_id === 'number'
        );
        const targetAssignment = matchedAssignment ?? fallbackAssignment ?? null;

        if (targetAssignment?.pharmacy_id != null) {
          redirectPath = `/dashboard/admin/${targetAssignment.pharmacy_id}/overview`;
        } else if (personaKey) {
          localStorage.removeItem(personaKey);
        }
      } else if (storedPersona?.startsWith('ROLE:')) {
        const storedRole = storedPersona.split(':')[1];
        if (storedRole === 'PHARMACIST' && userInfo.role === 'PHARMACIST') {
          redirectPath = '/dashboard/pharmacist/overview';
        } else if (storedRole === 'OTHER_STAFF' && userInfo.role === 'OTHER_STAFF') {
          redirectPath = '/dashboard/otherstaff/overview';
        } else if (storedRole === 'OWNER' && userInfo.role === 'OWNER') {
          redirectPath = '/dashboard/owner/overview';
        } else if (personaKey) {
          localStorage.removeItem(personaKey);
        }
      }

      if (!redirectPath) {
        redirectPath = resolveDashboardPath(userInfo.role);
      }

      navigate(redirectPath);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code;
        const msg =
          err.response?.data?.detail ||
          (Array.isArray(err.response?.data?.email)
            ? err.response?.data?.email[0]
            : err.response?.data?.message) ||
          'Login failed. Please check your credentials.';
        setError(msg);

        if (
          code === "email_not_verified" ||
          (msg && msg.toLowerCase().includes("verify your email"))
        ) {
          navigate("/otp-verify", { state: { email: email.toLowerCase() } });
        }

      } else {
        setError('An unexpected error occurred. Please try again.');
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
