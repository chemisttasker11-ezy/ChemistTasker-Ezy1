import React, { type ReactNode, useEffect, useMemo } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { Stack, Tabs, useRouter, useSegments } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Menu } from 'lucide-react-native';
import { colors } from '@/constants/tokens';
import { useUnsavedChangesRegistry } from '@/roles/shared/forms/UnsavedChangesRegistryProvider';
import { isRootRoute, type MoreGroup, type MoreItem, ShellContext, type ShellTab, tabPath, useShell } from './ShellContext';
import { ShellHeader } from './ShellHeader';
import { ShellTabBar } from './ShellTabBar';
import { useShellChrome } from './useShellChrome';
import { AdminWorkspaceSwitchProvider, RoleWorkspaceProvider, type RoleWorkspaceProps } from './WorkspaceSwitch';

const MORE_TAB: ShellTab = { name: 'more', label: 'More', icon: Menu, accessibilityLabel: 'More tab' };

export type PersonaShellProps = {
  /** Up to four tabs; More is always added last. */
  tabs: ShellTab[];
  /** Inner-screen titles by route name. */
  titles: Record<string, string>;
  fallbackTitle: string;
  more: MoreGroup[];
  /** Account group rows above Sign out (profile, subscription, ...). */
  account: MoreItem[];
  /** The layout's own navigation (guarded push where the old menu used one). */
  navigate: (route: string) => void;
  /** The layout's back handler for inner screens. */
  onBack: () => void;
  profileRoute: string;
  notificationsRoute: string;
  workspace: ({ kind: 'role' } & RoleWorkspaceProps) | { kind: 'admin'; personaRole: string };
  /**
   * Keep a Stack under the shared chrome (admin): every push is a fresh screen instance, so a form
   * opened for pharmacy B never keeps pharmacy A's state, and Back walks the real history.
   */
  stack?: boolean;
  /** Screens declared before the tabs, e.g. an `index` that must stay the initial route. */
  children?: ReactNode;
};

/** Tabs mode: the tab bar, guarded tab switches, and hardware Back on inner screens through the layout's onBack. */
function TabsBar({ state, navigation, tabs }: BottomTabBarProps & { tabs: ShellTab[] }) {
  const { onBack } = useShell();
  const registry = useUnsavedChangesRegistry();
  const currentName = state.routes[state.index]?.name ?? '';
  const inner = !isRootRoute(tabs, currentName);

  useEffect(() => {
    // Tab history would jump to Home; the layout's onBack knows the parent screen and asks before discarding a form.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inner) {
        onBack();
        return true;
      }
      // A root tab's Back only switches tabs or exits, so removal guards never fire: ask a dirty or saving form first.
      if (!registry?.isBlocking()) return false;
      void registry.requestNavigation(() => {
        if (navigation.canGoBack()) navigation.goBack();
        else BackHandler.exitApp();
      });
      return true;
    });
    return () => sub.remove();
  }, [inner, navigation, onBack, registry]);

  const onNavigate = (tab: ShellTab) => {
    const route = state.routes.find((candidate) => candidate.name === tab.name);
    if (!route) return;
    // A tab switch only blurs the screen, so removal guards never fire: ask the dirty form first.
    const go = () => navigation.navigate(route.name, route.params);
    if (registry) void registry.requestNavigation(go);
    else go();
  };

  return <ShellTabBar tabs={tabs} currentName={currentName} onNavigate={onNavigate} />;
}

/** Stack mode: the focused route comes from the URL segments; tab presses use the layout's navigate. */
function StackBar({ tabs }: { tabs: ShellTab[] }) {
  const { navigate, onBack } = useShell();
  const registry = useUnsavedChangesRegistry();
  const router = useRouter();
  const [persona, ...rest] = useSegments() as string[];
  const path = rest.join('/');
  const currentName = tabs.find((tab) => tabPath(tab) === path)?.name ?? (path || 'index');
  const inner = !isRootRoute(tabs, currentName);

  useEffect(() => {
    // Inner-route Back always goes through onBack: it is guarded and handles both history and a cold open.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inner) {
        onBack();
        return true;
      }
      // A root route pops through removal guards; only exiting the app skips them.
      if (router.canGoBack() || !registry?.isBlocking()) return false;
      void registry.requestNavigation(() => BackHandler.exitApp());
      return true;
    });
    return () => sub.remove();
  }, [inner, onBack, registry, router]);

  return (
    <ShellTabBar
      tabs={tabs}
      currentName={currentName}
      onNavigate={(tab) => navigate(`/${[persona, tabPath(tab)].filter(Boolean).join('/')}`)}
    />
  );
}

/**
 * One navigation shell for every persona: the shared header and tab bar over Tabs (or a Stack for
 * admin), and the More tab fed from this config.
 */
export function PersonaShell({
  tabs,
  titles,
  fallbackTitle,
  more,
  account,
  navigate,
  onBack,
  profileRoute,
  notificationsRoute,
  workspace,
  stack = false,
  children,
}: PersonaShellProps) {
  const { unreadCount, photoUrl, openNotifications } = useShellChrome(notificationsRoute, navigate);
  const allTabs = useMemo(() => [...tabs, MORE_TAB], [tabs]);
  const value = {
    tabs: allTabs,
    titles,
    fallbackTitle,
    more,
    account,
    navigate,
    onBack,
    profileRoute,
    unreadCount,
    photoUrl,
    openNotifications,
  };

  const navigator = stack ? (
    <View style={styles.stack}>
      <Stack
        screenOptions={{
          header: ({ route, options }) => <ShellHeader route={route} options={options} />,
          contentStyle: { backgroundColor: colors.pageBg },
        }}
      >
        {children}
      </Stack>
      <StackBar tabs={allTabs} />
    </View>
  ) : (
    <Tabs
      tabBar={(props) => <TabsBar {...props} tabs={allTabs} />}
      screenOptions={{
        header: ({ route, options }) => <ShellHeader route={route} options={options} />,
        sceneStyle: { backgroundColor: colors.pageBg },
      }}
    >
      {children}
      {allTabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );

  return (
    <ShellContext.Provider value={value}>
      {workspace.kind === 'admin' ? (
        <AdminWorkspaceSwitchProvider personaRole={workspace.personaRole}>{navigator}</AdminWorkspaceSwitchProvider>
      ) : (
        <RoleWorkspaceProvider {...workspace}>{navigator}</RoleWorkspaceProvider>
      )}
    </ShellContext.Provider>
  );
}

const styles = StyleSheet.create({
  stack: { flex: 1, backgroundColor: colors.pageBg },
});
