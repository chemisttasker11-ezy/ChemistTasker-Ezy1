import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthLayoutProps = {
  title: string;
  children: React.ReactNode;
  showTitle?: boolean;
};

export default function AuthLayout({ title, children, showTitle = true }: AuthLayoutProps) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const driftAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const swayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(driftAnim, { toValue: 1, duration: 6000, useNativeDriver: true }),
        Animated.timing(driftAnim, { toValue: 0, duration: 6000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 28000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, { toValue: 1, duration: 7000, useNativeDriver: true }),
        Animated.timing(swayAnim, { toValue: 0, duration: 7000, useNativeDriver: true }),
      ])
    ).start();
  }, [floatAnim, driftAnim, spinAnim, swayAnim]);

  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const driftX = driftAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const swayY = swayAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 14] });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <LinearGradient colors={['#f7f9fb', '#eef1f7']} style={StyleSheet.absoluteFillObject} />
      <Animated.View
        style={[
          styles.network,
          { transform: [{ rotate: spin }, { translateY: swayY }], pointerEvents: 'none' },
        ]}
      >
        <View style={[styles.node, styles.nodeOne]} />
        <View style={[styles.node, styles.nodeTwo]} />
        <View style={[styles.node, styles.nodeThree]} />
        <View style={[styles.node, styles.nodeFour]} />
        <View style={[styles.line, styles.lineOne]} />
        <View style={[styles.line, styles.lineTwo]} />
        <View style={[styles.line, styles.lineThree]} />
      </Animated.View>
      <Animated.View style={[styles.blob, styles.blobOne, { transform: [{ translateY: floatY }] }]} />
      <Animated.View style={[styles.blob, styles.blobTwo, { transform: [{ translateX: driftX }] }]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Surface style={styles.card} elevation={2}>
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
    backgroundColor: '#f7f9fb',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 18,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  title: {
    fontWeight: '700',
    marginBottom: 12,
    color: '#0f172a',
    textAlign: 'center',
  },
  content: {
    gap: 12,
  },
  blob: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 999,
    opacity: 0.12,
  },
  blobOne: {
    backgroundColor: '#a5b4fc',
    top: -40,
    right: -50,
  },
  blobTwo: {
    backgroundColor: '#fbbf24',
    bottom: -50,
    left: -40,
  },
  network: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.16,
  },
  node: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#00a99d',
  },
  nodeOne: {
    top: '18%',
    left: '20%',
  },
  nodeTwo: {
    top: '30%',
    right: '18%',
  },
  nodeThree: {
    bottom: '22%',
    left: '30%',
  },
  nodeFour: {
    bottom: '18%',
    right: '28%',
  },
  line: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#00a99d',
    opacity: 0.35,
  },
  lineOne: {
    width: 200,
    top: '24%',
    left: '28%',
    transform: [{ rotate: '16deg' }],
  },
  lineTwo: {
    width: 240,
    bottom: '28%',
    right: '22%',
    transform: [{ rotate: '-12deg' }],
  },
  lineThree: {
    width: 160,
    top: '52%',
    left: '42%',
    transform: [{ rotate: '34deg' }],
  },
});
