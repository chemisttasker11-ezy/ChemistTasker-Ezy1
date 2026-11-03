import React, { useCallback, useEffect, useMemo } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  MessageSquare,
  Pill,
  Plus,
  Search,
  Store,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react-native';
import { hasOrganizationAccess } from '@chemisttasker/shared-core';
import { useAuth } from '../../context/AuthContext';
import {
  resolveCalendarNotificationRoute,
  resolveChatNotificationRoomId,
  resolveShiftNotificationRoute,
} from '@/utils/notificationNavigation';
import { getMessageDetailRoute } from '@/utils/chatRoutes';
import { useGuardedNavigation, useUnsavedChangesRegistry } from '../../roles/shared/forms/UnsavedChangesRegistryProvider';
import { type MoreGroup, type MoreItem, PersonaShell, type ShellTab } from '@/components/shell';

const titles: Record<string, string> = {
  index: 'Home',
  dashboard: 'Home',
  invite: 'Invite staff',
  'shifts/index': 'Shifts',
  'shifts/[id]': 'Shift',
  'post-shift': 'Post shift',
  'pharmacies/index': 'Pharmacies',
  'pharmacies/[id]': 'Pharmacy',
  'pharmacies/[id]/edit': 'Edit pharmacy',
  'pharmacies/[id]/staff': 'Staff',
  'pharmacies/[id]/locums': 'Locums',
  'pharmacies/add': 'Add pharmacy',
  hub: 'Pharmacy Hub',
  pills: 'Pills',
  notifications: 'Notifications',
  calendar: 'Calendar',
  'talent-board': 'Talent Hub',
  invoice: 'Invoices',
  'invoice/new': 'New invoice',
  'invoice/[id]': 'Invoice',
  'messages/[id]': 'Chat',
  profile: 'Profile',
  chat: 'Chat',
  more: 'More',
};

const more: MoreGroup[] = [
  {
    title: 'Workspace',
    tone: 'violet',
    items: [
      { label: 'Pharmacy Hub', icon: Users, route: '/organization/hub' },
      { label: 'Calendar', icon: CalendarDays, route: '/organization/calendar' },
    ],
  },
  {
    title: 'Shifts & finance',
    tone: 'blue',
    items: [
      { label: 'Timesheets', icon: ClipboardCheck, route: '/workforce-timesheets' },
      { label: 'Pills', icon: Pill, route: '/organization/pills' },
    ],
  },
  {
    title: 'Pharmacy operations',
    tone: 'cyan',
    items: [
      { label: 'Pharmacies', icon: Store, route: '/organization/pharmacies' },
      { label: 'Invite staff', icon: UserPlus, route: '/organization/invite' },
      { label: 'Workforce & Payroll', icon: Wallet, route: '/workforce-settings' },
    ],
  },
  { title: 'Discover', tone: 'magenta', items: [{ label: 'Talent Hub', icon: Search, route: '/organization/talent-board' }] },
  { title: 'Work & platform tools', tone: 'blue', tools: true },
];

const account: MoreItem[] = [{ label: 'Profile', icon: UserRound, route: '/organization/profile' }];

