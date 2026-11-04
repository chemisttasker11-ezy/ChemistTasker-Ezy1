import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Checkbox, Text } from 'react-native-paper';
import type { MarketplaceAccess } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '@/config/api';
import { colors, space, touch } from '@/constants/tokens';

const termsUrl = 'https://www.chemisttasker.com.au/terms-of-service';
const identityRoutes: Record<string, string> = {
  OWNER: '/owner/profile-detail',
  PHARMACIST: '/pharmacist/profile-identity',
  OTHER_STAFF: '/otherstaff/profile-identity',
  EXPLORER: '/explorer/profile-identity',
  ORGANIZATION: '/organization/profile',
};

export function MarketplaceAccessResolution({
  access, onUpdated,
}: { access: MarketplaceAccess; onUpdated: () => Promise<void> }) {
  const router = useRouter();
  const blocked = access.blockers ?? [];
  const needsTerms = blocked.some(row => row.code === 'MARKETPLACE_TERMS_REQUIRED');
  const [terms, setTerms] = useState<{ version: string; accepted: boolean; terms_url: string } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!needsTerms) { setTerms(null); setAgreed(false); return; }
    let live = true;
    setTerms(null);
    setError('');
    void chemistTaskerApi.marketplace.getTerms().then(response => { if (live) setTerms(response); })
      .catch(failure => { if (live) setError(failure?.message || 'Current terms could not load.'); });
    return () => { live = false; };
  }, [needsTerms]);

  const accept = useCallback(async () => {
    if (loading || !terms || !agreed) return;
    setLoading(true); setError('');
    try {
      await chemistTaskerApi.marketplace.acceptTerms(terms.version);
      setAgreed(false);
      await onUpdated();
    } catch (failure: any) {
      setError(failure?.message || 'Marketplace terms could not be saved. Please retry.');
    } finally { setLoading(false); }
  }, [agreed, loading, onUpdated, terms]);

  const role = String(access.role_code || '').toUpperCase();
  const identityRoute = identityRoutes[role];
  const needsMobile = blocked.some(row => row.code === 'MOBILE_UNVERIFIED');
  const needsProfile = blocked.some(row => ['ONBOARDING_INCOMPLETE', 'IDENTITY_UNVERIFIED', 'AGE_ASSURANCE_REQUIRED'].includes(row.code));

  return <View style={styles.container}>
    {needsMobile ? <Button mode="outlined" icon="cellphone-check" onPress={() => router.push('/mobile-verify' as any)} contentStyle={styles.touch}>Verify mobile number</Button> : null}
    {needsProfile && identityRoute ? <Button mode="outlined" icon="account-check-outline" onPress={() => router.push(identityRoute as any)} contentStyle={styles.touch}>Complete role profile and verification</Button> : null}
    {needsTerms ? <View style={styles.terms}>
      <Text style={styles.body}>Marketplace participation requires acceptance of the current terms{terms ? ` (version ${terms.version})` : ''}.</Text>
      <Button mode="outlined" icon="open-in-new" onPress={() => void Linking.openURL(termsUrl).catch(() => setError('Unable to open terms. Check your connection or open ChemistTasker in a browser.'))} contentStyle={styles.touch}>Read marketplace terms</Button>
      <Checkbox.Item label="I have read and agree to the current marketplace terms" status={agreed ? 'checked' : 'unchecked'} onPress={() => setAgreed(!agreed)} disabled={!terms || loading} />
      <Button mode="contained" disabled={!agreed || !terms || loading} loading={loading} onPress={() => void accept()} contentStyle={styles.touch}>Accept marketplace terms</Button>
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
