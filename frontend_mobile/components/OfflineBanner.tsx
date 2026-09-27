import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useNetInfo } from '@react-native-community/netinfo';

export default function OfflineBanner() {
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

  if (!isOffline) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Icon source="wifi-off" size={20} color="#7C2D12" />
      <Text style={styles.text}>You&apos;re offline. Some features are unavailable until your connection returns.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '700',
  },
});
