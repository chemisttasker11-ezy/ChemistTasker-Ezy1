import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
} from "react";
import type { AdminAssignment } from "./AuthContext";

type AdminScopeValue = {
  assignment: AdminAssignment;
  pharmacyId: number;
};

const AdminScopeContext = createContext<AdminScopeValue | null>(null);

type AdminScopeProviderProps = {
  assignment: AdminAssignment;
  children: ReactNode;
};

export function AdminScopeProvider({ assignment, children }: AdminScopeProviderProps) {
  const value = useMemo<AdminScopeValue>(
    () => ({
      assignment,
      pharmacyId: assignment.pharmacy_id,
    }),
    [assignment],
  );

  return <AdminScopeContext.Provider value={value}>{children}</AdminScopeContext.Provider>;
}

export function useAdminScope() {
  const ctx = useContext(AdminScopeContext);
  if (!ctx) {
    throw new Error("useAdminScope must be used within an AdminScopeProvider");
  }
  return ctx;
}
