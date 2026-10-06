import { API_ENDPOINTS as SHARED_ENDPOINTS } from '@chemisttasker/shared-core';

const normalizeApiBaseUrl = (value: string) => {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/api/v1')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
};

const rawApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_URL || '');
const useLocalProxy =
  import.meta.env.DEV &&
  /^http:\/\/(localhost|127\.0\.0\.1):8000\/api\/?$/.test(rawApiBaseUrl);

export const API_BASE_URL = useLocalProxy
  ? `${window.location.origin}/api`
  : rawApiBaseUrl;

export const API_ENDPOINTS = SHARED_ENDPOINTS;
