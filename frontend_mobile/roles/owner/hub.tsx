import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, IconButton } from 'react-native-paper';

export default function OwnerHubScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>Pharmacy Hub</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>Manage communications and updates for your pharmacies.</Text>
      </View>
      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.cardContent}>
          <IconButton icon="account-group" size={28} iconColor="#6366F1" />
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={styles.cardTitle}>Hub coming soon</Text>
            <Text variant="bodySmall" style={styles.cardDesc}>
              This is a placeholder. Wire this to the shared hub experience once available.
            </Text>
          </View>
        </Card.Content>
      </Card>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontWeight: '700', color: '#111827' },
  subtitle: { color: '#6B7280', marginTop: 4 },
  card: { marginHorizontal: 20, marginTop: 12, borderRadius: 12 },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontWeight: '600', color: '#111827' },
  cardDesc: { color: '#6B7280', marginTop: 2 },
});
