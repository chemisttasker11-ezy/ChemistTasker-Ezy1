// src/utils/apiClient.ts
import {csrfToken,expireBrowserSession,getSessionGeneration} from '../../shared/browser-session';
import axios, { AxiosError, AxiosResponse } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { refreshCookieSession, getAccessToken } from './tokenService';
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
  async (config: InternalAxiosRequestConfig & { sessionGeneration?: number }) => {
    const generation = getSessionGeneration();
    if (config.sessionGeneration !== undefined && config.sessionGeneration !== generation) throw new axios.CanceledError();
    config.sessionGeneration = generation;
    config.withCredentials = true;
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if(!['get','head','options'].includes((config.method||'get').toLowerCase())) {
      config.headers['X-CSRFToken']=await csrfToken(API_BASE_URL);
    }
    if (generation !== getSessionGeneration()) throw new axios.CanceledError();
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
      const isOnboarding = /\/[^/]+\/onboarding\//.test(url);

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

    if (error.response?.status !== 401 || originalRequest.sessionGeneration !== getSessionGeneration()) return Promise.reject(error);
    if (!originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshed = await refreshCookieSession(true);
        if (refreshed?.access) return apiClient(originalRequest);
      } catch (refreshErr) {
        if (originalRequest.sessionGeneration === getSessionGeneration()) expireBrowserSession(refreshErr);
        return Promise.reject(refreshErr);
      }
    }

    if (originalRequest.sessionGeneration === getSessionGeneration()) expireBrowserSession();
    return Promise.reject(error);
  }
);

export default apiClient;
