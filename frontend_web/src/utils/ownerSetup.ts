import { fetchPharmaciesService, getOnboardingDetail } from "@chemisttasker/shared-core";
import type { User } from "../contexts/AuthContext";

export type OwnerSetupStatus = {
  onboardingExists: boolean;
  onboardingComplete: boolean;
  pharmaciesCount: number;
  numberOfPharmacies: number;
  nextPath: string | null;
};

const OWNER_ONBOARDING_PATH = "/setup/owner/onboarding";
const OWNER_PHARMACIES_PATH = "/setup/owner/pharmacies";
const OWNER_PHARMACY_SETUP_SKIPPED_KEY = "owner-pharmacy-setup-skipped";

function countOwnedPharmaciesFromUser(user?: User | null) {
  if (!user) return 0;

  for (const key of ["owned_pharmacies", "owner_pharmacies", "pharmacies"]) {
    const value = (user as any)[key];
    if (Array.isArray(value) && value.length > 0) {
      return value.length;
    }
  }

  if (!Array.isArray(user.memberships)) return 0;

  const ownedPharmacyIds = new Set<number>();
  for (const membership of user.memberships) {
    if (!membership || typeof membership !== "object" || !("pharmacy_id" in membership)) {
      continue;
    }

    const role = String((membership as any).role || "").toUpperCase();
    const isOwner =
      role === "OWNER" ||
      role === "PHARMACY_OWNER" ||
      (membership as any).is_pharmacy_owner === true;

    const pharmacyId = Number((membership as any).pharmacy_id);
    if (isOwner && Number.isFinite(pharmacyId)) {
      ownedPharmacyIds.add(pharmacyId);
    }
  }

  return ownedPharmacyIds.size;
}

function hasSkippedPharmacySetup() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(OWNER_PHARMACY_SETUP_SKIPPED_KEY) === "true";
}

export async function getOwnerSetupStatus(user?: User | null): Promise<OwnerSetupStatus> {
  const ownedPharmaciesCount = countOwnedPharmaciesFromUser(user);
  if (ownedPharmaciesCount > 0) {
    return {
      onboardingExists: true,
      onboardingComplete: true,
      pharmaciesCount: ownedPharmaciesCount,
      numberOfPharmacies: ownedPharmaciesCount,
      nextPath: null,
    };
  }

  try {
    const onboarding = await getOnboardingDetail("owner");
    const numberOfPharmacies = Math.max(1, Number((onboarding as any)?.number_of_pharmacies) || 1);
    const onboardingComplete = Boolean(
      (onboarding as any)?.submitted_for_verification ||
        (
          (onboarding as any)?.first_name &&
          (onboarding as any)?.last_name &&
          (onboarding as any)?.username &&
          (onboarding as any)?.phone_number &&
          (onboarding as any)?.role
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

    const pharmacies = await fetchPharmaciesService({});
    const pharmaciesCount = Array.isArray(pharmacies) ? pharmacies.length : 0;

    return {
      onboardingExists: true,
      onboardingComplete: true,
      pharmaciesCount,
      numberOfPharmacies,
      nextPath: pharmaciesCount > 0 || hasSkippedPharmacySetup() ? null : OWNER_PHARMACIES_PATH,
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
};

export function markOwnerPharmacySetupSkipped() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(OWNER_PHARMACY_SETUP_SKIPPED_KEY, "true");
}

export function clearOwnerPharmacySetupSkipped() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(OWNER_PHARMACY_SETUP_SKIPPED_KEY);
}
