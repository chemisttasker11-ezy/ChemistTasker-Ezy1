import React, { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { Button, Surface, Text, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import { getOwnerSetupStatus } from '../utils/ownerSetup';
import {
  authenticateWithBiometrics,
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricAvailability,
  getSavedBiometricUser,
  type BiometricUser,
} from '../utils/biometricAuth';

const ORG_ROLES = new Set(['ORGANIZATION', 'ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN']);

function hasOrganizationAccess(user: any) {
  const role = String(user?.role || '').toUpperCase();
  if (ORG_ROLES.has(role)) return true;
  return Array.isArray(user?.memberships) && user.memberships.some((membership: any) => {
    const membershipRole = String(membership?.role || '').toUpperCase();
    return ORG_ROLES.has(membershipRole);
  });
}

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { loginWithCredentials, loginWithStoredSession } = useAuth();

  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('biometrics');
  const [biometricUser, setBiometricUser] = useState<BiometricUser | null>(null);

  useEffect(() => {
    let active = true;
    const loadBiometricState = async () => {
      const [availability, savedUser] = await Promise.all([
        getBiometricAvailability(),
        getSavedBiometricUser(),
      ]);
      if (!active) return;
      setBiometricLabel(availability.label);
      setBiometricUser(availability.available ? savedUser : null);
    };
    void loadBiometricState();
    return () => {
      active = false;
    };
  }, []);

  const routeAfterLogin = async (userData: any) => {
    if (!userData.is_mobile_verified) {
      router.replace('/mobile-verify' as never);
      return;
    }

    // Organization access must win before owner setup because org accounts can still carry OWNER as their base role.
    if (hasOrganizationAccess(userData)) {
      router.replace('/organization/dashboard' as never);
    } else if (userData.role === 'OWNER') {
      const setupStatus = await getOwnerSetupStatus(userData);
      router.replace((setupStatus.nextPath || '/owner/dashboard') as never);
    } else if (userData.role === 'PHARMACIST') {
      router.replace('/pharmacist/dashboard' as never);
    } else if (userData.role === 'OTHER_STAFF') {
      router.replace('/otherstaff/dashboard' as never);
    } else if (userData.role === 'EXPLORER') {
      router.replace('/explorer' as never);
    } else {
      router.replace('/login' as never);
    }
  };

  const promptForBiometricEnable = async (userData: any) => {
    const availability = await getBiometricAvailability();
    if (!availability.available) return;

    const userLabel = userData.email || userData.username || 'this account';
    await new Promise<void>((resolve) => {
      Alert.alert(
        'Use biometrics for this account?',
        `Next time, you can sign in as ${userLabel} with ${availability.label} or your device screen lock.`,
        [
          { text: 'Not now', style: 'cancel', onPress: () => resolve() },
          {
            text: 'Enable',
            onPress: () => {
              void (async () => {
                const passed = await authenticateWithBiometrics(availability.label);
                if (passed) {
                  const nextBiometricUser = {
                    id: userData.id ?? null,
                    email: userData.email ?? null,
                    name: userData.username || userData.email || null,
                  };
                  await enableBiometricLogin(nextBiometricUser);
                  setBiometricLabel(availability.label);
                  setBiometricUser(nextBiometricUser);
                }
              })().finally(() => resolve());
            },
          },
        ],
        { onDismiss: () => resolve() }
      );
    });
  };

  const handleLogin = async () => {
    setError('');

    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const userData = await loginWithCredentials(email, password);
      if (!userData.is_mobile_verified) {
        await routeAfterLogin(userData);
        return;
      }
      await promptForBiometricEnable(userData);
      await routeAfterLogin(userData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setError('');
    setBiometricLoading(true);
    try {
      const passed = await authenticateWithBiometrics(biometricLabel);
      if (!passed) return;
      const userData = await loginWithStoredSession();
      await routeAfterLogin(userData);
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('saved session')) {
        await disableBiometricLogin();
        setBiometricUser(null);
      }
      setError(err?.message || 'Biometric sign in failed. Please sign in with your password.');
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" showTitle={false}>
      <View style={styles.logoRow}>
        <Image
          source={require('../assets/images/clipsnap-edit-6-1-2026.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      <Text variant="headlineMedium" style={styles.formTitle}>
        Welcome back
      </Text>
      <Text variant="bodyMedium" style={styles.formSubtitle}>
        Sign in to access your hub.
      </Text>

      {error ? (
        <Surface style={styles.errorContainer} elevation={1}>
          <Text style={styles.errorText}>{error}</Text>
        </Surface>
      ) : null}

      <View style={styles.form}>
        <TextInput
          label="Work email"
          value={email}
          onChangeText={(value) => setEmail(value.toLowerCase())}
          mode="outlined"
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          mode="outlined"
          style={styles.input}
          secureTextEntry={!showPassword}
          right={
            <TextInput.Icon
              icon={showPassword ? 'eye-off' : 'eye'}
              onPress={() => setShowPassword(!showPassword)}
            />
          }
        />

        <Button
          mode="text"
          onPress={() => router.push('/forgot-password')}
          style={styles.forgotButton}
          labelStyle={styles.linkLabel}
        >
          Forgot password?
        </Button>

        <Button
          mode="contained"
          onPress={handleLogin}
          loading={loading}
          disabled={loading || biometricLoading}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          Sign in
        </Button>

        {biometricUser ? (
          <Button
            mode="outlined"
            icon="fingerprint"
            onPress={handleBiometricLogin}
            loading={biometricLoading}
            disabled={loading || biometricLoading}
            style={styles.biometricButton}
            contentStyle={styles.buttonContent}
          >
            Sign in with {biometricLabel}
          </Button>
        ) : null}

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>Don&apos;t have an account?</Text>
          <Button
            mode="text"
            onPress={() => router.push('/register')}
            labelStyle={styles.linkLabel}
            compact
          >
            Create account
          </Button>
        </View>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 12,
  },
  logoImage: {
    width: 160,
    height: 48,
  },
  formTitle: {
    marginTop: 8,
    fontWeight: '700',
    color: '#111827',
  },
  formSubtitle: {
    color: '#4b5563',
    marginBottom: 12,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#c62828',
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: '#fff',
  },
  forgotButton: {
    alignSelf: 'flex-end',
  },
  button: {
    marginTop: 8,
    borderRadius: 8,
  },
  biometricButton: {
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  linkLabel: {
    textTransform: 'none',
  },
  signupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  signupText: {
    color: '#4b5563',
  },
});
