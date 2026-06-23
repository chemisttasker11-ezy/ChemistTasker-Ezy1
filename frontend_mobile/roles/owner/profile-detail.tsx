import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Avatar, Button, Chip, HelperText, Menu, Text, TextInput } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { getOnboarding, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useUnsavedChangesGuard } from '../shared/forms/useUnsavedChangesGuard';
import { AHPRA_CONSENT_TEXT } from '../../constants/ahpraConsent';

type OwnerRole = 'MANAGER' | 'PHARMACIST';

type OwnerFormData = {
  username: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  gender: string;
  role: OwnerRole;
  chain_pharmacy: boolean;
  number_of_pharmacies: number;
  ahpra_number: string;
  ahpra_years_since_first_registration?: number | null;
  ahpra_verified?: boolean | null;
  ahpra_verification_note?: string | null;
  profile_photo_url?: string | null;
};

type Props = {
  standalone?: boolean;
  onSuccessPath?: string;
  onCancelPath?: string;
};

const ROLE_OPTIONS: Array<{ value: OwnerRole; label: string }> = [
  { value: 'MANAGER', label: 'Pharmacy Manager' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
];

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const;

const LIGHT_PAGE_BG = '#F4F7FB';
const LIGHT_SURFACE = '#FFFFFF';
const LIGHT_BORDER = '#D9E2F2';
const HERO_GRADIENT_START = '#6366F1';
const HERO_GRADIENT_END = '#8B5CF6';

const inputTheme = {
  colors: {
    background: LIGHT_SURFACE,
    surface: LIGHT_SURFACE,
    onSurface: '#111827',
    onSurfaceVariant: '#64748B',
    primary: HERO_GRADIENT_START,
    outline: LIGHT_BORDER,
  },
};

export default function OwnerProfileDetailScreen({
  standalone = false,
  onSuccessPath,
  onCancelPath,
}: Props) {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const imageMediaTypes = (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [roleMenuVisible, setRoleMenuVisible] = useState(false);
  const [genderMenuVisible, setGenderMenuVisible] = useState(false);
  const [lockedNames, setLockedNames] = useState({ first: false, last: false });
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [profilePhotoAsset, setProfilePhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [form, setForm] = useState<OwnerFormData>({
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    gender: '',
    role: 'MANAGER',
    chain_pharmacy: false,
    number_of_pharmacies: 1,
    ahpra_number: '',
    ahpra_years_since_first_registration: null,
    ahpra_verified: null,
    ahpra_verification_note: null,
    profile_photo_url: null,
  });

  const isMobileVerified = Boolean(user?.is_mobile_verified);

  const unsaved = useUnsavedChangesGuard(
    {
      form,
      profilePhotoPreview,
      profilePhotoUri: profilePhotoAsset?.uri ?? null,
    },
    {
      enabled: !loading,
      saving,
    }
  );

  const roleLabel = useMemo(
    () => ROLE_OPTIONS.find((option) => option.value === form.role)?.label || 'Owner',
    [form.role]
  );
  const genderLabel = useMemo(
    () => GENDER_OPTIONS.find((option) => option.value === form.gender)?.label || 'Select gender',
    [form.gender]
  );
  const displayName = useMemo(() => {
    const name = [form.first_name, form.last_name].filter(Boolean).join(' ').trim();
    return name || form.username || 'Owner setup';
  }, [form.first_name, form.last_name, form.username]);
  const showAhpra = form.role === 'PHARMACIST' || Boolean(form.ahpra_number);

  const buildFormFromResponse = (data: any): OwnerFormData => ({
    username: data?.username || '',
    first_name: data?.first_name || '',
    last_name: data?.last_name || '',
    phone_number: data?.phone_number || user?.mobile_number || '',
    gender: data?.gender || '',
    role: (data?.role as OwnerRole) || 'MANAGER',
    chain_pharmacy: Boolean(data?.chain_pharmacy),
    number_of_pharmacies: Math.max(1, Number(data?.number_of_pharmacies) || 1),
    ahpra_number: data?.ahpra_number || '',
    ahpra_years_since_first_registration: data?.ahpra_years_since_first_registration ?? null,
    ahpra_verified: typeof data?.ahpra_verified === 'boolean' ? data.ahpra_verified : null,
    ahpra_verification_note: data?.ahpra_verification_note || null,
    profile_photo_url: data?.profile_photo_url || data?.profile_photo || null,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const data: any = await getOnboarding('owner');
        const nextForm = buildFormFromResponse(data);
        setForm(nextForm);
        setLockedNames({
          first: Boolean(data?.first_name),
          last: Boolean(data?.last_name),
        });
        setProfilePhotoPreview(nextForm.profile_photo_url || null);
        setProfilePhotoAsset(null);
        unsaved.markClean({
          form: nextForm,
          profilePhotoPreview: nextForm.profile_photo_url || null,
          profilePhotoUri: null,
        });
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || 'Unable to load owner profile detail.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user?.mobile_number]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to upload a profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: imageMediaTypes,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfilePhotoAsset(result.assets[0]);
      setProfilePhotoPreview(result.assets[0].uri);
    }
  };

  const submit = async () => {
    setError('');
    if (!form.first_name || !form.last_name || !form.username || !form.phone_number) {
      setError('Please complete first name, last name, username, and phone number.');
      return;
    }
    if (form.role === 'PHARMACIST' && !form.ahpra_number) {
      setError('AHPRA number is required for Pharmacist role.');
      return;
    }

    const payload = new FormData();
    payload.append('first_name', form.first_name);
    payload.append('last_name', form.last_name);
    payload.append('username', form.username);
    payload.append('phone_number', form.phone_number);
    payload.append('gender', form.gender);
    payload.append('role', form.role);
    payload.append('chain_pharmacy', String(form.chain_pharmacy));
    payload.append('number_of_pharmacies', String(form.chain_pharmacy ? Math.max(1, form.number_of_pharmacies) : 1));
    payload.append('ahpra_number', showAhpra ? form.ahpra_number : '');
    payload.append('submitted_for_verification', 'true');
    if (profilePhotoAsset?.uri) {
      payload.append('profile_photo', {
        uri: profilePhotoAsset.uri,
        name: profilePhotoAsset.fileName || `owner-profile-${Date.now()}.jpg`,
        type: profilePhotoAsset.mimeType || 'image/jpeg',
      } as any);
    }

    setSaving(true);
    try {
      await updateOnboardingForm('owner', payload);
      await refreshUser();
      unsaved.markClean({
        form,
        profilePhotoPreview,
        profilePhotoUri: null,
      });
      setProfilePhotoAsset(null);
      if (standalone && onSuccessPath) {
        router.replace(onSuccessPath as any);
      } else {
        Alert.alert('Saved', 'Owner profile detail updated.');
        router.back();
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save owner profile detail.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loader}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Image
          source={require('../../assets/images/clipsnap-edit-6-1-2026.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? <HelperText type="error">{error}</HelperText> : null}

        <LinearGradient
          colors={[HERO_GRADIENT_START, HERO_GRADIENT_END]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroContent}>
            <View style={styles.heroPhotoRow}>
              {profilePhotoPreview ? (
                <Avatar.Image size={78} source={{ uri: profilePhotoPreview }} style={styles.heroAvatar} />
              ) : (
                <Avatar.Text
                  size={78}
                  label={displayName.slice(0, 1).toUpperCase() || 'Y'}
                  style={styles.heroAvatar}
                  color="#111827"
                />
              )}
              <Button
                mode="contained"
                icon="camera-outline"
                onPress={pickImage}
                buttonColor="#93C5FD"
                textColor="#1E293B"
                compact
                style={styles.photoButton}
              >
                Upload Photo
              </Button>
            </View>
            <Text variant="headlineMedium" style={styles.heroName}>
              {displayName}
            </Text>
            <Chip style={styles.heroRoleChip} textStyle={styles.heroRoleText}>
              {roleLabel.toUpperCase()}
            </Chip>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text variant="headlineSmall" style={styles.title}>Complete Owner Setup</Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              Finish your owner profile before adding your pharmacy workspace.
            </Text>
          </View>

          <TextInput
            mode="outlined"
            label="First Name"
            value={form.first_name}
            onChangeText={(value) => setForm((prev) => ({ ...prev, first_name: value }))}
            editable={!lockedNames.first}
            right={lockedNames.first ? <TextInput.Icon icon="lock-outline" /> : undefined}
            theme={inputTheme}
            style={styles.input}
          />
          {lockedNames.first ? <HelperText type="info">Locked after initial registration.</HelperText> : null}

          <TextInput
            mode="outlined"
            label="Last Name"
            value={form.last_name}
            onChangeText={(value) => setForm((prev) => ({ ...prev, last_name: value }))}
            editable={!lockedNames.last}
            right={lockedNames.last ? <TextInput.Icon icon="lock-outline" /> : undefined}
            theme={inputTheme}
            style={styles.input}
          />
          {lockedNames.last ? <HelperText type="info">Locked after initial registration.</HelperText> : null}

          <TextInput
            mode="outlined"
            label="Username"
            value={form.username}
            onChangeText={(value) => setForm((prev) => ({ ...prev, username: value }))}
            theme={inputTheme}
            style={styles.input}
          />

          <TextInput
            mode="outlined"
            label="Phone Number"
            value={form.phone_number}
            onChangeText={(value) => setForm((prev) => ({ ...prev, phone_number: value }))}
            editable={!isMobileVerified}
            theme={inputTheme}
            style={styles.input}
          />
          <Chip
            mode="outlined"
            icon={isMobileVerified ? 'check-circle-outline' : 'clock-outline'}
            style={styles.statusChip}
            textStyle={styles.statusChipText}
          >
            {isMobileVerified ? 'Mobile Verified' : 'Mobile Not Verified'}
          </Chip>

          <Menu
            visible={genderMenuVisible}
            onDismiss={() => setGenderMenuVisible(false)}
            anchor={
              <Button mode="outlined" onPress={() => setGenderMenuVisible(true)} style={styles.menuButton} textColor="#111827">
                {genderLabel}
              </Button>
            }
          >
            {GENDER_OPTIONS.map((option) => (
              <Menu.Item
                key={option.value}
                title={option.label}
                onPress={() => {
                  setForm((prev) => ({ ...prev, gender: option.value }));
                  setGenderMenuVisible(false);
                }}
              />
            ))}
          </Menu>

          <View style={styles.switchRow}>
            <Text variant="bodyMedium" style={styles.switchLabel}>Do you have more than one pharmacy?</Text>
            <Button
              mode={form.chain_pharmacy ? 'contained' : 'outlined'}
              onPress={() => setForm((prev) => ({
                ...prev,
                chain_pharmacy: !prev.chain_pharmacy,
                number_of_pharmacies: !prev.chain_pharmacy ? prev.number_of_pharmacies : 1,
              }))}
              buttonColor={form.chain_pharmacy ? '#7C8CF8' : undefined}
              textColor={form.chain_pharmacy ? '#FFFFFF' : '#111827'}
              compact
            >
              {form.chain_pharmacy ? 'Yes' : 'No'}
            </Button>
          </View>

          {form.chain_pharmacy ? (
            <TextInput
              mode="outlined"
              label="Number of Pharmacies"
              value={String(form.number_of_pharmacies || 1)}
              onChangeText={(value) => {
                const digits = value.replace(/\D/g, '');
                setForm((prev) => ({
                  ...prev,
                  number_of_pharmacies: Math.max(1, Number(digits || '1')),
                }));
              }}
              keyboardType="number-pad"
              theme={inputTheme}
              style={styles.input}
            />
          ) : null}

          <Menu
            visible={roleMenuVisible}
            onDismiss={() => setRoleMenuVisible(false)}
            anchor={
              <Button mode="outlined" onPress={() => setRoleMenuVisible(true)} style={styles.menuButton} textColor="#111827">
                {roleLabel}
              </Button>
            }
          >
            {ROLE_OPTIONS.map((option) => (
              <Menu.Item
                key={option.value}
                title={option.label}
                onPress={() => {
                  setForm((prev) => ({ ...prev, role: option.value }));
                  setRoleMenuVisible(false);
                }}
              />
            ))}
          </Menu>

          {showAhpra ? (
            <>
              <TextInput
                mode="outlined"
                label="AHPRA Number"
                value={form.ahpra_number}
                onChangeText={(value) => setForm((prev) => ({ ...prev, ahpra_number: value }))}
                left={<TextInput.Affix text="PHA" />}
                theme={inputTheme}
                style={styles.input}
              />
              <HelperText type="info">{AHPRA_CONSENT_TEXT}</HelperText>

              <TextInput
                mode="outlined"
                label="Years Since First Registration"
                value={form.ahpra_years_since_first_registration != null ? String(form.ahpra_years_since_first_registration) : ''}
                editable={false}
                theme={inputTheme}
                style={styles.input}
              />

              <Chip
                mode="outlined"
                icon={form.ahpra_verified === true ? 'check-circle-outline' : form.ahpra_verified === false ? 'close-circle-outline' : 'clock-outline'}
                style={styles.statusChip}
                textStyle={styles.statusChipText}
              >
                {form.ahpra_verified === true ? 'AHPRA Verified' : form.ahpra_verified === false ? 'AHPRA Not Verified' : 'AHPRA Pending'}
              </Chip>
              {form.ahpra_verification_note ? <HelperText type="info">{form.ahpra_verification_note}</HelperText> : null}
            </>
          ) : null}

          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={() => {
                unsaved.confirmDiscard(() => {
                  if (standalone && onCancelPath) {
                    router.replace(onCancelPath as any);
                    return;
                  }
                  router.back();
                });
              }}
              textColor="#111827"
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={submit}
              loading={saving}
              disabled={saving}
              buttonColor="#7C8CF8"
              textColor="#FFFFFF"
            >
              {saving ? 'Saving...' : standalone ? 'Continue' : 'Submit'}
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT_PAGE_BG,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: LIGHT_PAGE_BG,
  },
  topBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5EAF3',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logo: {
    width: 150,
    height: 36,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  hero: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
  },
  heroContent: {
    minHeight: 236,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  heroPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  heroAvatar: {
    backgroundColor: '#DBEAFE',
  },
  photoButton: {
    borderRadius: 10,
  },
  heroName: {
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  heroRoleChip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroRoleText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  card: {
    backgroundColor: LIGHT_SURFACE,
    borderWidth: 1,
    borderColor: LIGHT_BORDER,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#6366F1',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 16,
  },
  title: {
    color: '#111827',
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748B',
    marginTop: 4,
  },
  input: {
    backgroundColor: LIGHT_SURFACE,
    marginBottom: 10,
  },
  statusChip: {
    alignSelf: 'flex-start',
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
    marginBottom: 12,
  },
  statusChipText: {
    color: '#166534',
  },
  menuButton: {
    justifyContent: 'space-between',
    borderColor: LIGHT_BORDER,
    borderRadius: 12,
    backgroundColor: LIGHT_SURFACE,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  switchLabel: {
    color: '#111827',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
});
