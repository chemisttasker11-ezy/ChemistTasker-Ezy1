import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import axios from 'axios';
import { login as sharedLogin, getOnboarding } from '@chemisttasker/shared-core';
import apiClient from '../utils/apiClient';
import { registerForPushNotificationsAsync, registerDeviceTokenWithBackend } from '../utils/pushNotifications';
import * as Device from 'expo-device';
import { clearStoredSession, getValidAccessToken, primeInMemorySession, readStoredSession, writeStoredSession } from '../utils/authSession';
import {
  addNetworkDiagnostic,
  describeRequestError,
  getNetworkDiagnosticsSnapshot,
  networkDiagnosticsEnabled,
} from '../utils/networkDiagnostics';
import { authenticateWithBiometrics, disableBiometricLogin, getBiometricAvailability, getSavedBiometricUser } from '../utils/biometricAuth';

// --- Types ---
export interface OrgMembership {
  organization_id: number;
  organization_name: string;
  role: string;
  region: string;
}

export type User = {
  id?: number;
  username: string;
  email?: string;
  role: string;
  mobile_number?: string | null;
  is_mobile_verified?: boolean;
  first_name?: string;
  last_name?: string;
  profile_photo?: string;
  profile_photo_url?: string;
  memberships?: OrgMembership[];
  billing_active?: boolean;
  in_free_trial?: boolean;
};


interface RegisterData {
  email: string;
  password: string;
  confirm_password: string;
  first_name?: string;
  last_name?: string;
  role: string;
  accepted_terms: boolean;
  captcha_token?: string | null;
  referral_code?: string;
  referral_shift_id?: number;
  referral_event_id?: number;
}

