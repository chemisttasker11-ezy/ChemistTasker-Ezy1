import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPharmaciesService, getOnboarding } from '@chemisttasker/shared-core';
import type { User } from '../context/AuthContext';

export type OwnerSetupStatus = {
  onboardingExists: boolean;
  onboardingComplete: boolean;
  pharmaciesCount: number;
  numberOfPharmacies: number;
  nextPath: string | null;
};

const OWNER_ONBOARDING_PATH = '/setup/owner/onboarding';
const OWNER_PHARMACIES_PATH = '/setup/owner/pharmacies';
const OWNER_DASHBOARD_PATH = '/owner/dashboard';
const OWNER_PHARMACY_SETUP_SKIPPED_KEY = 'owner_pharmacy_setup_skipped';

export async function markOwnerPharmacySetupSkipped() {
  await AsyncStorage.setItem(OWNER_PHARMACY_SETUP_SKIPPED_KEY, 'true');
}

export async function clearOwnerPharmacySetupSkipped() {
  await AsyncStorage.removeItem(OWNER_PHARMACY_SETUP_SKIPPED_KEY);
}

async function isOwnerPharmacySetupSkipped() {
  return (await AsyncStorage.getItem(OWNER_PHARMACY_SETUP_SKIPPED_KEY)) === 'true';
}

function countOwnedPharmaciesFromUser(user?: User | null) {
  if (!user) return 0;

  for (const key of ['owned_pharmacies', 'owner_pharmacies', 'pharmacies']) {
    const value = (user as any)[key];
    if (Array.isArray(value) && value.length > 0) {
      return value.length;
    }
  }

  if (!Array.isArray(user.memberships)) return 0;

  const ownedPharmacyIds = new Set<number>();
  for (const membership of user.memberships) {
    if (!membership || typeof membership !== 'object') {
      continue;
    }

    const pharmacyId = Number((membership as any).pharmacy_id ?? (membership as any).pharmacyId);
    const role = String((membership as any).role || '').toUpperCase();
    const isOwner =
      role === 'OWNER' ||
      role === 'PHARMACY_OWNER' ||
      (membership as any).is_pharmacy_owner === true;

    if (isOwner && Number.isFinite(pharmacyId)) {
      ownedPharmacyIds.add(pharmacyId);
    }
  }

  return ownedPharmacyIds.size;
}

export async function getOwnerSetupStatus(user?: User | null): Promise<OwnerSetupStatus> {
  const ownedPharmaciesCount = countOwnedPharmaciesFromUser(user);
  if (ownedPharmaciesCount > 0) {
    await clearOwnerPharmacySetupSkipped().catch(() => null);
    return {
      onboardingExists: true,
      onboardingComplete: true,
      pharmaciesCount: ownedPharmaciesCount,
      numberOfPharmacies: ownedPharmaciesCount,
      nextPath: null,
    };
  }

  try {
    const onboarding: any = await getOnboarding('owner');
    const numberOfPharmacies = Math.max(1, Number(onboarding?.number_of_pharmacies) || 1);
    const onboardingComplete = Boolean(
      onboarding?.submitted_for_verification || (
        onboarding?.first_name &&
        onboarding?.last_name &&
        onboarding?.username &&
        onboarding?.phone_number &&
        onboarding?.role
      )
    );

    if (!onboardingComplete) {
      return {
        onboardingExists: true,
        onboardingComplete: false,
        pharmaciesCount: 0,
        numberOfPharmacies,
        nextPath: OWNER_ONBOARDING_PATH,
      };
    }

    const pharmacies: any = await fetchPharmaciesService({});
    const pharmacyList = Array.isArray(pharmacies?.results) ? pharmacies.results : Array.isArray(pharmacies) ? pharmacies : [];
    const pharmaciesCount = pharmacyList.length;
    const skippedPharmacySetup = pharmaciesCount === 0 ? await isOwnerPharmacySetupSkipped() : false;

    if (pharmaciesCount > 0) {
      await clearOwnerPharmacySetupSkipped().catch(() => null);
    }

    return {
      onboardingExists: true,
      onboardingComplete: true,
      pharmaciesCount,
      numberOfPharmacies,
      nextPath: pharmaciesCount > 0 || skippedPharmacySetup ? null : OWNER_PHARMACIES_PATH,
    };
  } catch (error: any) {
    if (error?.status === 404 || error?.response?.status === 404) {
      return {
        onboardingExists: false,
        onboardingComplete: false,
        pharmaciesCount: 0,
        numberOfPharmacies: 1,
        nextPath: OWNER_ONBOARDING_PATH,
      };
    }
    throw error;
  }
}

export const ownerSetupPaths = {
  onboarding: OWNER_ONBOARDING_PATH,
  pharmacies: OWNER_PHARMACIES_PATH,
  dashboard: OWNER_DASHBOARD_PATH,
};
