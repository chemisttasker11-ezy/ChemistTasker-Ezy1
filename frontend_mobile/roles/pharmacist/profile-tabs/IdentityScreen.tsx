import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, HelperText, Menu, Text, TextInput } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { API_BASE_URL } from '@/constants/api';
import { AUS_STATES, DOC_TYPES, boolChipProps, pickSingleDocument, roleKey, toRNFile } from './shared';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';

type ApiData = {
  government_id?: string | null;
  government_id_type?: string | null;
  identity_secondary_file?: string | null;
  identity_meta?: Record<string, string> | null;
  gov_id_verified?: boolean | null;
  gov_id_verification_note?: string | null;
};

const fileUrl = (path?: string | null) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL}${path}`;
};

export default function PharmacistIdentityScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ApiData>({});
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [docMenuVisible, setDocMenuVisible] = useState(false);
  const [stateMenuVisible, setStateMenuVisible] = useState(false);
  const [primaryFile, setPrimaryFile] = useState<any>(null);
  const [secondaryFile, setSecondaryFile] = useState<any>(null);
  const unsaved = useUnsavedChangesGuard(
    { data, meta, primaryFile, secondaryFile },
    { enabled: !loading, onSave: () => save(false), saving }
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: any = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        setData(res || {});
        setMeta((res?.identity_meta as Record<string, string>) || {});
        unsaved.markClean({
          data: res || {},
          meta: (res?.identity_meta as Record<string, string>) || {},
          primaryFile: null,
          secondaryFile: null,
        });
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || 'Failed to load identity.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const govChip = boolChipProps(data.gov_id_verified);
  const selectedDocTypeLabel = useMemo(
    () => DOC_TYPES.find((d) => d.value === data.government_id_type)?.label || 'Select document type',
    [data.government_id_type]
  );

  const updateMeta = (k: string, v: string) => setMeta((p) => ({ ...p, [k]: v }));

  const save = async (submitForVerification: boolean) => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'identity');
      if (submitForVerification) fd.append('submitted_for_verification', 'true');
      if (data.government_id_type) fd.append('government_id_type', data.government_id_type);
      if (primaryFile) fd.append('government_id', toRNFile(primaryFile));
      if (secondaryFile) fd.append('identity_secondary_file', toRNFile(secondaryFile));
      fd.append('identity_meta', JSON.stringify(meta || {}));

      const res: any = await updateOnboardingForm(roleKey, fd as any);
      setData(res || {});
      setMeta((res?.identity_meta as Record<string, string>) || {});
      setPrimaryFile(null);
      setSecondaryFile(null);
      unsaved.markClean({
        data: res || {},
        meta: (res?.identity_meta as Record<string, string>) || {},
        primaryFile: null,
        secondaryFile: null,
      });
      Alert.alert('Saved', submitForVerification ? 'Identity submitted for verification.' : 'Identity saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save identity.');
      }
    } finally {
      setSaving(false);
    }
  };

  const pickPrimary = async () => {
    const asset = await pickSingleDocument();
    if (asset) setPrimaryFile(asset);
  };

  const pickSecondary = async () => {
    const asset = await pickSingleDocument();
    if (asset) setSecondaryFile(asset);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}>
          <Text>Loading identity...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>Identity</Text>

        <Menu
          visible={docMenuVisible}
          onDismiss={() => setDocMenuVisible(false)}
          anchor={<Button mode="outlined" onPress={() => setDocMenuVisible(true)}>{selectedDocTypeLabel}</Button>}
        >
          {DOC_TYPES.map((d) => (
            <Menu.Item
              key={d.value}
              title={d.label}
              onPress={() => {
                setData((p) => ({ ...p, government_id_type: d.value }));
                setDocMenuVisible(false);
              }}
            />
          ))}
        </Menu>

        <Button mode="outlined" onPress={pickPrimary}>
          {primaryFile ? 'Change file' : data.government_id ? 'Replace file' : 'Upload file'}
        </Button>

        {data.government_id_type === 'DRIVER_LICENSE' || data.government_id_type === 'AGE_PROOF' ? (
          <>
            <Menu
              visible={stateMenuVisible}
              onDismiss={() => setStateMenuVisible(false)}
              anchor={<Button mode="outlined" onPress={() => setStateMenuVisible(true)}>{meta.state || 'State/Territory'}</Button>}
            >
              {AUS_STATES.map((st) => (
                <Menu.Item key={st} title={st} onPress={() => { updateMeta('state', st); setStateMenuVisible(false); }} />
              ))}
            </Menu>
            <TextInput mode="outlined" label="Expiry date" value={meta.expiry || ''} onChangeText={(v) => updateMeta('expiry', v)} placeholder="YYYY-MM-DD" />
          </>
        ) : null}

        {data.government_id_type === 'VISA' ? (
          <>
            <TextInput mode="outlined" label="Visa type number" value={meta.visa_type_number || ''} onChangeText={(v) => updateMeta('visa_type_number', v)} />
            <TextInput mode="outlined" label="Valid to" value={meta.valid_to || ''} onChangeText={(v) => updateMeta('valid_to', v)} placeholder="YYYY-MM-DD" />
            <TextInput mode="outlined" label="Country of Issue" value={meta.passport_country || ''} onChangeText={(v) => updateMeta('passport_country', v)} />
            <TextInput mode="outlined" label="Passport expiry" value={meta.passport_expiry || ''} onChangeText={(v) => updateMeta('passport_expiry', v)} placeholder="YYYY-MM-DD" />
            <Button mode="outlined" onPress={pickSecondary}>
              {secondaryFile ? 'Change Overseas Passport' : data.identity_secondary_file ? 'Replace Overseas Passport' : 'Upload Overseas Passport'}
            </Button>
          </>
        ) : null}

        {data.government_id_type === 'AUS_PASSPORT' ? (
          <>
            <TextInput mode="outlined" label="Country of Issue" value="Australia" editable={false} />
            <TextInput mode="outlined" label="Expiry date" value={meta.expiry || ''} onChangeText={(v) => updateMeta('expiry', v)} placeholder="YYYY-MM-DD" />
          </>
        ) : null}

        {data.government_id_type === 'OTHER_PASSPORT' ? (
          <>
            <TextInput mode="outlined" label="Country of Issue" value={meta.country || ''} onChangeText={(v) => updateMeta('country', v)} />
            <TextInput mode="outlined" label="Passport expiry" value={meta.expiry || ''} onChangeText={(v) => updateMeta('expiry', v)} placeholder="YYYY-MM-DD" />
            <Button mode="outlined" onPress={pickSecondary}>
              {secondaryFile ? 'Change Visa Document' : data.identity_secondary_file ? 'Replace Visa Document' : 'Upload Visa Document'}
            </Button>
            <TextInput mode="outlined" label="Visa type number" value={meta.visa_type_number || ''} onChangeText={(v) => updateMeta('visa_type_number', v)} />
            <TextInput mode="outlined" label="Valid to" value={meta.valid_to || ''} onChangeText={(v) => updateMeta('valid_to', v)} placeholder="YYYY-MM-DD" />
          </>
        ) : null}

        {data.government_id ? (
          <Button mode="text" onPress={() => Linking.openURL(fileUrl(data.government_id))}>View current ID file</Button>
        ) : (
          <Text variant="bodySmall" style={styles.muted}>No file uploaded</Text>
        )}
        {data.identity_secondary_file ? (
          <Button mode="text" onPress={() => Linking.openURL(fileUrl(data.identity_secondary_file))}>View secondary file</Button>
        ) : null}

        <Chip mode="outlined" icon={govChip.icon} textStyle={{ color: govChip.color }}>
          Identity {govChip.text}
        </Chip>
        {data.gov_id_verification_note ? <HelperText type="info">{data.gov_id_verification_note}</HelperText> : null}
        {error ? <HelperText type="error">{error}</HelperText> : null}

        <View style={styles.actions}>
          <Button mode="outlined" onPress={() => save(false)} loading={saving} disabled={saving}>Save</Button>
          <Button mode="contained" onPress={() => save(true)} loading={saving} disabled={saving || (!primaryFile && !data.government_id)}>
            Submit & Verify
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontWeight: '700', color: '#111827' },
  muted: { color: '#6B7280' },
  actions: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
});