type AuthContextType = {
  access: string | null;
  token: string | null;
  refresh: string | null;
  user: User | null;
  hasCapability: (capability: string, pharmacyId?: number | string | null) => boolean;
  login: (access: string, refresh: string, user: User) => Promise<void>;
  loginWithCredentials: (email: string, password: string) => Promise<User>;
  loginWithStoredSession: () => Promise<User>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  verifyOTP: (code: string, email?: string) => Promise<void>;
  resendOTP: (email?: string) => Promise<void>;
  markMobileVerified: (updates?: Partial<User>) => Promise<void>;
  updateUserProfilePhoto: (photoUrl: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  access: null,
  token: null,
  refresh: null,
  user: null,
  hasCapability: () => false,
  login: async () => { },
  loginWithCredentials: async () => ({ id: 0, username: '', role: '' }),
  loginWithStoredSession: async () => ({ id: 0, username: '', role: '' }),
  register: async () => { },
  logout: async () => { },
  verifyOTP: async () => { },
  resendOTP: async () => { },
  markMobileVerified: async () => { },
  updateUserProfilePhoto: async () => { },
  refreshUser: async () => { },
  isLoading: true,
});

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [access, setAccess] = useState<string | null>(null);
  const [refresh, setRefresh] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);
  const [triedPhotoRefresh, setTriedPhotoRefresh] = useState(false);
  const [registeredPush, setRegisteredPush] = useState(false);
  const authMutationIdRef = useRef(0);

  // Load user from cookie session at app startup
  useEffect(() => {
    const loadStoredAuth = async () => {
      const bootstrapId = authMutationIdRef.current;
      try {
        const baseURL = process.env.EXPO_PUBLIC_API_URL?.trim();
        const session = await readStoredSession();
        const nextAccess = session?.access || session?.tokens?.access || null;
        const nextRefresh = session?.refresh || session?.tokens?.refresh || null;
        const nextUser = session?.user ? normalizeUser(session.user) : null;
        primeInMemorySession(session);

        if ((nextAccess || nextRefresh) && nextUser) {
          const [availability, biometricUser] = await Promise.all([
            getBiometricAvailability(),
            getSavedBiometricUser(),
          ]);
          const savedUserMatches =
            biometricUser &&
            ((biometricUser.id != null && nextUser.id != null && String(biometricUser.id) === String(nextUser.id)) ||
              (biometricUser.email && nextUser.email && biometricUser.email.toLowerCase() === nextUser.email.toLowerCase()));

          if (availability.available && savedUserMatches) {
            const passed = await authenticateWithBiometrics(availability.label);
            if (!passed) {
              primeInMemorySession(null);
              setAccess(null);
              setRefresh(null);
              setUser(null);
              setIsLoading(false);
              return;
            }
          } else if (biometricUser && !savedUserMatches) {
            await disableBiometricLogin();
          }
        }

        if (nextUser) {
          setUser(nextUser);
        }
        setAccess(nextAccess);
        setRefresh(nextRefresh);

        if (baseURL) {
          const token = await getValidAccessToken(baseURL);
          if (token) {
            const meResponse = await apiClient.get('/users/me/').catch(() => null);
            if (meResponse?.data) {
              const currentUser = normalizeUser(meResponse.data);
              const refreshedSession = await readStoredSession();
              setAccess(refreshedSession?.access || refreshedSession?.tokens?.access || token);
              setRefresh(refreshedSession?.refresh || refreshedSession?.tokens?.refresh || nextRefresh);
              setUser(currentUser);
              await writeStoredSession({
                access: refreshedSession?.access || refreshedSession?.tokens?.access || token,
                refresh: refreshedSession?.refresh || refreshedSession?.tokens?.refresh || nextRefresh,
                user: currentUser,
              });
              setIsLoading(false);
              return;
            }
          }
        }
      } catch {
        // handled below
      }

      const latestSession = await readStoredSession();
      const latestAccess = latestSession?.access || latestSession?.tokens?.access || null;
      const latestRefresh = latestSession?.refresh || latestSession?.tokens?.refresh || null;
      const latestUser = latestSession?.user ? normalizeUser(latestSession.user) : null;

      if (authMutationIdRef.current !== bootstrapId && (latestAccess || latestRefresh || latestUser)) {
        primeInMemorySession(latestSession);
        setAccess(latestAccess);
        setRefresh(latestRefresh);
        setUser(latestUser);
        setIsLoading(false);
        return;
      }

      if (latestAccess || latestRefresh || latestUser) {
        primeInMemorySession(latestSession);
        setAccess(latestAccess);
        setRefresh(latestRefresh);
        setUser(latestUser);
      } else {
        await clearStoredSession();
        setAccess(null);
        setRefresh(null);
        setUser(null);
      }
      setIsLoading(false);
    };
    loadStoredAuth();
  }, []);

  useEffect(() => {
    const setupPush = async () => {
      if (!user || registeredPush) return;
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          const platform = Device.osName?.toLowerCase().includes('ios') ? 'ios' : 'android';
          await registerDeviceTokenWithBackend(token, platform as 'ios' | 'android');
        }
        setRegisteredPush(true);
      } catch (err) {
        console.error('Push registration failed', err);
      }
    };
    void setupPush();
  }, [access, user, registeredPush]);

  const normalizeUser = (u: any): User => {
    if (!u) return u;
    const photo = u.profile_photo_url || u.profile_photo || u.profilePhoto;
    const role = typeof u.role === 'string' ? u.role.toUpperCase() : u.role;
    return { ...u, role, profile_photo_url: photo, profile_photo: photo };
  };

  const fetchOnboardingProfile = async (role?: string, existing?: any) => {
    const normalizedRole = (role || '').toLowerCase();
    const safeRole = normalizedRole === 'other_staff' ? 'otherstaff' : normalizedRole || 'pharmacist';
    const data = await getOnboarding(safeRole);
    const merged = { ...(existing ?? {}), ...(data as any) };
    // Do not allow onboarding payloads to change authenticated identity/role.
    if (existing?.role) merged.role = existing.role;
    if (existing?.id != null) merged.id = existing.id;
    if (existing?.email) merged.email = existing.email;
    return normalizeUser(merged);
  };

  const getLoginErrorMessage = (error: any) => {
    const data = error?.response?.data ?? error?.data;
    const detail = data?.detail || data?.message;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(data?.non_field_errors) && data.non_field_errors[0]) return data.non_field_errors[0];
    if (Array.isArray(data?.email) && data.email[0]) return data.email[0];
    return error?.message || 'Login failed';
  };

  const login = async (newAccess: string, newRefresh: string, userInfo: User) => {
    authMutationIdRef.current += 1;
    const baseUser = normalizeUser(userInfo);
    await writeStoredSession({
      access: newAccess || null,
      refresh: newRefresh || null,
      user: baseUser,
    });
    setAccess(newAccess || null);
    setRefresh(newRefresh || null);
    setUser(baseUser);

    // Hydrate with onboarding profile if available (adds photo, phone, etc.)
    try {
      const hydrated = await fetchOnboardingProfile(baseUser.role, baseUser);
      await writeStoredSession({
        access: newAccess || null,
        refresh: newRefresh || null,
        user: hydrated,
      });
      setUser(hydrated);
    } catch (error) {
      const msg = (error as any)?.message || error;
      console.debug('Onboarding profile fetch skipped:', msg);
    }
  };

  const loginWithCredentials = async (email: string, password: string) => {
    try {
      addNetworkDiagnostic('login-attempt', { api: process.env.EXPO_PUBLIC_API_URL });
      const response: any = await apiClient.post('/users/login/', { email, password }, { withCredentials: true });
      const payload = response?.data ?? response;
      const userData = payload.user || payload.userData || payload.profile;
      const newAccess = payload.access;
      const newRefresh = payload.refresh;
      if (!userData) {
        throw new Error('Unexpected login response');
      }
      if (!newAccess || !newRefresh) {
        throw new Error('Login did not return API tokens.');
      }
      await login(newAccess, newRefresh, userData);
      return userData;
    } catch (directError: any) {
      addNetworkDiagnostic('login-axios-error', describeRequestError('axios', directError));
      const status = directError?.response?.status;
      if ([400, 401, 403, 429].includes(status)) {
        throw new Error(getLoginErrorMessage(directError));
      }
      try {
        // Fallback to shared-core login shape
        const response: any = await sharedLogin({ email, password });
        const tokens = response.tokens || {};
        const newAccess = tokens.access || response.access;
        const newRefresh = tokens.refresh || response.refresh;
        const userData = response.user || response.userData || response.profile;
        if (!newAccess || !newRefresh || !userData) {
          throw new Error(directError?.message || 'Unexpected login response');
        }
        await login(newAccess, newRefresh, userData);
        return userData;
      } catch (error: any) {
        addNetworkDiagnostic('login-shared-core-error', describeRequestError('shared-core', error));
        if (networkDiagnosticsEnabled) {
          throw new Error([
            error?.message || directError?.message || 'Login failed',
            '',
            getNetworkDiagnosticsSnapshot(),
          ].join('\n'));
        }
        throw new Error(error?.message || directError?.message || 'Login failed');
      }
    }
  };

  const loginWithStoredSession = async () => {
    const baseURL = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (!baseURL) {
      throw new Error('API URL is not configured.');
    }

    const token = await getValidAccessToken(baseURL);
    if (!token) {
      throw new Error('Your saved session has expired. Please sign in again.');
    }

    const session = await readStoredSession();
    const response = await apiClient.get('/users/me/');
    const userData = normalizeUser(response?.data);
    const refreshedSession = await readStoredSession();
    const nextAccess = refreshedSession?.access || refreshedSession?.tokens?.access || token;
    const nextRefresh =
      refreshedSession?.refresh ||
      refreshedSession?.tokens?.refresh ||
      session?.refresh ||
      session?.tokens?.refresh ||
      null;

    await writeStoredSession({
      access: nextAccess,
      refresh: nextRefresh,
      user: userData,
    });
    setAccess(nextAccess);
    setRefresh(nextRefresh);
    setUser(userData);
    return userData;
  };

  const register = async (data: RegisterData) => {
    try {
      await apiClient.post('/users/register/', data);
    } catch (error: any) {
      const duplicateEmailMessage =
        'There is already an account registered with this email. Please log in or reset your password.';
      const responseData = error?.response?.data ?? error?.data;
      const emailMsg = responseData?.email?.[0] || responseData?.email;
      const confirmPasswordMsg =
        responseData?.confirm_password?.[0] || responseData?.confirm_password;
      const passwordMsg = responseData?.password?.[0] || responseData?.password;
      const captchaMsg = responseData?.captcha?.[0] || responseData?.captcha;
      const detailMsg = responseData?.detail;
      const termsMsg = responseData?.accepted_terms?.[0] || responseData?.accepted_terms;
      const emailMsgLower = typeof emailMsg === 'string' ? emailMsg.toLowerCase() : '';
      const errorMessage = typeof error?.message === 'string' ? error.message : '';
      const errorMessageLower = errorMessage.toLowerCase();
      const fallbackFieldMessage =
        responseData && typeof responseData === 'object'
          ? Object.entries(responseData)
            .filter(([key]) => key !== 'email' && key !== 'captcha' && key !== 'accepted_terms')
            .map(([, value]) => (Array.isArray(value) ? value[0] : value))
            .find((value) => typeof value === 'string')
          : undefined;
      const errorMsg =
        (emailMsgLower.includes('unique') ||
          emailMsgLower.includes('already') ||
          emailMsgLower.includes('registered') ||
          errorMessageLower.includes('already') ||
          errorMessageLower.includes('registered')
          ? duplicateEmailMessage
          : confirmPasswordMsg ||
          passwordMsg ||
          captchaMsg ||
          termsMsg ||
          emailMsg ||
          detailMsg ||
          fallbackFieldMessage ||
          errorMessage ||
          'Registration failed');
      throw new Error(errorMsg);
    }
  };

  const verifyOTP = async (code: string, email?: string) => {
    try {
      const targetEmail = email || user?.email;
      const response = await apiClient.post('/users/verify-otp/', { email: targetEmail, otp: code });
      const payload = response?.data ?? response;
      const userData = payload?.user;
      const newAccess = payload?.access;
      const newRefresh = payload?.refresh;
      if (userData && newAccess && newRefresh) {
        await login(newAccess, newRefresh, userData);
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'OTP verification failed');
    }
  };

  const resendOTP = async (email?: string) => {
    try {
      // Backend ResendOTPView looks up user by email from request body (same as web)
      await apiClient.post('/users/resend-otp/', { email: email || user?.email });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to resend OTP');
    }
  };

  const refreshUser = async () => {
    try {
      const hydrated = await fetchOnboardingProfile(user?.role, user);
      setUser(hydrated as User);
      const session = await readStoredSession();
      await writeStoredSession({
        access: session?.access || session?.tokens?.access || access,
        refresh: session?.refresh || session?.tokens?.refresh || refresh,
        user: hydrated,
      });
    } catch (error) {
      const msg = (error as any)?.message || error;
      console.debug('Error refreshing user (non-fatal):', msg);
    }
  };

  const markMobileVerified = async (updates?: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates, is_mobile_verified: true };
    setUser(updated);
    const session = await readStoredSession();
    await writeStoredSession({
      access: session?.access || session?.tokens?.access || access,
      refresh: session?.refresh || session?.tokens?.refresh || refresh,
      user: updated,
    });
  };

  const updateUserProfilePhoto = async (photoUrl: string) => {
    if (!user || !photoUrl) return;
    const updated = {
      ...user,
      profile_photo: photoUrl,
      profile_photo_url: photoUrl,
      profilePhoto: photoUrl,
    } as User;
    setUser(updated);
    const session = await readStoredSession();
    await writeStoredSession({
      access: session?.access || session?.tokens?.access || access,
      refresh: session?.refresh || session?.tokens?.refresh || refresh,
      user: updated,
    });
  };

  // If we have a token but missing photo, pull a fresh user without forcing users to clear storage
  useEffect(() => {
    if (!access || isRefreshingProfile || triedPhotoRefresh) return;
    const needsPhoto = user && !user.profile_photo_url && !user.profile_photo;
    if (needsPhoto) {
      setIsRefreshingProfile(true);
      setTriedPhotoRefresh(true);
      refreshUser().finally(() => setIsRefreshingProfile(false));
    }
  }, [access, user, isRefreshingProfile, triedPhotoRefresh]);

  const logout = async () => {
    authMutationIdRef.current += 1;
    await axios.post('/users/logout/', {}, {
      baseURL: process.env.EXPO_PUBLIC_API_URL?.trim(),
      withCredentials: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);
    setAccess(null);
    setRefresh(null);
    setUser(null);
    setRegisteredPush(false);
    await clearStoredSession();
  };

  const hasCapability = (capability: string, pharmacyId?: number | string | null) => {
    if (!user) return false;
    const role = String(user.role || '').toUpperCase();
    if (role === 'OWNER') return true;
    const assignments: any[] = (user as any).admin_assignments || [];
    return assignments.some((a) => {
      const caps: string[] = a?.capabilities || [];
      const pid = a?.pharmacy_id ?? a?.pharmacyId ?? a?.pharmacy;
      const matchesPharmacy = pharmacyId ? String(pid ?? '') === String(pharmacyId) : true;
      return matchesPharmacy && caps.includes(capability);
    });
  };

  return (
    <AuthContext.Provider
      value={{
        access,
        token: access,
        refresh,
        user,
        hasCapability,
        login,
        loginWithCredentials,
        loginWithStoredSession,
        register,
        logout,
        verifyOTP,
        resendOTP,
        markMobileVerified,
        updateUserProfilePhoto,
        refreshUser,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
