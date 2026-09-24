import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { getOnboardingDetail } from '@chemisttasker/shared-core';
import { getAdminAssignments, readPersonaSelection } from '@/utils/mobilePersona';

type WorkspaceType = 'internal' | 'platform';

interface WorkspaceContextType {
  workspace: WorkspaceType;
  setWorkspace: (workspace: WorkspaceType) => Promise<void>;
  reloadWorkspace: () => Promise<void>;
  isLoading: boolean;
  canUseInternal: boolean;
  canUsePlatform: boolean;
  selectedPharmacyId: number | null;
  setSelectedPharmacyId: (pharmacyId: number | null) => Promise<void>;
  selectedPharmacyName: string | null;
  setSelectedPharmacyName: (pharmacyName: string | null) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const WORKSPACE_STORAGE_PREFIX = '@chemisttasker_workspace_v2';
const PHARMACY_STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);
const FAVORITE_STAFF_EMPLOYMENT_TYPES = new Set(['LOCUM', 'SHIFT_HERO']);
const INTERNAL_PHARMACY_ROLES = new Set(['OWNER', 'PHARMACY_OWNER', 'MANAGER', 'PHARMACY_ADMIN', 'ADMIN', 'ROSTER_MANAGER', 'COMMUNICATION_MANAGER']);

