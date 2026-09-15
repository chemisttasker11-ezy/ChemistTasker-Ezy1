import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, HelperText, Menu, Text, TextInput } from 'react-native-paper';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { roleKey, boolChipProps } from './shared';
import GooglePlacesInput from '../../shared/pharmacies/GooglePlacesInput';
import { useUnsavedChangesGuard } from '../../shared/forms/useUnsavedChangesGuard';
import { AHPRA_CONSENT_TEXT } from '../../../constants/ahpraConsent';
import { useAuth } from '../../../context/AuthContext';

type ApiData = {
  username?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  ahpra_number?: string;
  date_of_birth?: string | null;
  gender?: string | null;
  emergency_contact_number?: string | null;
  emergency_contact_relation?: string | null;
  street_address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  google_place_id?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  ahpra_verified?: boolean | null;
  ahpra_verification_note?: string | null;
  ahpra_years_since_first_registration?: number | null;
};

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const;

export default function PharmacistBasicInfoScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [genderMenuVisible, setGenderMenuVisible] = useState(false);
  const [form, setForm] = useState<ApiData>({});
  const [lockedNames, setLockedNames] = useState({ first: false, last: false });
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const unsaved = useUnsavedChangesGuard(form, { enabled: !loading, onSave: () => saveRef.current?.(), saving });
  const { refreshUser } = useAuth();
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data: any = await getOnboardingDetail(roleKey);
        if (!mounted) return;
        setForm(data || {});
        setLockedNames({
          first: Boolean(data?.first_name),
          last: Boolean(data?.last_name),
        });
        unsaved.markClean(data || {});
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || err?.message || 'Unable to load basic info.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const isAhpraVerified = form.ahpra_verified === true;
  const canSubmit = useMemo(() => Boolean(form.ahpra_number) && !isAhpraVerified, [form.ahpra_number, isAhpraVerified]);
  const ahpraChip = boolChipProps(form.ahpra_verified);
  const genderLabel = GENDER_OPTIONS.find((g) => g.value === form.gender)?.label || 'Select gender';

  const setField = (k: keyof ApiData, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const handlePlaceSelect = (place: {
    address: string;
    place_id?: string;
    street_address: string;
    suburb: string;
    state: string;
    postcode: string;
    latitude?: number;
    longitude?: number;
  }) => {
    setForm((prev) => ({
      ...prev,
      street_address: place.street_address || place.address || prev.street_address || '',
      suburb: place.suburb || prev.suburb || '',
      state: place.state || prev.state || '',
      postcode: place.postcode || prev.postcode || '',
      google_place_id: place.place_id || prev.google_place_id || '',
      latitude: place.latitude ?? prev.latitude ?? null,
      longitude: place.longitude ?? prev.longitude ?? null,
    }));
  };

  const save = async (submitForVerification: boolean) => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tab', 'basic');
      if (submitForVerification && !isAhpraVerified) fd.append('submitted_for_verification', 'true');
      if (form.username != null) fd.append('username', String(form.username));
      if (form.first_name != null) fd.append('first_name', String(form.first_name));
      if (form.last_name != null) fd.append('last_name', String(form.last_name));
      if (form.phone_number != null) fd.append('phone_number', String(form.phone_number));
      if (form.ahpra_number != null) fd.append('ahpra_number', String(form.ahpra_number));
      if (form.date_of_birth != null) fd.append('date_of_birth', String(form.date_of_birth));
      if (form.gender != null) fd.append('gender', String(form.gender));
      if (form.emergency_contact_number != null) fd.append('emergency_contact_number', String(form.emergency_contact_number));
      if (form.emergency_contact_relation != null) fd.append('emergency_contact_relation', String(form.emergency_contact_relation));
      (
        [
          'street_address',
          'suburb',
          'state',
          'postcode',
          'google_place_id',
          'latitude',
          'longitude',
        ] as const
      ).forEach((k) => {
        const v = form[k];
        if (v != null && v !== '') fd.append(k, String(v));
      });

      const res: any = await updateOnboardingForm(roleKey, fd as any);
      setForm(res || {});
      setLockedNames({
        first: Boolean(res?.first_name),
        last: Boolean(res?.last_name),
      });
      await refreshUser();
      unsaved.markClean(res || {});
      Alert.alert('Saved', submitForVerification ? 'Submitted for verification.' : 'Basic info saved.');
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp && typeof resp === 'object') {
        setError(Object.entries(resp).map(([k, v]) => `${k}: ${(v as any[]).join(', ')}`).join('\n'));
      } else {
        setError(err?.message || 'Failed to save basic info.');
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    saveRef.current = () => save(false);
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}>
          <Text>Loading basic info...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>Basic Info</Text>

        <TextInput mode="outlined" label="First Legal Name" value={form.first_name || ''} onChangeText={(v) => setField('first_name', v)} editable={!lockedNames.first} />
        <TextInput mode="outlined" label="Last Legal Name" value={form.last_name || ''} onChangeText={(v) => setField('last_name', v)} editable={!lockedNames.last} />
        <TextInput mode="outlined" label="Username" value={form.username || ''} onChangeText={(v) => setField('username', v)} />
        <TextInput mode="outlined" label="Phone Number" value={form.phone_number || ''} onChangeText={(v) => setField('phone_number', v)} />
        <TextInput mode="outlined" label="Date of Birth" value={form.date_of_birth || ''} onChangeText={(v) => setField('date_of_birth', v)} placeholder="YYYY-MM-DD" />
        <Menu
          visible={genderMenuVisible}
          onDismiss={() => setGenderMenuVisible(false)}
          anchor={<Button mode="outlined" onPress={() => setGenderMenuVisible(true)}>{genderLabel}</Button>}
        >
          {GENDER_OPTIONS.map((opt) => (
            <Menu.Item key={opt.value} title={opt.label} onPress={() => { setField('gender', opt.value); setGenderMenuVisible(false); }} />
          ))}
        </Menu>

        <Text variant="titleSmall" style={styles.sectionTitle}>Emergency Contact</Text>
        <TextInput
          mode="outlined"
          label="Emergency Contact Number"
          value={form.emergency_contact_number || ''}
          onChangeText={(v) => setField('emergency_contact_number', v)}
          keyboardType="phone-pad"
        />
        <TextInput
          mode="outlined"
          label="Relation to You"
          value={form.emergency_contact_relation || ''}
          onChangeText={(v) => setField('emergency_contact_relation', v)}
        />

        <Text variant="titleSmall" style={styles.sectionTitle}>Address</Text>
        <View style={{ minHeight: 56, zIndex: 10 }}>
          <GooglePlacesInput
            label="Search Address"
            value={form.street_address || ''}
            onPlaceSelected={handlePlaceSelect}
          />
        </View>
        <TextInput mode="outlined" label="Street Address" value={form.street_address || ''} onChangeText={(v) => setField('street_address', v)} />
        <TextInput mode="outlined" label="Suburb" value={form.suburb || ''} onChangeText={(v) => setField('suburb', v)} />
        <View style={styles.row}>
          <TextInput style={styles.flex} mode="outlined" label="State" value={form.state || ''} onChangeText={(v) => setField('state', v)} />
          <TextInput style={styles.flex} mode="outlined" label="Postcode" value={form.postcode || ''} onChangeText={(v) => setField('postcode', v)} />
        </View>

        <TextInput
          mode="outlined"
          label="AHPRA Number"
          value={form.ahpra_number || ''}
          onChangeText={(v) => setField('ahpra_number', v)}
          editable={!isAhpraVerified}
          left={<TextInput.Affix text="PHA" />}
        />
        <HelperText type="info">{isAhpraVerified ? 'AHPRA number is locked after verification.' : AHPRA_CONSENT_TEXT}</HelperText>
        <TextInput
          mode="outlined"
          label="Years Since First Registration"
          value={form.ahpra_years_since_first_registration != null ? String(form.ahpra_years_since_first_registration) : ''}
          editable={false}
        />
        <Chip mode="outlined" icon={ahpraChip.icon} textStyle={{ color: ahpraChip.color }}>
          AHPRA {ahpraChip.text}
        </Chip>
        {form.ahpra_verification_note ? <HelperText type="info">{form.ahpra_verification_note}</HelperText> : null}
        {error ? <HelperText type="error">{error}</HelperText> : null}

        <View style={styles.actions}>
          <Button mode="outlined" onPress={() => save(false)} loading={saving} disabled={saving}>Save</Button>
          <Button mode="contained" onPress={() => save(true)} loading={saving} disabled={saving || !canSubmit}>
            Submit & Verify Basic
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
  sectionTitle: { marginTop: 4, color: '#374151', fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  actions: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
});
