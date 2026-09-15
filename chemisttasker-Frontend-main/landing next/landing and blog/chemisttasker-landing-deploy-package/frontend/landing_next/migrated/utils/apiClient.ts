// src/utils/apiClient.ts
import axios, { AxiosError, AxiosResponse } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { clearTokens, refreshCookieSession, getAccessToken } from './tokenService';
import { API_BASE_URL } from '../constants/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

/**
 * REQUEST interceptor
 * - Injects the JWT Bearer token from localStorage.
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.withCredentials = true;
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

/**
 * RESPONSE interceptor
 * - Emit "onboarding-updated" after any successful onboarding write (v1 or v2).
 * - On 401, clear tokens and redirect to /login (avoid redirect loop if already there).
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    try {
      const method = (response.config?.method || '').toLowerCase();
      const url = response.config?.url || '';

      const isWrite = method === 'post' || method === 'patch' || method === 'put';
      const isOnboarding = /\/client-profile\/[^/]+\/onboarding\//.test(url);

      if (isWrite && isOnboarding) {
        window.dispatchEvent(new Event('onboarding-updated'));
      }
    } catch {
      // no-op
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest: any = error.config || {};

    // Attempt refresh once on 401
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshed = await refreshCookieSession(true);
        if (!refreshed?.access) {
          throw new Error('Refresh failed');
        }
        return apiClient(originalRequest);
      } catch (refreshErr) {
        // fall through to logout behaviour
        console.error('Token refresh failed', refreshErr);
      }
    }

    if (error.response?.status === 401) {
      clearTokens();
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
