import React, { useEffect, useMemo, useState } from 'react';
import { SkillIcon } from '../../../components/SkillIcon';
import { SoftwarePicker, SOFTWARE_GROUP, roleSoftware } from '../../shared/skills/SoftwarePicker';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Checkbox, Chip, HelperText, Searchbar, Text } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm, searchRoleSkillGroups, normalizeSavedSkillCodes, skillId, skillLabel, workerSkillRole, claimModeLabel } from '@chemisttasker/shared-core';
import { pickSingleDocument, roleKey, toRNFile } from './shared';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';

type CertRow = { skill_code: string; path?: string; url?: string | null; uploaded_at?: string | null };
type ApiData = { skills?: string[]; skill_certificates?: CertRow[]; role_type?: string | null };

const registry = require('@chemisttasker/shared-core/skills_registry.json') as any;

export default function OtherStaffSkillsScreen() {
  const [subtype,setSubtype] = useState<string | null>(null);
  const currentRole = workerSkillRole('otherstaff',subtype);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => searchRoleSkillGroups(registry,currentRole,query).filter(group => group.key !== SOFTWARE_GROUP),[currentRole,query]);
  const software = useMemo(() => roleSoftware(currentRole, query), [currentRole, query]);
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

  const skillIndex = useMemo(() => new Map(registry.skills.map((item: any) => [item.code,item])),[]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: ApiData = (await getOnboardingDetail(roleKey)) as any;
        if (!mounted) return;
        const skills = normalizeSavedSkillCodes(registry, res?.skills || []);
        setSubtype((res as any)?.role_type || null);
        setSelected(skills);
        const map: Record<string, CertRow> = {};
        (res?.skill_certificates || []).forEach((row) => { map[skillId(registry, row.skill_code) || row.skill_code] = row; });
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

  const requiresCert = (code: string) => {
    const item = skillIndex.get(code) as any;
    return Boolean(item?.certificate && currentRole && !['familiarity','none'].includes(item.eligibility[currentRole]));
  };
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


  const save = async () => {
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
      setSelected(normalizeSavedSkillCodes(registry, res?.skills || []));
      const map: Record<string, CertRow> = {};
      (res?.skill_certificates || []).forEach((row) => { map[skillId(registry, row.skill_code) || row.skill_code] = row; });
      setExistingCerts(map);
      setPendingFiles({});
      unsaved.markClean({ selected: normalizeSavedSkillCodes(registry, res?.skills || []), pendingFiles: {} });
      Alert.alert('Saved', 'Skills saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save skills.');
      }
    } finally {
      setSaving(false);
    }
  };

  const activeTab = groups.some(g => g.key === tab) ? tab : groups[0]?.key;
  const currentItems = query.trim() ? groups.flatMap(group => group.items) : groups.find(g => g.key === activeTab)?.items || [];

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
        <Text variant="bodySmall" style={styles.help}>Tick what you have actually done on the job, then the software you have used. A tick is not a verified credential; certificates are checked separately.</Text>

        <Searchbar placeholder="Search skills or software" value={query} onChangeText={setQuery} accessibilityLabel="Search skills or software" />
        <Text style={styles.help}>{selected.filter(code => (skillIndex.get(code) as any)?.group !== SOFTWARE_GROUP).length} skills selected. There is no minimum.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {groups.map(group => <Chip key={group.key} selected={activeTab === group.key}
            accessibilityRole="tab" accessibilityState={{ selected: activeTab === group.key }}
            onPress={() => setTab(group.key)}>{group.label}</Chip>)}
        </ScrollView>
        {currentRole && currentItems.length === 0 && software.length === 0 ? <Text accessibilityRole="alert">Nothing matches. Try a shorter word, such as Webster or Fred.</Text> : null}

        {currentItems.map((item: any) => {
          const checked = selected.includes(item.code);
          const required = requiresCert(item.code);
          const fileState = hasPending(item.code) ? 'Selected' : hasExisting(item.code) ? 'Document uploaded' : required && checked ? 'Required' : '';
          return (
            <View key={item.code} style={[styles.rowCard, checked && { borderColor: '#2463A6', backgroundColor: '#F0F6FC' }]}>
              <View style={styles.rowTop}>
                <Checkbox.Item label="" accessibilityLabel={`Select ${item.label}`} style={{ width: 48, paddingHorizontal: 0 }} position="leading" disabled={saving} status={checked ? 'checked' : 'unchecked'} onPress={() => toggle(item.code)} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <SkillIcon skill={item.code} size={28} />
                    <Text style={[styles.itemLabel, { flexShrink: 1 }]}>{item.label}</Text>
                  </View>
                  {currentRole && claimModeLabel(item.eligibility[currentRole]) ? <Text style={styles.itemDesc}>{claimModeLabel(item.eligibility[currentRole])}</Text> : null}
                  {item.definition ? <Text style={styles.itemDesc}>{item.definition}</Text> : null}
                </View>
              </View>
              {fileState ? <Chip mode="outlined" style={{ alignSelf: 'flex-start' }}>{fileState}</Chip> : null}
              {checked && required ? (
                <Button mode="outlined" onPress={() => pickForSkill(item.code)}>
                  {hasPending(item.code) ? 'Change certificate' : 'Upload certificate'}
                </Button>
              ) : null}
            </View>
          );
        })}


        {!currentRole ? <HelperText type="info">Select your staff role under Regulatory Docs first.</HelperText> : null}
        <SoftwarePicker role={currentRole} items={software} selected={selected} disabled={saving} onToggle={toggle} />

        {error ? <HelperText type="error">{error}</HelperText> : null}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving || !currentRole}>Save Skills</Button>
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

