import React, { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Button, Card, Chip, Text, TextInput } from 'react-native-paper';
import { claimOnboarding, getPharmacyClaims } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { ContentState } from '@/components/ui/ContentState';
import { colors, space } from '@/constants/tokens';
import { getClaimableOrganizations, validatePharmacyClaimEmail } from '@/roles/shared/pharmacies/organizationClaims';

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
  const organizations = getClaimableOrganizations(user);
  const [chosenOrganizationId, setChosenOrganizationId] = useState<number | null>(null);
  // Multi-org accounts must choose deliberately; never silently send a claim
  // for a different organisation from the one whose history is displayed.
  const organizationId = organizations.length === 1
    ? organizations[0].id
    : (organizations.some(item => item.id === chosenOrganizationId) ? chosenOrganizationId : null);
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
    setClaims([]);
    if (organizationId == null) {
      setClaims([]);
      setLoading(false);
      return;
    }
    try {
      const scoped: Claim[] = [];
      let page = 1;
      while (page <= 50) {
        if (request !== currentRequest.current) return;
        const response: any = await getPharmacyClaims({ organization: organizationId, page });
        const all = Array.isArray(response?.results) ? response.results : Array.isArray(response) ? response : [];
        // Defensive scope filtering; backend is still the authorization authority.
        scoped.push(...all.filter((row: any) => {
          const value = row.organization;
          const id = typeof value === 'object' ? value?.id : value;
          return Number(id) === organizationId;
        }));
        if (!response?.next) break;
        page += 1;
      }
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

  const sendClaim = async (targetId: number, targetEmail: string) => {
    if (submittingRef.current || organizationId !== targetId) return;
    submittingRef.current = true;
    setSubmitting(true);
    setNotice(null);
    try {
      const result: any = await claimOnboarding({ pharmacy_email: targetEmail, organization_id: targetId });
      setEmail('');
      // The existing backend creates a new placeholder pharmacy and sends an
      // invitation when the email is unknown; no owner approval occurs then.
      if (result?.pharmacy_admin_id != null && result?.pharmacy != null) {
        setNotice('New pharmacy entry created and an invitation sent to its contact.');
      } else if (result?.status === 'ACCEPTED') {
        setNotice('This pharmacy is already linked to your organisation.');
      } else {
        setNotice('Claim requested. The pharmacy owner can review it.');
      }
      await load();
    } catch (failure: any) {
      const response = failure?.response?.data;
      setFormError(response?.detail || response?.pharmacy_email?.[0] || failure?.message || 'Claim submission failed.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const submit = () => {
    if (submittingRef.current || organizationId == null) return;
    const validation = validatePharmacyClaimEmail(email);
    setFormError(validation);
    if (validation) return;
    const targetId = organizationId;
    const targetEmail = email.trim();
    Alert.alert(
      'Request or invite pharmacy?',
      'If the email belongs to an existing pharmacy, its owner will review the claim. If it is new to ChemistTasker, a pharmacy entry and account invitation will be created immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => void sendClaim(targetId, targetEmail) },
      ],
    );
  };

  if (organizations.length === 0) {
    return <ContentState kind="forbidden" title="Claim authority required" description="Only an authorised organisation administrator can claim a pharmacy." />;
  }

  const pending = claims.filter(item => item.status === 'PENDING').length;
  const accepted = claims.filter(item => item.status === 'ACCEPTED').length;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <Text variant="headlineSmall" style={styles.title}>Claim a pharmacy</Text>
        <Text style={styles.subtitle}>Existing pharmacies request owner approval. An email not registered on ChemistTasker creates a new pharmacy entry and sends an invitation immediately.</Text>
      </View>
      {organizations.length > 1 ? <Card mode="outlined" style={styles.card}><Card.Content style={styles.cardContent}>
        <Text style={styles.label}>Choose organisation</Text>
        <View style={styles.counts}>{organizations.map(item => <Chip key={item.id} selected={organizationId === item.id} onPress={() => {
          currentRequest.current += 1;
          setChosenOrganizationId(item.id);
          setClaims([]);
          setNotice(null);
          setFormError(null);
          setEmail('');
        }}>{item.label}</Chip>)}</View>
        {organizationId == null ? <Text style={styles.subtitle}>Select the organisation that will make this request.</Text> : null}
      </Card.Content></Card> : null}
      <Card mode="outlined" style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <Text variant="titleMedium" style={styles.label}>New request</Text>
          <TextInput mode="outlined" label="Pharmacy email" value={email} onChangeText={value => { setEmail(value); setFormError(null); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address" editable={!submitting && organizationId != null} maxLength={254} error={!!formError} accessibilityLabel="Pharmacy email address" />
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          {notice ? <Text style={styles.success}>{notice}</Text> : null}
          <Button mode="contained" loading={submitting} disabled={submitting || organizationId == null} onPress={submit} contentStyle={styles.button}>Request or invite pharmacy</Button>
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
          {expanded && organizationId != null ? (
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
