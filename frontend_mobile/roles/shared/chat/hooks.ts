import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getRooms,
  fetchChatParticipants,
  startDirectMessageByUser,
  startDirectMessageByMembership,
  fetchShiftContacts,
  type ChatRoom,
  type ChatUserLite,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';

type UseChatRoomsResult = {
  rooms: ChatRoom[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useChatRooms(): UseChatRoomsResult {
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const requestRef = useRef(0);
  const [snapshot, setSnapshot] = useState<{ accountId: number | null; rows: ChatRoom[] }>({
    accountId: null,
    rows: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (accountId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data: any = await getRooms();
      if (accountRef.current !== accountId || requestRef.current !== requestId) return;
      const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      setSnapshot({ accountId, rows: list });
    } catch (err: any) {
      if (accountRef.current === accountId && requestRef.current === requestId) {
        setError(err?.message || 'Failed to load rooms');
      }
    } finally {
      if (accountRef.current === accountId && requestRef.current === requestId) setLoading(false);
    }
  }, [accountId]);

  const refresh = useCallback(async () => {
    if (accountId == null) return;
    setRefreshing(true);
    await load();
    if (accountRef.current === accountId) setRefreshing(false);
  }, [accountId, load]);

  useEffect(() => {
    // Never carry room data or a completed request into another signed-in account.
    requestRef.current += 1;
    setSnapshot({ accountId, rows: [] });
    setError(null);
    setRefreshing(false);
    setLoading(accountId != null);
    if (accountId != null) void load();
    return () => { requestRef.current += 1; };
  }, [accountId, load]);

  const rooms = snapshot.accountId === accountId ? snapshot.rows : [];
  return useMemo(
    () => ({
      rooms,
      loading: accountId != null && (snapshot.accountId !== accountId || loading),
      refreshing: snapshot.accountId === accountId && refreshing,
      error: snapshot.accountId === accountId ? error : null,
      reload: load,
      refresh,
    }),
    [rooms, loading, refreshing, error, snapshot.accountId, accountId, load, refresh],
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
    return startDirectMessageByUser(params.userId);
  }
  throw new Error('Missing userId or membershipId for DM start');
}

export function useShiftContacts() {
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const requestRef = useRef(0);
  const [snapshot, setSnapshot] = useState<{ accountId: number | null; rows: any[] }>({
    accountId: null,
    rows: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (accountId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data: any = await fetchShiftContacts();
      if (accountRef.current !== accountId || requestRef.current !== requestId) return;
      const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      setSnapshot({ accountId, rows: list });
    } catch (err: any) {
      if (accountRef.current === accountId && requestRef.current === requestId) {
        setError(err?.message || 'Failed to load shift contacts');
      }
    } finally {
      if (accountRef.current === accountId && requestRef.current === requestId) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    requestRef.current += 1;
    setSnapshot({ accountId, rows: [] });
    setError(null);
    setLoading(accountId != null);
    if (accountId != null) void load();
    return () => { requestRef.current += 1; };
  }, [accountId, load]);

  return {
    contacts: snapshot.accountId === accountId ? snapshot.rows : [],
    loading: accountId != null && (snapshot.accountId !== accountId || loading),
    error: snapshot.accountId === accountId ? error : null,
    reload: load,
  };
}
