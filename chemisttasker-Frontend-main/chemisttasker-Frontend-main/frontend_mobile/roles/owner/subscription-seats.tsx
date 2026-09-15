import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, HelperText, Surface, Text, TextInput } from 'react-native-paper';
import { createSubscriptionCheckout } from '@chemisttasker/shared-core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import apiClient from '../../utils/apiClient';

type SubscriptionState = {
  active: boolean;
  status: string;
  staffCount: number;
  extraSeatCount: number;
  accountName?: string;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
};

const defaultSubscription: SubscriptionState = {
  active: false,
  status: 'inactive',
  staffCount: 5,
  extraSeatCount: 0,
  accountName: '',
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
};

export default function OwnerSubscriptionSeatsScreen() {
  const router = useRouter();
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const [subscription, setSubscription] = useState<SubscriptionState>(defaultSubscription);
  const [targetStaffCount, setTargetStaffCount] = useState('5');
  const [targetExtraSeats, setTargetExtraSeats] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data }: any = await apiClient.get('/billing/subscription/');
      const nextState: SubscriptionState = {
        active: !!data?.active,
        status: data?.status || 'inactive',
        staffCount: data?.staffCount ?? 5,
        extraSeatCount: data?.extraSeatCount ?? 0,
        accountName: data?.accountName ?? '',
        stripeSubscriptionId: data?.stripeSubscriptionId ?? null,
        currentPeriodEnd: data?.currentPeriodEnd ?? null,
      };
      setSubscription(nextState);
      setTargetStaffCount(String(Math.max(nextState.staffCount, 5)));
      setTargetExtraSeats(String(Math.max(nextState.extraSeatCount, 0)));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load subscription.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  useEffect(() => {
    if (!checkout) return;

    if (checkout === 'success') {
      Alert.alert('Subscription', 'Stripe checkout completed. Refreshing your subscription now.');
      void loadSubscription();
    } else if (checkout === 'cancel') {
      Alert.alert('Subscription', 'Stripe checkout was cancelled.');
    } else if (checkout === 'seat_success') {
      Alert.alert('Extra seats', 'Stripe checkout completed. Refreshing your subscription now.');
      void loadSubscription();
    } else if (checkout === 'seat_cancel') {
      Alert.alert('Extra seats', 'Stripe checkout was cancelled.');
    }

    router.replace('/owner/subscription-seats' as any);
  }, [checkout, loadSubscription, router]);

  const parsedTarget = Math.max(parseInt(targetStaffCount || '5', 10) || 5, 5);
  const parsedExtraSeats = Math.max(parseInt(targetExtraSeats || '0', 10) || 0, 0);
  const monthlyTotal = useMemo(
    () => 30 + (subscription.active ? parsedExtraSeats : 0) * 5,
    [parsedExtraSeats, parsedTarget, subscription.active],
  );
  const periodText = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : 'Not available yet';

  const handleStartSubscription = async () => {
    setSaving(true);
    try {
      const res: any = await createSubscriptionCheckout({
        staffCount: 5,
        paymentMethod: 'card',
        platform: 'mobile',
      } as any);
      if (res?.url) {
        await Linking.openURL(res.url);
      } else if (res?.message) {
        Alert.alert('Subscription', res.message);
        await loadSubscription();
      } else {
        Alert.alert('Error', 'Unexpected response from server.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to start subscription.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSeats = async () => {
    const desiredStaffCount = 5 + parsedExtraSeats;
    if (desiredStaffCount === subscription.staffCount) {
      Alert.alert('No changes', 'No seat change detected.');
      return;
    }
    setSaving(true);
    try {
      const { data }: any = await apiClient.post('/billing/subscription/seats/', {
        staff_count: desiredStaffCount,
        platform: 'mobile',
      });
      if (data?.url) {
        await Linking.openURL(data.url);
      } else {
        Alert.alert('Updated', data?.message || 'Redirecting to Stripe checkout.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to update seats.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading subscription...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <HelperText type="error">{error}</HelperText> : null}

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              Subscription and seats
            </Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              {subscription.active
                ? 'Your owner subscription is active. Add or reduce extra seats below.'
                : 'You do not have an active owner subscription yet. Start the subscription first, then manage extra seats here.'}
            </Text>
          </Card.Content>
        </Card>

        {subscription.active ? (
          <>
            <Surface style={styles.summary}>
              <Text variant="labelLarge" style={styles.summaryLabel}>Status</Text>
              <Text variant="titleMedium" style={styles.summaryValue}>{subscription.status}</Text>
              <Text variant="bodySmall" style={styles.summaryMeta}>Billing account: {subscription.accountName || 'Owner account'}</Text>
              <Text variant="bodySmall" style={styles.summaryMeta}>Current seats: {subscription.staffCount}</Text>
              <Text variant="bodySmall" style={styles.summaryMeta}>Extra seats: {subscription.extraSeatCount}</Text>
              <Text variant="bodySmall" style={styles.summaryMeta}>Next period end: {periodText}</Text>
            </Surface>

            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>Add seats</Text>
                <Text variant="bodySmall" style={styles.sectionCopy}>
                  Base subscription includes 5 seats. Each extra seat is billed at $5 per month.
                </Text>
                <TextInput
                  mode="outlined"
                  label="Extra seats"
                  keyboardType="numeric"
                  value={targetExtraSeats}
                  onChangeText={setTargetExtraSeats}
                  style={styles.input}
                />
                <Text variant="bodyMedium" style={styles.totalText}>New monthly total: ${monthlyTotal} AUD</Text>
                <Button mode="contained" onPress={handleUpdateSeats} loading={saving} disabled={saving || parsedExtraSeats < 1}>
                  Buy extra seats
                </Button>
                <Button mode="text" onPress={() => void loadSubscription()} disabled={saving}>
                  Refresh status
                </Button>
              </Card.Content>
            </Card>
          </>
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>Start subscription</Text>
              <Text variant="bodySmall" style={styles.sectionCopy}>
                Start the fixed owner subscription first. It includes 5 seats for $30/month. Extra seats are purchased later as a separate add-on.
              </Text>
              <Text variant="bodyMedium" style={styles.totalText}>Monthly total: ${monthlyTotal} AUD</Text>
              <Button mode="contained" onPress={handleStartSubscription} loading={saving} disabled={saving}>
                Subscribe with card
              </Button>
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280' },
  card: { borderRadius: 16, backgroundColor: '#FFFFFF' },
  title: { fontWeight: '700', color: '#111827' },
  subtitle: { color: '#6B7280', marginTop: 8 },
  sectionTitle: { fontWeight: '700', color: '#111827', marginBottom: 8 },
  sectionCopy: { color: '#6B7280', marginBottom: 16 },
  input: { marginBottom: 16 },
  totalText: { color: '#111827', fontWeight: '700', marginBottom: 16 },
  summary: { borderRadius: 16, padding: 16, backgroundColor: '#FFFFFF', elevation: 0 },
  summaryLabel: { color: '#6B7280', marginBottom: 4 },
  summaryValue: { color: '#4F46E5', fontWeight: '700', marginBottom: 8 },
  summaryMeta: { color: '#4B5563', marginBottom: 4 },
});
