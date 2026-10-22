import { API_ENDPOINTS } from '../../constants/endpoints';

/** Canonical auth wire routes; Vite and Next use browser CSRF/cookie transport.
 * Expo retains its secure-storage Axios interceptor while migrating React
 * callsites without duplicating literal endpoints or altering auth semantics.
 */
export const NATIVE_IDENTITY_ROUTES = {
  me: '/users/me/',
  login: API_ENDPOINTS.login,
  register: API_ENDPOINTS.register,
  verifyEmailOtp: API_ENDPOINTS.verifyOtp,
  resendEmailOtp: API_ENDPOINTS.resendOtp,
} as const;
