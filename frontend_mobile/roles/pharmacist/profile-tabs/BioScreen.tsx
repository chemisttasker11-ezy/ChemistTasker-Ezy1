import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { API_BASE_URL } from '@/constants/api';
import { pickSingleDocument, roleKey, toRNFile } from './shared';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';

type ApiData = {
  short_bio?: string | null;
  resume?: string | null;
};

const fileUrl = (path?: string | null) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL}${path}`;
};

export default function PharmacistBioScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [shortBio, setShortBio] = useState('');
  const [resumeExistingUrl, setResumeExistingUrl] = useState('');
  const [resumePending, setResumePending] = useState<any>(null);
  const unsaved = useUnsavedChangesGuard(
    { shortBio, resumeExistingUrl, resumePending },
    { enabled: !loading, onSave: () => save(), saving }
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res: ApiData = (await getOnboardingDetail(roleKey)) as any;
        if (!mounted) return;
        setShortBio(res?.short_bio || '');
        setResumeExistingUrl(fileUrl(res?.resume || ''));
        unsaved.markClean({
          shortBio: res?.short_bio || '',
          resumeExistingUrl: fileUrl(res?.resume || ''),
          resumePending: null,
        });
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || 'Failed to load profile.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const pickResume = async () => {
    const asset = await pickSingleDocument();
    if (asset) setResumePending(asset);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'profile');
      fd.append('short_bio', shortBio ?? '');
      if (resumePending) fd.append('resume', toRNFile(resumePending));
      const res: ApiData = (await updateOnboardingForm(roleKey, fd as any)) as any;
      setShortBio(res?.short_bio || '');
      setResumeExistingUrl(fileUrl(res?.resume || ''));
      setResumePending(null);
      unsaved.markClean({
        shortBio: res?.short_bio || '',
        resumeExistingUrl: fileUrl(res?.resume || ''),
        resumePending: null,
      });
      Alert.alert('Saved', 'Profile saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}>
          <Text>Loading bio...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>Bio</Text>
        <TextInput
          mode="outlined"
          label="Short note"
          value={shortBio}
          onChangeText={setShortBio}
          multiline
          numberOfLines={5}
          placeholder="Add a short note about you..."
        />
        <Button mode="outlined" onPress={pickResume}>
          {resumePending ? 'Change resume' : 'Upload resume'}
        </Button>
        {resumePending ? <Text variant="bodySmall">{resumePending.name}</Text> : null}
        {resumeExistingUrl && !resumePending ? (
          <Button mode="text" onPress={() => Linking.openURL(resumeExistingUrl)}>
            View current resume
          </Button>
        ) : null}

        {error ? <HelperText type="error">{error}</HelperText> : null}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving}>Save Profile</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontWeight: '700', color: '#111827' },
});
