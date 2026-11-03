import React, { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Clock,
  CreditCard,
  Gift,
  HardHat,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  MessageSquare,
  Pill,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserCheck,
  UserRound,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { resolveCalendarNotificationRoute, resolveChatNotificationRoomId, resolveShiftNotificationRoute } from '@/utils/notificationNavigation';
import { getMessageDetailRoute } from '@/utils/chatRoutes';
import { useGuardedNavigation, useUnsavedChangesRegistry } from '../../roles/shared/forms/UnsavedChangesRegistryProvider';
import { type MoreGroup, type MoreItem, PersonaShell, type ShellTab } from '@/components/shell';

const titles: Record<string, string> = {
  dashboard: 'Home',
  'shifts/index': 'Shifts',
  'shifts/create': 'New shift',
  'shifts/[id]': 'Shift',
  'shifts/[id]/applications': 'Applications',
  'post-shift': 'Post shift',
  'pharmacies/index': 'Pharmacies',
  'pharmacies/[id]': 'Pharmacy',
  'pharmacies/[id]/edit': 'Edit pharmacy',
  'pharmacies/[id]/staff': 'Staff',
  'pharmacies/[id]/locums': 'Locums',
  'pharmacies/add': 'Add pharmacy',
  'staff/index': 'Staff',
  'locums/index': 'Locums',
  hub: 'Pharmacy Hub',
  pills: 'Pills',
  notifications: 'Notifications',
  calendar: 'Calendar',
  'talent-board': 'Talent Board',
  invoice: 'Invoices',
  'invoice/new': 'New invoice',
  'invoice/[id]': 'Invoice',
  'messages/[id]': 'Chat',
  profile: 'Profile',
  'profile-detail': 'Profile details',
  'subscription-seats': 'Subscription',
  pharmacy: 'Pharmacy',
  onboarding: 'Pharmacy setup',
  more: 'More',
};

// By how often an owner needs each (top-tasks map, owner); web's owner nav shows all of them without capability gates.
const more: MoreGroup[] = [
  {
    title: 'This week',
    tone: 'violet',
    items: [
      { label: 'Roster', icon: CalendarCheck, route: '/manager/roster' },
      { label: 'Timesheets', icon: ClipboardCheck, route: '/workforce-timesheets' },
      { label: 'Attendance approvals', icon: UserCheck, route: '/attendance/reviews' },
      { label: 'Clock & kiosk', icon: Clock, route: '/attendance' },
      { label: 'Calendar', icon: CalendarDays, route: '/owner/calendar' },
    ],
  },
  {
    title: 'Pharmacies & people',
    tone: 'cyan',
    items: [
      { label: 'Pharmacies', icon: Store, route: '/owner/pharmacies' },
      { label: 'Staff', icon: UsersRound, route: '/owner/staff' },
      { label: 'Locums & favourites', icon: HeartHandshake, route: '/owner/locums' },
      { label: 'Workforce & Payroll', icon: Wallet, route: '/workforce-settings' },
      { label: 'Employment terms', icon: HardHat, route: '/workforce/employment-engagements' },
      { label: 'Pharmacy Hub', icon: Users, route: '/owner/hub' },
    ],
  },
  {
    title: 'Money',
    tone: 'magenta',
    items: [
      { label: 'Invoices', icon: ReceiptText, route: '/owner/invoice' },
      { label: 'Finance & BAS', icon: Landmark, route: '/finance' },
      { label: 'Pills', icon: Pill, route: '/owner/pills' },
      { label: 'Pill rewards', icon: Gift, route: '/rewards/pills' },
      { label: 'Subscription', icon: CreditCard, route: '/owner/subscription-seats' },
    ],
  },
  {
    title: 'Discover',
    tone: 'blue',
    items: [
      { label: 'Talent Board', icon: Search, route: '/owner/talent-board' },
      { label: 'Marketplace', icon: ShoppingBag, route: '/marketplace' },
      { label: 'Ethical Marketplace', icon: ShieldCheck, route: '/marketplace/ethical/access' },
    ],
  },
];

const account: MoreItem[] = [{ label: 'Profile', icon: UserRound, route: '/owner/profile' }];

export default function OwnerLayout() {
  const router = useRouter();
  const unsavedRegistry = useUnsavedChangesRegistry();
  const guardedNavigation = useGuardedNavigation();
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

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
    (route: string) => {
      requestNavigation(() => router.push(route as any));
    },
    [requestNavigation, router]
  );

  const replaceWithGuard = useCallback(
    (route: string) => {
      requestNavigation(() => router.replace(route as any));
    },
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
    if (user.role !== 'OWNER') {
      switch (user.role) {
        case 'PHARMACIST':
          router.replace('/pharmacist/dashboard' as any);
          break;
        case 'OTHER_STAFF':
          router.replace('/otherstaff/dashboard' as any);
          break;
        case 'EXPLORER':
          router.replace('/explorer/dashboard' as any);
          break;
        case 'ORGANIZATION':
          router.replace('/organization/dashboard' as any);
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
      if (calendarRoute && calendarRoute.startsWith('/owner/')) {
        guardedNavigation(() => router.push(calendarRoute as any));
        return;
      }
      const route = resolveShiftNotificationRoute({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
        userRole: user?.role ?? null,
      });
      if (route && route.startsWith('/owner/')) {
        guardedNavigation(() => router.push(route as any));
      }
    });
    return () => sub.remove();
  }, [guardedNavigation, router, user?.role]);

  const { backTarget, isPharmacyDetail } = useMemo(() => {
    if (!pathname) return { backTarget: null, isPharmacyDetail: false };
    const segments = pathname.split('/').filter(Boolean);
    const isPharmacy =
      segments[0] === 'owner' &&
      segments[1] === 'pharmacies' &&
      segments.length === 3;
    const isProfileSubPage =
      segments[0] === 'owner' &&
      ['profile-detail', 'subscription-seats'].includes(segments[1] ?? '');

    // Build parent path for nested routes: /owner/pharmacies/123/staff -> /owner/pharmacies/123
    let parent: string | null = null;
    if (isProfileSubPage) {
      parent = '/owner/profile';
    } else if (segments[1] === 'messages') {
      parent = '/owner/chat';
    } else if (segments.length > 2) {
      parent = `/${segments.slice(0, -1).join('/')}`;
    }

    return { backTarget: parent, isPharmacyDetail: isPharmacy };
  }, [pathname]);

  const onBack = useCallback(() => {
    if (isPharmacyDetail) {
      pushWithGuard('/owner/pharmacies');
    } else if (backTarget) {
      pushWithGuard(backTarget);
    } else {
      goBackWithGuard('/owner/dashboard');
    }
  }, [backTarget, goBackWithGuard, isPharmacyDetail, pushWithGuard]);

  const tabs = useMemo<ShellTab[]>(
    () => [
      { name: 'dashboard', label: 'Home', icon: LayoutDashboard, accessibilityLabel: 'Home tab', onPress: () => replaceWithGuard('/owner/dashboard') },
      { name: 'shifts/index', label: 'Shifts', icon: CalendarClock, accessibilityLabel: 'Shifts tab', onPress: () => replaceWithGuard('/owner/shifts') },
      { name: 'post-shift', label: 'Post shift', icon: Plus, hero: true, accessibilityLabel: 'Post a shift', onPress: () => replaceWithGuard('/owner/post-shift') },
      { name: 'chat', label: 'Chat', icon: MessageSquare, match: ['messages/'], accessibilityLabel: 'Chat tab', onPress: () => replaceWithGuard('/owner/chat') },
    ],
    [replaceWithGuard]
  );

  return (
    <PersonaShell
      tabs={tabs}
      titles={titles}
      fallbackTitle="Owner"
      more={more}
      account={account}
      navigate={pushWithGuard}
      onBack={onBack}
      profileRoute="/owner/profile"
      notificationsRoute="/owner/notifications"
      workspace={{ kind: 'role', personaRole: 'OWNER', scopeRole: 'OWNER' }}
    />
  );
}
