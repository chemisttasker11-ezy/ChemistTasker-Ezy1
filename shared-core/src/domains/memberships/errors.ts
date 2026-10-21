import { ApiError } from '../../transport/errors';

/**
 * Error extraction helper for membership operations across browser (Axios)
 * and native/SDK (ApiError) transports.
 */
export function getMembershipErrorMessage(error: any, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status >= 400 && error.status < 500) {
      const message = error.message;
      if (typeof message === 'string' && message.trim() && !message.startsWith('Request failed with status')) {
        return message;
      }
    }
    return fallback;
  }

  const responseStatus = error?.response?.status;
  if (typeof responseStatus === 'number' && responseStatus >= 500) {
    return fallback;
  }
  if (typeof error?.status === 'number' && error.status >= 500) {
    return fallback;
  }

  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0 && typeof detail[0] === 'string' && detail[0].trim()) {
    return detail[0];
  }

  return fallback;
}
