import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Button, Dialog, PaperProvider, Portal, Text } from 'react-native-paper';
import crashlytics from '@react-native-firebase/crashlytics';
import * as Updates from 'expo-updates';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { WorkspaceProvider } from '../context/WorkspaceContext';
import { theme } from '../constants/theme';
import OfflineBanner from '../components/OfflineBanner';
import '../config/api'; // Configure shared-core on app load
import { getOwnerSetupStatus, ownerSetupPaths } from '../utils/ownerSetup';
import { initializeMobileSslPinning } from '../utils/sslPinning';
import { UnsavedChangesDialogProvider } from '../roles/shared/forms/UnsavedChangesDialogProvider';
import { UnsavedChangesRegistryProvider } from '../roles/shared/forms/UnsavedChangesRegistryProvider';
import { decideAppUpdate, fetchMobileAppConfig, getInstalledAppVersion } from '../utils/appUpdates';

const ORG_ROLES = new Set(['ORGANIZATION', 'ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN']);

function hasOrganizationAccess(user: any) {
  const role = String(user?.role || '').toUpperCase();
  if (ORG_ROLES.has(role)) return true;
  return Array.isArray(user?.memberships) && user.memberships.some((membership: any) => {
    const membershipRole = String(membership?.role || '').toUpperCase();
    return ORG_ROLES.has(membershipRole);
  });
}

function hasAdminAccess(user: any) {
  return Array.isArray(user?.admin_assignments) && user.admin_assignments.length > 0;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('Unhandled error', error, info);
    try {
      const err = error instanceof Error ? error : new Error(String(error));
      const stack = (info as { componentStack?: string })?.componentStack;
      crashlytics().recordError(err);
      if (stack) {
        crashlytics().setAttribute('componentStack', stack);
      }
    } catch {
      // ignore crash reporting errors
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaProvider>
          <SafeAreaView
            style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}
            edges={['top', 'left', 'right']}
          >
            <StatusBar barStyle="dark-content" />
            <PaperProvider theme={theme}>
              <Stack screenOptions={{ headerShown: false }} />
            </PaperProvider>
          </SafeAreaView>
        </SafeAreaProvider>
      );
    }
    return this.props.children;
  }
}

