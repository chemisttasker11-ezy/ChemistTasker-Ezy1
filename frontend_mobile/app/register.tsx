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
import { brandColors, personaPalettes } from '../constants/theme';

const ROLE_OPTIONS = [
  { label: 'Pharmacy Owner', description: 'Manage pharmacies, teams, shifts and business tools.', value: 'OWNER', icon: 'storefront', color: personaPalettes.owner.accent, soft: personaPalettes.owner.soft },
  { label: 'Pharmacist', description: 'Find shifts, manage availability and build your professional profile.', value: 'PHARMACIST', icon: 'local-pharmacy', color: personaPalettes.pharmacist.accent, soft: personaPalettes.pharmacist.soft },
  {
    label: 'Other Staff',
    description: 'For interns, technicians, assistants and pharmacy students.',
    value: 'OTHER_STAFF',
    icon: 'badge',
    color: personaPalettes.otherStaff.accent,
    soft: personaPalettes.otherStaff.soft,
  },
  { label: 'Explorer', description: 'For shadowing, volunteering and pharmacy career exploration.', value: 'EXPLORER', icon: 'travel-explore', color: personaPalettes.explorer.accent, soft: personaPalettes.explorer.soft },
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
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isDuplicateEmail, setIsDuplicateEmail] = useState(false);
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
              background: #F5F8FC;
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
    setIsDuplicateEmail(false);

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
        email: formData.email.toLowerCase(),
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
      router.replace({ pathname: '/verify-otp', params: { email: formData.email.toLowerCase() } } as any);
    } catch (err: any) {
      const message = String(err?.message || 'Registration failed');
      const duplicate = message.toLowerCase().includes('already') || message.toLowerCase().includes('registered');
      setIsDuplicateEmail(duplicate);
      setError(message);
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
        <Surface style={styles.errorContainer} elevation={0}>
          <Text style={styles.errorText}>{error}</Text>
          {isDuplicateEmail ? (
            <View style={styles.recoveryActions}>
              <Button compact mode="text" onPress={() => router.replace('/login')}>Sign in</Button>
              <Button compact mode="text" onPress={() => router.push('/forgot-password')}>Reset password</Button>
            </View>
          ) : null}
        </Surface>
      ) : null}

      <View style={styles.form}>
        <TextInput
          label="Email"
          value={formData.email}
          onChangeText={(text) => setFormData({ ...formData, email: text.toLowerCase() })}
          mode="outlined"
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="username"
        />

        <TextInput
          label="Password"
          value={formData.password}
          onChangeText={(text) => setFormData({ ...formData, password: text })}
          mode="outlined"
          style={styles.input}
          secureTextEntry={!showPassword}
          autoComplete="new-password"
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
          secureTextEntry={!showConfirmPassword}
          autoComplete="new-password"
          right={
            <TextInput.Icon
              icon={showConfirmPassword ? 'eye-off' : 'eye'}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
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
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`${option.label}. ${option.description}`}
                style={[
                  styles.roleCard,
                  { borderColor: isSelected ? option.color : brandColors.border },
                  isSelected && { backgroundColor: option.soft },
                ]}
                activeOpacity={0.85}
                onPress={() => setFormData({ ...formData, role: option.value })}
              >
                <View style={[styles.roleIconWrap, { backgroundColor: option.soft }]}>
                  <MaterialIcons name={option.icon as any} size={22} color={option.color} />
                </View>
                <View style={styles.roleCopy}>
                  <Text style={[styles.radioLabel, isSelected && { color: option.color }]}>{option.label}</Text>
                  <Text style={styles.roleDescription}>{option.description}</Text>
                </View>
                <RadioButton value={option.value} status={isSelected ? 'checked' : 'unchecked'} color={option.color} />
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
              color={captchaToken ? '#166534' : '#5222B8'}
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
                <MaterialIcons name="close" size={22} color="#59677E" />
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
                    <ActivityIndicator size="small" color="#5222B8" />
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
    color: '#06214A',
  },
  subtitle: {
    color: '#59677E',
  },
  errorContainer: {
    backgroundColor: '#FDEEEF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: brandColors.danger,
  },
  recoveryActions: { flexDirection: 'row', marginTop: 6, gap: 4 },
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
    color: brandColors.navy,
    fontWeight: '800',
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
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#D9CEF0',
    backgroundColor: '#F0EAFF',
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
    color: '#5222B8',
    fontWeight: '600',
  },
  captchaButtonTextVerified: {
    color: '#166534',
  },
  linkText: {
    color: '#5222B8',
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
    gap: 10,
  },
  roleCard: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    backgroundColor: brandColors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roleCopy: { flex: 1 },
  roleDescription: { color: brandColors.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  roleIconWrap: {
    width: 46,
    height: 46,
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
    color: '#06214A',
    fontWeight: '700',
  },
  modalDescription: {
    marginTop: 8,
    marginBottom: 14,
    color: '#59677E',
  },
  webviewWrap: {
    height: 280,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F5F8FC',
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
    backgroundColor: '#F5F8FC',
    zIndex: 1,
  },
  webviewLoaderText: {
    color: '#59677E',
  },
});
