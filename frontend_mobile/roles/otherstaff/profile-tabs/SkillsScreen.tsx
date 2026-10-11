import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Checkbox, Chip, HelperText, SegmentedButtons, Text } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm, roleSkillGroups, workerSkillRole, claimModeLabel, legacySkillCodes } from '@chemisttasker/shared-core';
import { pickSingleDocument, roleKey, toRNFile } from './shared';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';

type SkillItem = {
  code: string;
  label: string;
  description?: string;
  requires_certificate?: boolean;
};

const registry = require('@chemisttasker/shared-core/skills_registry.json') as any;

export default function PharmacistSkillsScreen() {
  const [subtype,setSubtype] = useState<string | null>(null);
  const currentRole = workerSkillRole('otherstaff',subtype);
  const groups = useMemo(() => roleSkillGroups(registry,currentRole),[currentRole]);
  const legacy = useMemo(() => legacySkillCodes(registry,currentRole,selected),[currentRole,selected]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [existingCerts, setExistingCerts] = useState<Record<string, CertRow>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, any>>({});
  const unsaved = useUnsavedChangesGuard(
    { selected, pendingFiles },
    { enabled: !loading, onSave: () => save(), saving }
  );

  const allItems = useMemo(() => groups.flatMap(g => g.items),[groups]);
  const skillIndex = useMemo(() => new Map(allItems.map((item: any) => [item.code,item])),[allItems]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: ApiData = (await getOnboardingDetail(roleKey)) as any;
        if (!mounted) return;
        const skills = res?.skills || [];
        setSubtype((res as any)?.role_type || null);
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

  const requiresCert = (code: string) => Boolean((skillIndex.get(code) as any)?.certificate);
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

  const activeTab = groups.some(g => g.key === tab) ? tab : groups[0]?.key;
  const currentItems = groups.find(g => g.key === activeTab)?.items || [];

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
        <Text variant="bodySmall" style={styles.help}>Skills describe experience, not professional authorisation. Supervised activities must be performed under pharmacist supervision.</Text>

        <SegmentedButtons value={activeTab || ''} onValueChange={setTab} buttons={groups.map(group => ({value:group.key,label:group.label}))} />

        {currentItems.map((item: any) => {
          const checked = selected.includes(item.code);
          const required = requiresCert(item.code);
          const fileState = hasPending(item.code) ? 'Selected' : hasExisting(item.code) ? 'On file' : required && checked ? 'Required' : '';
          return (
            <View key={item.code} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <Checkbox status={checked ? 'checked' : 'unchecked'} onPress={() => toggle(item.code)} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>{item.icon}  {item.label}</Text>
                  {currentRole && claimModeLabel(item.eligibility[currentRole]) ? <Text style={styles.itemDesc}>{claimModeLabel(item.eligibility[currentRole])}</Text> : null}
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

        {legacy.length ? <Text style={styles.itemDesc}>Some previously selected skills are unavailable for this role; they remain visible in the saved profile until reviewed.</Text> : null}
        {!currentRole ? <HelperText type="info">Select your staff role under Regulatory Docs first.</HelperText> : null}
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

