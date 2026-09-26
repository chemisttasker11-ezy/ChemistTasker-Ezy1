import { createContext, useContext, useMemo, useCallback, useEffect, useState, ReactNode } from 'react';
import { hasInternalWorkspaceAccess } from '@chemisttasker/shared-core';
import { useAuth } from './AuthContext';

type WorkspaceType = 'internal' | 'platform';

interface WorkspaceContextType {
  workspace: WorkspaceType;
  setWorkspace: (workspace: WorkspaceType) => void;
  canUseInternal: boolean;
  selectedPharmacyId: number | null;
  setSelectedPharmacyId: (pharmacyId: number | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceType>('platform');
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<number | null>(null);

  const canUseInternal = useMemo(() => hasInternalWorkspaceAccess(user), [user]);

  useEffect(() => {
    if (!canUseInternal) {
      if (workspace !== 'platform') setWorkspace('platform');
      if (selectedPharmacyId != null) setSelectedPharmacyId(null);
    }
  }, [canUseInternal, selectedPharmacyId, workspace]);

  const guardedSetWorkspace = useCallback(
    (nextWorkspace: WorkspaceType) => {
      if (!canUseInternal) {
        setWorkspace('platform');
        setSelectedPharmacyId(null);
        return;
      }
      setWorkspace(nextWorkspace);
      if (nextWorkspace === 'platform') {
        setSelectedPharmacyId(null);
      }
    },
    [canUseInternal]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        setWorkspace: guardedSetWorkspace,
        canUseInternal,
        selectedPharmacyId,
        setSelectedPharmacyId,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
