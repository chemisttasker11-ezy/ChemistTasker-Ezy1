// constants/api.ts
import { resolveApiBaseUrl } from '../utils/apiUrl';

export const API_BASE_URL = resolveApiBaseUrl();

export const API_ENDPOINTS = {
  // Auth
  login: '/users/login/',
  register: '/users/register/',
  refresh: '/users/token/refresh/',  
  // ...and all your other endpoints
};
