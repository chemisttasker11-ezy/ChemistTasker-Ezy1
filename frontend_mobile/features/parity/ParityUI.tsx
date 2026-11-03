import React, { createContext, type ReactNode, useContext } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { HelperText, Icon, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ExternalLink,
  Info,
  type LucideIcon,
  Plus,
  Store,
  TriangleAlert,
} from 'lucide-react-native';

import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { ContentState, PageHeader, Pill, ScalePressable, SectionCard } from '@/components/ui';
import { alpha } from '@/components/ui/tone';
import { statusToneFor } from './statusTone';

export const palette = {
  primary: colors.primary,
  primarySoft: colors.primarySoft,
  background: colors.pageBg,
  surface: colors.surfaceBg,
  border: colors.border,
  text: colors.textPrimary,
  muted: colors.textMuted,
  success: colors.status.green.solid,
  successSoft: colors.status.green.bg,
  warning: colors.status.amber.solid,
  warningSoft: colors.status.amber.bg,
  danger: colors.status.red.solid,
  dangerSoft: colors.status.red.bg,
  info: colors.tone.blue.fg,
  infoSoft: colors.tone.blue.bg,
};

// Rows and empty states inside a Section drop their own card chrome (no card in a card).
const InSection = createContext(false);

export function ParityPage({
  title,
  subtitle,
  children,
  loading = false,
  error = '',
  onRetry,
  onRefresh,
  refreshing = false,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  right?: ReactNode;
}) {
  const router = useRouter();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  // The bar takes over the title once the large heading has scrolled under it, like a native large title.
  const barTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [space.lg, space.lg + type.headlineLarge.lineHeight], [0, 1], Extrapolation.CLAMP),
  }));
  const barRuleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, space.lg], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <ScalePressable
          pressBg
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
        </ScalePressable>
        <Animated.Text
          numberOfLines={1}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[styles.headerTitle, barTitleStyle]}
        >
          {title}
        </Animated.Text>
        {right ?? <View style={styles.headerRightSpacer} />}
        <Animated.View style={[styles.headerRule, barRuleStyle]} />
      </View>
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          ) : undefined
        }
      >
        <PageHeader title={title} subtitle={subtitle} style={styles.headerCopy} />
        {error ? (
          <ContentState kind="error" compact title="Unable to load" description={error} onAction={onRetry} style={styles.errorCard} />
        ) : null}
        {loading ? <ContentState kind="loading" style={styles.loading} /> : children}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <SectionCard dense title={title} subtitle={description} action={action} style={styles.section}>
      <InSection.Provider value>
        <View style={styles.sectionBody}>{children}</View>
      </InSection.Provider>
    </SectionCard>
  );
}

type MetricTone = 'primary' | 'success' | 'warning' | 'danger';

const metricTones: Record<MetricTone, { bg: string; fg: string }> = {
  primary: colors.tone.violet,
  success: colors.status.green,
  warning: colors.status.amber,
  danger: colors.status.red,
};

