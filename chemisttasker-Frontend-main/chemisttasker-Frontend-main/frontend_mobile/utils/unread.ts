import apiClient from './apiClient';

export async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await apiClient.get('/client-profile/rooms/?unread=1');
    // Expect unread count in response or count locally
    const data: any = res.data;
    if (typeof data?.unread_total === 'number') return data.unread_total;
    const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    return list.reduce((sum: number, room: any) => sum + (room.unread_count ?? 0), 0);
  } catch {
    return 0;
  }
}
