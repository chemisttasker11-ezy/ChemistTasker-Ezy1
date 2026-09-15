import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Checkbox, HelperText, Text, TextInput } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { roleKey } from './shared';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';

type RatePref = {
  weekday: string;
  saturday: string;
  sunday: string;
  public_holiday: string;
  early_morning: string;
  late_night: string;
  early_morning_same_as_day?: boolean;
  late_night_same_as_day?: boolean;
};

const emptyRates: RatePref = {
  weekday: '',
  saturday: '',
  sunday: '',
  public_holiday: '',
  early_morning: '',
  late_night: '',
  early_morning_same_as_day: false,
  late_night_same_as_day: false,
};

export default function PharmacistRateScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rates, setRates] = useState<RatePref>(emptyRates);
  const unsaved = useUnsavedChangesGuard(rates, { enabled: !loading, onSave: () => save(), saving });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: any = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        const nextRates = { ...emptyRates, ...(res?.rate_preference || {}) };
        setRates(nextRates);
        unsaved.markClean(nextRates);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || 'Failed to load rates.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const setField = (k: keyof RatePref, v: string) => {
    setRates((p) => ({ ...p, [k]: v.replace(/[^\d.]/g, '') }));
  };
  const setBool = (k: keyof RatePref, v: boolean) => setRates((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'rate');
      fd.append('rate_preference', JSON.stringify(rates));
      const res: any = await updateOnboardingForm(roleKey, fd as any);
      const nextRates = { ...emptyRates, ...(res?.rate_preference || {}) };
      setRates(nextRates);
      unsaved.markClean(nextRates);
      Alert.alert('Saved', 'Rates saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save rates.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}>
          <Text>Loading rates...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>Rate</Text>
        <TextInput mode="outlined" label="Weekday" value={rates.weekday || ''} onChangeText={(v) => setField('weekday', v)} left={<TextInput.Affix text="$" />} />
        <TextInput mode="outlined" label="Saturday" value={rates.saturday || ''} onChangeText={(v) => setField('saturday', v)} left={<TextInput.Affix text="$" />} />
        <TextInput mode="outlined" label="Sunday" value={rates.sunday || ''} onChangeText={(v) => setField('sunday', v)} left={<TextInput.Affix text="$" />} />
        <TextInput mode="outlined" label="Public Holiday" value={rates.public_holiday || ''} onChangeText={(v) => setField('public_holiday', v)} left={<TextInput.Affix text="$" />} />

        <TextInput
          mode="outlined"
          label="Early Morning (< 8 am)"
          value={rates.early_morning || ''}
          onChangeText={(v) => setField('early_morning', v)}
          left={<TextInput.Affix text="$" />}
          disabled={Boolean(rates.early_morning_same_as_day)}
        />
        <View style={styles.checkboxRow}>
          <Checkbox status={rates.early_morning_same_as_day ? 'checked' : 'unchecked'} onPress={() => setBool('early_morning_same_as_day', !rates.early_morning_same_as_day)} />
          <Text>Early Morning: same as day</Text>
        </View>

        <TextInput
          mode="outlined"
          label="Late Night (> 7 pm)"
          value={rates.late_night || ''}
          onChangeText={(v) => setField('late_night', v)}
          left={<TextInput.Affix text="$" />}
          disabled={Boolean(rates.late_night_same_as_day)}
        />
        <View style={styles.checkboxRow}>
          <Checkbox status={rates.late_night_same_as_day ? 'checked' : 'unchecked'} onPress={() => setBool('late_night_same_as_day', !rates.late_night_same_as_day)} />
          <Text>Late Night: same as day</Text>
        </View>

        {error ? <HelperText type="error">{error}</HelperText> : null}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving}>Save Rates</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontWeight: '700', color: '#111827' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: -6 },
});
