import React, { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';

import { useAuth } from '@/context/AuthContext';
import apiClient from '@/utils/apiClient';

export default function KioskLinkPrompt() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    pharmacy_id?: string;
    device_name?: string;
    source?: string;
    pairing_code?: string;
  }>();
  const { user, hasCapability } = useAuth();
  const [pairingCode, setPairingCode] = useState<string | null>(
    /^\d{6}$/.test(String(params.pairing_code || '')) ? String(params.pairing_code) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pharmacyId = Number(params.pharmacy_id || 0);
  const wasExplicitlyPrompted = params.source === 'kiosk' && Number.isInteger(pharmacyId) && pharmacyId > 0;
  const normalizedRole = String(user?.role || '').toUpperCase();
  const canLink = useMemo(
    () => normalizedRole === 'OWNER'
      || user?.memberships?.some((membership) => membership.role === 'ORG_ADMIN')
      || hasCapability('MANAGE_ROSTER', pharmacyId),
    [hasCapability, normalizedRole, pharmacyId, user?.memberships],
  );

  const requestPairingCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/client-profile/attendance/kiosk/pairing/request/', {
        pharmacy_id: pharmacyId,
        device_name: params.device_name || 'Windows Pharmacy Kiosk',
      });
      setPairingCode(String(response.data?.pairing_code || ''));
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || 'Unable to create a kiosk pairing code.');
    } finally {
      setLoading(false);
    }
  };

  if (!wasExplicitlyPrompted) {
    return (
      <SafeAreaView style={styles.page}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge">Kiosk linking unavailable</Text>
            <Text style={styles.body}>Open the secure link shown by the kiosk you want to connect.</Text>
            <Button onPress={() => router.back()}>Back</Button>
          </Card.Content>
        </Card>
      </SafeAreaView>
    );
  }

  if (!canLink) {
    return (
      <SafeAreaView style={styles.page}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge">Permission required</Text>
            <Text style={styles.body}>Only an owner or authorized organization/pharmacy administrator can link this kiosk.</Text>
            <Button onPress={() => router.back()}>Back</Button>
          </Card.Content>
        </Card>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="labelLarge" style={styles.eyebrow}>Pharmacy kiosk</Text>
          <Text variant="headlineSmall">Link this device?</Text>
          <Text style={styles.body}>
            {params.device_name || 'Windows Pharmacy Kiosk'} is requesting a one-time pairing code for pharmacy #{pharmacyId}.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {pairingCode ? (
            <View style={styles.codeBox}>
              <Text variant="labelMedium">Enter this code on the kiosk</Text>
              <Text variant="displaySmall" style={styles.code}>{pairingCode}</Text>
              <Text variant="bodySmall">The code expires in 15 minutes and can be used once.</Text>
            </View>
          ) : (
            <Button mode="contained" disabled={loading} onPress={requestPairingCode}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : 'Allow and create code'}
            </Button>
          )}
          <Button onPress={() => router.back()}>Close</Button>
        </Card.Content>
      </Card>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#F5F7FA' },
  card: { borderRadius: 20 },
  body: { marginVertical: 18, color: '#4B5563', lineHeight: 22 },
  eyebrow: { color: '#4F46E5', marginBottom: 6, textTransform: 'uppercase' },
  error: { color: '#B91C1C', marginBottom: 12 },
  codeBox: { alignItems: 'center', gap: 8, padding: 18, borderRadius: 14, backgroundColor: '#EEF2FF' },
  code: { color: '#312E81', fontWeight: '800', letterSpacing: 7 },
});
