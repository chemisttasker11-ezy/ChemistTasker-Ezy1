import { canPublishTalent, getOnboarding } from '@chemisttasker/shared-core';
import { useCallback, useEffect, useRef, useState } from 'react';

export type EligibilityStatus = 'idle' | 'loading' | 'verified' | 'ineligible' | 'error';

export interface EligibilityUser {
  id?: number | string | null;
  role?: string | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
  is_mobile_verified?: boolean | null;
  isMobileVerified?: boolean | null;
}

export interface EligibilityState {
  status: EligibilityStatus;
  staffPublicAccess: boolean | null;
  error: string | null;
  userKey?: string | null;
}

export type OnboardingLoader = (roleKey: 'pharmacist' | 'otherstaff') => Promise<any>;
export type CanPublishFn = (user: any, profile: any, today?: string) => boolean;

export function resolveStaffRoleKey(role?: string | null): 'pharmacist' | 'otherstaff' | null {
  const normalized = String(role || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'PHARMACIST') return 'pharmacist';
  if (normalized === 'OTHER_STAFF') return 'otherstaff';
  return null;
}

export function computeUserKey(user: EligibilityUser | null | undefined): string | null {
  if (!user?.id) return null;
  const role = String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_');
  const mobile = user?.is_mobile_verified ?? (user as any)?.isMobileVerified ?? false;
  const active = user?.is_active ?? (user as any)?.isActive ?? true;
  return `${user.id}:${role}:${mobile}:${active}`;
}

export class EligibilityManager {
  private user: EligibilityUser | null = null;
  private attempt = 0;
  private state: EligibilityState = { status: 'idle', staffPublicAccess: null, error: null, userKey: null };
  private listeners = new Set<(state: EligibilityState) => void>();
  private loader: OnboardingLoader;
  private canPublish: CanPublishFn;
  private getToday?: () => string;

  constructor(
    loader: OnboardingLoader = getOnboarding,
    canPublish: CanPublishFn = canPublishTalent,
    getToday?: () => string,
  ) {
    this.loader = loader;
    this.canPublish = canPublish;
    this.getToday = getToday;
  }

  getState(): EligibilityState {
    return this.state;
  }

  subscribe(listener: (state: EligibilityState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  setUser(user: EligibilityUser | null | undefined): void {
    const nextUser = user ?? null;
    const prevKey = computeUserKey(this.user);
    const nextKey = computeUserKey(nextUser);
    const roleKey = resolveStaffRoleKey(nextUser?.role);

    this.user = nextUser;

    if (!roleKey) {
      this.attempt += 1;
      this.state = { status: 'idle', staffPublicAccess: null, error: null, userKey: nextKey };
      this.notify();
      return;
    }

    if (prevKey !== nextKey || this.state.status === 'idle') {
      void this.load();
    }
  }

  async load(): Promise<void> {
    const roleKey = resolveStaffRoleKey(this.user?.role);
    const currentKey = computeUserKey(this.user);
    if (!roleKey || !this.user) {
      this.state = { status: 'idle', staffPublicAccess: null, error: null, userKey: currentKey };
      this.notify();
      return;
    }

    const currentAttempt = ++this.attempt;
    const currentUserId = this.user.id;
    const currentRole = this.user.role;
    const currentUser = this.user;

    this.state = { status: 'loading', staffPublicAccess: null, error: null, userKey: currentKey };
    this.notify();

    try {
      const profile = await this.loader(roleKey);
      if (this.attempt !== currentAttempt || this.user?.id !== currentUserId || this.user?.role !== currentRole) {
        return;
      }
      const allowed = this.canPublish(currentUser, profile, this.getToday?.());
      this.state = {
        status: allowed ? 'verified' : 'ineligible',
        staffPublicAccess: allowed,
        error: null,
        userKey: currentKey,
      };
      this.notify();
    } catch (err: any) {
      if (this.attempt !== currentAttempt || this.user?.id !== currentUserId || this.user?.role !== currentRole) {
        return;
      }
      this.state = {
        status: 'error',
        staffPublicAccess: null,
        error: err?.message || 'Unable to verify publishing eligibility',
        userKey: currentKey,
      };
      this.notify();
    }
  }

  retry(): void {
    void this.load();
  }
}

export function usePublicAvailabilityEligibility(
  user: EligibilityUser | null | undefined,
  loader: OnboardingLoader = getOnboarding,
  canPublish: CanPublishFn = canPublishTalent,
  getToday?: () => string,
) {
  const managerRef = useRef<EligibilityManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new EligibilityManager(loader, canPublish, getToday);
  }
  const manager = managerRef.current;
  const [state, setState] = useState<EligibilityState>(() => manager.getState());

  const currentUserKey = computeUserKey(user);
  const isTalentStaff = Boolean(resolveStaffRoleKey(user?.role));

  useEffect(() => {
    return manager.subscribe(setState);
  }, [manager]);

  useEffect(() => {
    manager.setUser(user);
  }, [
    manager,
    user?.id,
    user?.role,
    user?.is_mobile_verified,
    (user as any)?.isMobileVerified,
    user?.is_active,
    (user as any)?.isActive,
  ]);

  const retry = useCallback(() => {
    manager.retry();
  }, [manager]);

  const effectiveState: EligibilityState =
    state.userKey === currentUserKey
      ? state
      : {
          status: isTalentStaff ? 'loading' : 'idle',
          staffPublicAccess: null,
          error: null,
          userKey: currentUserKey,
        };

  return {
    ...effectiveState,
    retry,
    isTalentStaff,
  };
}