function UpdatePrompt() {
  const [mode, setMode] = useState<'none' | 'store-required' | 'store-optional' | 'ota'>('none');
  const [visible, setVisible] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');
  const dismissedForSessionRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__) {
      return;
    }

    let active = true;

    const checkForUpdate = async () => {
      try {
        const installedVersion = getInstalledAppVersion();
        const appConfig = await fetchMobileAppConfig();
        const nextDecision = decideAppUpdate(appConfig, installedVersion);

        if (!active) return;

        if (nextDecision.type === 'store-required') {
          setMode('store-required');
          setStoreUrl(nextDecision.storeUrl);
          setVisible(true);
          return;
        }

        if (!Updates.isEnabled || dismissedForSessionRef.current) {
          if (nextDecision.type === 'store-optional' && !dismissedForSessionRef.current) {
            setMode('store-optional');
            setStoreUrl(nextDecision.storeUrl);
            setVisible(true);
            return;
          }
        } else {
          const result = await Updates.checkForUpdateAsync();
          if (result.isAvailable) {
            setMode('ota');
            setStoreUrl('');
            setVisible(true);
            return;
          }
        }

        if (nextDecision.type === 'store-optional' && !dismissedForSessionRef.current) {
          setMode('store-optional');
          setStoreUrl(nextDecision.storeUrl);
          setVisible(true);
          return;
        }

        setVisible(false);
        setMode('none');
      } catch (error) {
        console.warn('Failed to check for app updates', error);
      }
    };

    void checkForUpdate();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void checkForUpdate();
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const applyUpdate = async () => {
    if (mode === 'store-required' || mode === 'store-optional') {
      if (!storeUrl) return;
      const canOpen = await Linking.canOpenURL(storeUrl);
      if (canOpen) {
        await Linking.openURL(storeUrl);
      }
      return;
    }

    setIsApplying(true);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (error) {
      console.warn('Failed to apply OTA update', error);
      setIsApplying(false);
    }
  };

  if (Platform.OS === 'web' || !visible) {
    return null;
  }

  return (
    <Portal>
      <Dialog
        dismissable={mode !== 'store-required' && !isApplying}
        visible={visible}
        onDismiss={() => mode !== 'store-required' && !isApplying && setVisible(false)}
      >
        <Dialog.Title>{mode === 'store-required' ? 'Update required' : 'Update available'}</Dialog.Title>
        <Dialog.Content>
          <Text>
            {mode === 'store-required'
              ? 'A newer version of the app is required to continue. Press Update to open the latest store version.'
              : mode === 'store-optional'
                ? 'A newer app build is available in the store. Press Update to install the latest version.'
                : 'A new update is available. Press Update to get the latest version.'}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          {mode !== 'store-required' ? (
            <Button
              disabled={isApplying}
              onPress={() => {
                dismissedForSessionRef.current = true;
                setVisible(false);
              }}
            >
              Later
            </Button>
          ) : null}
          <Button loading={isApplying && mode === 'ota'} mode="contained" onPress={applyUpdate}>
            Update
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { user, isLoading } = useAuth();

  const getRoleHome = (role?: string | null) => {
    const normalized = String(role || '').toUpperCase();
    if (ORG_ROLES.has(normalized)) {
      return '/organization/dashboard';
    }
    switch (normalized) {
      case 'OWNER':
        return '/owner/dashboard';
      case 'PHARMACIST':
        return '/pharmacist/dashboard';
      case 'OTHER_STAFF':
        return '/otherstaff/dashboard';
      case 'EXPLORER':
        return '/explorer/dashboard';
      default:
        return '/login';
    }
  };

  useEffect(() => {
    if (isLoading) return;
    const top = segments[0];
    const segmentList = segments as readonly string[];
    const second = segmentList[1];
    const publicRoutes = new Set(['login', 'register', 'welcome', 'verify-otp', 'forgot-password', 'reset-password', 'mobile-verify', 'index', 'contact']);
    const isPublic = publicRoutes.has(top ?? '');
    const allowAuthenticatedAccess = new Set(['contact', 'reset-password']);
    const isSharedAuthenticatedRoute = allowAuthenticatedAccess.has(top ?? '');
    const isOwnerSetupRoute = top === 'setup' && second === 'owner';
    const expectedTopByRole: Record<string, string> = {
      OWNER: 'owner',
      PHARMACIST: 'pharmacist',
      OTHER_STAFF: 'otherstaff',
      EXPLORER: 'explorer',
      ORGANIZATION: 'organization',
      ORG_ADMIN: 'organization',
      ORG_OWNER: 'organization',
      ORG_STAFF: 'organization',
      CHIEF_ADMIN: 'organization',
      REGION_ADMIN: 'organization',
    };

    let active = true;
    const runGate = async () => {
      if (user && !user.is_mobile_verified) {
        if (top !== 'mobile-verify') {
          router.replace('/mobile-verify' as any);
        }
        return;
      }

      if (user && isPublic && !isSharedAuthenticatedRoute) {
        if (hasOrganizationAccess(user)) {
          router.replace('/organization/dashboard' as any);
          return;
        }
        if (String(user.role || '').toUpperCase() === 'OWNER') {
          const status = await getOwnerSetupStatus(user);
          if (active) {
            router.replace((status.nextPath || ownerSetupPaths.dashboard) as any);
          }
          return;
        }

        router.replace(getRoleHome(user.role) as any);
        return;
      }

      if (user && top) {
        if (isSharedAuthenticatedRoute) {
          return;
        }

        const normalizedRole = String(user.role || '').toUpperCase();

        if (top === 'admin' && hasAdminAccess(user)) {
          return;
        }

        if (hasOrganizationAccess(user)) {
          if (top !== 'organization') {
            router.replace('/organization/dashboard' as any);
          }
          return;
        }

        if (normalizedRole === 'OWNER') {
          const status = await getOwnerSetupStatus(user);
          if (!active) return;

          if (isOwnerSetupRoute) {
            if (status.nextPath && status.nextPath !== `/${segments.join('/')}`) {
              router.replace(status.nextPath as any);
              return;
            }
            if (!status.nextPath) {
              router.replace(ownerSetupPaths.dashboard as any);
            }
            return;
          }

          if (top !== 'owner') {
            router.replace((status.nextPath || ownerSetupPaths.dashboard) as any);
            return;
          }

          if (status.nextPath) {
            router.replace(status.nextPath as any);
            return;
          }

          return;
        }

        if (top === 'setup') {
          router.replace(getRoleHome(user.role) as any);
          return;
        }

        const expectedTop = expectedTopByRole[normalizedRole];
        if (expectedTop && top !== expectedTop) {
          router.replace(getRoleHome(user.role) as any);
          return;
        }
      }

      if (!user && !isPublic) {
        router.replace('/login');
      }
    };

    void runGate();
    return () => {
      active = false;
    };
  }, [isLoading, segments, router, user]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    void initializeMobileSslPinning();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['left', 'right']}>
          <StatusBar barStyle="dark-content" />
          <PaperProvider theme={theme}>
            <UnsavedChangesDialogProvider>
              <UnsavedChangesRegistryProvider>
                <AuthProvider>
                  <WorkspaceProvider>
                    <AuthGate />
                    <UpdatePrompt />
                    <OfflineBanner />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        gestureEnabled: true,
                        animation: 'slide_from_right',
                      }}
                    />
                  </WorkspaceProvider>
                </AuthProvider>
              </UnsavedChangesRegistryProvider>
            </UnsavedChangesDialogProvider>
          </PaperProvider>
        </SafeAreaView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
