import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, HelperText, Switch, Text, TextInput } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { roleKey } from './shared';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';

type ApiData = {
  payment_preference?: 'ABN' | 'TFN' | string;
  tfn_masked?: string | null;
  super_fund_name?: string | null;
  super_usi?: string | null;
  super_member_number?: string | null;
  abn?: string | null;
  abn_entity_name?: string | null;
  abn_entity_type?: string | null;
  abn_status?: string | null;
  abn_gst_registered?: boolean | null;
  abn_gst_from?: string | null;
  abn_last_checked?: string | null;
  abn_verified?: boolean | null;
  abn_verification_note?: string | null;
};

const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');

export default function PharmacistPaymentScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingABN, setCheckingABN] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ApiData>({});
  const [tfnInput, setTfnInput] = useState('');
  const [abnInput, setAbnInput] = useState('');
  const [showSuperABN, setShowSuperABN] = useState(false);
  const unsaved = useUnsavedChangesGuard(
    { data, tfnInput, abnInput, showSuperABN },
    { enabled: !loading, onSave: () => (isTFN ? saveTFNAndSuper() : saveABN()), saving: saving || checkingABN }
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: ApiData = (await getOnboardingDetail(roleKey)) as any;
        if (!mounted) return;
        const pref = (res?.payment_preference || '').toUpperCase();
        setData({
          ...res,
          payment_preference: (pref || (res?.abn ? 'ABN' : 'TFN')) as any,
        });
        setAbnInput(res?.abn || '');
        const nextShowSuperABN = Boolean(res?.super_fund_name || res?.super_usi || res?.super_member_number);
        setShowSuperABN(nextShowSuperABN);
        unsaved.markClean({
          data: {
            ...res,
            payment_preference: (pref || (res?.abn ? 'ABN' : 'TFN')) as any,
          },
          tfnInput: '',
          abnInput: res?.abn || '',
          showSuperABN: nextShowSuperABN,
        });
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || 'Failed to load payment.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const isTFN = (data.payment_preference || '').toUpperCase() === 'TFN';
  const isABN = (data.payment_preference || '').toUpperCase() === 'ABN';
  const abnDigits = useMemo(() => onlyDigits(abnInput), [abnInput]);
  const tfnDigits = useMemo(() => onlyDigits(tfnInput), [tfnInput]);
  const abnValid = abnDigits.length === 11;
  const tfnValid = tfnDigits.length === 8 || tfnDigits.length === 9;

  const setField = (k: keyof ApiData, v: any) => setData((p) => ({ ...p, [k]: v }));

  const saveTFNAndSuper = async () => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'payment');
      fd.append('payment_preference', 'TFN');
      if (tfnInput) fd.append('tfn', tfnInput);
      if (data.super_fund_name != null) fd.append('super_fund_name', String(data.super_fund_name));
      if (data.super_usi != null) fd.append('super_usi', String(data.super_usi));
      if (data.super_member_number != null) fd.append('super_member_number', String(data.super_member_number));
      fd.append('submitted_for_verification', 'true');

      const res: ApiData = (await updateOnboardingForm(roleKey, fd as any)) as any;
      setData(res || {});
      setTfnInput('');
      unsaved.markClean({ data: res || {}, tfnInput: '', abnInput, showSuperABN });
      Alert.alert('Saved', 'TFN & Super saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save TFN details.');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveABN = async () => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'payment');
      fd.append('payment_preference', 'ABN');
      fd.append('abn', abnInput.trim());
      if (data.super_fund_name != null) fd.append('super_fund_name', String(data.super_fund_name));
      if (data.super_usi != null) fd.append('super_usi', String(data.super_usi));
      if (data.super_member_number != null) fd.append('super_member_number', String(data.super_member_number));
      const res: ApiData = (await updateOnboardingForm(roleKey, fd as any)) as any;
      setData(res || {});
      unsaved.markClean({ data: res || {}, tfnInput, abnInput, showSuperABN });
      Alert.alert('Saved', 'ABN payment details saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save ABN details.');
      }
    } finally {
      setSaving(false);
    }
  };

  const checkABN = async () => {
    setCheckingABN(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'payment');
      fd.append('payment_preference', 'ABN');
      fd.append('abn', abnInput.trim());
      fd.append('submitted_for_verification', 'true');
      const res: ApiData = (await updateOnboardingForm(roleKey, fd as any)) as any;
      setData(res || {});
      unsaved.markClean({ data: res || {}, tfnInput, abnInput, showSuperABN });
      Alert.alert('ABN', 'ABN check queued.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to check ABN.');
      }
    } finally {
      setCheckingABN(false);
    }
  };

  const confirmABN = async () => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'payment');
      fd.append('payment_preference', 'ABN');
      fd.append('abn_entity_confirmed', 'true');
      const res: ApiData = (await updateOnboardingForm(roleKey, fd as any)) as any;
      setData(res || {});
      unsaved.markClean({ data: res || {}, tfnInput, abnInput, showSuperABN });
      Alert.alert('Saved', 'ABN confirmed.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to confirm ABN.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}>
          <Text>Loading payment...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>Payment</Text>

        <View style={styles.row}>
          <Button mode={isTFN ? 'contained' : 'outlined'} onPress={() => setField('payment_preference', 'TFN')} style={styles.flex}>TFN</Button>
          <Button mode={isABN ? 'contained' : 'outlined'} onPress={() => setField('payment_preference', 'ABN')} style={styles.flex}>ABN</Button>
        </View>

        {isTFN ? (
          <>
            <TextInput
              mode="outlined"
              label="TFN"
              value={tfnInput}
              onChangeText={setTfnInput}
              placeholder={data.tfn_masked || 'Enter your TFN'}
            />
            {!tfnValid && tfnInput ? <HelperText type="error">TFN must be 8 or 9 digits.</HelperText> : null}
            <TextInput mode="outlined" label="Super Fund Name *" value={data.super_fund_name || ''} onChangeText={(v) => setField('super_fund_name', v)} />
            <TextInput mode="outlined" label="USI *" value={data.super_usi || ''} onChangeText={(v) => setField('super_usi', v)} />
            <TextInput mode="outlined" label="Member Number *" value={data.super_member_number || ''} onChangeText={(v) => setField('super_member_number', v)} />
            <Button
              mode="contained"
              onPress={saveTFNAndSuper}
              loading={saving}
              disabled={saving || (!tfnInput && !data.tfn_masked) || !(data.super_fund_name && data.super_usi && data.super_member_number)}
            >
              Save TFN & Super
            </Button>
          </>
        ) : null}

        {isABN ? (
          <>
            <TextInput mode="outlined" label="ABN" value={abnInput} onChangeText={setAbnInput} />
            {!abnValid && abnInput ? <HelperText type="error">ABN must be 11 digits.</HelperText> : null}

            <View style={styles.row}>
              <Button mode="outlined" onPress={checkABN} loading={checkingABN} disabled={checkingABN || !abnInput.trim()} style={styles.flex}>
                Check ABN
              </Button>
              <Button mode="contained" onPress={confirmABN} loading={saving} disabled={saving || !data.abn_entity_name || !!data.abn_verified} style={styles.flex}>
                {data.abn_verified ? 'Confirmed' : 'Confirm ABN'}
              </Button>
            </View>

            {data.abn_entity_name ? (
              <View style={styles.abnBox}>
                <Text style={styles.abnText}>Entity: {data.abn_entity_name}</Text>
                {data.abn_entity_type ? <Text style={styles.abnText}>Type: {data.abn_entity_type}</Text> : null}
                {data.abn_status ? <Text style={styles.abnText}>Status: {data.abn_status}</Text> : null}
                <Text style={styles.abnText}>GST: {data.abn_gst_registered == null ? '-' : data.abn_gst_registered ? 'Yes' : 'No'}</Text>
              </View>
            ) : null}

            {data.abn_verification_note ? <HelperText type="info">{data.abn_verification_note}</HelperText> : null}
            <Chip mode="outlined" icon={data.abn_verified ? 'check-circle-outline' : 'clock-outline'}>{data.abn_verified ? 'ABN verified' : 'ABN pending'}</Chip>

            <View style={styles.switchRow}>
              <Text>Add super details</Text>
              <Switch value={showSuperABN} onValueChange={setShowSuperABN} />
            </View>
            {showSuperABN ? (
              <>
                <TextInput mode="outlined" label="Super Fund Name" value={data.super_fund_name || ''} onChangeText={(v) => setField('super_fund_name', v)} />
                <TextInput mode="outlined" label="USI" value={data.super_usi || ''} onChangeText={(v) => setField('super_usi', v)} />
                <TextInput mode="outlined" label="Member Number" value={data.super_member_number || ''} onChangeText={(v) => setField('super_member_number', v)} />
              </>
            ) : null}

            <Button mode="outlined" onPress={saveABN} loading={saving} disabled={saving || !abnInput.trim()}>
              Save
            </Button>
          </>
        ) : null}

        {error ? <HelperText type="error">{error}</HelperText> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontWeight: '700', color: '#111827' },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  abnBox: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 10, backgroundColor: '#FFFFFF', gap: 2 },
  abnText: { color: '#374151' },
});
