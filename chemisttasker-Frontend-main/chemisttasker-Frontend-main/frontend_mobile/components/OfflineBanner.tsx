import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useNetInfo } from '@react-native-community/netinfo';

export default function OfflineBanner() {
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You&apos;re offline. Some features may not work.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  text: {
    color: '#92400E',
    textAlign: 'center',
    fontSize: 12,
  },
});
