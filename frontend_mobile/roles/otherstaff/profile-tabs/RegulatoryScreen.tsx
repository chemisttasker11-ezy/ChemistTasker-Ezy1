import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, HelperText, Menu, Text, TextInput } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { API_BASE_URL } from '@/constants/api';
import { pickSingleDocument, toRNFile } from './shared';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';

type Role = 'INTERN' | 'TECHNICIAN' | 'ASSISTANT' | 'STUDENT' | '';

const ROLE_CHOICES = [
  { value: 'INTERN', label: 'Intern Pharmacist' },
  { value: 'TECHNICIAN', label: 'Dispensary Technician' },
  { value: 'ASSISTANT', label: 'Pharmacy Assistant' },
  { value: 'STUDENT', label: 'Pharmacy Student' },
];
const ASSISTANT_LEVEL_CHOICES = [
  { value: 'LEVEL_1', label: 'Pharmacy Assistant - Level 1' },
  { value: 'LEVEL_2', label: 'Pharmacy Assistant - Level 2' },
  { value: 'LEVEL_3', label: 'Pharmacy Assistant - Level 3' },
  { value: 'LEVEL_4', label: 'Pharmacy Assistant - Level 4' },
];
const STUDENT_YEAR_CHOICES = [
  { value: 'YEAR_1', label: 'Pharmacy Student - 1st Year' },
  { value: 'YEAR_2', label: 'Pharmacy Student - 2nd Year' },
  { value: 'YEAR_3', label: 'Pharmacy Student - 3rd Year' },
  { value: 'YEAR_4', label: 'Pharmacy Student - 4th Year' },
];
const INTERN_HALF_CHOICES = [
  { value: 'FIRST_HALF', label: 'Intern - First Half' },
  { value: 'SECOND_HALF', label: 'Intern - Second Half' },
];

const roleKey = 'otherstaff';

const fileUrl = (path?: string | null) => (path ? (path.startsWith('http') ? path : `${API_BASE_URL}${path}`) : '');

export default function OtherStaffRegulatoryScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [roleMenu, setRoleMenu] = useState(false);
  const [assistantMenu, setAssistantMenu] = useState(false);
  const [studentMenu, setStudentMenu] = useState(false);
  const [internMenu, setInternMenu] = useState(false);
  const [data, setData] = useState<any>({
    role_type: '',
    classification_level: '',
    student_year: '',
    intern_half: '',
  });
  const [files, setFiles] = useState<Record<string, any>>({});
  const unsaved = useUnsavedChangesGuard(
    { data, files },
    { enabled: !loading, onSave: () => save(false), saving }
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: any = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        setData({
          role_type: (res?.role_type as Role) || '',
          classification_level: res?.classification_level || '',
          student_year: res?.student_year || '',
          intern_half: res?.intern_half || '',
          ahpra_proof: res?.ahpra_proof || '',
          hours_proof: res?.hours_proof || '',
          certificate: res?.certificate || '',
          university_id: res?.university_id || '',
          cpr_certificate: res?.cpr_certificate || '',
          s8_certificate: res?.s8_certificate || '',
        });
        unsaved.markClean({
          data: {
            role_type: (res?.role_type as Role) || '',
            classification_level: res?.classification_level || '',
            student_year: res?.student_year || '',
            intern_half: res?.intern_half || '',
            ahpra_proof: res?.ahpra_proof || '',
            hours_proof: res?.hours_proof || '',
            certificate: res?.certificate || '',
            university_id: res?.university_id || '',
            cpr_certificate: res?.cpr_certificate || '',
            s8_certificate: res?.s8_certificate || '',
          },
          files: {},
        });
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || 'Failed to load regulatory docs.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const showAssistantLevel = data.role_type === 'ASSISTANT';
  const showStudentYear = data.role_type === 'STUDENT';
  const showInternHalf = data.role_type === 'INTERN';

  const pickFor = async (key: string) => {
    const asset = await pickSingleDocument();
    if (!asset) return;
    setFiles((p) => ({ ...p, [key]: asset }));
  };

  const save = async (submitForVerification: boolean) => {
    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      form.append('tab', 'regulatory');
      if (submitForVerification) form.append('submitted_for_verification', 'true');
      if (data.role_type) form.append('role_type', data.role_type);
      if (showAssistantLevel) form.append('classification_level', data.classification_level || '');
      if (showStudentYear) form.append('student_year', data.student_year || '');
      if (showInternHalf) form.append('intern_half', data.intern_half || '');

      ['ahpra_proof', 'hours_proof', 'certificate', 'university_id', 'cpr_certificate', 's8_certificate'].forEach((k) => {
        if (files[k]) form.append(k, toRNFile(files[k]));
      });

      const res: any = await updateOnboardingForm(roleKey, form as any);
      setData((p: any) => ({ ...p, ...res }));
      setFiles({});
      unsaved.markClean({
        data: {
          ...data,
          ...res,
        },
        files: {},
      });
      Alert.alert('Saved', submitForVerification ? 'Regulatory details submitted.' : 'Regulatory details saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save regulatory details.');
      }
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = ROLE_CHOICES.find((r) => r.value === data.role_type)?.label || 'Select role type';
  const assistantLabel = ASSISTANT_LEVEL_CHOICES.find((r) => r.value === data.classification_level)?.label || 'Assistant level';
  const studentLabel = STUDENT_YEAR_CHOICES.find((r) => r.value === data.student_year)?.label || 'Student year';
  const internLabel = INTERN_HALF_CHOICES.find((r) => r.value === data.intern_half)?.label || 'Intern half';

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}><Text>Loading regulatory docs...</Text></View>
      </SafeAreaView>
    );
  }

  const fileButton = (key: string, label: string) => (
    <View style={styles.fileRow}>
      <Button mode="outlined" onPress={() => pickFor(key)}>{files[key] ? `Change ${label}` : `Upload ${label}`}</Button>
      {data[key] ? <Button mode="text" onPress={() => Linking.openURL(fileUrl(data[key]))}>View current</Button> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>Regulatory Docs</Text>

        <Menu visible={roleMenu} onDismiss={() => setRoleMenu(false)} anchor={<Button mode="outlined" onPress={() => setRoleMenu(true)}>{roleLabel}</Button>}>
          {ROLE_CHOICES.map((c) => (
            <Menu.Item key={c.value} title={c.label} onPress={() => { setData((p: any) => ({ ...p, role_type: c.value, classification_level: '', student_year: '', intern_half: '' })); setRoleMenu(false); }} />
          ))}
        </Menu>

        {showAssistantLevel ? (
          <Menu visible={assistantMenu} onDismiss={() => setAssistantMenu(false)} anchor={<Button mode="outlined" onPress={() => setAssistantMenu(true)}>{assistantLabel}</Button>}>
            {ASSISTANT_LEVEL_CHOICES.map((c) => <Menu.Item key={c.value} title={c.label} onPress={() => { setData((p: any) => ({ ...p, classification_level: c.value })); setAssistantMenu(false); }} />)}
          </Menu>
        ) : null}
        {showStudentYear ? (
          <Menu visible={studentMenu} onDismiss={() => setStudentMenu(false)} anchor={<Button mode="outlined" onPress={() => setStudentMenu(true)}>{studentLabel}</Button>}>
            {STUDENT_YEAR_CHOICES.map((c) => <Menu.Item key={c.value} title={c.label} onPress={() => { setData((p: any) => ({ ...p, student_year: c.value })); setStudentMenu(false); }} />)}
          </Menu>
        ) : null}
        {showInternHalf ? (
          <Menu visible={internMenu} onDismiss={() => setInternMenu(false)} anchor={<Button mode="outlined" onPress={() => setInternMenu(true)}>{internLabel}</Button>}>
            {INTERN_HALF_CHOICES.map((c) => <Menu.Item key={c.value} title={c.label} onPress={() => { setData((p: any) => ({ ...p, intern_half: c.value })); setInternMenu(false); }} />)}
          </Menu>
        ) : null}

        {showInternHalf ? (
          <>
            {fileButton('ahpra_proof', 'AHPRA proof')}
            {fileButton('hours_proof', 'Hours proof')}
          </>
        ) : null}
        {showAssistantLevel || data.role_type === 'TECHNICIAN' ? fileButton('certificate', 'Certificate') : null}
        {showStudentYear ? fileButton('university_id', 'University ID') : null}
        {fileButton('cpr_certificate', 'CPR Certificate')}
        {fileButton('s8_certificate', 'S8 Certificate')}

        {error ? <HelperText type="error">{error}</HelperText> : null}
        <View style={styles.actions}>
          <Button mode="outlined" onPress={() => save(false)} loading={saving} disabled={saving}>Save</Button>
          <Button mode="contained" onPress={() => save(true)} loading={saving} disabled={saving}>Submit</Button>
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
  fileRow: { gap: 4 },
  actions: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
});
