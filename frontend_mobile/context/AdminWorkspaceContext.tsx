import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
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
  const assignments = useMemo(() => getAdminAssignments(user), [user]);
  const [activeAssignmentId, setActiveAssignmentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void getSelectedAdminAssignment(user)
      .then((assignment) => {
        if (!active) return;
        setActiveAssignmentId(getAssignmentId(assignment));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const activeAssignment = useMemo(
    () => assignments.find((assignment) => getAssignmentId(assignment) === activeAssignmentId) ?? assignments[0] ?? null,
    [activeAssignmentId, assignments],
  );

  const selectAssignment = useCallback(async (assignmentId: number) => {
    const selected = await selectAdminPersona(user, assignmentId);
    setActiveAssignmentId(getAssignmentId(selected));
  }, [user]);

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
