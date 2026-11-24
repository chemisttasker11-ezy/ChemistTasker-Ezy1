type QueueStorage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

export const SESSION_ENDED_MESSAGE = 'Your session ended. Sign in to carry on where you left off.';
export const LOGOUT_QUEUED_MESSAGE = "Signed out on this device. We'll finish signing you out of the server when you're back online.";

export function isSessionRejection(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 400 || status === 401;
}

export function createLogoutQueue<Entry>(
  storage: QueueStorage, key: string, send: (entry: Entry) => Promise<unknown>,
) {
  let pending: Promise<unknown> = Promise.resolve();
  let retrying: Promise<void> | undefined;
  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = pending.then(work);
    pending = result.catch(() => undefined);
    return result;
  }
  const read = async (): Promise<Entry[]> => JSON.parse((await storage.getItem(key)) ?? '[]');
  const write = async (entries: Entry[]) => {
    if (entries.length) await storage.setItem(key, JSON.stringify(entries));
    else await storage.removeItem(key);
  };
  const flush = async (entries: Entry[]) => {
    const remaining: Entry[] = [];
    for (const entry of entries) {
      try { await send(entry); }
      catch { remaining.push(entry); }
    }
    await write(remaining);
    return remaining;
  };
  return {
    enqueue: (entry: Entry, attempt = true, sendFirst: (entry: Entry) => Promise<unknown> = send) =>
      serialize(async () => {
        const entries = await read();
        await write([...entries, entry]);
        if (!attempt) return false;
        try { await sendFirst(entry); }
        catch { return false; }
        await write(entries);
        return true;
      }),
    retry: () => {
      retrying ??= serialize(async () => { await flush(await read()); }).finally(() => { retrying = undefined; });
      return retrying;
    },
    beforeBrowserLogin: <T>(login: () => Promise<T>, attempt = true) => serialize(async () => {
      const queued = await read();
      const remaining = attempt && queued.length ? await flush(queued) : queued;
      if (remaining.length) {
        const detail = 'Your previous sign-out is still pending. Reconnect and try again.';
        throw Object.assign(new Error(detail), { status: 409, payload: { detail } });
      }
      return login();
    }),
  };
}