function coerceVerified(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function isOverallVerified(user: any): boolean {
  return (
    coerceVerified(user?.verified) ||
    coerceVerified(user?.pharmacist_profile?.verified) ||
    coerceVerified(user?.other_staff_profile?.verified)
  );
}

function isWorkerRole(role?: string | null): boolean {
  const normalized = String(role || '').toUpperCase();
  return normalized === 'PHARMACIST' || normalized === 'OTHER_STAFF';
}

function hasFavoriteStaffMembership(user: any): boolean {
  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  return memberships.some((membership: any) => {
    const rawPharmacyId = membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id;
    const employmentType = String(membership?.employment_type ?? membership?.employmentType ?? '').toUpperCase();
    return Number.isFinite(Number(rawPharmacyId)) && FAVORITE_STAFF_EMPLOYMENT_TYPES.has(employmentType);
  });
}

function userIdentity(user: any): string | null {
  const value = user?.id ?? user?.email ?? user?.username;
  return value == null ? null : String(value);
}

async function storageKeys(user: any) {
  const identity = userIdentity(user);
  if (!identity) return null;
  const storedPersona = await readPersonaSelection(user);
  const persona = storedPersona || `ROLE:${String(user?.role || 'UNKNOWN').toUpperCase()}`;
  const scope = `${identity}:${persona}`;
  return {
    workspace: `${WORKSPACE_STORAGE_PREFIX}:${scope}:workspace`,
    pharmacyId: `${WORKSPACE_STORAGE_PREFIX}:${scope}:pharmacy-id`,
    pharmacyName: `${WORKSPACE_STORAGE_PREFIX}:${scope}:pharmacy-name`,
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [workspace, setWorkspaceState] = useState<WorkspaceType>('internal');
  const [selectedPharmacyId, setSelectedPharmacyIdState] = useState<number | null>(null);
  const [selectedPharmacyName, setSelectedPharmacyNameState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canUseInternal, setCanUseInternal] = useState(false);
  const [workerVerified, setWorkerVerified] = useState(false);
  const canUsePlatform = isWorkerRole(user?.role) && (workerVerified || hasFavoriteStaffMembership(user));

  useEffect(() => {
    const memberships = Array.isArray((user as any)?.memberships) ? (user as any).memberships : [];
    const hasPharmacyMembership = memberships.some((membership: any) => {
      const rawPharmacyId = membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id;
      const role = String(membership?.role ?? '').toUpperCase();
      const employmentType = String(membership?.employment_type ?? membership?.employmentType ?? '').toUpperCase();
      return Number.isFinite(Number(rawPharmacyId)) && (
        INTERNAL_PHARMACY_ROLES.has(role) ||
        PHARMACY_STAFF_EMPLOYMENT_TYPES.has(employmentType) ||
        FAVORITE_STAFF_EMPLOYMENT_TYPES.has(employmentType)
      );
    });
    const hasAdminAssignment = getAdminAssignments(user).length > 0;
    const ownerPharmacies = [(user as any)?.pharmacies, (user as any)?.owner_pharmacies, (user as any)?.owned_pharmacies].find(Array.isArray) ?? [];
    const hasOwnerPharmacy = ownerPharmacies.some((pharmacy: any) => Number.isFinite(Number(pharmacy?.id)));
    setCanUseInternal(hasPharmacyMembership || hasAdminAssignment || hasOwnerPharmacy);
  }, [user]);

  useEffect(() => {
    const initialVerified = isOverallVerified(user);
    setWorkerVerified(initialVerified);

    if (!user || !isWorkerRole(user?.role) || initialVerified) return;

    let cancelled = false;
    const roleKey = String(user.role).toUpperCase() === 'PHARMACIST' ? 'pharmacist' : 'other_staff';

    getOnboardingDetail(roleKey)
      .then((onboarding: any) => {
        if (cancelled) return;
        const verifiedFlag =
          onboarding?.verified ??
          onboarding?.data?.verified ??
          (roleKey === 'pharmacist' ? onboarding?.ahpra_verified : undefined);
        setWorkerVerified(coerceVerified(verifiedFlag));
      })
      .catch(() => {
        if (!cancelled) setWorkerVerified(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const reloadWorkspace = useCallback(async () => {
    setIsLoading(true);
    try {
      const keys = await storageKeys(user);
      if (!keys) {
        setWorkspaceState('internal');
        setSelectedPharmacyIdState(null);
        setSelectedPharmacyNameState(null);
        return;
      }
      const [storedWorkspace, rawStoredPharmacyId, storedPharmacyName] = await AsyncStorage.multiGet([
        keys.workspace,
        keys.pharmacyId,
        keys.pharmacyName,
      ]);
      const workspaceValue = storedWorkspace[1];
      setWorkspaceState(workspaceValue === 'platform' ? 'platform' : 'internal');

      const rawId = rawStoredPharmacyId[1];
      const parsedId = Number(rawId);
      setSelectedPharmacyIdState(rawId != null && Number.isFinite(parsedId) ? parsedId : null);
      setSelectedPharmacyNameState(storedPharmacyName[1] || null);
    } catch (error) {
      console.error('Failed to load workspace:', error);
      setWorkspaceState('internal');
      setSelectedPharmacyIdState(null);
      setSelectedPharmacyNameState(null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void reloadWorkspace();
  }, [authLoading, reloadWorkspace]);

  const setWorkspace = useCallback(async (newWorkspace: WorkspaceType) => {
    const targetWorkspace: WorkspaceType = newWorkspace === 'platform' && canUsePlatform ? 'platform' : 'internal';
    setWorkspaceState(targetWorkspace);
    const keys = await storageKeys(user);
    if (!keys) return;
    try {
      await AsyncStorage.setItem(keys.workspace, targetWorkspace);
      if (targetWorkspace === 'platform') {
        setSelectedPharmacyIdState(null);
        setSelectedPharmacyNameState(null);
        await AsyncStorage.multiRemove([keys.pharmacyId, keys.pharmacyName]);
      }
    } catch (error) {
      console.error('Failed to save workspace:', error);
    }
  }, [canUsePlatform, user]);

  const setSelectedPharmacyId = useCallback(async (pharmacyId: number | null) => {
    setSelectedPharmacyIdState(pharmacyId);
    const keys = await storageKeys(user);
    if (!keys) return;
    try {
      if (pharmacyId == null) await AsyncStorage.removeItem(keys.pharmacyId);
      else await AsyncStorage.setItem(keys.pharmacyId, String(pharmacyId));
    } catch (error) {
      console.error('Failed to save selected pharmacy:', error);
    }
  }, [user]);

  const setSelectedPharmacyName = useCallback(async (pharmacyName: string | null) => {
    setSelectedPharmacyNameState(pharmacyName);
    const keys = await storageKeys(user);
    if (!keys) return;
    try {
      if (!pharmacyName) await AsyncStorage.removeItem(keys.pharmacyName);
      else await AsyncStorage.setItem(keys.pharmacyName, pharmacyName);
    } catch (error) {
      console.error('Failed to save selected pharmacy name:', error);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!canUsePlatform && workspace === 'platform') {
      void setWorkspace('internal');
      return;
    }
    if (!canUseInternal && canUsePlatform && workspace !== 'platform') {
      void setWorkspace('platform');
    }
  }, [authLoading, canUseInternal, canUsePlatform, setWorkspace, workspace]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        setWorkspace,
        reloadWorkspace,
        isLoading,
        canUseInternal,
        canUsePlatform,
        selectedPharmacyId,
        setSelectedPharmacyId,
        selectedPharmacyName,
        setSelectedPharmacyName,
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
