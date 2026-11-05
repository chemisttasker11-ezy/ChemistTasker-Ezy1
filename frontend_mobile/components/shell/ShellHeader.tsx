import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BottomTabHeaderProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronLeft } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { CountBadge, InitialsAvatar, ScalePressable } from '@/components/ui';
import { colors, font, space, touch, type } from '@/constants/tokens';
import { isRootRoute, useShell } from './ShellContext';
import { WorkspacePills } from './WorkspaceSwitch';

export const HEADER_HEIGHT = 56;

/** The parts of a Tabs or Stack header's props the shell reads. */
type ShellHeaderProps = {
  route: { name: string };
  options: Pick<BottomTabHeaderProps['options'], 'headerTitle' | 'title' | 'headerRight'>;
};

/**
 * Root tabs: workspace pills (or the title), bell with unread count, profile avatar.
 * Inner screens: back chevron, title, and the screen's own headerRight. Owns the top safe-area inset.
 */
export function ShellHeader({ route, options }: ShellHeaderProps) {
  const shell = useShell();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isRoot = isRootRoute(shell.tabs, route.name);
  const title =
    (typeof options.headerTitle === 'string' ? options.headerTitle : undefined) ??
    options.title ??
    shell.titles[route.name] ??
    shell.tabs.find((tab) => tab.name === route.name)?.label ??
    shell.fallbackTitle;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || user?.email || '?';

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {isRoot ? (
          <>
            <WorkspacePills title={title} />
            <View style={styles.actions}>
              <ScalePressable
                static
                pressBg
                onPress={shell.openNotifications}
                accessibilityLabel={
                  shell.unreadCount > 0 ? `Notifications, ${shell.unreadCount} unread` : 'Notifications'
                }
                style={styles.iconButton}
              >
                <Bell size={22} color={colors.textPrimary} strokeWidth={1.75} />
                {shell.unreadCount > 0 ? (
                  <CountBadge
                    value={Math.min(shell.unreadCount, 99)}
                    tone="magenta"
                    label={`${shell.unreadCount} unread`}
                    style={styles.badge}
                  />
                ) : null}
              </ScalePressable>
              <ScalePressable
                onPress={() => shell.navigate(shell.profileRoute)}
                accessibilityLabel="Open profile"
                style={styles.iconButton}
              >
                <InitialsAvatar name={name} photoUrl={shell.photoUrl} size={34} />
              </ScalePressable>
            </View>
          </>
        ) : (
          <>
            <ScalePressable
              static
              pressBg
              onPress={shell.onBack}
              accessibilityLabel="Go back"
              style={[styles.iconButton, styles.back]}
            >
              <ChevronLeft size={26} color={colors.textPrimary} strokeWidth={2} />
            </ScalePressable>
            <View style={styles.titleSlot}>
              {typeof options.headerTitle === 'function' ? (
                options.headerTitle({ children: title, tintColor: colors.textPrimary })
              ) : (
                <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
                  {title}
                </Text>
              )}
            </View>
            {options.headerRight ? (
              <View style={styles.actions}>{options.headerRight({ tintColor: colors.textPrimary, canGoBack: true })}</View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surfaceBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.lg,
    // The 34pt avatar's visible edge lands on the same 16pt margin as the left content.
    paddingRight: space.lg - (touch.min - 34) / 2,
  },
  actions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  iconButton: {
    width: touch.min,
    height: touch.min,
    borderRadius: touch.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The touch box reaches into the margin so the chevron sits optically near the edge.
  back: { marginLeft: -space.md },
  // A 2pt surface ring cuts the badge out of the bell instead of sitting on its stroke.
  badge: {
    position: 'absolute',
    top: 3,
    right: 1,
    // 22pt keeps an 18pt inner box under the ring, so Android never clips the 16pt digits.
    minWidth: 22,
    height: 22,
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: colors.surfaceBg,
  },
  titleSlot: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: {
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: type.titleMedium.fontSize,
    lineHeight: type.titleMedium.lineHeight,
    letterSpacing: type.titleMedium.letterSpacing,
  },
});
