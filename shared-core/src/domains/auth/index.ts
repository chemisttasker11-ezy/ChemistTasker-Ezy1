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
  getOnboarding,
  updateOnboarding,
  createOnboarding,
  getOnboardingDetail,
  updateOnboardingForm,
} from '../../api';
