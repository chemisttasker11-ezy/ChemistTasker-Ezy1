import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getOnboardingDetail, updateOnboardingForm } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { useAhpra } from '@/context/AhpraContext';

export type OwnerRole = 'MANAGER' | 'PHARMACIST';

export type OwnerForm = {
  username: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  gender: string;
  role: OwnerRole;
  chain_pharmacy: boolean;
  number_of_pharmacies: number;
  ahpra_number: string;
  ahpra_years_since_first_registration: number | null;
  ahpra_verified: boolean | null;
  ahpra_verification_note: string | null;
};

type FieldErrors = Partial<Record<keyof OwnerForm, string>>;

// Same options and order as web OwnerOnboarding.
export const ROLE_OPTIONS: { value: OwnerRole; label: string }[] = [
  { value: 'MANAGER', label: 'Pharmacy Manager' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
];

export const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const;

/** Steps of the owner first run; the last one reviews and submits. */
export const ONBOARDING_STEPS = ['About you', 'Your role', 'Your pharmacies', 'Review'] as const;

const emptyForm: OwnerForm = {
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
};

const isNotFound = (err: any) => err?.status === 404 || err?.response?.status === 404;
const errorText = (err: any, fallback: string) => err?.response?.data?.detail || err?.message || fallback;

/**
 * Owner profile state for the first run: loads `getOnboardingDetail('owner')`, validates per step with web's
 * required fields, and submits one `updateOnboardingForm('owner', FormData)` exactly like web OwnerOnboarding.
 */
export function useOwnerOnboardingForm() {
  const { user, refreshUser } = useAuth();
  const ahpra = useAhpra();
  const [form, setForm] = useState<OwnerForm>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lockedNames, setLockedNames] = useState({ first: false, last: false });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [loadedSnapshot, setLoadedSnapshot] = useState<unknown>(null);

  const isMobileVerified = Boolean(user?.is_mobile_verified);
  const showAhpra = form.role === 'PHARMACIST' || Boolean(form.ahpra_number);
  const isAhpraVerified = form.ahpra_verified === true && (!ahpra.summary || ahpra.summary.state === 'ok');

  useEffect(() => {
    let active = true;
    getOnboardingDetail('owner')
      .then((data: any) => {
        if (!active) return;
        const next: OwnerForm = {
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
        };
        const photo = data?.profile_photo_url || data?.profile_photo || null;
        setForm(next);
        setLockedNames({ first: Boolean(data?.first_name), last: Boolean(data?.last_name) });
        setPhotoPreview(photo);
        setLoadedSnapshot({ form: next, photoPreview: photo, photoUri: null, photoCleared: false });
      })
      .catch((err: any) => {
        if (!active) return;
        // No onboarding record yet is the normal first-run case (web ignores the 404 too).
        if (!isNotFound(err)) setLoadError(errorText(err, 'Unable to load your owner profile.'));
        const next = { ...emptyForm, phone_number: user?.mobile_number || '' };
        setForm(next);
        setLoadedSnapshot({ form: next, photoPreview: null, photoUri: null, photoCleared: false });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.mobile_number]);

  const update = useCallback((changes: Partial<OwnerForm>) => {
    setForm((prev) => ({ ...prev, ...changes }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(changes) as (keyof OwnerForm)[]) delete next[key];
      return next;
    });
  }, []);

  const pickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to upload a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoAsset(result.assets[0]);
      setPhotoPreview(result.assets[0].uri);
      setPhotoCleared(false);
    }
  }, []);

  const removePhoto = useCallback(() => {
    setPhotoAsset(null);
    setPhotoPreview(null);
    setPhotoCleared(true);
  }, []);

  /** Web's `required` rules, split by the step that shows the field. */
  const validateStep = useCallback(
    (step: number): FieldErrors => {
      const found: FieldErrors = {};
      if (step === 0) {
        if (!form.first_name.trim()) found.first_name = 'Enter your first name.';
        if (!form.last_name.trim()) found.last_name = 'Enter your last name.';
        if (!form.username.trim()) found.username = 'Choose a username.';
        if (!form.phone_number.trim()) found.phone_number = 'Enter your phone number.';
      }
      if (step === 1 && form.role === 'PHARMACIST' && !form.ahpra_number.trim()) {
        found.ahpra_number = 'AHPRA number is required for the Pharmacist role.';
      }
      if (step === 2 && form.chain_pharmacy && !(form.number_of_pharmacies >= 1)) {
        found.number_of_pharmacies = 'Enter how many pharmacies you have (1 or more).';
      }
      setErrors((prev) => ({ ...prev, ...found }));
      return found;
    },
    [form],
  );

  /** Saves the profile; resolves true on success. The caller navigates while `saving` is still true. */
  const submit = useCallback(async () => {
    setSubmitError('');
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
    if (!isAhpraVerified) payload.append('submitted_for_verification', 'true');
    if (photoAsset?.uri) {
      payload.append('profile_photo', {
        uri: photoAsset.uri,
        name: photoAsset.fileName || `owner-profile-${Date.now()}.jpg`,
        type: photoAsset.mimeType || 'image/jpeg',
      } as any);
    } else if (photoCleared) {
      payload.append('profile_photo_clear', 'true');
    }

    setSaving(true);
    try {
      await updateOnboardingForm('owner', payload);
    } catch (err: any) {
      setSubmitError(errorText(err, 'Failed to save your owner profile.'));
      setSaving(false);
      return false;
    }
    // The profile is saved; a failed refresh must not show a save error (web OwnerOnboarding does the same).
    await ahpra.refresh().catch(() => {});
    await refreshUser().catch(() => {});
    return true;
  }, [ahpra, form, isAhpraVerified, photoAsset, photoCleared, refreshUser, showAhpra]);

  return useMemo(
    () => ({
      form,
      update,
      errors,
      validateStep,
      submit,
      saving,
      loading,
      loadError,
      submitError,
      loadedSnapshot,
      lockedNames,
      isMobileVerified,
      showAhpra,
      isAhpraVerified,
      ahpraSummary: ahpra.summary,
      photo: { preview: photoPreview, uri: photoAsset?.uri ?? null, cleared: photoCleared },
      pickPhoto,
      removePhoto,
    }),
    [
      ahpra.summary,
      errors,
      form,
      isAhpraVerified,
      isMobileVerified,
      loadError,
      loadedSnapshot,
      loading,
      lockedNames,
      photoAsset?.uri,
      photoCleared,
      photoPreview,
      pickPhoto,
      removePhoto,
      saving,
      showAhpra,
      submit,
      submitError,
      update,
      validateStep,
    ],
  );
}

export type OwnerOnboardingState = ReturnType<typeof useOwnerOnboardingForm>;

const OnboardingContext = createContext<OwnerOnboardingState | null>(null);

export const OnboardingProvider = OnboardingContext.Provider;

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return context;
}

/** app/owner/onboarding/_context.tsx re-exports this default; it renders nothing as a route. */
export default function OnboardingContextRoute() {
  return null;
}
