import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { colors, radius, space, touch } from '@/constants/tokens';

/** Device permission is not a server-side communications preference. Never simulate a mute toggle. */
export default function AppPreferencesScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const permission = await Notifications.getPermissionsAsync();
      const granted = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      setStatus(granted ? 'Allowed' : permission.canAskAgain ? 'Not enabled' : 'Blocked by device settings');
    } catch (failure: any) {
      setError(failure?.message || 'Unable to read notification permissions.');
      setStatus(null);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const openDeviceSettings = async () => {
    setError('');
    try { await Linking.openSettings(); }
    catch (failure: any) { setError(failure?.message || 'Unable to open device settings.'); }
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text variant="headlineSmall" style={styles.title}>App preferences</Text>
    <Text style={styles.subtitle}>Choose how ChemistTasker works with notifications and communication on this device.</Text>
    <Card mode="outlined" style={styles.card}><Card.Content style={styles.cardContent}>
      <Text variant="titleMedium">Push notifications</Text>
      <Text style={styles.subtitle}>Delivery is controlled by your phone's permissions. This setting is separate from email and in-app messages.</Text>
      <View style={styles.row}>
        <Text style={styles.statusLabel}>Device permission</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.status}>{status ?? 'Unknown'}</Text>}
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button mode="contained-tonal" icon="cog" onPress={() => void openDeviceSettings()} contentStyle={styles.action}>Open device notification settings</Button>
      <Button mode="text" onPress={() => void refresh()}>Refresh permission status</Button>
    </Card.Content></Card>
    <Card mode="outlined" style={styles.card}><Card.Content style={styles.cardContent}>
      <Text variant="titleMedium">In-app messages and alerts</Text>
      <Text style={styles.subtitle}>Review shift, booking and other in-app notifications. Device notification permission does not delete or silence your in-app notification history.</Text>
      <Button mode="outlined" icon="bell-outline" onPress={() => router.push('/notifications' as any)} contentStyle={styles.action}>Open notifications</Button>
      <Button mode="outlined" icon="message-text-outline" onPress={() => router.push('/contact' as any)} contentStyle={styles.action}>Contact support</Button>
    </Card.Content></Card>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.lg },
  title: { color: colors.textPrimary, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, lineHeight: 21 },
  card: { backgroundColor: colors.surfaceBg, borderColor: colors.border, borderRadius: radius.card },
  cardContent: { gap: space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  statusLabel: { color: colors.textSecondary },
  status: { fontWeight: '700', color: colors.textPrimary },
  error: { color: colors.status.red.fg },
  action: { minHeight: touch.min },
});
