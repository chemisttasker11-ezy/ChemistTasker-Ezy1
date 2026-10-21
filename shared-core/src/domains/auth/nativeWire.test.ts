import { expect, it } from 'vitest';
import { NATIVE_IDENTITY_ROUTES } from './nativeWire';
import { API_ENDPOINTS } from '../../constants/endpoints';

it('retains Expo identity routes under canonical shared-core ownership', () => {
  expect(NATIVE_IDENTITY_ROUTES).toEqual({
    me: '/users/me/', login: API_ENDPOINTS.login,
    register: API_ENDPOINTS.register,
    verifyEmailOtp: API_ENDPOINTS.verifyOtp,
    resendEmailOtp: API_ENDPOINTS.resendOtp,
  });
});
