import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useWorkspace } from './WorkspaceContext';
import {
  getAdminAssignments,
  getAssignmentId,
  getAssignmentPharmacyId,
  getAssignmentPharmacyName,
  getSelectedAdminAssignment,
  selectAdminPersona,
  type MobileAdminAssignment,
} from '@/utils/mobilePersona';

type AdminWorkspaceContextValue = {
  assignments: MobileAdminAssignment[];
  activeAssignment: MobileAdminAssignment | null;
  activePharmacyId: number | null;
  activePharmacyName: string;
  selectAssignment: (assignmentId: number) => Promise<void>;
  isLoading: boolean;
};

const AdminWorkspaceContext = createContext<AdminWorkspaceContextValue | null>(null);

export function AdminWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { reloadWorkspace, setSelectedPharmacyId, setSelectedPharmacyName } = useWorkspace();
  const assignments = useMemo(() => getAdminAssignments(user), [user]);
  const [activeAssignmentId, setActiveAssignmentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void getSelectedAdminAssignment(user)
      .then(async (assignment) => {
        if (!active) return;
        setActiveAssignmentId(getAssignmentId(assignment));
        await reloadWorkspace();
        if (!active) return;
        const pharmacyId = getAssignmentPharmacyId(assignment);
        const pharmacyName = assignment ? getAssignmentPharmacyName(assignment) : null;
        await setSelectedPharmacyId(pharmacyId);
        await setSelectedPharmacyName(pharmacyName);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadWorkspace, setSelectedPharmacyId, setSelectedPharmacyName, user]);

  const activeAssignment = useMemo(
    () => activeAssignmentId == null
      ? null
      : assignments.find((assignment) => getAssignmentId(assignment) === activeAssignmentId) ?? null,
    [activeAssignmentId, assignments],
  );

  const selectAssignment = useCallback(async (assignmentId: number) => {
    const selected = await selectAdminPersona(user, assignmentId);
    setActiveAssignmentId(getAssignmentId(selected));
    await reloadWorkspace();
    await setSelectedPharmacyId(getAssignmentPharmacyId(selected));
    await setSelectedPharmacyName(selected ? getAssignmentPharmacyName(selected) : null);
  }, [reloadWorkspace, setSelectedPharmacyId, setSelectedPharmacyName, user]);

  const value = useMemo<AdminWorkspaceContextValue>(() => ({
    assignments,
    activeAssignment,
    activePharmacyId: getAssignmentPharmacyId(activeAssignment),
    activePharmacyName: getAssignmentPharmacyName(activeAssignment),
    selectAssignment,
    isLoading,
  }), [activeAssignment, assignments, isLoading, selectAssignment]);

  return <AdminWorkspaceContext.Provider value={value}>{children}</AdminWorkspaceContext.Provider>;
}

export function useAdminWorkspace() {
  const context = useContext(AdminWorkspaceContext);
  if (!context) {
    throw new Error('useAdminWorkspace must be used within AdminWorkspaceProvider');
  }
  return context;
}
