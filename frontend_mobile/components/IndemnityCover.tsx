import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, HelperText, Text, TextInput } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { getOnboardingDetail, updateOnboardingForm, type OnboardingApi } from '@chemisttasker/shared-core';

export default function IndemnityCover({ role }: { role: 'pharmacist' | 'otherstaff' }) {
  const [data, setData] = useState<OnboardingApi>({});
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; getOnboardingDetail(role).then(d => { if (active) { setData(d); setLoaded(true); } }).catch(() => { if (active) setError('Could not load cover.'); }); return () => { active = false; }; }, [role]);
  const pick = async () => { const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, type: '*/*' }); if (!result.canceled && result.assets?.length) setFile(result.assets[0]); };
  const save = async () => {
    setSaving(true); setError('');
    try {
      const form = new FormData(); form.append('tab', role === 'pharmacist' ? 'profile' : 'regulatory');
      form.append('indemnity_insurer', data.indemnity_insurer || ''); form.append('indemnity_expiry', data.indemnity_expiry || '');
      if (file) form.append('indemnity_certificate', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
      setData(await updateOnboardingForm(role, form) as OnboardingApi); setFile(null);
    } catch { setError('Could not save cover. Check the expiry date and try again.'); } finally { setSaving(false); }
  };
  const label = data.indemnity_status === 'shown' ? 'Cover shown' : data.indemnity_status === 'expired' ? 'Cover expired' : 'No cover added';
  return <View style={{ gap: 8 }}>
    <Text variant="titleMedium">Professional indemnity cover</Text><View><Chip compact>{label}</Chip></View>
    <Text>Optional. Managers can see whether you have shown cover.</Text>
    <TextInput mode="outlined" label="Insurer" value={data.indemnity_insurer || ''} onChangeText={value => setData({ ...data, indemnity_insurer: value })} />
    <TextInput mode="outlined" label="Expiry date (YYYY-MM-DD)" value={data.indemnity_expiry || ''} onChangeText={value => setData({ ...data, indemnity_expiry: value })} />
    <Button mode="outlined" onPress={pick}>{file ? file.name : data.indemnity_certificate ? 'Replace certificate' : 'Add certificate'}</Button>
    {error ? <HelperText type="error" visible>{error}</HelperText> : null}<Button mode="outlined" onPress={save} loading={saving} disabled={saving || !loaded}>Save cover</Button>
  </View>;
}
