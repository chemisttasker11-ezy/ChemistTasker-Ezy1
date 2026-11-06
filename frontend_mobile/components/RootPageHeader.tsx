import React, { useCallback, useRef } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { ScalePressable } from '@/components/ui';
import { colors, radius, touch } from '@/constants/tokens';
import { useGuardedNavigation } from '@/roles/shared/forms/UnsavedChangesRegistryProvider';
import { getRoleHome, resolveInitialWorkspace } from '@/utils/mobilePersona';

export async function executeRootBack(
  router: { canGoBack: () => boolean; back: () => void; replace: (href: any) => void },
  user: any,
  userRef?: { current: any },
  signedOutFallback = '/welcome'
) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  const initialKey = user ? String(user.id ?? user.email ?? user.username ?? '') : '';
  if (!user) {
    router.replace(signedOutFallback as any);
    return;
  }
  try {
    const destination = await resolveInitialWorkspace(user);
    const currentUser = userRef ? userRef.current : user;
    const currentKey = currentUser ? String(currentUser.id ?? currentUser.email ?? currentUser.username ?? '') : '';
    if (currentUser && currentKey !== initialKey) {
      return;
    }
    if (!currentUser) {
      router.replace(signedOutFallback as any);
      return;
    }
    router.replace(destination as any);
  } catch {
    const currentUser = userRef ? userRef.current : user;
    const currentKey = currentUser ? String(currentUser.id ?? currentUser.email ?? currentUser.username ?? '') : '';
    if (currentUser && currentKey !== initialKey) {
      return;
    }
    if (!currentUser) {
      router.replace(signedOutFallback as any);
      return;
    }
    router.replace(getRoleHome(currentUser.role) as any);
  }
}

export type UseRootBackActionOptions = {
  active?: boolean;
  disabled?: boolean;
  signedOutFallback?: string;
};

export function useRootBackAction({
  active = true,
  disabled = false,
  signedOutFallback = '/welcome',
}: UseRootBackActionOptions = {}) {
  const router = useRouter();
  const { user } = useAuth();
  const guardedNavigation = useGuardedNavigation();
  const userRef = useRef(user);
  userRef.current = user;

  const handleBack = useCallback(() => {
    if (disabled) {
      return;
    }
    guardedNavigation(() => {
      void executeRootBack(router, user, userRef, signedOutFallback);
    });
  }, [disabled, guardedNavigation, router, user, signedOutFallback]);

  useFocusEffect(
    useCallback(() => {
      if (!active) {
        return;
      }
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (disabled) {
          return true;
        }
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [active, disabled, handleBack])
  );

  return { handleBack };
}

export type RootPageHeaderProps = {
  title: string;
  signedOutFallback?: string;
  disabled?: boolean;
};

export function RootPageHeader({
  title,
  signedOutFallback = '/welcome',
  disabled = false,
}: RootPageHeaderProps) {
  const { handleBack } = useRootBackAction({
    active: true,
    disabled,
    signedOutFallback,
  });

  return (
    <Stack.Screen
      options={{
        headerShown: true,
        title,
        gestureEnabled: !disabled,
        headerLeft: () => (
          <ScalePressable
            pressBg
            disabled={disabled}
            aria-disabled={disabled}
            accessibilityState={{ disabled }}
            onPress={handleBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            style={styles.backButton}
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
          </ScalePressable>
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: touch.min,
    height: touch.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
