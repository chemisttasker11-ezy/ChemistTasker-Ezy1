import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { getOnboardingDetail, hasFavoriteStaffMembership, hasInternalWorkspaceAccess } from '@chemisttasker/shared-core';

type WorkspaceType = 'internal' | 'platform';

interface WorkspaceContextType {
  workspace: WorkspaceType;
  setWorkspace: (workspace: WorkspaceType) => void;
  isLoading: boolean;
  canUseInternal: boolean;
  canUsePlatform: boolean;
  selectedPharmacyId: number | null;
  setSelectedPharmacyId: (pharmacyId: number | null) => void;
  selectedPharmacyName: string | null;
  setSelectedPharmacyName: (pharmacyName: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const WORKSPACE_STORAGE_KEY = '@chemisttasker_workspace';
const PHARMACY_ID_STORAGE_KEY = '@chemisttasker_selected_pharmacy_id';
const PHARMACY_NAME_STORAGE_KEY = '@chemisttasker_selected_pharmacy_name';
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [workspace, setWorkspaceState] = useState<WorkspaceType>('internal');
  const [selectedPharmacyId, setSelectedPharmacyIdState] = useState<number | null>(null);
  const [selectedPharmacyName, setSelectedPharmacyNameState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workerVerified, setWorkerVerified] = useState(false);
  const canUseInternal = hasInternalWorkspaceAccess(user);
  const canUsePlatform = isWorkerRole(user?.role) && (workerVerified || hasFavoriteStaffMembership(user));

  useEffect(() => {
    loadWorkspace();
  }, []);

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

  useEffect(() => {
    if (authLoading || isLoading) return;
    if (!canUseInternal && (selectedPharmacyId != null || selectedPharmacyName != null)) {
      setSelectedPharmacyIdState(null);
      setSelectedPharmacyNameState(null);
      AsyncStorage.multiRemove([PHARMACY_ID_STORAGE_KEY, PHARMACY_NAME_STORAGE_KEY]).catch(() => null);
    }
    if (!canUsePlatform && workspace === 'platform') {
      setWorkspaceState('internal');
      AsyncStorage.setItem(WORKSPACE_STORAGE_KEY, 'internal').catch(() => null);
      return;
    }
    if (!canUseInternal) {
      if (canUsePlatform && workspace !== 'platform') {
        setWorkspaceState('platform');
        setSelectedPharmacyIdState(null);
        setSelectedPharmacyNameState(null);
        AsyncStorage.setItem(WORKSPACE_STORAGE_KEY, 'platform').catch(() => null);
        AsyncStorage.multiRemove([PHARMACY_ID_STORAGE_KEY, PHARMACY_NAME_STORAGE_KEY]).catch(() => null);
      }
    }
  }, [authLoading, canUseInternal, canUsePlatform, isLoading, selectedPharmacyId, selectedPharmacyName, workspace]);

  const loadWorkspace = async () => {
    try {
      const stored = await AsyncStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (stored === 'internal' || stored === 'platform') {
        setWorkspaceState(stored);
      }
      const rawStoredPharmacyId = await AsyncStorage.getItem(PHARMACY_ID_STORAGE_KEY);
      const storedPharmacyId = Number(rawStoredPharmacyId);
      if (rawStoredPharmacyId != null && Number.isFinite(storedPharmacyId) && storedPharmacyId > 0) {
        setSelectedPharmacyIdState(storedPharmacyId);
      }
      const storedPharmacyName = await AsyncStorage.getItem(PHARMACY_NAME_STORAGE_KEY);
      if (storedPharmacyName) {
        setSelectedPharmacyNameState(storedPharmacyName);
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setWorkspace = async (newWorkspace: WorkspaceType) => {
    const targetWorkspace: WorkspaceType = newWorkspace === 'platform' && canUsePlatform
      ? 'platform'
      : canUseInternal ? 'internal' : canUsePlatform ? 'platform' : 'internal';
    try {
      await AsyncStorage.setItem(WORKSPACE_STORAGE_KEY, targetWorkspace);
      setWorkspaceState(targetWorkspace);
      if (targetWorkspace === 'platform' || !canUseInternal) {
        setSelectedPharmacyIdState(null);
        setSelectedPharmacyNameState(null);
        await AsyncStorage.multiRemove([PHARMACY_ID_STORAGE_KEY, PHARMACY_NAME_STORAGE_KEY]);
      }
    } catch (error) {
      console.error('Failed to save workspace:', error);
      setWorkspaceState(targetWorkspace);
      if (targetWorkspace === 'platform' || !canUseInternal) {
        setSelectedPharmacyIdState(null);
        setSelectedPharmacyNameState(null);
      }
    }
  };

  const setSelectedPharmacyId = async (pharmacyId: number | null) => {
    setSelectedPharmacyIdState(pharmacyId);
    try {
      if (pharmacyId == null) {
        await AsyncStorage.removeItem(PHARMACY_ID_STORAGE_KEY);
      } else {
        await AsyncStorage.setItem(PHARMACY_ID_STORAGE_KEY, String(pharmacyId));
      }
    } catch (error) {
      console.error('Failed to save selected pharmacy:', error);
    }
  };

  const setSelectedPharmacyName = async (pharmacyName: string | null) => {
    setSelectedPharmacyNameState(pharmacyName);
    try {
      if (!pharmacyName) {
        await AsyncStorage.removeItem(PHARMACY_NAME_STORAGE_KEY);
      } else {
        await AsyncStorage.setItem(PHARMACY_NAME_STORAGE_KEY, pharmacyName);
      }
    } catch (error) {
      console.error('Failed to save selected pharmacy name:', error);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        setWorkspace,
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
