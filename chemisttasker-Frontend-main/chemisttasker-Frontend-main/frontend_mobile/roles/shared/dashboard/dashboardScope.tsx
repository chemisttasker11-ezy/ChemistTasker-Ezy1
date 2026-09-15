import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Divider, IconButton, Modal, Portal, Surface, Text } from 'react-native-paper';
import { usePathname, useRouter } from 'expo-router';
import apiClient from '@/utils/apiClient';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';

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
  shifts?: any[];
  bills_summary?: { total_billed?: string | number; points?: string | number };
};

const ORG_ROLES = new Set(['ORGANIZATION', 'ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN']);
const PHARMACY_STAFF_EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CASUAL']);
const FAVORITE_STAFF_EMPLOYMENT_TYPES = new Set(['LOCUM', 'SHIFT_HERO']);
const INTERNAL_PHARMACY_ROLES = new Set(['OWNER', 'PHARMACY_OWNER', 'MANAGER', 'PHARMACY_ADMIN', 'ADMIN', 'ROSTER_MANAGER', 'COMMUNICATION_MANAGER']);

const isWorkerRole = (role?: string | null) => {
  const normalized = String(role || '').toUpperCase();
  return normalized === 'PHARMACIST' || normalized === 'OTHER_STAFF';
};

const addPharmacy = (map: Map<number, PharmacyOption>, idRaw: unknown, nameRaw: unknown, helper?: string) => {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return;
  const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : `Pharmacy #${id}`;
  if (!map.has(id)) map.set(id, { id, name, helper });
};

