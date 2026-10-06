/**
 * Reject late results without cancelling an already accepted server mutation.
 * Each mounted selection owns a scope; each named lane accepts its latest request.
 */
export class StaleAsyncScopeError extends Error {
  constructor() {
    super('The selected workspace changed while the request was in progress.');
    this.name = 'StaleAsyncScopeError';
  }
}

export interface AsyncScopeTicket {
  isCurrent(): boolean;
  assertCurrent(): void;
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export interface AsyncScope {
  activate(): void;
  dispose(): void;
  cancel(lane: string): void;
  begin(lane: string): AsyncScopeTicket;
}

/** No global state: create one instance per mounted, keyed workspace. */
export function createAsyncScope(): AsyncScope {
  let active = true;
  let generation = 0;
  let sequence = 0;
  const lanes = new Map<string, number>();
  return {
    activate() {
      active = true;
      generation += 1;
      lanes.clear();
    },
    dispose() {
      active = false;
      generation += 1;
      lanes.clear();
    },
    cancel(lane) {
      lanes.delete(lane);
    },
    begin(lane) {
      const epoch = generation;
      const id = ++sequence;
      lanes.set(lane, id);
      const isCurrent = () => active && generation === epoch && lanes.get(lane) === id;
      const assertCurrent = () => {
        if (!isCurrent()) throw new StaleAsyncScopeError();
      };
      return {
        isCurrent,
        assertCurrent,
        async run<T>(operation: () => Promise<T>): Promise<T> {
          assertCurrent();
          try {
            const value = await operation();
            assertCurrent();
            return value;
          } catch (error) {
            // A late failure belongs to the old selection just as much as a late success.
            assertCurrent();
            throw error;
          }
        },
      };
    },
  };
}
