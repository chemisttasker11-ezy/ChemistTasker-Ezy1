/**
 * Error extraction helper for membership operations across browser (Axios)
 * and native/SDK (ApiError) transports.
 */
export function getMembershipErrorMessage(error: any, fallback: string): string {
  const detail = error?.response?.data?.detail ?? (error?.payload && typeof error.payload === 'object' ? (error.payload as any).detail : undefined);
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0 && typeof detail[0] === 'string' && detail[0].trim()) return detail[0];
  if (typeof error?.message === 'string' && error.message.trim() && !error.message.startsWith('Request failed with status')) {
    return error.message;
  }
  const responseData = error?.response?.data;
  if (typeof responseData === 'string' && responseData.trim()) return responseData;
  if (typeof responseData?.error === 'string' && responseData.error.trim()) return responseData.error;
  if (typeof responseData?.message === 'string' && responseData.message.trim()) return responseData.message;
  const payload = error?.payload;
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object') {
    const payloadObj = payload as Record<string, unknown>;
    if (typeof payloadObj.error === 'string' && payloadObj.error.trim()) return payloadObj.error;
    if (typeof payloadObj.message === 'string' && payloadObj.message.trim()) return payloadObj.message;
  }
  return fallback;
}
