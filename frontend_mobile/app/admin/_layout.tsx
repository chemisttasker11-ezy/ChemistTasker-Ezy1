import React, { useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import {
  ArrowLeftRight,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  MessageSquare,
  Pill,
  Plus,
  Store,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { AdminWorkspaceProvider, useAdminWorkspace } from '@/context/AdminWorkspaceContext';
import { colors } from '@/constants/tokens';
import { useUnsavedChangesRegistry } from '@/roles/shared/forms/UnsavedChangesRegistryProvider';
import { usePersonaSwitch } from '@/roles/shared/dashboard/dashboardScope';
import { type MoreGroup, type MoreItem, PersonaShell, type ShellTab } from '@/components/shell';

function profileRouteForRole(role?: string | null) {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'PHARMACIST') return '/pharmacist/profile';
  if (normalized === 'OTHER_STAFF') return '/otherstaff/profile';
  if (normalized === 'OWNER') return '/owner/profile';
  if (normalized === 'EXPLORER') return '/explorer/profile';
  if (normalized.includes('ORG') || normalized === 'ORGANIZATION') return '/organization/profile';
  return '/admin';
}

const titles: Record<string, string> = {
  index: 'Admin Dashboard',
  'messages/[id]': 'Messages',
  'pharmacies/index': 'Pharmacies',
  'pharmacies/[id]': 'Pharmacy',
  'pharmacies/[id]/staff': 'Staff',
  'pharmacies/[id]/locums': 'Locums',
  'pharmacies/add': 'Add Pharmacy',
  'pharmacies/[id]/edit': 'Edit Pharmacy',
  'shifts/index': 'Shift Centre',
  'shifts/[id]': 'Shift',
  invoice: 'Invoices',
  'invoice/new': 'New Invoice',
  'invoice/[id]': 'Invoice',
  'post-shift': 'Post Shift',
  '[pharmacyId]/post-shift': 'Post Shift',
  pills: 'Pills',
  '[pharmacyId]/pills': 'Pills',
  chat: 'Chat',
  hub: 'Pharmacy Hub',
  calendar: 'Calendar',
  notifications: 'Notifications',
  more: 'More',
};

function AdminLayoutInner() {
  const router = useRouter();
  const pathname = usePathname();
  const unsavedRegistry = useUnsavedChangesRegistry();
  const { user, isLoading, hasCapability } = useAuth();
  const { activePharmacyId: pharmacyId, isLoading: adminWorkspaceLoading } = useAdminWorkspace();
  const { roleLabel, openRoleWorkspace } = usePersonaSwitch(user?.role);

  const canManageCommunications = Boolean(
    pharmacyId && hasCapability('MANAGE_COMMUNICATIONS', pharmacyId),
  );

  const adminPath = useCallback((route: string) => {
    if (route === '/admin/post-shift' && pharmacyId) return `/admin/${pharmacyId}/post-shift`;
    if (route === '/admin/pills' && pharmacyId) return `/admin/${pharmacyId}/pills`;
    return route;
  }, [pharmacyId]);

  // Tab bar and header go through the registry too, so a dirty form asks before it is left.
  const guarded = useCallback((go: () => void) => {
    if (unsavedRegistry) void unsavedRegistry.requestNavigation(go);
    else go();
  }, [unsavedRegistry]);

  const navigateAdmin = useCallback((route: string) => {
    guarded(() => router.push(adminPath(route) as any));
  }, [adminPath, guarded, router]);

  const onBack = useCallback(() => {
    // Nested detail routes go to their parent (/admin/pharmacies/1/edit -> /admin/pharmacies/1), so a cold open still lands there.
    const segments = (pathname || '').split('/').filter(Boolean);
    const parent = segments[1] === 'messages'
      ? '/admin/chat'
      : ['pharmacies', 'shifts', 'invoice'].includes(segments[1] ?? '') && segments.length > 2
        ? `/${segments.slice(0, -1).join('/')}`
        : null;
    guarded(() => {
      if (parent) router.replace(parent as any);
      else if (router.canGoBack()) router.back();
      else router.replace('/admin' as any);
    });
  }, [guarded, pathname, router]);

  const tabs = useMemo<ShellTab[]>(
    () => [
      { name: 'index', label: 'Home', icon: LayoutDashboard, accessibilityLabel: 'Home tab' },
      { name: 'shifts/index', label: 'Shifts', icon: CalendarClock, accessibilityLabel: 'Shifts tab' },
      {
        name: 'post-shift',
        label: 'Post shift',
        icon: Plus,
        hero: true,
        match: ['[pharmacyId]/post-shift'],
        accessibilityLabel: 'Post a shift',
        onPress: () => navigateAdmin('/admin/post-shift'),
      },
      { name: 'chat', label: 'Chat', icon: MessageSquare, match: ['messages/'], accessibilityLabel: 'Chat tab' },
    ],
    [navigateAdmin]
  );

  const more = useMemo<MoreGroup[]>(
    () => [
      {
        title: 'Workspace',
        tone: 'violet',
        items: [
          { label: 'Pharmacy Hub', icon: Users, route: '/admin/hub', hidden: !canManageCommunications },
          { label: 'Calendar', icon: CalendarDays, route: '/admin/calendar', hidden: !canManageCommunications },
        ],
      },
      {
        title: 'Shifts & finance',
        tone: 'blue',
        items: [
          { label: 'Timesheets', icon: ClipboardCheck, route: '/workforce-timesheets' },
          { label: 'Pills', icon: Pill, route: '/admin/pills' },
        ],
      },
      {
        title: 'Pharmacy operations',
        tone: 'cyan',
        items: [
          { label: 'Pharmacies', icon: Store, route: '/admin/pharmacies' },
          { label: 'Workforce & Payroll', icon: Wallet, route: '/workforce-settings' },
        ],
      },
    ],
    [canManageCommunications]
  );

  const profileRoute = profileRouteForRole(user?.role);
  const account = useMemo<MoreItem[]>(
    () => [
      { label: 'Profile', icon: UserRound, route: profileRoute },
      { label: `Return to ${roleLabel} workspace`, icon: ArrowLeftRight, onPress: openRoleWorkspace },
    ],
    [openRoleWorkspace, profileRoute, roleLabel]
  );

  if (isLoading || adminWorkspaceLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text>Restoring admin workspace…</Text></View>;
  }

  return (
    <PersonaShell
      tabs={tabs}
      titles={titles}
      fallbackTitle="Admin"
      more={more}
      account={account}
      navigate={navigateAdmin}
      onBack={onBack}
      profileRoute={profileRoute}
      notificationsRoute="/admin/notifications"
      workspace={{ kind: 'admin', personaRole: String(user?.role || '') }}
      stack
    />
  );
}

export default function AdminLayout() {
  return <AdminWorkspaceProvider><AdminLayoutInner /></AdminWorkspaceProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.surfaceBg },
});
