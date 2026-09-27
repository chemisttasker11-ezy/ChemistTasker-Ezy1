import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { getOnboardingDetail, hasFavoriteStaffMembership, hasInternalWorkspaceAccess, hasVerifiedWorkerProfile, resolveWorkspaceMode } from '@chemisttasker/shared-core';
import { readPersonaSelection } from '@/utils/mobilePersona';

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
function isWorkerRole(role?: string | null): boolean {
  const normalized = String(role || '').toUpperCase();
  return normalized === 'PHARMACIST' || normalized === 'OTHER_STAFF';
}

function isPlatformOnlyRole(role?: string | null): boolean {
  return String(role || '').toUpperCase() === 'EXPLORER';
}

async function storageKeys(user: any) {
  const identity = user?.id ?? user?.email ?? user?.username;
  if (identity == null) return null;
  const storedPersona = await readPersonaSelection(user);
  const persona = storedPersona || `ROLE:${String(user?.role || 'UNKNOWN').toUpperCase()}`;
  const scope = `${String(identity)}:${persona}`;
  return {
    persona,
    workspace: `${WORKSPACE_STORAGE_PREFIX}:${scope}:workspace`,
    pharmacyId: `${WORKSPACE_STORAGE_PREFIX}:${scope}:pharmacy-id`,
    pharmacyName: `${WORKSPACE_STORAGE_PREFIX}:${scope}:pharmacy-name`,
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [workspacePreference, setWorkspacePreference] = useState<WorkspaceType>('platform');
  const [activePersona, setActivePersona] = useState('');
  const [selectedPharmacyId, setSelectedPharmacyIdState] = useState<number | null>(null);
  const [selectedPharmacyName, setSelectedPharmacyNameState] = useState<string | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [verificationLoading, setVerificationLoading] = useState(true);
  const [workerVerified, setWorkerVerified] = useState(false);
  const canUseInternal = hasInternalWorkspaceAccess(user);
  const workerRole = isWorkerRole(user?.role);
  const platformOnlyRole = isPlatformOnlyRole(user?.role);
  const canUsePlatform = platformOnlyRole || (workerRole && (workerVerified || hasFavoriteStaffMembership(user)));
  const workspace = resolveWorkspaceMode({
    role: user?.role,
    preferred: workspacePreference,
    hasInternal: canUseInternal,
    hasPlatform: canUsePlatform,
    persona: activePersona,
  });
  const isLoading = storageLoading || verificationLoading;

  useEffect(() => {
    const initialVerified = hasVerifiedWorkerProfile(user);
    setWorkerVerified(initialVerified);

    if (!user || !isWorkerRole(user?.role) || initialVerified) {
      setVerificationLoading(false);
      return;
    }

    let cancelled = false;
    setVerificationLoading(true);
    const roleKey = String(user.role).toUpperCase() === 'PHARMACIST' ? 'pharmacist' : 'other_staff';

    getOnboardingDetail(roleKey)
      .then((onboarding: any) => {
        if (cancelled) return;
        setWorkerVerified(hasVerifiedWorkerProfile(onboarding));
      })
      .catch(() => {
        if (!cancelled) setWorkerVerified(false);
      })
      .finally(() => {
        if (!cancelled) setVerificationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const reloadWorkspace = useCallback(async () => {
    setStorageLoading(true);
    try {
      const keys = await storageKeys(user);
      if (!keys) {
        setWorkspacePreference('platform');
        setActivePersona('');
        setSelectedPharmacyIdState(null);
        setSelectedPharmacyNameState(null);
        return;
      }
      const values = await AsyncStorage.multiGet([keys.workspace, keys.pharmacyId, keys.pharmacyName]);
      const storedWorkspace = values[0][1];
      const rawPharmacyId = values[1][1];
      const parsedPharmacyId = Number(rawPharmacyId);
      setActivePersona(keys.persona);
      setWorkspacePreference(storedWorkspace === 'internal' ? 'internal' : 'platform');
      setSelectedPharmacyIdState(rawPharmacyId != null && Number.isFinite(parsedPharmacyId) && parsedPharmacyId > 0 ? parsedPharmacyId : null);
      setSelectedPharmacyNameState(values[2][1] || null);
    } catch (error) {
      console.error('Failed to load workspace:', error);
      setWorkspacePreference('platform');
      setActivePersona('');
      setSelectedPharmacyIdState(null);
      setSelectedPharmacyNameState(null);
    } finally {
      setStorageLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void reloadWorkspace();
  }, [authLoading, reloadWorkspace]);

  const setWorkspace = useCallback(async (newWorkspace: WorkspaceType) => {
    const targetWorkspace = resolveWorkspaceMode({
      role: user?.role,
      preferred: newWorkspace,
      hasInternal: canUseInternal,
      hasPlatform: canUsePlatform,
      persona: activePersona,
    });
    setWorkspacePreference(targetWorkspace);
    const keys = await storageKeys(user);
    if (!keys) return;
    try {
      await AsyncStorage.setItem(keys.workspace, targetWorkspace);
      if (targetWorkspace === 'platform' || !canUseInternal) {
        setSelectedPharmacyIdState(null);
        setSelectedPharmacyNameState(null);
        await AsyncStorage.multiRemove([keys.pharmacyId, keys.pharmacyName]);
      }
    } catch (error) {
      console.error('Failed to save workspace:', error);
    }
  }, [activePersona, canUseInternal, canUsePlatform, user]);

  const setSelectedPharmacyId = useCallback(async (pharmacyId: number | null) => {
    setSelectedPharmacyIdState(pharmacyId);
    const keys = await storageKeys(user);
    if (!keys) return;
    try {
      if (pharmacyId == null) {
        await AsyncStorage.removeItem(keys.pharmacyId);
      } else {
        await AsyncStorage.setItem(keys.pharmacyId, String(pharmacyId));
      }
    } catch (error) {
      console.error('Failed to save selected pharmacy:', error);
    }
  }, [user]);

  const setSelectedPharmacyName = useCallback(async (pharmacyName: string | null) => {
    setSelectedPharmacyNameState(pharmacyName);
    const keys = await storageKeys(user);
    if (!keys) return;
    try {
      if (!pharmacyName) {
        await AsyncStorage.removeItem(keys.pharmacyName);
      } else {
        await AsyncStorage.setItem(keys.pharmacyName, pharmacyName);
      }
    } catch (error) {
      console.error('Failed to save selected pharmacy name:', error);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || isLoading || workspacePreference === workspace) return;
    void setWorkspace(workspace);
  }, [authLoading, isLoading, setWorkspace, workspace, workspacePreference]);

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
