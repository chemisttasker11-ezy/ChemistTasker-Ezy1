// Role & qualifications (Pharmacy team). Required: the role, its classification or year, and an intern's AHPRA number.
// Every document is optional evidence: it earns a badge once checked and never blocks saving.
import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, HelperText, Menu, Text, TextInput } from 'react-native-paper';
import {
  dispensaryQualifications,
  getOnboardingDetail,
  normalizeVerification,
  otherStaffQualificationLevels,
  updateOnboardingForm,
  verificationRows,
  type VerificationRow,
} from '@chemisttasker/shared-core';
import { API_BASE_URL } from '@/constants/api';
import { pickSingleDocument, toRNFile } from './shared';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';
import { EvidenceStatus } from '../../shared/skills/VerificationBadges';

type Role = 'INTERN' | 'TECHNICIAN' | 'ASSISTANT' | 'STUDENT' | '';
type FileField = 'certificate' | 'university_id' | 'cpr_certificate' | 's8_certificate';

const ROLE_CHOICES = [
  { value: 'ASSISTANT', label: 'Pharmacy Assistant' },
  { value: 'TECHNICIAN', label: 'Dispensary Technician' },
  { value: 'INTERN', label: 'Intern Pharmacist' },
  { value: 'STUDENT', label: 'Pharmacy Student' },
];
const STUDENT_YEAR_CHOICES = [
  { value: 'YEAR_1', label: '1st year' },
  { value: 'YEAR_2', label: '2nd year' },
  { value: 'YEAR_3', label: '3rd year' },
  { value: 'YEAR_4', label: '4th year' },
];
const FIELDS: FileField[] = ['certificate', 'university_id', 'cpr_certificate', 's8_certificate'];
const roleKey = 'otherstaff';
const fileUrl = (path?: string | null) => (path ? (path.startsWith('http') ? path : `${API_BASE_URL}${path}`) : '');

const fromServer = (res: any) => ({
  role_type: (res?.role_type as Role) || '',
  classification_level: res?.classification_level || '',
  dispensary_qualification: res?.dispensary_qualification || '',
  student_year: res?.student_year || '',
  ahpra_number: res?.ahpra_number || '',
  ...Object.fromEntries(FIELDS.map(field => [field, res?.[field] || ''])),
});

export default function OtherStaffRegulatoryScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<'role' | 'level' | 'dispensing' | 'year' | null>(null);
  const [data, setData] = useState<any>(fromServer({}));
  const [files, setFiles] = useState<Partial<Record<FileField, any>>>({});
  const [badges, setBadges] = useState<VerificationRow[]>([]);
  const unsaved = useUnsavedChangesGuard({ data, files }, { enabled: !loading, onSave: () => save(), saving });

  const accept = (res: any) => {
    const next = fromServer(res);
    setData(next);
    setFiles({});
    setBadges(verificationRows(normalizeVerification(res?.verification), 'worker'));
    unsaved.markClean({ data: next, files: {} });
  };

  useEffect(() => {
    let mounted = true;
    getOnboardingDetail(roleKey)
      .then((res: any) => { if (mounted) accept(res); })
      .catch(() => { if (mounted) setError("We couldn't load your role details. Go back and open this screen again."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const role: Role = data.role_type;
  const isLevelled = role === 'ASSISTANT' || role === 'TECHNICIAN';
  const badge = (code: string) => badges.find(row => row.code === code);
  const set = (patch: any) => setData((prev: any) => ({ ...prev, ...patch }));

  const pick = async (field: FileField) => {
    const asset = await pickSingleDocument();
    if (asset) setFiles(prev => ({ ...prev, [field]: asset }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const form = new FormData();
      form.append('tab', 'regulatory');
      // Submitting runs the document checks; only an intern's AHPRA number is required.
      form.append('submitted_for_verification', 'true');
      if (role) form.append('role_type', role);
      if (isLevelled) {
        form.append('classification_level', data.classification_level || '');
        form.append('dispensary_qualification', data.dispensary_qualification || '');
      }
      if (role === 'STUDENT') form.append('student_year', data.student_year || '');
      if (role === 'INTERN') form.append('ahpra_number', String(data.ahpra_number || '').trim());
      FIELDS.forEach(field => { if (files[field]) form.append(field, toRNFile(files[field])); });
      accept(await updateOnboardingForm(roleKey, form as any));
      Alert.alert('Saved', 'Role and qualifications saved.');
    } catch (err: any) {
      const body = err?.response?.data;
      if (body && typeof body === 'object' && !body.detail) {
        setFieldErrors(Object.fromEntries(Object.entries(body).map(([field, messages]) => [field, ([] as string[]).concat(messages as any).join(' ')])));
        setError('Check the highlighted field.');
      } else {
        setError(body?.detail || "We couldn't save your role details. Your changes are still here; try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.container} edges={['left', 'right']}><View style={styles.loader}><Text>Loading your role details…</Text></View></SafeAreaView>;
  }

  const evidence = (field: FileField, title: string, purpose: string, code?: string) => {
    const state = code ? badge(code) : undefined;
    return (
      <View key={field} style={styles.evidence}>
        <Text style={styles.evidenceTitle}>{title}</Text>
        <Text style={styles.help}>{purpose}</Text>
        {state && !files[field] ? <EvidenceStatus label={state.label} state={state.state} explainer={state.explainer} /> : null}
        {files[field] ? <Text style={styles.help}>{files[field]?.name || 'File selected'} · save to send it for checking</Text> : null}
        <View style={styles.row}>
          <Button mode="outlined" icon="file-upload-outline" onPress={() => pick(field)}>{files[field] ? 'Change file' : data[field] ? 'Replace file' : 'Add file'}</Button>
          {data[field] && !files[field] ? <Button mode="text" onPress={() => Linking.openURL(fileUrl(data[field]))}>View current file</Button> : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>Role & qualifications</Text>
        <Text style={styles.help}>Your role and award level. Interns add their AHPRA number; certificates are optional and earn badges.</Text>
        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        <Text style={styles.section}>Your role</Text>
        <Menu visible={menu === 'role'} onDismiss={() => setMenu(null)}
          anchor={<Button mode="outlined" onPress={() => setMenu('role')} contentStyle={styles.select}>{ROLE_CHOICES.find(c => c.value === role)?.label || 'Choose your role'}</Button>}>
          {ROLE_CHOICES.map(c => <Menu.Item key={c.value} title={c.label} onPress={() => { set({ role_type: c.value, classification_level: '', dispensary_qualification: '', student_year: '' }); setMenu(null); }} />)}
        </Menu>

        {isLevelled ? (
          <>
            <Menu visible={menu === 'level'} onDismiss={() => setMenu(null)}
              anchor={<Button mode="outlined" onPress={() => setMenu('level')} contentStyle={styles.select}>{otherStaffQualificationLevels.find(c => c.value === data.classification_level)?.label || 'Award classification'}</Button>}>
              {otherStaffQualificationLevels.filter(c => role !== 'TECHNICIAN' || ['LEVEL_3', 'LEVEL_4'].includes(c.value)).map(c => <Menu.Item key={c.value} title={c.label} onPress={() => { set({ classification_level: c.value }); setMenu(null); }} />)}
            </Menu>
            <Text style={styles.help}>{fieldErrors.classification_level || otherStaffQualificationLevels.find(item => item.value === data.classification_level)?.explainer || 'The level you are paid at under the Pharmacy Industry Award.'}</Text>
            <Menu visible={menu === 'dispensing'} onDismiss={() => setMenu(null)}
              anchor={<Button mode="outlined" onPress={() => setMenu('dispensing')} contentStyle={styles.select}>{dispensaryQualifications.find(item => item.value === data.dispensary_qualification)?.label || 'Dispensing training (optional)'}</Button>}>
              <Menu.Item title="None" onPress={() => { set({ dispensary_qualification: '' }); setMenu(null); }} />
              {dispensaryQualifications.map(item => <Menu.Item key={item.value} title={item.label} onPress={() => { set({ dispensary_qualification: item.value }); setMenu(null); }} />)}
            </Menu>
            <Text style={styles.help}>{dispensaryQualifications.find(item => item.value === data.dispensary_qualification)?.explainer || 'Claim it if you have it. Pharmacies see it as Not verified until we check your certificate.'}</Text>
          </>
        ) : null}

        {role === 'STUDENT' ? (
          <Menu visible={menu === 'year'} onDismiss={() => setMenu(null)}
            anchor={<Button mode="outlined" onPress={() => setMenu('year')} contentStyle={styles.select}>{STUDENT_YEAR_CHOICES.find(c => c.value === data.student_year)?.label || 'Year of study'}</Button>}>
            {STUDENT_YEAR_CHOICES.map(c => <Menu.Item key={c.value} title={c.label} onPress={() => { set({ student_year: c.value }); setMenu(null); }} />)}
          </Menu>
        ) : null}

        {role === 'INTERN' ? (
          <View style={{ gap: 6 }}>
            <TextInput mode="outlined" label="AHPRA number" value={data.ahpra_number} onChangeText={value => set({ ahpra_number: value })}
              autoCapitalize="characters" autoCorrect={false} error={Boolean(fieldErrors.ahpra_number)} />
            <HelperText type={fieldErrors.ahpra_number ? 'error' : 'info'} visible>
              {fieldErrors.ahpra_number || 'Your provisional (intern) registration. Our team checks it on the AHPRA register; nothing else is needed from interns.'}
            </HelperText>
            {badge('AHPRA_PROVISIONAL') && data.ahpra_number ? <EvidenceStatus label="AHPRA provisional registration" state={badge('AHPRA_PROVISIONAL')!.state} explainer={badge('AHPRA_PROVISIONAL')!.explainer} /> : null}
          </View>
        ) : null}

        {role && role !== 'INTERN' ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.section}>Evidence (optional)</Text>
            <Text style={styles.help}>You can apply without these. Each one earns a badge pharmacies see once we have checked it.</Text>
            {isLevelled ? evidence('certificate', 'Qualification certificate', 'Certificate II, III or IV (with the unit transcript for dispensing).', 'QUALIFICATION') : null}
            {role === 'STUDENT' ? evidence('university_id', 'University ID', 'Your current student card.', 'ENROLMENT') : null}
            {evidence('cpr_certificate', 'First aid / CPR certificate', 'Kept on your profile for pharmacies that ask.')}
            {evidence('s8_certificate', 'S8 certificate', 'Kept on your profile for pharmacies that ask.')}
          </View>
        ) : null}

        <Button mode="contained" onPress={save} loading={saving} disabled={saving || !role} style={{ marginTop: 8 }}>Save role & qualifications</Button>
        {!role ? <Text style={styles.help}>Choose your role to continue.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontWeight: '600', color: '#06214A' },
  section: { fontSize: 16, fontWeight: '600', color: '#06214A', marginTop: 8 },
  help: { fontSize: 13, lineHeight: 19, color: '#445474' },
  select: { justifyContent: 'flex-start', minHeight: 44 },
  evidence: { gap: 6, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#D5DCE8', backgroundColor: '#FFFFFF' },
  evidenceTitle: { fontSize: 14.5, fontWeight: '600', color: '#06214A' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
