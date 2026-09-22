import React, { type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, IconButton, Surface, Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export const palette = {
  primary: '#6366F1',
  primarySoft: '#EEF2FF',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111827',
  muted: '#6B7280',
  success: '#10B981',
  successSoft: '#ECFDF5',
  warning: '#F59E0B',
  warningSoft: '#FFF7ED',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
  info: '#0369A1',
  infoSoft: '#EFF6FF',
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
  const theme = useTheme();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <Surface elevation={0} style={styles.header}>
        <IconButton icon="chevron-left" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
        <View style={styles.headerCopy}>
          <Text variant="titleMedium" numberOfLines={1} style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text variant="bodySmall" numberOfLines={2} style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        {right ?? <View style={styles.headerRightSpacer} />}
      </Surface>
      <Divider />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} /> : undefined}
      >
        {error ? (
          <Card mode="outlined" style={styles.errorCard}>
            <Card.Content style={styles.gap8}>
              <Text variant="titleSmall" style={{ color: palette.danger }}>Unable to load</Text>
              <Text variant="bodyMedium">{error}</Text>
              {onRetry ? <Button mode="contained-tonal" onPress={onRetry}>Try again</Button> : null}
            </Card.Content>
          </Card>
        ) : null}
        {loading ? <View style={styles.loading}><ActivityIndicator size="large" /><Text>Loading…</Text></View> : children}
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
        const backgroundColor = tone === 'success' ? palette.successSoft : tone === 'warning' ? palette.warningSoft : tone === 'danger' ? palette.dangerSoft : palette.primarySoft;
        const color = tone === 'success' ? '#047857' : tone === 'warning' ? '#B45309' : tone === 'danger' ? '#B91C1C' : palette.primary;
        return (
          <Card key={item.label} mode="contained" style={[styles.metric, { backgroundColor }]}>
            <Card.Content style={styles.metricContent}>
              <Text variant="labelSmall" style={styles.muted}>{item.label}</Text>
              <Text variant="titleLarge" style={{ color, fontWeight: '800' }}>{item.value}</Text>
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
  const color = tone === 'warning' ? '#9A3412' : tone === 'success' ? '#047857' : palette.info;
  return (
    <View style={[styles.note, { backgroundColor }]}>
      <Text variant="labelLarge" style={{ color, fontWeight: '700' }}>{title}</Text>
      <Text variant="bodySmall" style={{ color }}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <Card mode="outlined" style={styles.empty}>
      <Card.Content style={styles.gap8}>
        <Text variant="titleMedium">{title}</Text>
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
          <Text variant="titleSmall">{title}</Text>
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
  content: { padding: 16, paddingBottom: 36, gap: 16 },
  header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, backgroundColor: palette.surface },
  headerCopy: { flex: 1, paddingVertical: 10 },
  headerTitle: { fontWeight: '700', color: palette.text },
  headerSubtitle: { color: palette.muted, marginTop: 2 },
  headerRightSpacer: { width: 48 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontWeight: '700', color: palette.text },
  sectionBody: { gap: 10 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexGrow: 1, flexBasis: 100, minWidth: 100, borderRadius: 12 },
  metricContent: { minHeight: 82, justifyContent: 'space-between' },
  rowCard: { borderRadius: 12, backgroundColor: palette.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontWeight: '600', color: palette.text },
  muted: { color: palette.muted },
  note: { borderRadius: 12, padding: 14, gap: 5 },
  empty: { borderRadius: 12, backgroundColor: palette.surface },
  field: { backgroundColor: palette.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkCard: { borderRadius: 12, backgroundColor: palette.surface },
  gap8: { gap: 8 },
  loading: { paddingVertical: 56, alignItems: 'center', gap: 12 },
  errorCard: { borderColor: '#FCA5A5', backgroundColor: palette.dangerSoft },
});
