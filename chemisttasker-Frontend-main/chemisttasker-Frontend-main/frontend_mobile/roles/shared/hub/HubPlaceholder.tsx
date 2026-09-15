import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

export default function HubPlaceholder() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.center}>
        <Text variant="titleMedium">Hub</Text>
        <Text variant="bodyMedium" style={styles.sub}>
          Hub will live here. Coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  sub: { color: '#6B7280' },
});
