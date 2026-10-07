/**
 * Auth/session domain facade.
 * New consumers should prefer this namespace over importing the monolithic API surface.
 */
export {
  login,
  register,
  refreshToken,
  verifyOtp,
  resendOtp,
  mobileRequestOtp,
  mobileVerifyOtp,
  mobileResendOtp,
  getCurrentUser,
  passwordReset,
  passwordResetConfirm,
} from './api';
export {
  getOnboarding,
  updateOnboarding,
  getOnboardingDetail,
  updateOnboardingForm,
} from '../onboarding/api';
