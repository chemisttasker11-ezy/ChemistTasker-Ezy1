import {logoutSession} from '../../landing_next/shared/browser-session';
// src/contexts/AuthContext.tsx

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
  Dispatch,
  SetStateAction,
  useCallback,
  useMemo,
} from "react";
import { getRooms } from "@chemisttasker/shared-core";
import { type PersonaMode, type AdminLevel } from "@chemisttasker/shared-core";
import { AdminCapability, ALL_ADMIN_CAPABILITIES } from "../constants/adminCapabilities";
import { API_BASE_URL } from "../constants/api";
import { setTokens, clearTokens, refreshCookieSession, restoreTokensFromStorage, getAccessToken, getRefreshToken, AUTH_TOKENS_CLEARED_EVENT, AUTH_TOKENS_UPDATED_EVENT } from "../utils/tokenService";

export interface OrgMembership {
  organization_id: number;
  organization_name?: string;
  role: string;
  role_label?: string;
  admin_level?: string;
  admin_level_label?: string;
  job_title?: string;
  region?: string | null;
  pharmacies?: { id: number; name: string }[];
  capabilities?: string[];
}

export interface PharmacyMembership {
  pharmacy_id: number;
  pharmacy_name?: string | null;
  role: string;
}

export interface AdminAssignment {
  id?: number;
  pharmacy_id: number;
  pharmacy_name?: string | null;
  admin_level: AdminLevel;
  capabilities: AdminCapability[];
  staff_role?: string | null;
  job_title?: string | null;
}

export type User = {
  id?: number;
  username: string;
  email?: string;
  role: string;
  first_name?: string | null;
  firstName?: string | null;
  last_name?: string | null;
  lastName?: string | null;
  mobile_number?: string | null;
  profile_photo?: string | null;
  profile_photo_url?: string | null;
  profilePhoto?: string | null;
  profilePhotoUrl?: string | null;
  is_pharmacy_admin?: boolean;
  memberships?: Array<OrgMembership | PharmacyMembership>;
  admin_assignments?: AdminAssignment[];
  is_mobile_verified?: boolean;
  billing_active?: boolean;
  in_free_trial?: boolean;
};

type AuthContextType = {
  access: string | null;
  token: string | null;
  refresh: string | null;
  user: User | null;
  login: (access: string, refresh: string, user: User, rememberMe?: boolean) => void;
  logout: () => Promise<boolean>;
  isLoading: boolean;
  setUser: Dispatch<SetStateAction<User | null>>;
  unreadCount: number;
  refreshUnreadCount: () => void;
  adminAssignments: AdminAssignment[];
  hasCapability: (capability: AdminCapability, pharmacyId?: number) => boolean;
  isAdminUser: boolean;
  activePersona: PersonaMode;
  activeAdminAssignmentId: number | null;
  activeAdminAssignment: AdminAssignment | null;
  activeAdminPharmacyId: number | null;
  selectRolePersona: (role: "PHARMACIST" | "OTHER_STAFF") => void;
  selectAdminPersona: (assignmentId: number) => void;
  setActivePersona: (persona: PersonaMode) => void;
};

export const AuthContext = createContext<AuthContextType>({
  access: null,
  token: null,
  refresh: null,
  user: null,
  login: () => { },
  logout: async () => false,
  isLoading: true,
  setUser: () => { },
  unreadCount: 0,
  refreshUnreadCount: () => { },
  adminAssignments: [],
  hasCapability: () => false,
  isAdminUser: false,
  activePersona: "staff",
  activeAdminAssignmentId: null,
  activeAdminAssignment: null,
  activeAdminPharmacyId: null,
  selectRolePersona: () => { },
  selectAdminPersona: () => { },
  setActivePersona: () => { },
});

type AuthProviderProps = {
  children: ReactNode;
};

const PERSONA_KEY_PREFIX = "ct-active-persona";

