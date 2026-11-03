import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, type TextInputInstance, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fingerprint } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import AuthLayout, { AuthLink, AuthNotice, AuthPrompt } from '../components/AuthLayout';
import { Button, TextField } from '@/components/ui';
import { colors, font, space, type } from '@/constants/tokens';
import { getOwnerSetupStatus } from '../utils/ownerSetup';
import { hasOrganizationAccess, resolveInitialWorkspace, selectRolePersona } from '../utils/mobilePersona';
import {
  authenticateWithBiometrics,
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricAvailability,
  getSavedBiometricUser,
  type BiometricUser,
} from '../utils/biometricAuth';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; reset?: string }>();
  const { loginWithCredentials, loginWithStoredSession } = useAuth();

  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState('');
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
    if (!userData.is_mobile_verified && !userData.mobile_check_skipped) {
      router.replace('/mobile-verify' as never);
      return;
    }

    // A fresh sign-in always starts in the account's original persona.
    await selectRolePersona(userData);

    if (hasOrganizationAccess(userData) && !['OWNER', 'PHARMACIST', 'OTHER_STAFF', 'EXPLORER'].includes(userData.role)) {
      router.replace('/organization/dashboard' as never);
    } else if (userData.role === 'OWNER') {
      const setupStatus = await getOwnerSetupStatus(userData);
      router.replace((setupStatus.nextPath || '/owner/dashboard') as never);
    } else {
      const workspaceRoute = await resolveInitialWorkspace(userData);
      router.replace(workspaceRoute as never);
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
    // The keyboard's Go key can fire while a sign-in is already running.
    if (loading || biometricLoading) return;
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      const userData = await loginWithCredentials(email, password);
      if (!userData.is_mobile_verified && !userData.mobile_check_skipped) {
        await routeAfterLogin(userData);
        return;
      }
      await promptForBiometricEnable(userData);
      await routeAfterLogin(userData);
    } catch (err: any) {
      setError(err.message);
      // Web parity (login.tsx): an unverified email goes to the code screen. AuthContext keeps only the
      // detail text, so match backend login_security.py's "email address is not verified" as well.
      if (/verify your email|email address is not verified/i.test(String(err?.message || ''))) {
        router.push({ pathname: '/verify-otp', params: { email: email.toLowerCase() } } as never);
      }
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

  const passwordRef = useRef<TextInputInstance>(null);
  const busy = loading || biometricLoading;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage shifts, people and your pharmacy work."
      onBack={router.canGoBack() ? () => router.back() : undefined}
      backDisabled={busy}
      footer={
        <>
          <AuthPrompt
            text="New to ChemistTasker?"
            action={<AuthLink label="Create account" onPress={() => router.push('/register')} disabled={busy} />}
          />
          <Text style={styles.terms}>By using ChemistTasker, you agree to the</Text>
          {/* 44pt AuthLinks: inline Text links are too small to tap. */}
          <View style={styles.legalLinks}>
            <AuthLink label="Terms of Service" onPress={() => void Linking.openURL(TERMS_URL).catch(() => {})} disabled={busy} />
            <AuthLink label="Privacy Policy" onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => {})} disabled={busy} />
          </View>
        </>
      }
    >
      {error ? (
        <AuthNotice tone="error" message={error} />
      ) : params.reset === '1' ? (
        <AuthNotice tone="success" message="Password updated. Sign in with your new password." />
      ) : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={(value) => setEmail(value.toLowerCase())}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        disabled={busy}
      />

      <View style={styles.passwordBlock}>
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secure
          textContentType="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => void handleLogin()}
          disabled={busy}
        />
        <AuthLink label="Forgot password?" onPress={() => router.push('/forgot-password')} disabled={busy} style={styles.forgot} />
      </View>

      <Button
        label="Sign in"
        busyLabel="Signing in"
        onPress={() => void handleLogin()}
        busy={loading}
        disabled={biometricLoading}
        haptic="light"
      />

      {biometricUser ? (
        <Button
          variant="outlined"
          icon={<Fingerprint />}
          label={`Sign in with ${biometricLabel}`}
          busyLabel="Checking"
          onPress={() => void handleBiometricLogin()}
          busy={biometricLoading}
          disabled={loading}
        />
      ) : null}
    </AuthLayout>
  );
}

const TERMS_URL = 'https://www.chemisttasker.com.au/terms-of-service';
const PRIVACY_URL = 'https://www.chemisttasker.com.au/privacy-policy';

const styles = StyleSheet.create({
  passwordBlock: {
    gap: space.xxs,
  },
  forgot: {
    alignSelf: 'flex-end',
  },
  terms: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
    textAlign: 'center',
  },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