export function collectDashboardPharmacies(user: any): PharmacyOption[] {
  const byId = new Map<number, PharmacyOption>();
  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  memberships.forEach((membership: any) => {
    const role = String(membership?.role ?? '').toUpperCase();
    const employmentType = String(membership?.employment_type ?? membership?.employmentType ?? '').toUpperCase();
    if (
      !INTERNAL_PHARMACY_ROLES.has(role) &&
      !PHARMACY_STAFF_EMPLOYMENT_TYPES.has(employmentType) &&
      !FAVORITE_STAFF_EMPLOYMENT_TYPES.has(employmentType)
    ) return;
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
    if (Array.isArray(membership?.pharmacies)) {
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
  if (normalized === 'OWNER') return '/client-profile/dashboard/owner/';
  if (normalized === 'PHARMACIST') return '/client-profile/dashboard/pharmacist/';
  if (normalized === 'OTHER_STAFF') return '/client-profile/dashboard/otherstaff/';
  if (ORG_ROLES.has(normalized)) return '/client-profile/dashboard/organization/';
  return null;
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
  } = useWorkspace();
  const role = roleOverride ?? user?.role;
  const pharmacies = useMemo(() => collectDashboardPharmacies(user), [user]);
  const canSelectPlatform = canUsePlatform && isWorkerRole(role);

  const selectPlatform = useCallback(() => {
    if (!canSelectPlatform) return;
    setWorkspace('platform');
    setSelectedPharmacyId(null);
    setSelectedPharmacyName(null);
  }, [canSelectPlatform, setSelectedPharmacyId, setSelectedPharmacyName, setWorkspace]);

  const selectPharmacy = useCallback(
    (pharmacy: PharmacyOption) => {
      setWorkspace('internal');
      setSelectedPharmacyId(pharmacy.id);
      setSelectedPharmacyName(pharmacy.name);
    },
    [setSelectedPharmacyId, setSelectedPharmacyName, setWorkspace]
  );

  const fetchDashboard = useCallback(async () => {
    const endpoint = dashboardEndpointForRole(role);
    if (!endpoint) return null;
    const params =
      workspace === 'platform' && canSelectPlatform
        ? { workspace: 'platform' }
        : selectedPharmacyId != null
        ? { workspace: 'internal', pharmacy_id: selectedPharmacyId }
        : { workspace: 'internal' };
    try {
      const response = await apiClient.get(endpoint, { params });
      const selected = response.data?.selected_pharmacy;
      if (selected?.id != null) {
        setSelectedPharmacyId(Number(selected.id));
        setSelectedPharmacyName(selected?.name ?? selectedPharmacyName ?? null);
      }
      return response.data as DashboardPayload;
    } catch (error: any) {
      if (error?.response?.status === 403) {
        const firstPharmacy = pharmacies[0];
        if (firstPharmacy && workspace === 'internal') {
          selectPharmacy(firstPharmacy);
        } else if (canSelectPlatform) {
          selectPlatform();
        }
      }
      throw error;
    }
  }, [
    canSelectPlatform,
    pharmacies,
    role,
    selectPharmacy,
    selectPlatform,
    selectedPharmacyId,
    selectedPharmacyName,
    setSelectedPharmacyId,
    setSelectedPharmacyName,
    workspace,
  ]);

  const scopeLabel =
    workspace === 'platform' && canSelectPlatform
      ? 'ChemistTasker Platform'
      : selectedPharmacyName || pharmacies.find((item) => item.id === selectedPharmacyId)?.name || 'Selected pharmacy';

  return {
    workspace,
    selectedPharmacyId,
    pharmacies,
    scopeLabel,
    fetchDashboard,
    selectPlatform,
    selectPharmacy,
    canSelectPlatform,
  };
}

export function DashboardScopeSwitcher({
  pharmacies,
  scopeLabel,
  workspace,
  selectedPharmacyId,
  canSelectPlatform = false,
  onSelectPlatform,
  onSelectPharmacy,
}: {
  pharmacies: PharmacyOption[];
  scopeLabel: string;
  workspace: 'platform' | 'internal';
  selectedPharmacyId: number | null;
  canSelectPlatform?: boolean;
  onSelectPlatform: () => void;
  onSelectPharmacy: (pharmacy: PharmacyOption) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity style={styles.scopeButton} onPress={() => setVisible(true)} activeOpacity={0.82}>
        <View style={styles.scopeIcon}>
          <IconButton icon={workspace === 'internal' ? 'store-outline' : 'earth'} size={20} iconColor="#4338CA" />
        </View>
        <View style={styles.scopeText}>
          <Text style={styles.scopeLabel}>Dashboard scope</Text>
          <Text style={styles.scopeValue} numberOfLines={1}>
            {scopeLabel}
          </Text>
        </View>
        <IconButton icon="chevron-down" size={20} iconColor="#6B7280" />
      </TouchableOpacity>

      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={styles.modalTitle}>
            Dashboard scope
          </Text>
          {canSelectPlatform && (
            <>
              <Button
                mode={workspace === 'platform' ? 'contained' : 'text'}
                icon="earth"
                contentStyle={styles.optionContent}
                onPress={() => {
                  onSelectPlatform();
                  setVisible(false);
                }}
              >
                ChemistTasker Platform
              </Button>
              <Divider style={styles.divider} />
            </>
          )}
          {pharmacies.length === 0 ? (
            <Text style={styles.emptyText}>No internal pharmacies are available for this account.</Text>
          ) : (
            pharmacies.map((pharmacy) => (
              <Button
                key={pharmacy.id}
                mode={workspace === 'internal' && selectedPharmacyId === pharmacy.id ? 'contained' : 'text'}
                icon="store-outline"
                contentStyle={styles.optionContent}
                onPress={() => {
                  onSelectPharmacy(pharmacy);
                  setVisible(false);
                }}
              >
                {pharmacy.name}
              </Button>
            ))
          )}
        </Modal>
      </Portal>
    </>
  );
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

export function DashboardPersonaSwitcher({ role }: { role?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const normalizedRole = String(role || user?.role || '').toUpperCase();
  const isWorker = normalizedRole === 'PHARMACIST' || normalizedRole === 'OTHER_STAFF';
  const assignments = Array.isArray((user as any)?.admin_assignments) ? (user as any).admin_assignments : [];

  if (!isWorker || assignments.length === 0) return null;

  const workerRoute = normalizedRole === 'OTHER_STAFF' ? '/otherstaff/dashboard' : '/pharmacist/dashboard';
  const roleLabel = normalizedRole === 'OTHER_STAFF' ? 'Other Staff' : 'Pharmacist';
  const activeAdmin = String(pathname || '').startsWith('/admin');

  return (
    <View style={styles.personaSwitcher}>
      <TouchableOpacity
        style={[styles.personaButton, !activeAdmin && styles.personaButtonActive]}
        onPress={() => router.replace(workerRoute as any)}
        activeOpacity={0.82}
      >
        <IconButton icon="account-outline" size={18} iconColor={!activeAdmin ? '#FFFFFF' : '#4F46E5'} />
        <Text style={[styles.personaButtonText, !activeAdmin && styles.personaButtonTextActive]}>{roleLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.personaButton, activeAdmin && styles.personaButtonActive]}
        onPress={() => router.replace('/admin' as any)}
        activeOpacity={0.82}
      >
        <IconButton icon="shield-account-outline" size={18} iconColor={activeAdmin ? '#FFFFFF' : '#4F46E5'} />
        <Text style={[styles.personaButtonText, activeAdmin && styles.personaButtonTextActive]}>Admin</Text>
      </TouchableOpacity>
    </View>
  );
}

export function DashboardActivity({ data }: { data: DashboardPayload | null }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const activity = Array.isArray(data?.activity) ? data.activity : [];
  if (activity.length === 0) return null;
  const resolveActivityRoute = (item: NonNullable<DashboardPayload['activity']>[number]) => {
    const raw = item.actionUrl || item.action_url;
    if (!raw) return null;
    const path = raw.replace(/^https?:\/\/[^/]+/i, '');
    const adminInvoiceMatch = path.match(/^\/dashboard\/admin\/[^/]+\/invoice(\/.*)?$/);
    if (adminInvoiceMatch) return `/admin/invoice${adminInvoiceMatch[1] || ''}`;
    if (path.startsWith('/dashboard/owner/')) return path.replace('/dashboard/owner', '/owner');
    if (path.startsWith('/dashboard/organization/')) return path.replace('/dashboard/organization', '/organization');
    if (path.startsWith('/dashboard/pharmacist/')) return path.replace('/dashboard/pharmacist', '/pharmacist');
    if (path.startsWith('/dashboard/otherstaff/')) return path.replace('/dashboard/otherstaff', '/otherstaff');
    return path.startsWith('/') ? path : null;
  };
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
          <IconButton icon="pulse" size={18} iconColor="#4338CA" />
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
  scopeButton: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
  },
  scopeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  scopeText: { flex: 1, minWidth: 0, marginLeft: 10 },
  scopeLabel: { color: '#6B7280', fontSize: 12 },
  scopeValue: { color: '#111827', fontWeight: '800', fontSize: 15 },
  modal: { marginHorizontal: 18, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 18 },
  modalTitle: { fontWeight: '800', color: '#111827', marginBottom: 12 },
  optionContent: { justifyContent: 'flex-start', minHeight: 46 },
  divider: { marginVertical: 8 },
  emptyText: { color: '#6B7280', paddingVertical: 10 },
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
  personaSwitcher: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  personaButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  personaButtonActive: { backgroundColor: '#4F46E5' },
  personaButtonText: { color: '#4F46E5', fontWeight: '800' },
  personaButtonTextActive: { color: '#FFFFFF' },
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
