import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Checkbox, Chip, HelperText, SegmentedButtons, Text } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { pickSingleDocument, roleKey, toRNFile } from './shared';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';

type SkillItem = {
  code: string;
  label: string;
  description?: string;
  requires_certificate?: boolean;
};

type RoleCatalog = {
  clinical_services: SkillItem[];
  dispense_software: SkillItem[];
  expanded_scope: SkillItem[];
};

type SkillsCatalog = {
  pharmacist: RoleCatalog;
};

type CertRow = {
  skill_code: string;
  path?: string;
  url?: string | null;
};

type ApiData = {
  skills?: string[];
  skill_certificates?: CertRow[];
};

const catalog = require('@chemisttasker/shared-core/skills_catalog.json') as SkillsCatalog;

export default function PharmacistSkillsScreen() {
  const roleCatalog = catalog.pharmacist;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'dispense_software' | 'clinical_services' | 'expanded_scope'>('dispense_software');
  const [selected, setSelected] = useState<string[]>([]);
  const [existingCerts, setExistingCerts] = useState<Record<string, CertRow>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, any>>({});
  const unsaved = useUnsavedChangesGuard(
    { selected, pendingFiles },
    { enabled: !loading, onSave: () => save(), saving }
  );

  const allItems = useMemo(
    () => [...roleCatalog.dispense_software, ...roleCatalog.clinical_services, ...roleCatalog.expanded_scope],
    [roleCatalog]
  );
  const skillIndex = useMemo(() => {
    const m = new Map<string, SkillItem>();
    allItems.forEach((it) => m.set(it.code, it));
    return m;
  }, [allItems]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: ApiData = (await getOnboardingDetail(roleKey)) as any;
        if (!mounted) return;
        const skills = res?.skills || [];
        setSelected(skills);
        const map: Record<string, CertRow> = {};
        (res?.skill_certificates || []).forEach((row) => { map[row.skill_code] = row; });
        setExistingCerts(map);
        unsaved.markClean({ selected: skills, pendingFiles: {} });
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || 'Failed to load skills.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const requiresCert = (code: string) => Boolean(skillIndex.get(code)?.requires_certificate);
  const hasExisting = (code: string) => Boolean(existingCerts[code]?.path || existingCerts[code]?.url);
  const hasPending = (code: string) => Boolean(pendingFiles[code]);

  const toggle = (code: string) => {
    setSelected((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  };

  const pickForSkill = async (code: string) => {
    const asset = await pickSingleDocument();
    if (!asset) return;
    setPendingFiles((p) => ({ ...p, [code]: asset }));
  };

  const validate = () => {
    const missing = selected.filter((code) => requiresCert(code) && !hasExisting(code) && !hasPending(code));
    return missing;
  };

  const save = async () => {
    const missing = validate();
    if (missing.length) {
      setError(`Please upload a certificate for: ${missing.join(', ')}`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'skills');
      fd.append('skills', JSON.stringify(selected));
      selected.forEach((code) => {
        if (pendingFiles[code]) fd.append(code, toRNFile(pendingFiles[code]));
      });
      const res: ApiData = (await updateOnboardingForm(roleKey, fd as any)) as any;
      setSelected(res?.skills || []);
      const map: Record<string, CertRow> = {};
      (res?.skill_certificates || []).forEach((row) => { map[row.skill_code] = row; });
      setExistingCerts(map);
      setPendingFiles({});
      unsaved.markClean({ selected: res?.skills || [], pendingFiles: {} });
      Alert.alert('Saved', 'Skills saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save skills.');
      }
    } finally {
      setSaving(false);
    }
  };

  const currentItems =
    tab === 'dispense_software'
      ? roleCatalog.dispense_software
      : tab === 'clinical_services'
        ? roleCatalog.clinical_services
        : roleCatalog.expanded_scope;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}>
          <Text>Loading skills...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>Skills</Text>
        <Text variant="bodySmall" style={styles.help}>Only skills marked as certificate-required need uploads.</Text>

        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as any)}
          buttons={[
            { value: 'dispense_software', label: 'Dispense Software' },
            { value: 'clinical_services', label: 'Clinical Services' },
            { value: 'expanded_scope', label: 'Expanded Scope' },
          ]}
        />

        {currentItems.map((item) => {
          const checked = selected.includes(item.code);
          const required = requiresCert(item.code);
          const fileState = hasPending(item.code) ? 'Selected' : hasExisting(item.code) ? 'On file' : required && checked ? 'Required' : '';
          return (
            <View key={item.code} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <Checkbox status={checked ? 'checked' : 'unchecked'} onPress={() => toggle(item.code)} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
                </View>
                {fileState ? <Chip mode="outlined">{fileState}</Chip> : null}
              </View>
              {checked && required ? (
                <Button mode="outlined" onPress={() => pickForSkill(item.code)}>
                  {hasPending(item.code) ? 'Change certificate' : 'Upload certificate'}
                </Button>
              ) : null}
            </View>
          );
        })}

        {error ? <HelperText type="error">{error}</HelperText> : null}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving}>Save Skills</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontWeight: '700', color: '#111827' },
  help: { color: '#6B7280' },
  rowCard: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 10, gap: 8, backgroundColor: '#FFFFFF' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemLabel: { color: '#111827', fontWeight: '600' },
  itemDesc: { color: '#6B7280', marginTop: 2 },
});
