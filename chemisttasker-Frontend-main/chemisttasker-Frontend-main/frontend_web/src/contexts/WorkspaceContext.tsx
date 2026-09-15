import { createContext, useContext, useMemo, useCallback, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';

type WorkspaceType = 'internal' | 'platform';

const PHARMACY_STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);
const INTERNAL_PHARMACY_ROLES = new Set(['OWNER', 'PHARMACY_OWNER', 'MANAGER', 'PHARMACY_ADMIN', 'ADMIN', 'ROSTER_MANAGER', 'COMMUNICATION_MANAGER']);

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

  const canUseInternal = useMemo(() => {
    const memberships = Array.isArray((user as any)?.memberships) ? (user as any).memberships : [];
    const hasPharmacyMembership = memberships.some((membership: any) => {
      const rawPharmacyId = membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id;
      const role = String(membership?.role ?? '').toUpperCase();
      const employmentType = String(membership?.employment_type ?? membership?.employmentType ?? '').toUpperCase();
      return Number.isFinite(Number(rawPharmacyId)) && (
        INTERNAL_PHARMACY_ROLES.has(role) ||
        PHARMACY_STAFF_EMPLOYMENT_TYPES.has(employmentType) ||
        employmentType === 'LOCUM' ||
        employmentType === 'SHIFT_HERO'
      );
    });
    const adminAssignments = Array.isArray((user as any)?.admin_assignments) ? (user as any).admin_assignments : [];
    const hasAdminAssignment = adminAssignments.some((assignment: any) => {
      const rawPharmacyId = assignment?.pharmacy_id ?? assignment?.pharmacyId ?? assignment?.pharmacy;
      return Number.isFinite(Number(rawPharmacyId));
    });
    return hasPharmacyMembership || hasAdminAssignment;
  }, [user]);

  useEffect(() => {
    if (!canUseInternal && workspace !== 'platform') {
      setWorkspace('platform');
      setSelectedPharmacyId(null);
    }
  }, [canUseInternal, workspace]);

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
