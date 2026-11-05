/** Render server field errors without assuming every backend value is an array.
 * DRF validation responses can contain strings, numbers, lists or nested objects.
 */
export function formatOnboardingErrors(data: unknown, fallback: string): string {
  if (typeof data === 'string') return data.trim() || fallback;
  if (!data || typeof data !== 'object') return fallback;
  const toMessage = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(toMessage).filter(Boolean).join(', ');
    if (value && typeof value === 'object') return Object.entries(value)
      .map(([key, item]) => `${key}: ${toMessage(item)}`).join('; ');
    return value == null ? '' : String(value);
  };
  const message = Object.entries(data)
    .map(([key, value]) => `${key === 'detail' || key === 'non_field_errors' ? '' : key + ': '}${toMessage(value)}`)
    .filter(Boolean).join('\n').trim();
  return message || fallback;
}
