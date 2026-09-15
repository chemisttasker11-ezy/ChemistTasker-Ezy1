import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  Modal,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Checkbox,
  RadioButton,
  Surface,
  Divider,
} from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

const ROLE_OPTIONS = [
  { label: 'Pharmacy Owner', value: 'OWNER', icon: 'storefront', color: '#4f46e5' },
  { label: 'Pharmacist', value: 'PHARMACIST', icon: 'local-pharmacy', color: '#0ea5e9' },
  {
    label: 'Other Staff (Intern, Technician, Assistant, Student)',
    value: 'OTHER_STAFF',
    icon: 'badge',
    color: '#22c55e',
  },
  { label: 'Explorer (Shadowing/Volunteering)', value: 'EXPLORER', icon: 'travel-explore', color: '#f97316' },
];

const TERMS_URL = 'https://www.chemisttasker.com.au/terms-of-service';
const PRIVACY_URL = 'https://www.chemisttasker.com.au/privacy-policy';

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    referral_code?: string | string[];
    referral_shift_id?: string | string[];
    referral_event_id?: string | string[];
  }>();
  const { register } = useAuth();
  const recaptchaSiteKey = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || '';

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirm_password: '',
    role: 'OWNER',
    accepted_terms: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaModalVisible, setCaptchaModalVisible] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const referralCode = Array.isArray(params.referral_code)
    ? params.referral_code[0]
    : params.referral_code;
  const referralShiftId = Array.isArray(params.referral_shift_id)
    ? params.referral_shift_id[0]
    : params.referral_shift_id;
  const referralEventId = Array.isArray(params.referral_event_id)
    ? params.referral_event_id[0]
    : params.referral_event_id;
  const parsedReferralShiftId = referralShiftId ? Number(referralShiftId) : null;
  const parsedReferralEventId = referralEventId ? Number(referralEventId) : null;

  const captchaHtml = useMemo(() => {
    if (!recaptchaSiteKey) {
      return '';
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://www.google.com/recaptcha/api.js" async defer></script>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #f8fafc;
              font-family: Arial, sans-serif;
            }
          </style>
        </head>
        <body>
          <div
            class="g-recaptcha"
            data-sitekey="${recaptchaSiteKey}"
            data-callback="onCaptchaSuccess"
          ></div>
          <script>
            function onCaptchaSuccess(token) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'captcha', token: token }));
            }
          </script>
        </body>
      </html>
    `;
  }, [recaptchaSiteKey]);

  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setError('Unable to open link');
    }
  };

  const handleRegister = async () => {
    setError('');

    if (!formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      return;
    }

    if (!formData.accepted_terms) {
      setError('Please accept the terms and conditions');
      return;
    }

    if (!recaptchaSiteKey) {
      setError('CAPTCHA is not configured for this build');
      return;
    }

    if (!captchaToken) {
      setError('Please complete the CAPTCHA verification');
      return;
    }

    setLoading(true);
    try {
      await register({
        email: formData.email,
        password: formData.password,
        confirm_password: formData.confirm_password,
        role: formData.role,
        accepted_terms: formData.accepted_terms,
        captcha_token: captchaToken,
        referral_code: referralCode || undefined,
        referral_shift_id: Number.isFinite(parsedReferralShiftId) && parsedReferralShiftId
          ? parsedReferralShiftId
          : undefined,
        referral_event_id: Number.isFinite(parsedReferralEventId) && parsedReferralEventId
          ? parsedReferralEventId
          : undefined,
      });
      router.replace({ pathname: '/verify-otp', params: { email: formData.email } } as any);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create Account">
      <View style={styles.logoRow}>
        <Image
          source={require('../assets/images/clipsnap-edit-6-1-2026.png')}
          style={styles.logoImage}
          resizeMode="contain"
          
        />
      </View>

      {error ? (
        <Surface style={styles.errorContainer} elevation={1}>
          <Text style={styles.errorText}>{error}</Text>
        </Surface>
      ) : null}

      <View style={styles.form}>
        <TextInput
          label="Email"
          value={formData.email}
          onChangeText={(text) => setFormData({ ...formData, email: text })}
          mode="outlined"
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          label="Password"
          value={formData.password}
          onChangeText={(text) => setFormData({ ...formData, password: text })}
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

        <TextInput
          label="Confirm Password"
          value={formData.confirm_password}
          onChangeText={(text) => setFormData({ ...formData, confirm_password: text })}
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

        <Divider style={styles.divider} />

        <Text variant="titleSmall" style={styles.sectionTitle}>I am a:</Text>
        <View style={styles.roleGrid}>
          {ROLE_OPTIONS.map((option) => {
            const isSelected = formData.role === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.roleCard,
                  { borderColor: isSelected ? option.color : '#e5e7eb' },
                  isSelected && { backgroundColor: '#f8fafc' },
                ]}
                activeOpacity={0.85}
                onPress={() => setFormData({ ...formData, role: option.value })}
              >
                <View style={styles.roleHeader}>
                  <View style={[styles.roleIconWrap, { backgroundColor: `${option.color}1A` }]}>
                    <MaterialIcons name={option.icon as any} size={22} color={option.color} />
                  </View>
                  <RadioButton
                    value={option.value}
                    status={isSelected ? 'checked' : 'unchecked'}
                    onPress={() => setFormData({ ...formData, role: option.value })}
                    color={option.color}
                  />
                </View>
                <Text style={styles.radioLabel}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Divider style={styles.divider} />

        <View style={styles.checkboxContainer}>
          <Checkbox
            status={formData.accepted_terms ? 'checked' : 'unchecked'}
            onPress={() => setFormData({ ...formData, accepted_terms: !formData.accepted_terms })}
          />
          <Text style={styles.checkboxLabel}>
            I accept the{' '}
            <Text
              style={styles.linkText}
              onPress={() => void openLink(TERMS_URL)}
              accessibilityRole="link"
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              style={styles.linkText}
              onPress={() => void openLink(PRIVACY_URL)}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.captchaButton,
            captchaToken ? styles.captchaButtonVerified : null,
          ]}
          activeOpacity={0.85}
          onPress={() => {
            setError('');
            setCaptchaLoading(true);
            setCaptchaModalVisible(true);
          }}
        >
          <View style={styles.captchaButtonContent}>
            <MaterialIcons
              name={captchaToken ? 'verified-user' : 'security'}
              size={20}
              color={captchaToken ? '#166534' : '#1d4ed8'}
            />
            <Text style={[
              styles.captchaButtonText,
              captchaToken ? styles.captchaButtonTextVerified : null,
            ]}>
              {captchaToken ? 'CAPTCHA verified' : 'Complete CAPTCHA verification'}
            </Text>
          </View>
        </TouchableOpacity>

        <Button
          mode="contained"
          onPress={handleRegister}
          loading={loading}
          disabled={loading || !captchaToken}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          Create Account
        </Button>

        <Button
          mode="text"
          onPress={() => router.replace('/login')}
          style={styles.backButton}
          labelStyle={styles.linkLabel}
        >
          Already have an account? Login
        </Button>
      </View>

      <Modal
        visible={captchaModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCaptchaModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text variant="titleMedium" style={styles.modalTitle}>Verify you are human</Text>
              <TouchableOpacity onPress={() => setCaptchaModalVisible(false)}>
                <MaterialIcons name="close" size={22} color="#475569" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              Complete the CAPTCHA challenge to continue account creation.
            </Text>
            {!recaptchaSiteKey ? (
              <Surface style={styles.errorContainer} elevation={1}>
                <Text style={styles.errorText}>Missing `EXPO_PUBLIC_RECAPTCHA_SITE_KEY`.</Text>
              </Surface>
            ) : (
              <View style={styles.webviewWrap}>
                {captchaLoading ? (
                  <View style={styles.webviewLoader}>
                    <ActivityIndicator size="small" color="#2563EB" />
                    <Text style={styles.webviewLoaderText}>Loading CAPTCHA...</Text>
                  </View>
                ) : null}
                <WebView
                  source={{ html: captchaHtml, baseUrl: 'https://www.chemisttasker.com.au' }}
                  onLoadEnd={() => setCaptchaLoading(false)}
                  javaScriptEnabled
                  originWhitelist={['*']}
                  onMessage={(event) => {
                    try {
                      const payload = JSON.parse(event.nativeEvent.data);
                      if (payload?.type === 'captcha' && payload?.token) {
                        setCaptchaToken(payload.token);
                        setCaptchaModalVisible(false);
                      }
                    } catch {
                      setError('CAPTCHA verification failed');
                    }
                  }}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  logoImage: {
    width: 160,
    height: 48,
  },
  title: {
    fontWeight: '700',
    marginBottom: 4,
    color: '#0f172a',
  },
  subtitle: {
    color: '#4b5563',
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
    gap: 12,
  },
  input: {
    backgroundColor: '#fff',
  },
  divider: {
    marginVertical: 8,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 4,
    fontWeight: '600',
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  radioLabel: {
    marginTop: 6,
    color: '#111827',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  checkboxLabel: {
    marginLeft: 8,
    flex: 1,
  },
  captchaButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  captchaButtonVerified: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  captchaButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  captchaButtonText: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  captchaButtonTextVerified: {
    color: '#166534',
  },
  linkText: {
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  button: {
    marginTop: 16,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  backButton: {
    marginTop: 8,
  },
  linkLabel: {
    textTransform: 'none',
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  roleCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
  },
  roleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    maxHeight: '78%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  modalDescription: {
    marginTop: 8,
    marginBottom: 14,
    color: '#475569',
  },
  webviewWrap: {
    height: 280,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
  },
  webviewLoader: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    zIndex: 1,
  },
  webviewLoaderText: {
    color: '#475569',
  },
});
