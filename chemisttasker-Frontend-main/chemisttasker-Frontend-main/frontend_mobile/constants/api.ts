// constants/api.ts
const normalizeApiBaseUrl = (value?: string) => {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

export const API_BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);

export const API_ENDPOINTS = {
  // Auth
  login: '/users/login/',
  register: '/users/register/',
  refresh: '/users/token/refresh/',  
  // ...and all your other endpoints
};
