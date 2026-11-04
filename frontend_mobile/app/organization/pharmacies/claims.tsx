import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Button, Card, Chip, Text, TextInput } from 'react-native-paper';
import { claimOnboarding, getPharmacyClaims } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { ContentState } from '@/components/ui/ContentState';
import { colors, space } from '@/constants/tokens';
import { getActiveOrganizationId, validatePharmacyClaimEmail } from '@/roles/shared/pharmacies/organizationClaims';

type Claim = {
  id: number;
  status: string;
  status_display?: string;
  pharmacy?: { name?: string; email?: string };
  created_at?: string;
  responded_at?: string | null;
  response_message?: string | null;
};

export default function OrganizationPharmacyClaimsScreen() {
  const { user } = useAuth();
  const organizationId = getActiveOrganizationId(user);
  const currentRequest = useRef(0);
  const submittingRef = useRef(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [email, setEmail] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const request = ++currentRequest.current;
    setLoading(true);
    setError(null);
    if (organizationId == null) {
      setClaims([]);
      setLoading(false);
      return;
    }
    try {
      const response = await getPharmacyClaims({ organization: organizationId });
      const all = Array.isArray((response as any)?.results)
        ? (response as any).results : Array.isArray(response) ? response : [];
      // Do not accept another organization's rows even if an upstream filter misbehaves.
      const scoped = all.filter((row: any) => {
        const value = row.organization;
        const id = typeof value === 'object' ? value?.id : value;
        return Number(id) === organizationId;
      });
      if (request === currentRequest.current) setClaims(scoped);
    } catch (failure: any) {
      if (request === currentRequest.current) setError(failure?.response?.data?.detail || failure?.message || 'Could not load claim history.');
    } finally {
      if (request === currentRequest.current) setLoading(false);
    }
  }, [organizationId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { currentRequest.current += 1; };
  }, [load]));

  const submit = async () => {
    if (submittingRef.current || organizationId == null) return;
    const validation = validatePharmacyClaimEmail(email);
    setFormError(validation);
    if (validation) return;
    submittingRef.current = true;
    setSubmitting(true);
    setNotice(null);
    try {
      await claimOnboarding({ pharmacy_email: email.trim() });
      setEmail('');
      setNotice('Claim submitted. The pharmacy owner can now review the request.');
      await load();
    } catch (failure: any) {
      const response = failure?.response?.data;
      setFormError(response?.detail || response?.pharmacy_email?.[0] || failure?.message || 'Claim submission failed.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (organizationId == null) {
    return <ContentState kind="forbidden" title="Organization access required" description="A current organization membership is required to submit pharmacy claims." />;
  }

  const pending = claims.filter(item => item.status === 'PENDING').length;
  const accepted = claims.filter(item => item.status === 'ACCEPTED').length;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <Text variant="headlineSmall" style={styles.title}>Claim a pharmacy</Text>
        <Text style={styles.subtitle}>Request access by pharmacy email. The owner decides whether to approve your request.</Text>
      </View>
      <Card mode="outlined" style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <Text variant="titleMedium" style={styles.label}>New request</Text>
          <TextInput mode="outlined" label="Pharmacy email" value={email} onChangeText={value => { setEmail(value); setFormError(null); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address" editable={!submitting} maxLength={254} error={!!formError} accessibilityLabel="Pharmacy email address" />
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          {notice ? <Text style={styles.success}>{notice}</Text> : null}
          <Button mode="contained" loading={submitting} disabled={submitting} onPress={() => void submit()} contentStyle={styles.button}>Submit claim</Button>
        </Card.Content>
      </Card>
      <Card mode="outlined" style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.headingRow}>
            <Text variant="titleMedium" style={styles.label}>Claim activity</Text>
            <Button compact onPress={() => setExpanded(!expanded)}>{expanded ? 'Hide' : 'Show'}</Button>
          </View>
          <View style={styles.counts}>
            <Chip compact>Pending {pending}</Chip>
            <Chip compact>Accepted {accepted}</Chip>
          </View>
          {expanded ? (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button mode="text" onPress={() => void load()} disabled={loading}>Refresh requests</Button>
              {loading ? <ActivityIndicator color={colors.primary} /> : error ? (
                <Button mode="outlined" onPress={() => void load()}>Try again</Button>
              ) : claims.length === 0 ? (
                <Text style={styles.subtitle}>No claim requests yet.</Text>
              ) : claims.map(item => (
                <View key={item.id} style={styles.claim}>
                  <View style={styles.headingRow}>
                    <Text style={styles.claimTitle}>{item.pharmacy?.name || 'Pharmacy'}</Text>
                    <Chip compact>{item.status_display || item.status}</Chip>
                  </View>
                  {item.pharmacy?.email ? <Text style={styles.subtitle}>{item.pharmacy.email}</Text> : null}
                  {item.created_at ? <Text style={styles.subtitle}>Requested {new Date(item.created_at).toLocaleDateString('en-AU')}</Text> : null}
                  {item.responded_at ? <Text style={styles.subtitle}>Responded {new Date(item.responded_at).toLocaleDateString('en-AU')}</Text> : null}
                  {item.response_message ? <Text style={styles.subtitle}>{item.response_message}</Text> : item.status === 'PENDING' ? <Text style={styles.subtitle}>Awaiting owner decision</Text> : null}
                </View>
              ))}
            </>
          ) : null}
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  heading: { gap: space.xs },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  title: { color: colors.textPrimary, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, lineHeight: 21 },
  card: { borderRadius: 20, borderColor: colors.border, backgroundColor: colors.surfaceBg },
  cardContent: { gap: space.md },
  label: { color: colors.textPrimary, fontWeight: '700' },
  button: { minHeight: 48 },
  counts: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  error: { color: colors.status.red.fg },
  success: { color: colors.primary },
  claim: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: space.md, gap: space.xs },
  claimTitle: { color: colors.textPrimary, fontWeight: '700', flexShrink: 1 },
});
