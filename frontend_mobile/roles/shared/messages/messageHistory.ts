/** Room-scoped helpers for native message pagination and scroll behavior. */
export type HistoricalMessage = { id: number | string; created_at: string };

export function mergeOlderMessages<T extends HistoricalMessage>(existing: T[], older: T[]): T[] {
  const byId = new Map<string, T>();
  for (const message of older) byId.set(String(message.id), message);
  // The current WebSocket/session version always wins over an older page's snapshot.
  for (const message of existing) byId.set(String(message.id), message);
  return [...byId.values()].sort((a, b) => {
    const timeA = Date.parse(a.created_at) || 0;
    const timeB = Date.parse(b.created_at) || 0;
    return timeA - timeB || String(a.id).localeCompare(String(b.id));
  });
}

export function shouldAutoFollowMessage(ownMessage: boolean, readerNearBottom: boolean): boolean {
  return ownMessage || readerNearBottom;
}

/** Prevent a stale/cross-room pagination URL from loading messages for a different room. */
export function isNextPageForRoom(nextUrl: string | null, roomId: number): boolean {
  if (!nextUrl || !Number.isSafeInteger(roomId) || roomId <= 0) return false;
  try {
    const pathname = decodeURIComponent(new URL(nextUrl, 'https://chat-page.local').pathname).replace(/\/+$/, '');
    return pathname.endsWith(`/rooms/${roomId}/messages`);
  } catch {
    return false;
  }
}
