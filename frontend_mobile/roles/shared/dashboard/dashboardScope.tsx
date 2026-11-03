import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Divider, Icon, IconButton, Modal, Portal, Surface, Text } from 'react-native-paper';
import { usePathname, useRouter } from 'expo-router';
import { canAccessOrganizationPharmacies, fetchAccessibleOrganizationPharmacies, getOrganizationDashboard, getOwnerDashboard, getPharmacistDashboard, getOtherStaffDashboard, getOrganizationMembership, getPendingPharmacyAdminInvitations, hasOrganizationAccess, isInternalPharmacyMembership, ORG_PORTAL_ROLES } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useUnsavedChangesRegistry } from '@/roles/shared/forms/UnsavedChangesRegistryProvider';
import {
  getAdminAssignments,
  getAssignmentId,
  selectAdminPersona,
  selectRolePersona,
} from '@/utils/mobilePersona';

export type PharmacyOption = {
  id: number;
  name: string;
  helper?: string;
};

export type DashboardPayload = {
  user?: { first_name?: string; username?: string };
  selected_pharmacy?: { id?: number; name?: string };
  community_shifts_count?: number;
  shift_summary?: {
    open_count?: number;
    confirmed_count?: number;
    all_count?: number;
    upcoming_count?: number;
    community_count?: number;
  };
  upcoming_stats?: { today?: number; week?: number; month?: number };
  invoice_summary?: {
    unpaid_count?: number;
    unpaid_total?: string | number;
    total_billed?: string | number;
  };
  activity?: Array<{
    title?: string;
    description?: string;
    message?: string;
    created_at?: string;
    timestamp?: string;
    time?: string;
    action_url?: string;
    actionUrl?: string;
  }>;
  shifts?: import('./WorkerShiftPreviews').DashboardWorkerShift[];
  recommended_shifts?: import('./WorkerShiftPreviews').DashboardWorkerShift[];
  bills_summary?: { total_billed?: string | number; points?: string | number };
};

const ORG_ROLES = new Set<string>(ORG_PORTAL_ROLES);

const isWorkerRole = (role?: string | null) => {
  const normalized = String(role || '').toUpperCase();
  return normalized === 'PHARMACIST' || normalized === 'OTHER_STAFF';
};

const addPharmacy = (map: Map<number, PharmacyOption>, idRaw: unknown, nameRaw: unknown, helper?: string) => {
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) return;
  const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : `Pharmacy #${id}`;
  if (!map.has(id)) map.set(id, { id, name, helper });
};

export function collectDashboardPharmacies(user: any): PharmacyOption[] {
  const byId = new Map<number, PharmacyOption>();
  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  memberships.forEach((membership: any) => {
    const role = String(membership?.role ?? '').toUpperCase();
    const employmentType = String(membership?.employment_type ?? membership?.employmentType ?? '').toUpperCase();
    if (isInternalPharmacyMembership(membership)) {
      addPharmacy(
        byId,
        membership?.pharmacy_id ?? membership?.pharmacyId ?? membership?.pharmacy?.id,
        membership?.pharmacy_name ?? membership?.pharmacyName ?? membership?.pharmacy?.name,
        role === 'OWNER' || role === 'PHARMACY_OWNER'
          ? 'Owner'
          : employmentType === 'LOCUM'
            ? 'Locum'
            : employmentType === 'SHIFT_HERO'
              ? 'Shift Hero'
              : membership?.role
      );
    }
    if (canAccessOrganizationPharmacies(membership) && Array.isArray(membership?.pharmacies)) {
      membership.pharmacies.forEach((pharmacy: any) => addPharmacy(byId, pharmacy?.id, pharmacy?.name, 'Organization pharmacy'));
    }
  });

  const adminAssignments = Array.isArray(user?.admin_assignments) ? user.admin_assignments : [];
  adminAssignments.forEach((assignment: any) => {
    addPharmacy(
      byId,
      assignment?.pharmacy_id ?? assignment?.pharmacyId ?? assignment?.pharmacy,
      assignment?.pharmacy_name ?? assignment?.pharmacyName,
      assignment?.admin_level ?? 'Admin assignment'
    );
  });

  const ownerPharmacies = [user?.pharmacies, user?.owner_pharmacies, user?.owned_pharmacies].find(Array.isArray) ?? [];
  ownerPharmacies.forEach((pharmacy: any) => addPharmacy(byId, pharmacy?.id, pharmacy?.name, 'Owner pharmacy'));

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function dashboardEndpointForRole(role?: string | null) {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'OWNER') return '/dashboard/owner/';
  if (normalized === 'PHARMACIST') return '/dashboard/pharmacist/';
  if (normalized === 'OTHER_STAFF') return '/dashboard/otherstaff/';
  return null;
}