export function MetricGrid({ items, minItemWidth = 88 }: {
  items: Array<{ label: string; value: string | number; tone?: MetricTone }>;
  minItemWidth?: number;
}) {
  return (
    <View style={styles.metricGrid}>
      {items.map((item) => {
        const { bg, fg } = metricTones[item.tone ?? 'primary'];
        // Figures get the big tabular face; words ("Clocked in", a pharmacy name) a size that fits two lines.
        const figure = typeof item.value === 'number' || !/[A-Za-z]/.test(String(item.value));
        return (
          <View
            key={item.label}
            accessible
            accessibilityLabel={`${item.label}, ${item.value}`}
            style={[styles.metric, { backgroundColor: bg, flexBasis: minItemWidth, minWidth: minItemWidth }]}
          >
            <Text style={[styles.metricLabel, { color: fg }]}>{item.label}</Text>
            <Text
              numberOfLines={figure ? 1 : 2}
              adjustsFontSizeToFit
              minimumFontScale={figure ? 0.7 : 0.85}
              maxFontSizeMultiplier={1.2}
              style={[figure ? styles.metricFigure : styles.metricWords, { color: fg }]}
            >
              {item.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Row({
  title,
  subtitle,
  onPress,
  trailing,
  control,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  /** An interactive control at the row's end; kept outside the pressable so screen readers reach it. */
  control?: ReactNode;
}) {
  const nested = useContext(InSection);
  const card = nested ? styles.rowNested : styles.rowCard;
  const row = nested ? [styles.row, styles.rowDense] : styles.row;
  const copy = (
    <>
      <View style={styles.rowCopy}>
        <Text numberOfLines={2} style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={3} style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </>
  );
  if (onPress && control) {
    return (
      <View style={[card, styles.rowSplit]}>
        <ScalePressable static pressBg onPress={onPress} style={[row, styles.rowMain]}>
          {copy}
        </ScalePressable>
        <View style={styles.rowControl}>{control}</View>
      </View>
    );
  }
  return onPress ? (
    <ScalePressable static pressBg onPress={onPress} style={[card, row]}>
      {copy}
    </ScalePressable>
  ) : (
    <View style={[card, row]}>
      {copy}
      {control}
    </View>
  );
}

function Trailing({ children }: { children: ReactNode }) {
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {children}
    </View>
  );
}

export function DataRow({
  title,
  subtitle,
  status,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string;
  status?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  return (
    <Row
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      trailing={
        <>
          {status ? <Pill label={status} tone={statusToneFor(status)} style={styles.status} /> : null}
          {onPress && !right ? <Trailing><ChevronRight size={20} color={colors.textMuted} strokeWidth={1.75} /></Trailing> : null}
        </>
      }
      control={right}
    />
  );
}

const noteTones = {
  info: { ...colors.tone.blue, Glyph: Info },
  warning: { ...colors.status.amber, Glyph: TriangleAlert },
  success: { ...colors.status.green, Glyph: CircleCheck },
};

export function InfoNote({ title, children, tone = 'info' }: { title: string; children: ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  const { bg, fg, Glyph } = noteTones[tone];
  return (
    <View style={[styles.note, { backgroundColor: bg, borderColor: alpha(fg, 0.2) }]}>
      <Trailing><Glyph size={18} color={fg} strokeWidth={2} style={styles.noteIcon} /></Trailing>
      <View style={styles.noteCopy}>
        <Text style={[styles.noteTitle, { color: fg }]}>{title}</Text>
        <Text style={[styles.noteBody, { color: fg }]}>{children}</Text>
      </View>
    </View>
  );
}

function useStateChrome() {
  const inSection = useContext(InSection);
  return { compact: inSection, style: inSection ? styles.empty : undefined };
}

export function EmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  const chrome = useStateChrome();
  return <ContentState kind="empty" title={title} description={body} actionLabel={actionLabel} onAction={onAction} {...chrome} />;
}

export function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline = false,
  disabled = false,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad' | 'decimal-pad';
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
}) {
  return (
    <View>
      <TextInput
        mode="outlined"
        label={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        disabled={disabled}
        placeholder={placeholder}
        error={Boolean(error)}
        outlineColor={colors.inputBorder}
        activeOutlineColor={colors.primary}
        textColor={colors.textPrimary}
        placeholderTextColor={colors.textMuted}
        outlineStyle={styles.fieldOutline}
        contentStyle={styles.fieldText}
        style={styles.field}
      />
      {error ? <HelperText type="error" style={styles.fieldError}>{error}</HelperText> : null}
    </View>
  );
}

export function ChoiceChips({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => (
        <Pill
          key={option.value}
          label={option.label}
          selected={value === option.value}
          disabled={disabled}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

export function ActionButtons({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

export function PharmacyRequired({ onOpen }: { onOpen?: () => void }) {
  const chrome = useStateChrome();
  return (
    <ContentState
      kind="empty"
      icon={<Store />}
      title="Select a pharmacy"
      description="This workspace is pharmacy-scoped. Select a pharmacy from your internal workspace before continuing."
      actionLabel={onOpen ? 'Go to dashboard' : undefined}
      onAction={onOpen}
      {...chrome}
    />
  );
}

// Paper (MaterialCommunityIcons) names the old API accepted, drawn in Lucide; any other name falls back to Paper.
const lucideByPaperName: Record<string, LucideIcon> = {
  'chevron-right': ChevronRight,
  'arrow-right': ArrowRight,
  'open-in-new': ExternalLink,
  plus: Plus,
};

export function ScreenLink({ title, subtitle, onPress, icon = 'chevron-right' }: { title: string; subtitle?: string; onPress: () => void; icon?: string }) {
  const Glyph = lucideByPaperName[icon];
  return (
    <Row
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      trailing={
        <Trailing>
          {Glyph ? <Glyph size={20} color={colors.textMuted} strokeWidth={1.75} /> : <Icon source={icon} size={20} color={colors.textMuted} />}
        </Trailing>
      }
    />
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space['3xl'] + space.xs, gap: space.lg },
  header: {
    minHeight: touch.min + space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
    backgroundColor: palette.background,
  },
  backButton: { width: touch.min, height: touch.min, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  headerRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: palette.border },
  // Space under the large title, on top of the content gap: more above a group than inside it.
  headerCopy: { marginBottom: space.xs },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    color: palette.text,
    fontFamily: font.outfit.medium,
    fontSize: type.titleSmall.fontSize,
    lineHeight: type.titleSmall.lineHeight,
    letterSpacing: type.titleSmall.letterSpacing,
  },
  headerRightSpacer: { width: touch.min },
  section: { minWidth: 0 },
  sectionBody: { gap: space.md },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metric: {
    flexGrow: 1,
    flexBasis: 88,
    minWidth: 88,
    minHeight: 82,
    justifyContent: 'space-between',
    gap: space.xs,
    padding: space.md + space.xxs,
    borderRadius: radius.nested,
  },
  metricLabel: { fontFamily: font.inter.medium, fontSize: type.labelMedium.fontSize, lineHeight: type.labelMedium.lineHeight },
  metricFigure: {
    fontFamily: font.outfit.medium,
    fontSize: type.headlineMedium.fontSize,
    lineHeight: type.headlineMedium.lineHeight,
    letterSpacing: type.headlineMedium.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  metricWords: {
    fontFamily: font.outfit.medium,
    fontSize: type.titleMedium.fontSize,
    lineHeight: type.titleMedium.lineHeight,
    letterSpacing: type.titleMedium.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  rowCard: { borderRadius: radius.nested, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  // Inside a Section: a tinted inset (smaller radius than the card), no second border.
  rowNested: { borderRadius: radius.tileSm, backgroundColor: colors.subtleBg },
  rowDense: { minHeight: touch.min, paddingVertical: space.sm, paddingLeft: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touch.min + space.lg,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.md,
  },
  // Pressable body beside its control (not around it): one card, two accessible elements.
  rowSplit: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  rowMain: { flex: 1, minWidth: 0, paddingRight: 0 },
  // Hairline between the two tap targets, so the control does not read as part of the row body.
  rowControl: {
    minHeight: touch.min,
    justifyContent: 'center',
    marginLeft: space.md,
    paddingHorizontal: space.sm,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: palette.border,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: space.xxs },
  rowTitle: {
    color: palette.text,
    fontFamily: font.inter.semiBold,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
  },
  rowSubtitle: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  status: { alignSelf: 'center', maxWidth: '45%' },
  muted: { color: palette.muted },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, borderRadius: radius.nested, borderWidth: 1, padding: space.lg },
  // Centres the 18pt glyph on the 20pt title line.
  noteIcon: { marginTop: 1 },
  noteCopy: { flex: 1, minWidth: 0, gap: space.xxs },
  noteTitle: { fontFamily: font.inter.semiBold, fontSize: type.labelLarge.fontSize, lineHeight: type.labelLarge.lineHeight },
  noteBody: { fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight },
  // Inside a Section the card is already there: keep only the content.
  empty: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 },
  field: { backgroundColor: colors.inputBg },
  fieldOutline: { borderRadius: radius.control },
  fieldText: { fontFamily: font.inter.regular },
  fieldError: { paddingHorizontal: space.xs },
  // Pill chips sit in a touch.min box around a 36pt chip, so rows already get 8-12pt of air: no extra row gap.
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm, rowGap: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  loading: { alignSelf: 'stretch' },
  errorCard: { borderColor: colors.status.red.bg },
});
