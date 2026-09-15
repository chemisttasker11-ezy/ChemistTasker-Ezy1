import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

type Guard = {
  discardChanges: () => Promise<boolean>;
  isDirty: boolean;
};

type ContextValue = {
  requestNavigation: (action: () => void) => Promise<boolean>;
  setActiveGuard: (guard: Guard | null) => void;
};

const UnsavedChangesRegistryContext = createContext<ContextValue | null>(null);

export function UnsavedChangesRegistryProvider({ children }: { children: React.ReactNode }) {
  const activeGuardRef = useRef<Guard | null>(null);

  const setActiveGuard = useCallback((guard: Guard | null) => {
    activeGuardRef.current = guard;
  }, []);

  const requestNavigation = useCallback(async (action: () => void) => {
    const guard = activeGuardRef.current;
    if (!guard?.isDirty) {
      action();
      return true;
    }

    const confirmed = await guard.discardChanges();
    if (!confirmed) {
      return false;
    }

    action();
    return true;
  }, []);

  const value = useMemo(
    () => ({
      requestNavigation,
      setActiveGuard,
    }),
    [requestNavigation, setActiveGuard]
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
