export function safeHubAttachmentUrl(value: unknown, expectedId?: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace('/api/public-hub/attachments/', '/api/hub/attachments/');
  const match = normalized.match(/^\/api\/hub\/attachments\/(\d+)\/?$/);
  if (!match) return undefined;
  if (expectedId !== undefined && Number(match[1]) !== expectedId) return undefined;
  return normalized;
}