function personaStorageKey(userId?: number) {
  return userId ? `${PERSONA_KEY_PREFIX}:${userId}` : PERSONA_KEY_PREFIX;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [access, setAccess] = useState<string | null>(null);
  const [refresh, setRefresh] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [activePersona, setActivePersonaState] = useState<PersonaMode>("staff");
  const [activeAdminAssignmentId, setActiveAdminAssignmentId] = useState<number | null>(null);

  const clearLocalAuthState = useCallback(() => {
    setAccess(null);
    setRefresh(null);
    setUser(null);
    setActivePersonaState("staff");
    setActiveAdminAssignmentId(null);
  }, []);

  const fetchCurrentUser = useCallback(async (): Promise<User | null> => {
    const token=getAccessToken();
    const resp=await fetch(`${API_BASE_URL}/users/me/`,{credentials:'include',headers:token?{Authorization:`Bearer ${token}`}:{}});
    if(resp.status===401)return null;
    if(!resp.ok)throw new Error('Your account is temporarily unavailable.');
    return await resp.json() as User;
  }, []);

  const ownedPharmacyIds = useMemo<Set<number>>(() => {
    const ownerSet = new Set<number>();
    const records = user?.memberships ?? [];
    for (const record of records) {
      if (
        record &&
        typeof record === "object" &&
        "pharmacy_id" in record &&
        "role" in record &&
        (record as PharmacyMembership).role === "OWNER"
      ) {
        const pid = Number((record as PharmacyMembership).pharmacy_id);
        if (!Number.isNaN(pid)) {
          ownerSet.add(pid);
        }
      }
    }
    return ownerSet;
  }, [user?.memberships]);

  const adminAssignments = useMemo<AdminAssignment[]>(() => {
    const assignmentsFromApi = Array.isArray(user?.admin_assignments)
      ? user!.admin_assignments
      : [];

    const isKnownCapability = (cap: unknown): cap is AdminCapability =>
      typeof cap === "string" && ALL_ADMIN_CAPABILITIES.includes(cap as AdminCapability);

    const byPharmacy = new Map<number, AdminAssignment>();
    const normalizedAssignments: AdminAssignment[] = [];

    assignmentsFromApi.forEach((assignmentRaw) => {
      const rawCaps = Array.isArray(assignmentRaw.capabilities) ? assignmentRaw.capabilities : [];
      const capabilities = rawCaps.filter(isKnownCapability);
      const assignment: AdminAssignment = {
        ...assignmentRaw,
        capabilities,
      };
      if (typeof assignment.pharmacy_id === "number") {
        byPharmacy.set(assignment.pharmacy_id, assignment);
      }
      normalizedAssignments.push(assignment);
    });

    const membershipRecords = Array.isArray(user?.memberships) ? user!.memberships : [];
    membershipRecords.forEach((membership) => {
      if (!membership || typeof membership !== "object" || !("pharmacy_id" in membership)) {
        return;
      }
      const pharmacyId = Number((membership as PharmacyMembership).pharmacy_id);
      if (!Number.isFinite(pharmacyId) || byPharmacy.has(pharmacyId)) {
        return;
      }
      const role = String((membership as PharmacyMembership).role || "").toUpperCase();
      const isOwner =
        role === "OWNER" ||
        role === "PHARMACY_OWNER" ||
        (membership as any).is_pharmacy_owner === true;
      if (isOwner) {
        return;
      }
      const isAdminLike =
        role === "MANAGER" ||
        role === "PHARMACY_ADMIN" ||
        role === "ADMIN" ||
        role === "ROSTER_MANAGER" ||
        role === "COMMUNICATION_MANAGER";
      if (!isAdminLike) {
        return;
      }
      const syntheticId = -Math.max(Math.abs(pharmacyId), normalizedAssignments.length + 1);
      const synthetic: AdminAssignment = {
        id: syntheticId,
        pharmacy_id: pharmacyId,
        pharmacy_name: (membership as any).pharmacy_name ?? null,
        admin_level: isOwner ? "OWNER" : "MANAGER",
        capabilities: [...ALL_ADMIN_CAPABILITIES],
        staff_role: (membership as any).staff_role ?? null,
        job_title: (membership as any).job_title ?? null,
      };
      byPharmacy.set(pharmacyId, synthetic);
      normalizedAssignments.push(synthetic);
    });

    return normalizedAssignments;
  }, [user]);

  const activeAdminAssignment = useMemo<AdminAssignment | null>(() => {
    if (activeAdminAssignmentId == null) {
      return null;
    }
    return (
      adminAssignments.find((assignment) => assignment.id === activeAdminAssignmentId) ?? null
    );
  }, [adminAssignments, activeAdminAssignmentId]);

  const activeAdminPharmacyId = activeAdminAssignment?.pharmacy_id ?? null;

  // Only treat the user as having an admin persona when there is an explicit admin assignment.
  // Owner memberships alone should not trigger the persona switcher.
  const isAdminUser = adminAssignments.length > 0;

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await restoreTokensFromStorage();
        let parsedUser: User | null = await fetchCurrentUser();

        if (!parsedUser) {
          {
            const refreshed = await refreshCookieSession(true);
            if (refreshed) {
              parsedUser = await fetchCurrentUser();
            }
          }
        }

        if (!parsedUser) {
          clearTokens();
          clearLocalAuthState();
          setIsLoading(false);
          return;
        }

        setAccess(getAccessToken());
        setRefresh(getRefreshToken());
        setUser(parsedUser);
      } catch {
        setSessionError('Unable to connect to your account. Please retry.');
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, [clearLocalAuthState, fetchCurrentUser]);
  useEffect(() => {
    if (!user) {
      setActivePersonaState("staff");
      setActiveAdminAssignmentId(null);
      return;
    }

    const storageKey = user.id !== undefined ? personaStorageKey(user.id) : null;
    const storedSelection = storageKey ? localStorage.getItem(storageKey) : null;

    const applyAdmin = (assignmentId: number | null) => {
      if (assignmentId == null) {
        return;
      }
      setActiveAdminAssignmentId((prev) => (prev === assignmentId ? prev : assignmentId));
      setActivePersonaState((prev) => (prev === "admin" ? prev : "admin"));
      if (storageKey) {
        localStorage.setItem(storageKey, `ADMIN:${assignmentId}`);
      }
    };

    const applyRole = (role: "PHARMACIST" | "OTHER_STAFF" | null) => {
      setActiveAdminAssignmentId((prev) => (prev === null ? prev : null));
      setActivePersonaState((prev) => (prev === "staff" ? prev : "staff"));
      if (!storageKey) {
        return;
      }
      if (role) {
        localStorage.setItem(storageKey, `ROLE:${role}`);
      } else {
        localStorage.removeItem(storageKey);
      }
    };

    if (user.role === "OWNER") {
      setActiveAdminAssignmentId(null);
      setActivePersonaState("staff");
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
      return;
    }

    const assignments = adminAssignments;
    let applied = false;
    if (storedSelection && storedSelection.startsWith("ADMIN:") && assignments.length > 0) {
      const storedId = Number(storedSelection.split(":")[1]);
      const match = assignments.find((assignment) => assignment.id === storedId);
      if (match?.id != null) {
        applyAdmin(match.id);
        applied = true;
      }
    }

    if (!applied && storedSelection && storedSelection.startsWith("ROLE:")) {
      const storedRole = storedSelection.split(":")[1];
      if (
        (storedRole === "PHARMACIST" || storedRole === "OTHER_STAFF") &&
        user.role === storedRole
      ) {
        applyRole(storedRole);
        applied = true;
      }
    }

    if (!applied) {
      if (assignments.length > 0 && assignments[0]?.id != null) {
        applyAdmin(assignments[0].id!);
      } else if (user.role === "PHARMACIST" || user.role === "OTHER_STAFF") {
        applyRole(user.role);
      } else {
        applyRole(null);
      }
    }
  }, [user, adminAssignments]);

  const refreshUnreadCount = useCallback(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    getRooms()
      .then((res: any) => {
        const rooms: any[] = Array.isArray(res?.results) ? res.results : res;
        const totalUnread = rooms.reduce((sum, room) => sum + (room.unread_count || 0), 0);
        setUnreadCount(totalUnread);
      })
      .catch(() => setUnreadCount(0));
  }, [user]);

  useEffect(() => {
    refreshUnreadCount();
  }, [user, refreshUnreadCount]);

  const hasCapability = useCallback(
    (capability: AdminCapability, pharmacyId?: number) => {
      if (user?.role === "OWNER") {
        return true;
      }

      const orgMemberships = (user?.memberships ?? []).filter(
        (membership): membership is OrgMembership =>
          Boolean(membership && typeof membership === "object" && "organization_id" in membership)
      );
      const orgHasCapability = orgMemberships.some((membership) => {
        const capabilities = Array.isArray(membership.capabilities) ? membership.capabilities : [];
        const hasRequested = capabilities.some(
          (value) => String(value).replaceAll("-", "_").toUpperCase() === capability
        );
        if (!hasRequested) return false;
        if (typeof pharmacyId !== "number") return true;
        if (String(membership.role || "").toUpperCase() === "ORG_ADMIN") return true;
        const scoped = Array.isArray(membership.pharmacies) ? membership.pharmacies : [];
        return scoped.some((pharmacy) => Number(pharmacy.id) === pharmacyId);
      });

      if (typeof pharmacyId === "number") {
        if (ownedPharmacyIds.has(pharmacyId)) {
          return true;
        }
        const match = adminAssignments.find(
          (assignment) => assignment.pharmacy_id === pharmacyId
        );
        return Boolean(match?.capabilities.includes(capability) || orgHasCapability);
      }

      if (ownedPharmacyIds.size > 0 || orgHasCapability) {
        return true;
      }
      if (activeAdminAssignment) {
        return activeAdminAssignment.capabilities.includes(capability);
      }
      return adminAssignments.some((assignment) =>
        assignment.capabilities.includes(capability)
      );
    },
    [activeAdminAssignment, adminAssignments, ownedPharmacyIds, user]
  );

  const selectRolePersona = useCallback(
    (role: "PHARMACIST" | "OTHER_STAFF") => {
      if (!user || user.role !== role) {
        return;
      }
      setActiveAdminAssignmentId(null);
      setActivePersonaState("staff");
      if (user.id) {
        localStorage.setItem(personaStorageKey(user.id), `ROLE:${role}`);
      }
    },
    [user]
  );

  const selectAdminPersona = useCallback(
    (assignmentId: number) => {
      const exists = adminAssignments.some((assignment) => assignment.id === assignmentId);
      if (!exists) {
        return;
      }
      setActivePersonaState("admin");
      setActiveAdminAssignmentId(assignmentId);
      if (user?.id) {
        localStorage.setItem(personaStorageKey(user.id), `ADMIN:${assignmentId}`);
      }
    },
    [adminAssignments, user?.id]
  );

  const setActivePersona = useCallback(
    (next: PersonaMode) => {
      if (next === "admin") {
        const fallbackId =
          activeAdminAssignmentId ??
          adminAssignments.find((assignment) => assignment.id != null)?.id ??
          null;
        if (fallbackId != null) {
          selectAdminPersona(fallbackId);
        }
      } else {
        if (user?.role === "PHARMACIST" || user?.role === "OTHER_STAFF") {
          selectRolePersona(user.role);
        } else {
          setActivePersonaState("staff");
          setActiveAdminAssignmentId(null);
          if (user?.id) {
            localStorage.removeItem(personaStorageKey(user.id));
          }
        }
      }
    },
    [
      activeAdminAssignmentId,
      adminAssignments,
      selectAdminPersona,
      selectRolePersona,
      user,
    ]
  );

  const login = (newAccess: string, newRefresh: string, userInfo: User, rememberMe?: boolean) => {
    setTokens(newAccess, newRefresh, rememberMe);
    setAccess(newAccess);
    setRefresh(newRefresh);
    setActivePersonaState("staff");
    setActiveAdminAssignmentId(null);
    setUser(userInfo);
  };

  const logout = useCallback(async () => {
    const previousUserId=user?.id;
    try {
      await logoutSession(API_BASE_URL);
      clearLocalAuthState();clearTokens();
      if(previousUserId)localStorage.removeItem(personaStorageKey(previousUserId));
      return true;
    } catch {setSessionError('Could not log out. Check your connection and retry.');return false;}
  }, [clearLocalAuthState,user?.id]);

  useEffect(()=>{const sync=()=>{setAccess(getAccessToken());setRefresh(getRefreshToken());};window.addEventListener(AUTH_TOKENS_UPDATED_EVENT,sync);return()=>window.removeEventListener(AUTH_TOKENS_UPDATED_EVENT,sync);},[]);

  useEffect(() => {
    const handleTokensCleared = () => {
      const previousUserId = user?.id;
      clearLocalAuthState();
      if (previousUserId) {
        localStorage.removeItem(personaStorageKey(previousUserId));
      }
    };
    window.addEventListener(AUTH_TOKENS_CLEARED_EVENT, handleTokensCleared);
    return () => {
      window.removeEventListener(AUTH_TOKENS_CLEARED_EVENT, handleTokensCleared);
    };
  }, [clearLocalAuthState, user?.id]);

  return (
    <AuthContext.Provider
      value={{
        access,
        token: access,
        refresh,
        user,
        login,
        logout,
        isLoading,
        setUser,
        unreadCount,
        refreshUnreadCount,
        adminAssignments,
        hasCapability,
        isAdminUser,
        activePersona,
        activeAdminAssignmentId,
        activeAdminAssignment,
        activeAdminPharmacyId,
        selectRolePersona,
        selectAdminPersona,
        setActivePersona,
      }}
    >
      {sessionError?<div role="alert" style={{padding:24}}><p>{sessionError}</p><button onClick={()=>window.location.reload()}>Reconnect</button><button onClick={()=>{setSessionError('');void logout();}}>Retry logout</button></div>:children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
