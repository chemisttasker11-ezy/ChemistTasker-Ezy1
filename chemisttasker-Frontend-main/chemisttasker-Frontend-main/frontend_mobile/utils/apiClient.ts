// utils/apiClient.ts
import axios from 'axios';
import { clearStoredSession, getValidAccessToken, refreshAccessToken } from './authSession';

// Prefer an env-driven base URL so the app can talk to the backend from devices/emulators.
// Set EXPO_PUBLIC_API_URL for Expo (e.g. http://192.168.1.10:8000/api).
const normalizeApiBaseUrl = (value?: string) => {
    const trimmed = (value || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const API_BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);

if (!API_BASE_URL) {
    // Fail fast in development so we don't silently point to localhost on devices.
    // Configure EXPO_PUBLIC_API_URL in your env (e.g., .env or project settings).
    throw new Error(
        'EXPO_PUBLIC_API_URL is not set. Please set it to your backend base URL (e.g., http://192.168.x.x:8000/api).'
    );
}

// Create axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Cookie-based auth fallback AND Bearer token injection
apiClient.interceptors.request.use(
    async (config) => {
        config.withCredentials = true;
        try {
            const token = await getValidAccessToken(API_BASE_URL);
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            } else {
                delete config.headers.Authorization;
            }
        } catch (e) {
            // Ignore storage errors
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If 401 and we haven't retried yet, try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise(function (resolve, reject) {
                    failedQueue.push({ resolve, reject });
                })
                    .then(() => {
                        return apiClient(originalRequest);
                    })
                    .catch((err) => {
                        return Promise.reject(err);
                    });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const nextToken = await refreshAccessToken(API_BASE_URL);
                if (!nextToken) {
                    throw new Error('Refresh failed');
                }
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${nextToken}`;
                processQueue(null, null);
                return apiClient(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                await clearStoredSession();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export const clearLocalAuthData = async () => {
    isRefreshing = false;
    failedQueue = [];
    await clearStoredSession();
};

export async function fetchWsTicket(): Promise<string | null> {
    try {
        const response = await apiClient.post('/users/ws-ticket/');
        return response.data?.ticket ?? null;
    } catch (e) {
        console.warn('Failed to fetch ws ticket', e);
        return null;
    }
}

export default apiClient;
