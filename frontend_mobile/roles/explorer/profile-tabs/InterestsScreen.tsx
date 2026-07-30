import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Checkbox, HelperText, Text } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';

const INTEREST_CHOICES: Array<{ value: string; label: string }> = [
  { value: 'SHADOWING', label: 'Shadowing' },
  { value: 'VOLUNTEERING', label: 'Volunteering' },
  { value: 'PLACEMENT', label: 'Placement' },
  { value: 'JUNIOR_ASSIST', label: 'Junior assistant role' },
];

const roleKey = 'explorer';

export default function ExplorerInterestsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const unsaved = useUnsavedChangesGuard(selected, { enabled: !loading, onSave: () => save(), saving });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: any = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        setSelected(res?.interests || []);
        unsaved.markClean(res?.interests || []);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || 'Failed to load interests.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = (code: string) => {
    setSelected((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...new Set([...prev, code])]));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'interests');
      fd.append('interests', JSON.stringify(selected));
      const res: any = await updateOnboardingForm(roleKey, fd as any);
      setSelected(res?.interests || []);
      unsaved.markClean(res?.interests || []);
      Alert.alert('Saved', 'Interests saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save interests.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}><Text>Loading interests...</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>Interests</Text>
        {INTEREST_CHOICES.map((opt) => (
          <View key={opt.value} style={styles.row}>
            <Checkbox status={selected.includes(opt.value) ? 'checked' : 'unchecked'} onPress={() => toggle(opt.value)} />
            <Text style={styles.rowText}>{opt.label}</Text>
          </View>
        ))}
        {error ? <HelperText type="error">{error}</HelperText> : null}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving}>Save</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  title: { fontWeight: '700', color: '#111827', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowText: { color: '#111827' },
});
