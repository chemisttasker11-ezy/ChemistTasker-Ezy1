import type { ReactionSummary } from '@chemisttasker/shared-core';
import { fetchAllPages } from '@chemisttasker/shared-core';

export interface ActionScope {
  accountKey: string;
  routeKey: string;
  generation: number;
}

export function isScopeCurrent(current: ActionScope, snapshot: ActionScope): boolean {
  return (
    current.accountKey === snapshot.accountKey &&
    current.routeKey === snapshot.routeKey &&
    current.generation === snapshot.generation
  );
}

let opTicketSeq = 0;

export function beginOperation(
  lock: TokenLock,
  scope: ActionScope
): { ticket: number; snapshot: ActionScope } | null {
  const ticket = ++opTicketSeq;
  return lock.acquire(ticket) ? { ticket, snapshot: { ...scope } } : null;
}

export function beginThreadOperation(
  lock: ThreadPagingLock,
  rootId: number,
  scope: ActionScope
): { ticket: number; snapshot: ActionScope } | null {
  const ticket = ++opTicketSeq;
  return lock.acquire(rootId, ticket) ? { ticket, snapshot: { ...scope } } : null;
}

export interface TokenLock {
  isLocked: () => boolean;
  acquire: (token: number) => boolean;
  release: (token: number) => boolean;
  forceRelease: () => void;
}

export function createTokenLock(): TokenLock {
  let activeToken: number | null = null;
  return {
    isLocked: () => activeToken !== null,
    acquire: (token: number) => {
      if (activeToken !== null) return false;
      activeToken = token;
      return true;
    },
    release: (token: number) => {
      if (activeToken === token) {
        activeToken = null;
        return true;
      }
      return false;
    },
    forceRelease: () => {
      activeToken = null;
    },
  };
}

export interface ThreadPagingLock {
  acquire: (rootId: number, token: number) => boolean;
  release: (rootId: number, token: number) => boolean;
  clear: () => void;
}

export function createThreadPagingLock(): ThreadPagingLock {
  const active = new Map<number, number>();
  return {
    acquire: (rootId: number, token: number) => {
      if (active.has(rootId)) return false;
      active.set(rootId, token);
      return true;
    },
    release: (rootId: number, token: number) => {
      if (active.get(rootId) === token) {
        active.delete(rootId);
        return true;
      }
      return false;
    },
    clear: () => {
      active.clear();
    },
  };
}

export function mergeItems<T extends { id: number }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<number, T>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

export function handlePageFailure<T>(
  existing: T[],
  error: unknown
): { items: T[]; error: string } {
  return {
    items: existing,
    error: (error as any)?.message || 'More items could not load.',
  };
}

export interface ReplyThreadState<T = any> {
  items: T[];
  page: number;
  nextPage: number | null;
  serverLoaded: boolean;
  loading: boolean;
  paging: boolean;
  error: string;
  expanded: boolean;
}

export interface DiscussionReplyMap<T = any> {
  [rootId: number]: ReplyThreadState<T> | undefined;
}

export function initialReplyState<T = any>(): ReplyThreadState<T> {
  return {
    items: [],
    page: 1,
    nextPage: null,
    serverLoaded: false,
    loading: false,
    paging: false,
    error: '',
    expanded: false,
  };
}

export function updateReplyThread<T extends { id: number }>(
  threads: DiscussionReplyMap<T>,
  rootId: number,
  updater: (prev: ReplyThreadState<T>) => ReplyThreadState<T>
): DiscussionReplyMap<T> {
  const current = threads[rootId] || initialReplyState<T>();
  return {
    ...threads,
    [rootId]: updater(current),
  };
}

export function insertPostedReply<T extends { id: number; parent?: number | null }>(
  threads: DiscussionReplyMap<T>,
  rootId: number,
  newReply: T
): DiscussionReplyMap<T> {
  const current = threads[rootId] || initialReplyState<T>();
  const merged = mergeItems(current.items, [newReply]);
  return {
    ...threads,
    [rootId]: {
      ...current,
      items: merged,
      expanded: true,
      error: '',
    },
  };
}

export function applyServerReplyPage<T extends { id: number }>(
  current: ReplyThreadState<T>,
  page: number,
  responseResults: T[],
  next: string | null
): ReplyThreadState<T> {
  const merged = page === 1 ? mergeItems(responseResults, current.items) : mergeItems(current.items, responseResults);
  return {
    ...current,
    items: merged,
    page,
    nextPage: next ? page + 1 : null,
    serverLoaded: true,
    loading: false,
    paging: false,
    error: '',
    expanded: true,
  };
}

export function incrementReplyCount<T extends { id: number; reply_count: number }>(
  comments: T[],
  rootId: number
): T[] {
  return comments.map(c => (c.id === rootId ? { ...c, reply_count: (c.reply_count || 0) + 1 } : c));
}

export function updateCommentReactions<T extends { id: number; reactions: ReactionSummary | any }>(
  comments: T[],
  commentId: number,
  reactions: ReactionSummary | any
): T[] {
  return comments.map(c => (c.id === commentId ? { ...c, reactions } : c));
}

export function markCommentDeleted<T extends { id: number; deleted: boolean; body: string; can_delete?: boolean }>(
  comments: T[],
  commentId: number
): T[] {
  return comments.map(c => (c.id === commentId ? { ...c, deleted: true, body: '', can_delete: false } : c));
}

export async function refreshLoadedPublicPages<T extends { id: number }>(
  fetchPage: (page: number) => Promise<{ results: T[]; next: string | null }>,
  loadedPageCount: number
): Promise<{ items: T[]; nextPage: number | null }> {
  const count = Math.max(1, loadedPageCount);
  let hasNext = false;
  let fetched = 0;
  const rows = await fetchAllPages(async (p) => {
    const response = await fetchPage(p);
    fetched = p;
    hasNext = !!response.next;
    return { results: response.results || [], next: p + 1 <= count ? response.next : null };
  });
  return { items: mergeItems([], rows), nextPage: hasNext ? fetched + 1 : null };
}
