import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useNetInfo } from '@react-native-community/netinfo';
import { brandColors } from '@/constants/theme';

export default function OfflineBanner() {
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

  if (!isOffline) return null;

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Icon source="wifi-off" size={16} color="#8C5B17" />
      <Text style={styles.text}>Offline. Some actions will resume when your connection returns.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 36,
    backgroundColor: brandColors.warningSoft,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1DFBC',
  },
  text: {
    color: '#7A5018',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
});
