import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Checkbox, Text } from 'react-native-paper';
import type { MarketplaceAccess } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { useAuth } from '@/context/AuthContext';
import { marketplaceTermsHref } from './marketplaceTermsUrl';
import { colors, space, touch } from '@/constants/tokens';

const identityRoutes: Record<string, string> = {
  OWNER: '/owner/profile-detail',
  PHARMACIST: '/pharmacist/profile-identity',
  OTHER_STAFF: '/otherstaff/profile-identity',
  INTERN: '/otherstaff/profile-identity',
  TECHNICIAN: '/otherstaff/profile-identity',
  ASSISTANT: '/otherstaff/profile-identity',
  STUDENT: '/otherstaff/profile-identity',
  EXPLORER: '/explorer/profile-identity',
  JUNIOR: '/explorer/profile-identity',
  CAREER_SWITCHER: '/explorer/profile-identity',
  ORGANIZATION: '/organization/profile',
};

export function MarketplaceAccessResolution({
  access, onUpdated,
}: { access: MarketplaceAccess; onUpdated: () => Promise<void> }) {
  const router = useRouter();
  const { user } = useAuth();
  const sessionRef = useRef(0);
  const [termsRetry, setTermsRetry] = useState(0);
  const blocked = access.blockers ?? [];
  const needsTerms = blocked.some(row => row.code === 'MARKETPLACE_TERMS_REQUIRED');
  const [terms, setTerms] = useState<{ version: string; accepted: boolean; terms_url: string } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Never reuse a previous account's terms checkbox or legal snapshot.
    const session = ++sessionRef.current;
    setTerms(null);
    setAgreed(false);
    setLoading(false);
    setError('');
    if (!needsTerms) return;
    void chemistTaskerApi.marketplace.getTerms()
      .then(response => { if (session === sessionRef.current) setTerms(response); })
      .catch(failure => { if (session === sessionRef.current) setError(failure?.message || 'Current terms could not load.'); });
    return () => { sessionRef.current += 1; };
  }, [needsTerms, user?.id, termsRetry]);

  const termsHref = marketplaceTermsHref(terms?.terms_url);

  const accept = useCallback(async () => {
    if (loading || !terms?.version || !termsHref || !agreed) return;
    const session = sessionRef.current;
    setLoading(true); setError('');
    try {
      await chemistTaskerApi.marketplace.acceptTerms(terms.version);
    } catch (failure: any) {
      if (session === sessionRef.current) {
        setError(failure?.message || 'Marketplace terms could not be saved. Please retry.');
        setLoading(false);
      }
      return;
    }
    if (session !== sessionRef.current) return;
    setAgreed(false);
    try {
      await onUpdated();
    } catch {
      if (session === sessionRef.current) setError('Terms were saved, but eligibility could not refresh. Please retry.');
    } finally {
      if (session === sessionRef.current) setLoading(false);
    }
  }, [agreed, loading, onUpdated, terms, termsHref]);

  const role = String(access.role_code || '').toUpperCase();
  const identityRoute = identityRoutes[role];
  const needsMobile = blocked.some(row => row.code === 'MOBILE_UNVERIFIED');
  const needsProfile = blocked.some(row => ['ONBOARDING_INCOMPLETE', 'IDENTITY_UNVERIFIED', 'AGE_ASSURANCE_REQUIRED'].includes(row.code));

  return <View style={styles.container}>
    {needsMobile ? <Button mode="outlined" icon="cellphone-check" onPress={() => router.push('/mobile-verify' as any)} contentStyle={styles.touch}>Verify mobile number</Button> : null}
    {needsProfile && identityRoute ? <Button mode="outlined" icon="account-check-outline" onPress={() => router.push(identityRoute as any)} contentStyle={styles.touch}>Complete role profile and verification</Button> : null}
    {needsTerms ? <View style={styles.terms}>
      <Text style={styles.body}>Marketplace participation requires acceptance of the current terms{terms ? ` (version ${terms.version})` : ''}.</Text>
      {terms && !termsHref ? <Text accessibilityRole="alert" style={styles.error}>The current terms link is unavailable. Acceptance is disabled until it can be verified.</Text> : null}
      <Button mode="outlined" icon="open-in-new" disabled={!termsHref || loading} onPress={() => termsHref && void Linking.openURL(termsHref).catch(() => setError('Unable to open the current terms. Check your connection and retry.'))} contentStyle={styles.touch}>Read marketplace terms</Button>
      <Checkbox.Item label="I have read and agree to the current marketplace terms" status={agreed ? 'checked' : 'unchecked'} onPress={() => setAgreed(!agreed)} disabled={!terms?.version || !termsHref || loading} />
      <Button mode="contained" disabled={!agreed || !terms?.version || !termsHref || loading} loading={loading} onPress={() => void accept()} contentStyle={styles.touch}>Accept marketplace terms</Button>
      {!terms || !termsHref ? <Button mode="text" onPress={() => setTermsRetry(value => value + 1)} disabled={loading}>Retry loading current terms</Button> : null}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: space.sm },
  terms: { gap: space.sm },
  body: { color: colors.textSecondary, lineHeight: 20 },
  touch: { minHeight: touch.min },
  error: { color: colors.status.red.fg },
});
