import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { brandColors } from '@/constants/theme';

type AuthLayoutProps = {
  title: string;
  children: React.ReactNode;
  showTitle?: boolean;
};

export default function AuthLayout({ title, children, showTitle = true }: AuthLayoutProps) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <LinearGradient
        colors={['#FFFFFF', brandColors.mist, '#F3F0FB']}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={styles.brandOrbPrimary} />
      <View pointerEvents="none" style={styles.brandOrbCyan} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandMark}>
            <View style={[styles.brandDot, { backgroundColor: brandColors.navy }]} />
            <View style={[styles.brandDot, { backgroundColor: brandColors.purple }]} />
            <View style={[styles.brandDot, { backgroundColor: brandColors.magenta }]} />
            <View style={[styles.brandDot, { backgroundColor: brandColors.cyan }]} />
          </View>
          <Surface style={styles.card} elevation={1}>
            {showTitle ? (
              <Text variant="headlineSmall" style={styles.title}>
                {title}
              </Text>
            ) : null}
            <View style={styles.content}>{children}</View>
          </Surface>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brandColors.mist,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 32,
  },
  brandMark: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 7,
    marginBottom: 18,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  card: {
    borderRadius: 20,
    padding: 22,
    backgroundColor: brandColors.white,
    borderWidth: 1,
    borderColor: brandColors.border,
  },
  title: {
    fontWeight: '900',
    marginBottom: 16,
    color: brandColors.navy,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  content: {
    gap: 12,
  },
  brandOrbPrimary: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#F0EAFF',
    top: -110,
    right: -90,
    opacity: 0.72,
  },
  brandOrbCyan: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#E5FBFD',
    bottom: -95,
    left: -80,
    opacity: 0.72,
  },
});
