import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DatePickerModal } from 'react-native-paper-dates';
import { Button, Chip, Surface, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { browserMagicMembershipInfo, browserSubmitMagicMembership } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { ContentState } from '@/components/ui';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { resolveApiBaseUrl } from '@/utils/apiUrl';
import {
  buildMagicMembershipPayload, membershipRoles, newMagicMembershipForm,
  roleClassificationOptions, validateMagicMembership,
  type MagicMembershipForm, type MagicMembershipInfo,
} from './magicApply';

export default function MagicMembershipApplyScreen() {
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams<{token:string}>();
  const token = typeof tokenParam === 'string' ? tokenParam : '';
  const { user, isLoading: authLoading } = useAuth();
  const [info, setInfo] = useState<MagicMembershipInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<MagicMembershipForm>(newMagicMembershipForm);
  const [dobOpen, setDobOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const options = { baseUrl: resolveApiBaseUrl() };
  const selectedClassification = form.role === 'PHARMACIST' ? form.pharmacistAwardLevel
    : ['TECHNICIAN','ASSISTANT'].includes(form.role) ? form.otherstaffClassificationLevel
    : form.role === 'INTERN' ? form.internHalf : form.studentYear;

  const update = <K extends keyof MagicMembershipForm>(key: K, value: MagicMembershipForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError('');
    setInfo(null);
    if (!token) {
      setLoading(false);
      setLoadError('The membership invitation link is missing its token.');
      return () => { current = false; };
    }
    void browserMagicMembershipInfo<MagicMembershipInfo>(options, token)
      .then((response) => {
        if (current) setInfo(response);
      })
      .catch((error: any) => {
        if (!current) return;
        const status = error?.status ?? error?.response?.status;
        setLoadError(status === 410
          ? 'This invitation has expired. Ask the pharmacy for a new link.'
          : status === 404
            ? 'This invitation is invalid.'
            : 'Could not load your invitation. Check the connection and retry.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [token, reloadKey]);

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      firstName: user.first_name ?? (user as { firstName?: string }).firstName ?? '',
      lastName: user.last_name ?? (user as { lastName?: string }).lastName ?? '',
      username: (user as any).username ?? '',
      email: user.email ?? '',
      mobile: (user as any).mobileNumber ?? (user as any).mobile_number ?? '',
      role: user.role === 'PHARMACIST' ? 'PHARMACIST'
        : current.role === 'PHARMACIST' ? 'TECHNICIAN' : current.role,
    }));
  }, [user?.id]);

  const submit = async () => {
    if (!info || submitting || authLoading) return;
    const error = validateMagicMembership(form, info, user as any);
    if (error) {
      setSubmitError(error);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await browserSubmitMagicMembership(options, token, buildMagicMembershipPayload(form, info, user as any), Boolean(user));
      setSubmitted(true);
    } catch (error: any) {
      const data = error?.payload ?? error?.response?.data ?? {};
      const firstField = Object.values(data).find((value) => Array.isArray(value) && typeof value[0] === 'string') as string[] | undefined;
      setSubmitError(data?.detail || data?.error || firstField?.[0] || 'Could not submit your application. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  const classificationRequired = info?.category === 'FULL_PART_TIME' && Boolean(info.payroll_enabled);
  const allowedRoles = user?.role === 'PHARMACIST' ? membershipRoles.filter((role) => role.value === 'PHARMACIST')
    : user?.role === 'OTHER_STAFF' ? membershipRoles.filter((role) => role.value !== 'PHARMACIST') : membershipRoles;
  const workerPaymentRoute = user?.role === 'PHARMACIST' ? '/pharmacist/profile-payment'
    : user?.role === 'OTHER_STAFF' ? '/otherstaff/profile-payment' : null;

  if (loading) {
    return <SafeAreaView edges={['top','bottom','left','right']} style={styles.screen}>
      <ContentState kind="loading" title="Loading your invitation" />
    </SafeAreaView>;
  }
  if (loadError || !info) {
    return <SafeAreaView edges={['top','bottom','left','right']} style={styles.screen}>
      <ContentState kind="error" title="Invitation unavailable"
        description={loadError || 'Could not load this invitation.'}
        actionLabel="Try again" onAction={() => setReloadKey((value) => value + 1)} />
    </SafeAreaView>;
  }

  return <SafeAreaView edges={['top','bottom','left','right']} style={styles.screen}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Join this pharmacy</Text>
      <Surface style={styles.card} elevation={0}>
        <Text style={styles.section}>{info.pharmacy_name}</Text>
        <Text style={styles.muted}>{info.category === 'FULL_PART_TIME' ? 'Full-time or part-time staff' : 'Locum or casual'} invitation</Text>
        <Text style={styles.body}>
          {info.category === 'FULL_PART_TIME'
            ? 'Staff employment follows the TFN pathway. Your TFN and super details belong in your private payment profile, not this application.'
            : 'Favourite pharmacy membership does not set your pay rate or payment method. Each shift has its own agreed terms.'}
        </Text>
      </Surface>
      {submitted ? <Surface style={styles.card} elevation={0}>
        <Text style={styles.section}>Application submitted</Text>
        <Text style={styles.body}>The pharmacy can review your application. Use the same email address for your ChemistTasker worker account.</Text>
        <Button mode="contained" contentStyle={styles.touch} onPress={() => router.push((workerPaymentRoute || '/register') as any)}>
          {workerPaymentRoute ? 'Complete private payment profile' : 'Create worker account'}
        </Button>
        <Button mode="outlined" contentStyle={styles.touch} onPress={() => router.push((user ? '/my-roster' : '/login') as any)}>
          {user ? 'Back to my work' : 'Log in'}
        </Button>
      </Surface> : <>
        {user && !['PHARMACIST','OTHER_STAFF'].includes(String(user.role)) ? (
          <Text style={styles.error}>Only pharmacist or other staff accounts can apply while signed in.</Text>
        ) : null}
        <Surface style={styles.card} elevation={0}>
          <Text style={styles.section}>Your details</Text>
          <Text style={styles.muted}>Worker role</Text>
          <View style={styles.chips}>
            {allowedRoles.map((option) => (
              <Chip key={option.value} selected={form.role === option.value}
                onPress={() => update('role', option.value)} style={styles.roleChip}
                accessibilityRole="radio" accessibilityState={{checked:form.role === option.value}}>
                {option.label}
              </Chip>
            ))}
          </View>
          <TextInput mode="outlined" label="First name" value={form.firstName} onChangeText={(value) => update('firstName',value)} />
          <TextInput mode="outlined" label="Last name" value={form.lastName} onChangeText={(value) => update('lastName',value)} />
          <TextInput mode="outlined" label="Username" value={form.username} onChangeText={(value) => update('username',value)} autoCapitalize="none" />
          <TextInput mode="outlined" label="Email" value={form.email} onChangeText={(value) => update('email',value)}
            keyboardType="email-address" autoCapitalize="none" disabled={Boolean(user?.email)} />
          <TextInput mode="outlined" label="Mobile number" value={form.mobile} onChangeText={(value) => update('mobile',value)}
            keyboardType="phone-pad" />
          <Button mode="outlined" contentStyle={styles.touch} icon="calendar" onPress={() => setDobOpen(true)}>
            {form.dateOfBirth ? 'Date of birth: ' + form.dateOfBirth : 'Choose date of birth'}
          </Button>
          <DatePickerModal locale="en" mode="single" visible={dobOpen}
            date={form.dateOfBirth ? new Date(form.dateOfBirth + 'T12:00:00') : undefined}
            onDismiss={() => setDobOpen(false)}
            onConfirm={({date}) => {
              setDobOpen(false);
              if (date) update('dateOfBirth',date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'));
            }} />
          {info.category === 'FULL_PART_TIME' ? (
            <TextInput mode="outlined" label="Job title" value={form.jobTitle} onChangeText={(value) => update('jobTitle',value)} />
          ) : null}
          {classificationRequired ? <>
            <Text style={styles.muted}>Award classification</Text>
            <View style={styles.chips}>
              {(roleClassificationOptions[form.role] ?? []).map((option) => (
                <Chip key={option.value} selected={selectedClassification === option.value} style={styles.roleChip}
                  onPress={() => {
                    const key = form.role === 'PHARMACIST' ? 'pharmacistAwardLevel'
                      : ['TECHNICIAN','ASSISTANT'].includes(form.role) ? 'otherstaffClassificationLevel'
                      : form.role === 'INTERN' ? 'internHalf' : 'studentYear';
                    update(key, option.value);
                  }}>{option.label}</Chip>
              ))}
            </View>
          </> : null}
          {submitError ? <Text style={styles.error} accessibilityRole="alert">{submitError}</Text> : null}
          <Button mode="contained" contentStyle={styles.touch} loading={submitting} disabled={submitting || authLoading}
            onPress={() => void submit()}>Submit application</Button>
        </Surface>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex:1,backgroundColor:colors.pageBg },
  content: { padding:space.xl,paddingBottom:space['3xl'],gap:space.lg },
  card: { backgroundColor:colors.surfaceBg,borderWidth:1,borderColor:colors.border,
    borderRadius:radius.card,padding:space.lg,gap:space.md },
  heading: { fontFamily:font.outfit.medium,fontSize:type.headlineMedium.fontSize,color:colors.textPrimary },
  section: { fontFamily:font.outfit.medium,fontSize:type.titleLarge.fontSize,color:colors.textPrimary },
  body: { fontFamily:font.inter.regular,fontSize:type.bodyMedium.fontSize,color:colors.textPrimary },
  muted: { fontFamily:font.inter.regular,fontSize:type.bodySmall.fontSize,color:colors.textSecondary },
  chips: {flexDirection:'row',flexWrap:'wrap',gap:space.sm},
  roleChip: {minHeight:touch.min,justifyContent:'center'},
  touch: {minHeight:touch.min},
  error: {color:colors.status.red.fg,fontFamily:font.inter.medium},
});