type DashboardRequest = { scopeKey: string; generation: number };

export function isCurrentDashboardRequest(request: DashboardRequest, current: DashboardRequest) {
  return request.scopeKey === current.scopeKey && request.generation === current.generation;
}

export function singlePharmacyDefault(
  pharmacies: PharmacyOption[],
  selectedPharmacyId: number | null,
  workspace: string,
  isOrganizationDashboard: boolean,
) {
  return workspace === 'internal' && !isOrganizationDashboard && selectedPharmacyId == null && pharmacies.length === 1
    ? pharmacies[0]
    : null;
}

export function useScopedDashboard(roleOverride?: string | null) {
  const { user } = useAuth();
  const {
    workspace,
    setWorkspace,
    selectedPharmacyId,
    selectedPharmacyName,
    setSelectedPharmacyId,
    setSelectedPharmacyName,
    canUsePlatform,
    isLoading: workspaceLoading,
  } = useWorkspace();
  const role = roleOverride ?? user?.role;
  const isOrganizationDashboard = ORG_ROLES.has(String(role || '').toUpperCase());
  const scopedWorkspace = isOrganizationDashboard ? 'internal' : workspace;
  const organizationId = getOrganizationMembership(user)?.organization_id;
  const scopeKey = `${user?.id}:${role}:${organizationId}:${scopedWorkspace}:${selectedPharmacyId}:${workspaceLoading}`;
  const dashboardRequest = useRef<DashboardRequest>({ scopeKey, generation: 0 });
  // The shell picker uses another hook instance; invalidate on render, before any new load/effect runs.
  if (dashboardRequest.current.scopeKey !== scopeKey) {
    dashboardRequest.current = { scopeKey, generation: dashboardRequest.current.generation + 1 };
  }
  useEffect(() => () => { dashboardRequest.current.generation += 1; }, []);
  const [organizationPharmacies, setOrganizationPharmacies] = useState<PharmacyOption[]>([]);
  useEffect(() => {
    if (!organizationId) {
      setOrganizationPharmacies((previous) => (previous.length ? [] : previous));
      return;
    }
    let active = true;
    setOrganizationPharmacies((previous) => (previous.length ? [] : previous));
    fetchAccessibleOrganizationPharmacies(organizationId)
      .then((items) => { if (active) setOrganizationPharmacies((previous) => (!previous.length && !items.length ? previous : items)); })
      .catch(() => { if (active) setOrganizationPharmacies((previous) => (previous.length ? [] : previous)); });
    return () => { active = false; };
  }, [organizationId]);
  const pharmacies = useMemo(() => {
    const byId = new Map(collectDashboardPharmacies(user).map((item) => [item.id, item]));
    organizationPharmacies.forEach((item) => byId.set(item.id, { ...item, helper: 'Organization pharmacy' }));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [user, organizationPharmacies]);
  const canSelectPlatform = canUsePlatform && isWorkerRole(role);

  const selectPlatform = useCallback(() => {
    if (!canSelectPlatform) return;
    dashboardRequest.current.generation += 1;
    setWorkspace('platform');
    setSelectedPharmacyId(null);
    setSelectedPharmacyName(null);
  }, [canSelectPlatform, setSelectedPharmacyId, setSelectedPharmacyName, setWorkspace]);

  const selectPharmacy = useCallback(
    (pharmacy: PharmacyOption) => {
      dashboardRequest.current.generation += 1;
      setWorkspace('internal');
      setSelectedPharmacyId(pharmacy.id);
      setSelectedPharmacyName(pharmacy.name);
    },
    [setSelectedPharmacyId, setSelectedPharmacyName, setWorkspace]
  );
  const selectAllOrganizationPharmacies = useCallback(() => {
    dashboardRequest.current.generation += 1;
    setWorkspace('internal');
    setSelectedPharmacyId(null);
    setSelectedPharmacyName(null);
  }, [setWorkspace, setSelectedPharmacyId, setSelectedPharmacyName]);

  const fetchDashboard = useCallback(async () => {
    if (workspaceLoading) return null;
    const endpoint = isOrganizationDashboard ? null : dashboardEndpointForRole(role);
    if (!isOrganizationDashboard && !endpoint) return null;
    const request = { scopeKey, generation: ++dashboardRequest.current.generation };
    const params =
      scopedWorkspace === 'platform'
        ? { workspace: 'platform' }
        : selectedPharmacyId != null
        ? { workspace: 'internal', pharmacy_id: selectedPharmacyId }
        : { workspace: 'internal' };
    try {
      const organizationId = getOrganizationMembership(user)?.organization_id;
      if (isOrganizationDashboard && organizationId == null) {
        throw new Error('Your organization membership is unavailable.');
      }
      const normalizedRole = String(role || '').toUpperCase();
      const payload = (isOrganizationDashboard && organizationId != null
        ? await getOrganizationDashboard(organizationId, params)
        : normalizedRole === 'OWNER'
          ? await getOwnerDashboard(params)
          : normalizedRole === 'PHARMACIST'
            ? await getPharmacistDashboard(params)
            : await getOtherStaffDashboard(params)) as DashboardPayload;
      const selected = payload?.selected_pharmacy?.id != null
        ? payload.selected_pharmacy
        : singlePharmacyDefault(pharmacies, selectedPharmacyId, scopedWorkspace, isOrganizationDashboard);
      if (selected?.id != null && isCurrentDashboardRequest(request, dashboardRequest.current)) {
        setSelectedPharmacyId(Number(selected.id));
        setSelectedPharmacyName(selected?.name ?? selectedPharmacyName ?? null);
      }
      return payload as DashboardPayload;
    } catch (error: any) {
      if ((error?.response?.status ?? error?.status) === 403 && isCurrentDashboardRequest(request, dashboardRequest.current)) {
        const firstPharmacy = pharmacies[0];
        if (firstPharmacy && scopedWorkspace === 'internal') {
          selectPharmacy(firstPharmacy);
        } else if (canSelectPlatform) {
          selectPlatform();
        }
      }
      throw error;
    }
  }, [
    canSelectPlatform,
    isOrganizationDashboard,
    pharmacies,
    role,
    user,
    selectPharmacy,
    selectPlatform,
    selectedPharmacyId,
    selectedPharmacyName,
    setSelectedPharmacyId,
    setSelectedPharmacyName,
    scopedWorkspace,
    scopeKey,
    workspaceLoading,
  ]);

  const scopeLabel =
    scopedWorkspace === 'platform'
      ? 'ChemistTasker Platform'
      : selectedPharmacyId == null && ORG_ROLES.has(String(role || '').toUpperCase())
        ? 'All organization pharmacies'
        : selectedPharmacyName || pharmacies.find((item) => item.id === selectedPharmacyId)?.name || 'Selected pharmacy';

  return {
    workspace: scopedWorkspace,
    selectedPharmacyId,
    pharmacies,
    scopeLabel,
    fetchDashboard,
    selectPlatform,
    selectPharmacy,
    selectAllOrganizationPharmacies,
    canSelectPlatform,
    isLoading: workspaceLoading,
  };
}

const toNumber = (value: unknown) => Number(value ?? 0) || 0;

export function DashboardStatsOverview({ data }: { data: DashboardPayload | null }) {
  const cards = [
    { label: 'This Week', value: toNumber(data?.upcoming_stats?.week), icon: 'calendar-week', color: '#4F46E5' },
    { label: 'This Month', value: toNumber(data?.upcoming_stats?.month), icon: 'calendar-range', color: '#DB2777' },
    { label: 'Confirmed Shifts', value: toNumber(data?.shift_summary?.confirmed_count), icon: 'calendar-check', color: '#059669' },
  ];

  return (
    <View style={styles.statsSection}>
      <View style={styles.statsGrid}>
        {cards.map((card) => (
          <Surface key={card.label} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${card.color}14` }]}>
              <IconButton icon={card.icon} size={19} iconColor={card.color} />
            </View>
            <Text style={styles.statValue} numberOfLines={1}>
              {String(card.value)}
            </Text>
            <Text style={styles.statLabelText} numberOfLines={2}>
              {card.label}
            </Text>
          </Surface>
        ))}
      </View>
    </View>
  );
}

/** Persona switching (role / delegated admin / organization). The shell header's workspace pill drives it. */
export function usePersonaSwitch(role?: string | null) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { reloadWorkspace } = useWorkspace();
  const unsavedRegistry = useUnsavedChangesRegistry();
  const normalizedRole = String(role || user?.role || '').toUpperCase();
  const assignments = getAdminAssignments(user).filter((assignment) => getAssignmentId(assignment) != null);
  const canSwitchToOrg = hasOrganizationAccess(user) &&
    !ORG_PORTAL_ROLES.includes(normalizedRole as (typeof ORG_PORTAL_ROLES)[number]);
  const roleLabel = normalizedRole === 'OTHER_STAFF' ? 'Pharmacy team' :
    normalizedRole === 'PHARMACIST' ? 'Pharmacist' :
    normalizedRole === 'OWNER' ? 'Owner' :
    normalizedRole === 'EXPLORER' ? 'New to pharmacy' : 'Organization';
  const activeAdmin = String(pathname || '').startsWith('/admin');
  const activeOrg = String(pathname || '').startsWith('/organization');

  // A switch leaves the screen and changes the stored persona, so a dirty form is asked first.
  const guarded = (action: () => void | Promise<void>) => {
    if (unsavedRegistry) void unsavedRegistry.requestNavigation(action);
    else void action();
  };

  const openRoleWorkspace = () => guarded(async () => {
    const route = await selectRolePersona(user);
    await reloadWorkspace();
    router.replace(route as any);
  });

  // Callers list every assignment and let the user pick: never guess between delegated pharmacies, since an
  // OWNER can be a delegated admin elsewhere while OWNER-level rows remain owner authority only.
  const enterAdminWorkspace = (assignmentId: number) => guarded(async () => {
    const selected = await selectAdminPersona(user, assignmentId);
    if (!selected) return;
    await reloadWorkspace();
    router.replace('/admin' as any);
  });

  const openOrganizationWorkspace = () => guarded(() => router.replace('/organization/dashboard' as any));

  return {
    roleLabel,
    assignments,
    canSwitchToOrg,
    activeAdmin,
    activeOrg,
    openRoleWorkspace,
    enterAdminWorkspace,
    openOrganizationWorkspace,
  };
}

/** Pending delegated-admin invitations on the dashboard; switching itself lives in the shell header. */
export function DashboardPersonaSwitcher(_props: { role?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [pendingAdminCount, setPendingAdminCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    getPendingPharmacyAdminInvitations()
      .then((items: unknown) => { if (active) setPendingAdminCount(Array.isArray(items) ? items.length : 0); })
      .catch(() => { if (active) setPendingAdminCount(0); });
    return () => { active = false; };
  }, [user?.id, pathname]);

  if (pendingAdminCount === 0) return null;

  return (
    <Surface style={{ padding: 14, borderRadius: 14, marginBottom: 12, backgroundColor: '#EEF2FF' }}>
      <Text variant="titleSmall">{pendingAdminCount} admin invitation{pendingAdminCount === 1 ? '' : 's'} awaiting your decision</Text>
      <Button mode="text" onPress={() => router.push('/admin-invitations' as any)}>Review invitations</Button>
    </Surface>
  );
}

/** The mobile route for a dashboard activity link (web /dashboard/<persona>/... paths), or null. */
export function activityRoute(item: NonNullable<DashboardPayload['activity']>[number], persona?: string) {
  const raw = item.actionUrl || item.action_url;
  if (!raw) return null;
  const path = raw.replace(/^https?:\/\/[^/]+/i, '');
  const hubMatch = path.match(/^\/dashboard\/pharmacy-hub\/?([?#].*)?$/);
  if (hubMatch) return persona ? `/${persona}/hub${hubMatch[1] || ''}` : null;
  const adminMatch = path.match(/^\/dashboard\/admin\/[^/?#]+(\/[^?#]*)?([?#].*)?$/);
  if (adminMatch) return `/admin${adminMatch[1] || ''}${adminMatch[2] || ''}`;
  const roleMatch = path.match(/^\/dashboard\/(owner|organization|pharmacist|otherstaff|explorer)(?=\/|[?#]|$)/);
  if (roleMatch) {
    const role = persona === 'admin' && roleMatch[1] === 'owner' ? 'admin' : roleMatch[1];
    return path.replace(roleMatch[0], `/${role}`);
  }
  return path.startsWith('/') ? path : null;
}

export function DashboardActivity({ data }: { data: DashboardPayload | null }) {
  const router = useRouter();
  const persona = usePathname().split('/')[1];
  const [visible, setVisible] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const activity = Array.isArray(data?.activity) ? data.activity : [];
  if (activity.length === 0) return null;
  const resolveActivityRoute = (item: NonNullable<DashboardPayload['activity']>[number]) => activityRoute(item, persona);
  const renderActivityItem = (item: NonNullable<DashboardPayload['activity']>[number], index: number) => (
    <View key={`${item.title ?? item.message ?? 'activity'}-${index}`}>
      <TouchableOpacity
        style={styles.activityItem}
        activeOpacity={resolveActivityRoute(item) ? 0.78 : 1}
        onPress={() => {
          const route = resolveActivityRoute(item);
          if (route) router.push(route as any);
        }}
        disabled={!resolveActivityRoute(item)}
      >
        <View style={styles.activityIcon}>
          <Icon source="pulse" size={18} color="#4338CA" />
        </View>
        <View style={styles.activityCopy}>
          <Text style={styles.activityTitle} numberOfLines={1}>
            {item.title || item.message || 'Dashboard activity'}
          </Text>
          {!!(item.description || item.time || item.created_at || item.timestamp) && (
            <Text style={styles.activityText} numberOfLines={2}>
              {item.description || item.time || item.created_at || item.timestamp}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      {index < activity.length - 1 && <Divider />}
    </View>
  );

  return (
    <View style={styles.activitySection}>
      <View style={styles.activityHeaderRow}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Recent Activity
        </Text>
        <Button
          mode="text"
          compact
          onPress={() => {
            setModalLoading(true);
            setVisible(true);
            setTimeout(() => setModalLoading(false), 250);
          }}
        >
          View all activity
        </Button>
      </View>
      <Surface style={styles.activityCard}>
        {activity.slice(0, 5).map(renderActivityItem)}
      </Surface>
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.activityModal}>
          <View style={styles.activityModalHeader}>
            <Text variant="titleMedium" style={styles.modalTitle}>
              Recent Activity
            </Text>
            <IconButton icon="close" size={20} onPress={() => setVisible(false)} />
          </View>
          <ScrollView style={styles.activityModalScroll} showsVerticalScrollIndicator>
            {modalLoading ? (
              <Surface style={styles.activityCard}>
                {Array.from({ length: 8 }).map((_, index) => (
                  <View key={index} style={styles.activitySkeletonRow}>
                    <View style={styles.activitySkeletonIcon} />
                    <View style={styles.activitySkeletonCopy}>
                      <View style={styles.activitySkeletonTitle} />
                      <View style={styles.activitySkeletonText} />
                    </View>
                  </View>
                ))}
              </Surface>
            ) : (
              <>
                <Surface style={styles.activityCard}>
                  {activity.map(renderActivityItem)}
                </Surface>
                <Button disabled style={styles.activityModalFooter}>
                  Older activity is not loaded yet
                </Button>
              </>
            )}
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

export function DashboardErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Surface style={styles.errorCard}>
      <IconButton icon="alert-circle-outline" size={28} iconColor="#DC2626" />
      <Text style={styles.errorTitle}>Dashboard unavailable</Text>
      <Text style={styles.errorText}>{message}</Text>
      <Button mode="contained" onPress={onRetry}>
        Retry
      </Button>
    </Surface>
  );
}

export function DashboardLoadingState({ label = 'Loading your dashboard...' }: { label?: string }) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#6366F1" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modalTitle: { fontWeight: '800', color: '#111827', marginBottom: 12 },
  statsSection: { paddingHorizontal: 20, marginBottom: 18 },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 10,
    minHeight: 104,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    elevation: 1,
  },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  statValue: { color: '#111827', fontSize: 18, fontWeight: '900' },
  statLabelText: { color: '#6B7280', fontSize: 11, marginTop: 2 },
  activitySection: { paddingHorizontal: 20, marginBottom: 20 },
  activityHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { color: '#111827', fontWeight: '800', marginBottom: 10 },
  activityCard: { borderRadius: 16, backgroundColor: '#FFFFFF', overflow: 'hidden', elevation: 1 },
  activityItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  activityIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  activityCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  activityTitle: { color: '#111827', fontWeight: '700' },
  activityText: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  activityModal: { marginHorizontal: 18, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 0, maxHeight: '78%' },
  activityModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 18, paddingRight: 6, paddingVertical: 8 },
  activityModalScroll: { paddingHorizontal: 14, paddingBottom: 14 },
  activityModalFooter: { marginTop: 12, marginBottom: 8 },
  activitySkeletonRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  activitySkeletonIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#E5E7EB' },
  activitySkeletonCopy: { flex: 1, marginLeft: 10, gap: 8 },
  activitySkeletonTitle: { width: '58%', height: 14, borderRadius: 8, backgroundColor: '#E5E7EB' },
  activitySkeletonText: { width: '86%', height: 12, borderRadius: 8, backgroundColor: '#EEF2F7' },
  errorCard: { margin: 20, borderRadius: 16, padding: 16, alignItems: 'center', backgroundColor: '#FFFFFF', gap: 8 },
  errorTitle: { color: '#111827', fontWeight: '800', fontSize: 16 },
  errorText: { color: '#6B7280', textAlign: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { color: '#6B7280', fontSize: 16 },
});
