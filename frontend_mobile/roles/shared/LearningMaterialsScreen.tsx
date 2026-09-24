import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { brandColors, getPersonaPalette } from '@/constants/theme';

export default function LearningMaterialsScreen() {
  const { user } = useAuth();
  const persona = getPersonaPalette(user?.role);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: persona.soft }]}>
          <Icon source="school-outline" size={34} color={persona.accent} />
        </View>
        <Text variant="headlineSmall" style={styles.title}>Learning Materials</Text>
        <Text variant="bodyMedium" style={styles.body}>
          Learning content will appear here when the ChemistTasker learning workspace is released.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: brandColors.mist },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { color: brandColors.navy, fontWeight: '900', textAlign: 'center' },
  body: {
    color: brandColors.body,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 420,
    marginTop: 8,
  },
});
