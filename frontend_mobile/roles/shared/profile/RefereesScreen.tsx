import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, HelperText, Menu, Text, TextInput, useTheme } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useUnsavedChangesGuard } from '../forms/useUnsavedChangesGuard';

const REL_CHOICES = [
  { value: 'manager', label: 'Manager' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'owner', label: 'Owner' },
  { value: 'other', label: 'Other' },
];

export type RefereeRoleKey = 'pharmacist' | 'otherstaff' | 'explorer';

type ApiData = {
  referee1_name?: string | null;
  referee1_relation?: string | null;
  referee1_workplace?: string | null;
  referee1_email?: string | null;
  referee1_confirmed?: boolean | null;
  referee1_rejected?: boolean | null;
  referee1_last_sent?: string | null;
  referee2_name?: string | null;
  referee2_relation?: string | null;
  referee2_workplace?: string | null;
  referee2_email?: string | null;
  referee2_confirmed?: boolean | null;
  referee2_rejected?: boolean | null;
  referee2_last_sent?: string | null;
};

function RefStatus({ confirmed, rejected }: { confirmed?: boolean | null; rejected?: boolean | null }) {
  if (confirmed) return <Chip mode="outlined" icon="check-circle-outline" textStyle={{ color: '#16A34A' }}>Accepted</Chip>;
  if (rejected) return <Chip mode="outlined" icon="close-circle-outline" textStyle={{ color: '#DC2626' }}>Declined</Chip>;
  return <Chip mode="outlined" icon="clock-outline">Pending</Chip>;
}

export default function RefereesScreen({ roleKey }: { roleKey: RefereeRoleKey }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ApiData>({});
  const [menu1, setMenu1] = useState(false);
  const [menu2, setMenu2] = useState(false);
  const unsaved = useUnsavedChangesGuard(data, { enabled: !loading, onSave: () => save(false), saving });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: any = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        setData(res || {});
        unsaved.markClean(res || {});
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || 'Failed to load referees.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const setField = (k: keyof ApiData, v: any) => setData((p) => ({ ...p, [k]: v }));
  const canSend = useMemo(() => {
    const r1 = Boolean(data.referee1_name && data.referee1_relation && data.referee1_workplace && data.referee1_email);
    const r2 = Boolean(data.referee2_name && data.referee2_relation && data.referee2_workplace && data.referee2_email);
    return r1 && r2;
  }, [data]);

  const save = async (sendForVerification: boolean) => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'referees');
      if (sendForVerification) fd.append('submitted_for_verification', 'true');
      ([
        'referee1_name', 'referee1_relation', 'referee1_workplace', 'referee1_email',
        'referee2_name', 'referee2_relation', 'referee2_workplace', 'referee2_email',
      ] as const).forEach((k) => {
        const v = data[k];
        if (v !== undefined && v !== null) fd.append(k, String(v));
      });
      const res: any = await updateOnboardingForm(roleKey, fd as any);
      setData(res || {});
      unsaved.markClean(res || {});
      Alert.alert('Saved', sendForVerification ? 'Reference requests sent.' : 'Referees saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save referees.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
        <View style={styles.loader}>
          <Text>Loading referees...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onSurface }]}>Referees</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Add two professional referees. Accepted references are locked to protect the completed verification.</Text>

        <View style={[styles.card, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Referee 1</Text>
            <RefStatus confirmed={data.referee1_confirmed} rejected={data.referee1_rejected} />
          </View>
          {data.referee1_last_sent ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Last request sent {new Date(data.referee1_last_sent).toLocaleString('en-AU')}</Text> : null}
          <TextInput mode="outlined" label="Full Name" value={data.referee1_name || ''} onChangeText={(v) => setField('referee1_name', v)} editable={!data.referee1_confirmed} />
          <Menu visible={menu1} onDismiss={() => setMenu1(false)} anchor={<Button mode="outlined" disabled={Boolean(data.referee1_confirmed)} onPress={() => setMenu1(true)}>{REL_CHOICES.find((r) => r.value === data.referee1_relation)?.label || 'Relationship'}</Button>}>
            {REL_CHOICES.map((r) => <Menu.Item key={r.value} title={r.label} onPress={() => { setField('referee1_relation', r.value); setMenu1(false); }} />)}
          </Menu>
          <TextInput mode="outlined" label="Workplace" value={data.referee1_workplace || ''} onChangeText={(v) => setField('referee1_workplace', v)} editable={!data.referee1_confirmed} />
          <TextInput mode="outlined" label="Email" value={data.referee1_email || ''} onChangeText={(v) => setField('referee1_email', v)} editable={!data.referee1_confirmed} keyboardType="email-address" autoCapitalize="none" />
        </View>

        <View style={[styles.card, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Referee 2</Text>
            <RefStatus confirmed={data.referee2_confirmed} rejected={data.referee2_rejected} />
          </View>
          {data.referee2_last_sent ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Last request sent {new Date(data.referee2_last_sent).toLocaleString('en-AU')}</Text> : null}
          <TextInput mode="outlined" label="Full Name" value={data.referee2_name || ''} onChangeText={(v) => setField('referee2_name', v)} editable={!data.referee2_confirmed} />
          <Menu visible={menu2} onDismiss={() => setMenu2(false)} anchor={<Button mode="outlined" disabled={Boolean(data.referee2_confirmed)} onPress={() => setMenu2(true)}>{REL_CHOICES.find((r) => r.value === data.referee2_relation)?.label || 'Relationship'}</Button>}>
            {REL_CHOICES.map((r) => <Menu.Item key={r.value} title={r.label} onPress={() => { setField('referee2_relation', r.value); setMenu2(false); }} />)}
          </Menu>
          <TextInput mode="outlined" label="Workplace" value={data.referee2_workplace || ''} onChangeText={(v) => setField('referee2_workplace', v)} editable={!data.referee2_confirmed} />
          <TextInput mode="outlined" label="Email" value={data.referee2_email || ''} onChangeText={(v) => setField('referee2_email', v)} editable={!data.referee2_confirmed} keyboardType="email-address" autoCapitalize="none" />
        </View>

        {error ? <HelperText type="error">{error}</HelperText> : null}
        <View style={styles.actions}>
          <Button mode="outlined" onPress={() => save(false)} loading={saving} disabled={saving}>Save</Button>
          <Button mode="contained" onPress={() => save(true)} loading={saving} disabled={saving || !canSend}>Send / Resend Requests</Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 4 },
});