export default function OrganizationLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const unsavedRegistry = useUnsavedChangesRegistry();
  const guardedNavigation = useGuardedNavigation();
  const { user, isLoading } = useAuth();

  const requestNavigation = useCallback(
    (action: () => void) => {
      if (!unsavedRegistry) {
        action();
        return;
      }
      void unsavedRegistry.requestNavigation(action);
    },
    [unsavedRegistry]
  );

  const pushWithGuard = useCallback(
    (route: string) => requestNavigation(() => router.push(route as any)),
    [requestNavigation, router]
  );

  const replaceWithGuard = useCallback(
    (route: string) => requestNavigation(() => router.replace(route as any)),
    [requestNavigation, router]
  );

  const goBackWithGuard = useCallback(
    (fallbackRoute?: string | null) => {
      requestNavigation(() => {
        const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : false;
        if (canGoBack) {
          router.back();
          return;
        }
        if (fallbackRoute) {
          router.push(fallbackRoute as any);
        }
      });
    },
    [requestNavigation, router]
  );

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login' as any);
      return;
    }
    if (!hasOrganizationAccess(user)) {
      const role = String(user.role || '').toUpperCase();
      switch (role) {
        case 'OWNER':
          router.replace('/owner/dashboard' as any);
          break;
        case 'PHARMACIST':
          router.replace('/pharmacist/dashboard' as any);
          break;
        case 'OTHER_STAFF':
          router.replace('/otherstaff/dashboard' as any);
          break;
        case 'EXPLORER':
          router.replace('/explorer/dashboard' as any);
          break;
        default:
          router.replace('/login' as any);
      }
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response?.notification?.request?.content?.data || {};
      const roomId = resolveChatNotificationRoomId({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
      });
      if (roomId) {
        guardedNavigation(() => router.push(getMessageDetailRoute(user?.role, roomId) as any));
        return;
      }
      const calendarRoute = resolveCalendarNotificationRoute({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
        userRole: user?.role ?? null,
      });
      if (calendarRoute && calendarRoute.startsWith('/organization/')) {
        guardedNavigation(() => router.push(calendarRoute as any));
        return;
      }
      const route = resolveShiftNotificationRoute({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
        userRole: user?.role ?? null,
      });
      if (route) {
        guardedNavigation(() => router.push(route.startsWith('/organization/') ? (route as any) : (`/organization/shifts` as any)));
      }
    });
    return () => sub.remove();
  }, [guardedNavigation, router, user?.role]);

  const { backTarget, isPharmacyDetail } = useMemo(() => {
    if (!pathname) return { backTarget: null, isPharmacyDetail: false };
    const segments = pathname.split('/').filter(Boolean);
    const isPharmacy = segments[0] === 'organization' && segments[1] === 'pharmacies' && segments.length === 3;
    let parent: string | null = null;
    if (segments[1] === 'messages') {
      parent = '/organization/chat';
    } else if (segments.length > 2) {
      parent = `/${segments.slice(0, -1).join('/')}`;
    }
    return { backTarget: parent, isPharmacyDetail: isPharmacy };
  }, [pathname]);

  const onBack = useCallback(() => {
    if (isPharmacyDetail) {
      pushWithGuard('/organization/pharmacies');
    } else if (backTarget) {
      pushWithGuard(backTarget);
    } else {
      goBackWithGuard('/organization/dashboard');
    }
  }, [backTarget, goBackWithGuard, isPharmacyDetail, pushWithGuard]);

  const tabs = useMemo<ShellTab[]>(
    () => [
      { name: 'dashboard', label: 'Home', icon: LayoutDashboard, match: ['index'], accessibilityLabel: 'Home tab', onPress: () => replaceWithGuard('/organization/dashboard') },
      { name: 'shifts/index', label: 'Shifts', icon: CalendarClock, accessibilityLabel: 'Shifts tab', onPress: () => replaceWithGuard('/organization/shifts') },
      { name: 'post-shift', label: 'Post shift', icon: Plus, hero: true, accessibilityLabel: 'Post a shift', onPress: () => replaceWithGuard('/organization/post-shift') },
      { name: 'chat', label: 'Chat', icon: MessageSquare, match: ['messages/'], accessibilityLabel: 'Chat tab', onPress: () => replaceWithGuard('/organization/chat') },
    ],
    [replaceWithGuard]
  );

  return (
    <PersonaShell
      tabs={tabs}
      titles={titles}
      fallbackTitle="Organization"
      more={more}
      account={account}
      navigate={pushWithGuard}
      onBack={onBack}
      profileRoute="/organization/profile"
      notificationsRoute="/organization/notifications"
      workspace={{ kind: 'role', personaRole: String(user?.role || ''), scopeRole: 'ORGANIZATION', allOrganizationPharmacies: true }}
    >
      {/* Declared first so `index` stays the initial route, as before. */}
      <Tabs.Screen name="index" />
    </PersonaShell>
  );
}
