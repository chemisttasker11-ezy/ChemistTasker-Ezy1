import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScalePressable } from '@/components/ui';
import { colors, font, radius, space } from '@/constants/tokens';
import { isTabRoute, type ShellTab } from './ShellContext';

const BAR = 60;
/** Only personas with a centre hero tab (Post shift, or Pharmacies for organization) get the taller bar (DD1). */
const HERO_BAR = 68;
const HERO = 56;
const LABEL_LINE = 14;
const HERO_PAD = space.sm;
/** The hero column (circle, gap, label, bottom pad) minus the bar: how far the circle rises above the bar's top edge. */
const HERO_LIFT = HERO + space.xxs + LABEL_LINE + HERO_PAD - HERO_BAR;

export type ShellTabBarProps = {
  tabs: ShellTab[];
  /** Route name of the focused screen. */
  currentName: string;
  /** Default navigation for tabs without their own onPress. */
  onNavigate: (tab: ShellTab) => void;
};

/**
 * Max five tabs: Lucide icons (1.75 stroke, 2 when active), the active one in a violet pill.
 * Hidden routes stay routable; only `tabs` render. Owns the bottom safe-area inset.
 */
export function ShellTabBar({ tabs, currentName, onNavigate }: ShellTabBarProps) {
  const insets = useSafeAreaInsets();
  // Routes outside every tab were opened from More, so More stays lit.
  const activeName = tabs.find((tab) => isTabRoute(tab, currentName))?.name ?? 'more';
  // The raised circle only reads as centred with five tabs; when guards drop tabs, the hero renders as a plain tab.
  const hasHero = tabs.length === 5 && Boolean(tabs[2]?.hero);
  const lift = hasHero ? HERO_LIFT : 0;
  const itemPad = { paddingBottom: hasHero ? HERO_PAD : space.xs };

  return (
    // The lift strip is transparent and overlaps the scene, so only the circle rises over the content.
    <View accessibilityRole="tablist" pointerEvents="box-none" style={{ marginTop: -lift }}>
      <View style={[styles.surface, { top: lift }]} />
      <View
        pointerEvents="box-none"
        style={[styles.row, { height: (hasHero ? HERO_BAR : BAR) + lift + insets.bottom, paddingBottom: insets.bottom }]}
      >
        {tabs.map((tab) => {
          const active = tab.name === activeName;
          const onPress = () => {
            // Re-pressing the screen you are on does nothing (no duplicate Post shift pushes).
            if ([tab.name, ...(tab.match ?? [])].includes(currentName)) return;
            if (tab.onPress) tab.onPress();
            else onNavigate(tab);
          };
          const Icon = tab.icon;

          if (tab.hero && hasHero) {
            return (
              <ScalePressable
                key={tab.name}
                haptic="medium"
                onPress={onPress}
                accessibilityRole="tab"
                accessibilityLabel={tab.accessibilityLabel}
                accessibilityState={{ selected: active }}
                style={[styles.item, itemPad]}
              >
                <View style={[styles.heroCircle, active ? styles.heroCircleActive : null]}>
                  <Icon size={26} color={colors.surfaceBg} strokeWidth={2} />
                </View>
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={[styles.label, styles.heroLabel, active ? styles.labelActive : null]}
                >
                  {tab.label}
                </Text>
              </ScalePressable>
            );
          }

          return (
            <ScalePressable
              key={tab.name}
              static
              haptic="selection"
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={tab.accessibilityLabel}
              accessibilityState={{ selected: active }}
              // Regular tabs start at the bar's edge; the strip above them passes touches to the scene.
              style={[styles.item, itemPad, { marginTop: lift }]}
            >
              <View style={[styles.iconPill, active ? styles.iconPillActive : null]}>
                <Icon
                  size={22}
                  color={active ? colors.accentStrong : colors.textSecondary}
                  strokeWidth={active ? 2 : 1.75}
                />
              </View>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
                style={[styles.label, active ? styles.labelActive : null]}
              >
                {tab.label}
              </Text>
            </ScalePressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  // Labels share one baseline; icons sit above them, so the taller hero column rises instead of shifting labels.
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  iconPill: {
    width: 56,
    height: 30,
    marginBottom: space.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: { backgroundColor: colors.tone.violet.bg },
  // A 2pt surface ring cuts the circle out of the bar's top border instead of sitting on it.
  heroCircle: {
    width: HERO,
    height: HERO,
    marginBottom: space.xxs,
    borderRadius: HERO / 2,
    borderWidth: 2,
    borderColor: colors.surfaceBg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: colors.brandNavy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  heroCircleActive: { backgroundColor: colors.primaryPressed },
  label: {
    color: colors.textSecondary,
    fontFamily: font.inter.medium,
    fontSize: 11.5,
    lineHeight: LABEL_LINE,
  },
  heroLabel: { color: colors.textPrimary, fontFamily: font.inter.semiBold },
  labelActive: { color: colors.accentStrong, fontFamily: font.inter.semiBold },
});
