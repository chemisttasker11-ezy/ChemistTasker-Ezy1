import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

type Guard = {
  discardChanges: () => Promise<boolean>;
  /** Dirty, or a save is still running: leaving must ask this guard first. */
  isBlocking: () => boolean;
};

type ContextValue = {
  isBlocking: () => boolean;
  requestNavigation: (action: () => void, ownGuard?: Guard) => Promise<boolean>;
  registerGuard: (guard: Guard) => () => void;
};

const UnsavedChangesRegistryContext = createContext<ContextValue | null>(null);

export function UnsavedChangesRegistryProvider({ children }: { children: React.ReactNode }) {
  // Every focused guard (a screen and a nested form can both be focused), not just the last one.
  const guardsRef = useRef(new Set<Guard>());

  const registerGuard = useCallback((guard: Guard) => {
    guardsRef.current.add(guard);
    return () => {
      guardsRef.current.delete(guard);
    };
  }, []);

  const isBlocking = useCallback(() => [...guardsRef.current].some((guard) => guard.isBlocking()), []);

  const pendingRef = useRef<{ action: () => void; result: Promise<boolean> } | null>(null);

  // One confirmation commits one navigation: every leave attempt (local Cancel, native removal, tab, notification,
  // scope) joins the open transaction; the latest action replaces the pending one, so Discard runs exactly one and
  // Keep editing runs none. ownGuard: the asking form is asked even when it is not focused (registered).
  const requestNavigation = useCallback((action: () => void, ownGuard?: Guard) => {
    if (pendingRef.current) {
      pendingRef.current.action = action;
      return pendingRef.current.result;
    }

    const pending = { action, result: Promise.resolve(false) };
    pendingRef.current = pending;
    pending.result = (async () => {
      try {
        const guards = new Set(guardsRef.current);
        if (ownGuard) guards.add(ownGuard);
        for (const guard of guards) {
          if (guard.isBlocking() && !(await guard.discardChanges())) {
            return false;
          }
        }
      } finally {
        if (pendingRef.current === pending) pendingRef.current = null;
      }
      // Closed before it runs: a removal this action triggers starts its own transaction instead of being dropped.
      pending.action();
      return true;
    })();
    return pending.result;
  }, []);

  const value = useMemo(
    () => ({
      isBlocking,
      requestNavigation,
      registerGuard,
    }),
    [isBlocking, requestNavigation, registerGuard]
  );

  return (
    <UnsavedChangesRegistryContext.Provider value={value}>
      {children}
    </UnsavedChangesRegistryContext.Provider>
  );
}

export function useUnsavedChangesRegistry() {
  return useContext(UnsavedChangesRegistryContext);
}

/** One guarded navigate for code outside a form (notification taps, local exits): asks every active guard first. */
export function useGuardedNavigation() {
  const registry = useUnsavedChangesRegistry();
  return useCallback(
    (action: () => void) => {
      if (registry) void registry.requestNavigation(action);
      else action();
    },
    [registry]
  );
}
