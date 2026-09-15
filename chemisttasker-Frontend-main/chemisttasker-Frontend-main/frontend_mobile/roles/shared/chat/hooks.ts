import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getRooms,
  fetchChatParticipants,
  startDirectMessageByUser,
  startDirectMessageByMembership,
  fetchShiftContacts,
  type ChatRoom,
  type ChatUserLite,
} from '@chemisttasker/shared-core';

type UseChatRoomsResult = {
  rooms: ChatRoom[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useChatRooms(): UseChatRoomsResult {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: any = await getRooms();
      const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      setRooms(list);
    } catch (err: any) {
      setError(err?.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return useMemo(
    () => ({
      rooms,
      loading,
      refreshing,
      error,
      reload: load,
      refresh,
    }),
    [rooms, loading, refreshing, error, load, refresh],
  );
}

export async function searchParticipants(query: string): Promise<ChatUserLite[]> {
  const data: any = await fetchChatParticipants();
  const list = (Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : []) as ChatUserLite[];
  const q = query.toLowerCase();
  return list.filter((p) => {
    const first = (p as any).first_name || (p as any).firstName || '';
    const last = (p as any).last_name || (p as any).lastName || '';
    const email = (p as any).email || '';
    return `${first} ${last}`.toLowerCase().includes(q) || email.toLowerCase().includes(q);
  });
}

type StartDmParams =
  | { userId: number; membershipId?: undefined }
  | { membershipId: number; userId?: undefined };

export async function startDirectChat(params: StartDmParams) {
  if ('membershipId' in params && params.membershipId) {
    return startDirectMessageByMembership(params.membershipId, null);
  }
  if ('userId' in params && params.userId) {
    return startDirectMessageByUser({ userId: params.userId });
  }
  throw new Error('Missing userId or membershipId for DM start');
}

export function useShiftContacts() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await fetchShiftContacts();
      const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      setContacts(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { contacts, loading, reload: load };
}
