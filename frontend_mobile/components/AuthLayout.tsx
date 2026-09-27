import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAnimationEnabled } from '@/hooks/useAnimationEnabled';

type AuthLayoutProps = {
  title: string;
  children: React.ReactNode;
  showTitle?: boolean;
};

export default function AuthLayout({ title, children, showTitle = true }: AuthLayoutProps) {
  const animationEnabled = useAnimationEnabled();
  const networkMotion = useRef(new Animated.Value(0)).current;
  const ambientMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    networkMotion.stopAnimation();
    ambientMotion.stopAnimation();

    if (!animationEnabled) {
      networkMotion.setValue(0);
      ambientMotion.setValue(0);
      return;
    }

    const networkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(networkMotion, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(networkMotion, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    const ambientLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientMotion, {
          toValue: 1,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(ambientMotion, {
          toValue: 0,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );

    networkLoop.start();
    ambientLoop.start();
    return () => {
      networkLoop.stop();
      ambientLoop.stop();
    };
  }, [ambientMotion, animationEnabled, networkMotion]);

  const networkRotate = networkMotion.interpolate({
    inputRange: [0, 1],
    outputRange: ['-1.5deg', '1.5deg'],
  });
  const networkY = networkMotion.interpolate({ inputRange: [0, 1], outputRange: [-3, 5] });
  const blobOneY = ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const blobTwoX = ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <LinearGradient colors={['#f7f9fb', '#eef1f7']} style={StyleSheet.absoluteFillObject} />
      <Animated.View
        style={[styles.network, { transform: [{ translateY: networkY }, { rotate: networkRotate }] }]}
        pointerEvents="none"
      >
        <View style={[styles.node, styles.nodeOne]} />
        <View style={[styles.node, styles.nodeTwo]} />
        <View style={[styles.node, styles.nodeThree]} />
        <View style={[styles.node, styles.nodeFour]} />
        <View style={[styles.line, styles.lineOne]} />
        <View style={[styles.line, styles.lineTwo]} />
        <View style={[styles.line, styles.lineThree]} />
      </Animated.View>
      <Animated.View style={[styles.blob, styles.blobOne, { transform: [{ translateY: blobOneY }] }]} pointerEvents="none" />
      <Animated.View style={[styles.blob, styles.blobTwo, { transform: [{ translateX: blobTwoX }] }]} pointerEvents="none" />

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
