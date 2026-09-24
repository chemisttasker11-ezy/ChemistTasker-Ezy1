import React, { type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, IconButton, Surface, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { brandColors, getPersonaPalette } from '@/constants/theme';

export const palette = {
  primary: brandColors.purple,
  primarySoft: '#F0EAFF',
  background: brandColors.mist,
  surface: brandColors.white,
  border: brandColors.border,
  text: brandColors.navy,
  muted: brandColors.body,
  success: brandColors.success,
  successSoft: brandColors.successSoft,
  warning: brandColors.warning,
  warningSoft: brandColors.warningSoft,
  danger: brandColors.danger,
  dangerSoft: brandColors.dangerSoft,
  info: brandColors.blue,
  infoSoft: '#E8F5FB',
};

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
  const { user } = useAuth();
  const persona = getPersonaPalette(user?.role);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <Surface elevation={0} style={styles.header}>
        <IconButton
          icon="chevron-left"
          accessibilityLabel="Go back"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        />
        <View style={styles.headerCopy}>
          <Text variant="titleLarge" numberOfLines={2} style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text variant="bodySmall" numberOfLines={3} style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        {right ?? <View style={styles.headerRightSpacer} />}
      </Surface>
      <View style={[styles.headerAccent, { backgroundColor: persona.accent }]} />
      <Divider />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={persona.accent} colors={[persona.accent]} />
        ) : undefined}
      >
        {error ? (
          <Card mode="contained" style={styles.errorCard}>
            <Card.Content style={styles.gap8}>
              <Text variant="titleSmall" style={{ color: palette.danger, fontWeight: '800' }}>Unable to load</Text>
              <Text variant="bodyMedium" style={{ color: brandColors.navy }}>{error}</Text>
              {onRetry ? <Button mode="contained-tonal" onPress={onRetry}>Try again</Button> : null}
            </Card.Content>
          </Card>
        ) : null}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={persona.accent} />
            <Text style={styles.muted}>Loading…</Text>
          </View>
        ) : children}
      </ScrollView>
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
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={styles.sectionTitle}>{title}</Text>
          {description ? <Text variant="bodySmall" style={styles.muted}>{description}</Text> : null}
        </View>
        {action}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function MetricGrid({ items }: { items: Array<{ label: string; value: string | number; tone?: 'primary' | 'success' | 'warning' | 'danger' }> }) {
  return (
    <View style={styles.metricGrid}>
      {items.map((item) => {
        const tone = item.tone ?? 'primary';
        const backgroundColor = tone === 'success' ? palette.successSoft : tone === 'warning' ? palette.warningSoft : tone === 'danger' ? palette.dangerSoft : '#F3F6FA';
        const color = tone === 'success' ? '#08765D' : tone === 'warning' ? '#8C5B17' : tone === 'danger' ? '#A42E39' : brandColors.navy;
        return (
          <Card key={item.label} mode="contained" style={[styles.metric, { backgroundColor }]}>
            <Card.Content style={styles.metricContent}>
              <Text variant="labelSmall" style={styles.muted}>{item.label}</Text>
              <Text variant="titleMedium" style={{ color, fontWeight: '900' }} numberOfLines={2}>{item.value}</Text>
            </Card.Content>
          </Card>
        );
      })}
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
    <Card mode="outlined" style={styles.rowCard} onPress={onPress}>
      <Card.Content style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="titleSmall" numberOfLines={2} style={styles.rowTitle}>{title}</Text>
          {subtitle ? <Text variant="bodySmall" style={styles.muted} numberOfLines={3}>{subtitle}</Text> : null}
        </View>
        {status ? <Chip compact>{status}</Chip> : null}
        {right}
        {onPress ? <IconButton icon="chevron-right" size={20} /> : null}
      </Card.Content>
    </Card>
  );
}

export function InfoNote({ title, children, tone = 'info' }: { title: string; children: ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  const backgroundColor = tone === 'warning' ? palette.warningSoft : tone === 'success' ? palette.successSoft : palette.infoSoft;
  const color = tone === 'warning' ? '#8C5B17' : tone === 'success' ? '#08765D' : '#086792';
  return (
    <View style={[styles.note, { backgroundColor }]}>
      <Text variant="labelLarge" style={{ color, fontWeight: '800' }}>{title}</Text>
      <Text variant="bodySmall" style={{ color }}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <Card mode="contained" style={styles.empty}>
      <Card.Content style={styles.gap8}>
        <Text variant="titleMedium" style={styles.rowTitle}>{title}</Text>
        <Text variant="bodyMedium" style={styles.muted}>{body}</Text>
        {actionLabel && onAction ? <Button mode="contained" onPress={onAction}>{actionLabel}</Button> : null}
      </Card.Content>
    </Card>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline = false,
  disabled = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad' | 'decimal-pad';
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <TextInput
      mode="outlined"
      label={label}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      multiline={multiline}
      disabled={disabled}
      placeholder={placeholder}
      style={styles.field}
    />
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
        <Chip key={option.value} selected={value === option.value} disabled={disabled} onPress={() => onChange(option.value)}>
          {option.label}
        </Chip>
      ))}
    </View>
  );
}

export function ActionButtons({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

export function PharmacyRequired({ onOpen }: { onOpen?: () => void }) {
  return <EmptyState title="Select a pharmacy" body="This workspace is pharmacy-scoped. Select a pharmacy from your internal workspace before continuing." actionLabel={onOpen ? 'Go to dashboard' : undefined} onAction={onOpen} />;
}

export function ScreenLink({ title, subtitle, onPress, icon = 'chevron-right' }: { title: string; subtitle?: string; onPress: () => void; icon?: string }) {
  return (
    <Card mode="outlined" style={styles.linkCard} onPress={onPress}>
      <Card.Content style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="titleSmall" style={styles.rowTitle}>{title}</Text>
          {subtitle ? <Text variant="bodySmall" style={styles.muted}>{subtitle}</Text> : null}
        </View>
        <IconButton icon={icon} />
      </Card.Content>
    </Card>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 36, gap: 20 },
  header: { minHeight: 82, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, backgroundColor: palette.surface },
  headerAccent: { height: 2 },
  headerCopy: { flex: 1, paddingVertical: 10 },
  headerTitle: { fontWeight: '900', color: palette.text, letterSpacing: -0.2 },
  headerSubtitle: { color: palette.muted, marginTop: 3, lineHeight: 17 },
  headerRightSpacer: { width: 48 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontWeight: '800', color: palette.text },
  sectionBody: { gap: 10 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexGrow: 1, flexBasis: 112, minWidth: 112, borderRadius: 14 },
  metricContent: { minHeight: 78, justifyContent: 'space-between' },
  rowCard: { borderRadius: 14, backgroundColor: palette.surface, borderColor: palette.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  rowTitle: { fontWeight: '800', color: palette.text },
  muted: { color: palette.muted },
  note: { borderRadius: 14, padding: 14, gap: 5 },
  empty: { borderRadius: 14, backgroundColor: '#F7F9FC' },
  field: { backgroundColor: palette.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkCard: { borderRadius: 14, backgroundColor: palette.surface, borderColor: palette.border },
  gap8: { gap: 8 },
  loading: { paddingVertical: 44, alignItems: 'center', gap: 10 },
  errorCard: { backgroundColor: palette.dangerSoft },
});
