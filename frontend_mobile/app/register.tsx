import React, { type ReactElement, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  View,
  StyleSheet,
  Text,
  type TextInputInstance,
  Linking,
  Modal,
} from 'react-native';
import {
  Calendar,
  Check,
  ChevronRight,
  Circle,
  CircleCheck,
  Compass,
  Pill,
  Shield,
  ShieldCheck,
  Store,
  Users,
  X,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { DatePickerModal } from 'react-native-paper-dates';
import { NEWCOMER_MINIMUM_AGE, NEWCOMER_TYPES, ageFromBirthDate } from '@chemisttasker/shared-core';
import { useAuth } from '../context/AuthContext';
import AuthLayout, { AuthLink, AuthNotice, AuthPrompt } from '../components/AuthLayout';
import { Button, ScalePressable, TextField } from '@/components/ui';
import { sizeIcon } from '@/components/ui/icon';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { registerRoleFromParam } from '../utils/registerRole';

const ROLE_OPTIONS = [
  { label: 'Pharmacy owner', description: 'Post shifts, run rosters and manage your team.', value: 'OWNER', icon: <Store /> },
  { label: 'Pharmacist', description: 'Find locum, casual and permanent work.', value: 'PHARMACIST', icon: <Pill /> },
  { label: 'Pharmacy team', description: 'Assistant · Technician · Intern · Student', value: 'OTHER_STAFF', icon: <Users /> },
];

const TERMS_URL = 'https://www.chemisttasker.com.au/terms-of-service';
const PRIVACY_URL = 'https://www.chemisttasker.com.au/privacy-policy';
// AuthContext.register throws exactly this for a taken email; web then offers Log in / Reset password.
const DUPLICATE_EMAIL_MESSAGE =
  'There is already an account registered with this email. Please log in or reset your password.';
const CAPTCHA_MISSING_MESSAGE = 'Registration is temporarily unavailable. Missing reCAPTCHA configuration.';

/** One radio card: Lucide tile, title, one line, and an empty ring that fills with a check once chosen. */
function Choice({
  selected,
  onPress,
  title,
  body,
  icon,
  accessibilityLabel,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  body: string;
  icon?: ReactElement;
  accessibilityLabel?: string;
}) {
  return (
    <ScalePressable
      pressBg
      haptic="selection"
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? `${title}. ${body}`}
      style={[styles.choice, selected ? styles.choiceSelected : null]}
    >
      {icon ? (
        <View style={[styles.choiceIcon, selected ? styles.choiceIconSelected : null]}>
          {sizeIcon(icon, 20, selected ? colors.surfaceBg : colors.accentStrong, 1.75)}
        </View>
      ) : null}
      <View style={styles.choiceText}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceBody}>{body}</Text>
      </View>
      {selected ? (
        <CircleCheck size={22} color={colors.primary} strokeWidth={2} />
      ) : (
        <Circle size={22} color={colors.textSecondary} strokeWidth={1.75} />
      )}
    </ScalePressable>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    referral_code?: string | string[];
    referral_shift_id?: string | string[];
    referral_event_id?: string | string[];
    role?: string | string[];
  }>();

  const referralParams: Record<string, string> = {};
  const refCode = Array.isArray(params.referral_code) ? params.referral_code[0] : params.referral_code;
  const refEventId = Array.isArray(params.referral_event_id) ? params.referral_event_id[0] : params.referral_event_id;
  const refShiftId = Array.isArray(params.referral_shift_id) ? params.referral_shift_id[0] : params.referral_shift_id;
  if (refCode) referralParams.referral_code = refCode;
  if (refEventId) referralParams.referral_event_id = refEventId;
  if (refShiftId) referralParams.referral_shift_id = refShiftId;
  const { register } = useAuth();
  const recaptchaSiteKey = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || '';
  // Welcome's persona chips preselect a role; the cards below stay changeable.
  const roleParam = registerRoleFromParam(params.role);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirm_password: '',
    role: roleParam as string,
    accepted_terms: false,
  });
  const [newcomerType, setNewcomerType] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const newcomerAge = ageFromBirthDate(dateOfBirth);
  const tooYoung = newcomerAge != null && newcomerAge < NEWCOMER_MINIMUM_AGE;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaModalVisible, setCaptchaModalVisible] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);
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
              background: ${colors.subtleBg};
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
    if (loading) return;
    setError('');

    // Web parity: all three account fields are required before the match check.
    if (!formData.email || !formData.password || !formData.confirm_password) {
      setError('Please fill in all fields');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      return;
    }

    if (!formData.role) {
      setError("Choose how you're joining.");
      return;
    }

    if (formData.role === 'EXPLORER') {
      if (!newcomerType) {
        setError('Tell us which describes you best.');
        return;
      }
      if (newcomerAge == null) {
        setError('Enter your date of birth.');
        return;
      }
      if (newcomerAge < NEWCOMER_MINIMUM_AGE) {
        setError(`You need to be at least ${NEWCOMER_MINIMUM_AGE} to join ChemistTasker.`);
        return;
      }
    }

    if (!formData.accepted_terms) {
      setError('You must accept the Terms of Service to register.');
      return;
    }

    // The notice in place of the CAPTCHA row already says why registration cannot go ahead.
    if (!recaptchaSiteKey) return;

    if (!captchaToken) {
      setError('Please complete the CAPTCHA to register.');
      return;
    }

    setLoading(true);
    try {
      await register({
        email: formData.email,
        password: formData.password,
        confirm_password: formData.confirm_password,
        role: formData.role,
        ...(formData.role === 'EXPLORER' ? { newcomer_type: newcomerType, date_of_birth: dateOfBirth } : {}),
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
      router.replace({ pathname: '/verify-otp', params: { email: formData.email, ...referralParams } } as any);
    } catch (err: any) {
      setError(err.message);
      // A reCAPTCHA token is single-use; the next attempt needs a fresh check.
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleTerms = () => setFormData({ ...formData, accepted_terms: !formData.accepted_terms });
  const dobLabel = dateOfBirth ? dateOfBirth.split('-').reverse().join('/') : '';

  return (
    <AuthLayout
      title="Create account"
      onBack={router.canGoBack() ? () => router.back() : undefined}
      backDisabled={loading}
      footer={
        <AuthPrompt
          text="Already have an account?"
          action={
            <AuthLink
              label="Sign in"
              onPress={() =>
                router.replace(
                  Object.keys(referralParams).length > 0
                    ? ({ pathname: '/login', params: referralParams } as any)
                    : '/login',
                )
              }
              disabled={loading}
            />
          }
        />
      }
    >
      <TextField
        label="Email"
        value={formData.email}
        onChangeText={(text) => setFormData({ ...formData, email: text.toLowerCase() })}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        disabled={loading}
      />

      <TextField
        ref={passwordRef}
        label="Password"
        value={formData.password}
        onChangeText={(text) => setFormData({ ...formData, password: text })}
        secure
        textContentType="newPassword"
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}
        disabled={loading}
      />

      <TextField
        ref={confirmRef}
        label="Confirm password"
        value={formData.confirm_password}
        onChangeText={(text) => setFormData({ ...formData, confirm_password: text })}
        secure
        textContentType="newPassword"
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        disabled={loading}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{"I'm joining as"}</Text>
        <View style={styles.choiceList} accessibilityRole="radiogroup" accessibilityLabel="Account type">
          {ROLE_OPTIONS.map((option) => (
            <Choice
              key={option.value}
              selected={formData.role === option.value}
              onPress={() => setFormData({ ...formData, role: option.value })}
              title={option.label}
              body={option.description}
              icon={option.icon}
            />
          ))}
          <View style={styles.orRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>
          <Choice
            selected={formData.role === 'EXPLORER'}
            onPress={() => setFormData({ ...formData, role: 'EXPLORER' })}
            title="New to pharmacy in Australia? Start here"
            body="Overseas-qualified, school students, placement seekers and anyone curious about pharmacy."
            icon={<Compass />}
          />
        </View>
      </View>

      {formData.role === 'EXPLORER' ? (
        <View style={styles.newcomerPanel}>
          <Text style={styles.newcomerTitle} accessibilityRole="header">Which describes you best?</Text>
          <View style={styles.choiceList} accessibilityRole="radiogroup" accessibilityLabel="Which describes you best">
            {NEWCOMER_TYPES.map((item) => (
              <Choice
                key={item.value}
                selected={newcomerType === item.value}
                onPress={() => setNewcomerType(item.value)}
                title={item.label}
                body={item.description}
              />
            ))}
          </View>

          <View style={styles.dobBlock}>
            <Text style={styles.fieldLabel} importantForAccessibility="no" accessibilityElementsHidden>
              Date of birth
            </Text>
            <ScalePressable
              pressBg
              onPress={() => setDobPickerOpen(true)}
              accessibilityLabel={dobLabel ? `Date of birth, ${dobLabel}` : 'Date of birth, not set'}
              accessibilityHint="Opens a date picker"
              style={[styles.dobField, tooYoung ? styles.dobFieldError : null]}
            >
              <Text style={[styles.dobValue, !dobLabel ? styles.dobPlaceholder : null]}>{dobLabel || 'DD/MM/YYYY'}</Text>
              <Calendar size={20} color={colors.textSecondary} strokeWidth={1.75} />
            </ScalePressable>
            <Text
              style={[styles.choiceBody, tooYoung ? styles.errorText : null]}
              accessibilityLiveRegion={tooYoung ? 'polite' : 'none'}
            >
              {tooYoung
                ? `You need to be at least ${NEWCOMER_MINIMUM_AGE} to join ChemistTasker.`
                : `You need to be at least ${NEWCOMER_MINIMUM_AGE}. If you're under 18, only your first name is shown.`}
            </Text>
          </View>
          <DatePickerModal locale="en" mode="single" visible={dobPickerOpen} onDismiss={() => setDobPickerOpen(false)}
            date={dateOfBirth ? new Date(`${dateOfBirth}T00:00:00`) : new Date(new Date().getFullYear() - 18, 0, 1)}
            validRange={{ endDate: new Date() }} label="Date of birth"
            onConfirm={({ date }) => { setDobPickerOpen(false); if (date) setDateOfBirth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`); }} />
        </View>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.termsRow}>
        <ScalePressable
          static
          onPress={toggleTerms}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: formData.accepted_terms }}
          accessibilityLabel="I accept the Terms of Service and Privacy Policy"
          style={styles.checkHit}
        >
          <View style={[styles.checkBox, formData.accepted_terms ? styles.checkBoxOn : null]}>
            {formData.accepted_terms ? <Check size={16} color={colors.surfaceBg} strokeWidth={3} /> : null}
          </View>
        </ScalePressable>
        <Text style={styles.termsText} onPress={toggleTerms}>
          I accept the Terms of Service and Privacy Policy
        </Text>
      </View>
      {/* 44pt AuthLinks: inline Text links inside the checkbox label were too small to tap. */}
      <View style={styles.legalLinks}>
        <AuthLink label="Terms of Service" onPress={() => void openLink(TERMS_URL)} disabled={loading} />
        <AuthLink label="Privacy Policy" onPress={() => void openLink(PRIVACY_URL)} disabled={loading} />
      </View>

      {!recaptchaSiteKey ? (
        <AuthNotice tone="error" message={CAPTCHA_MISSING_MESSAGE} />
      ) : (
        <ScalePressable
          pressBg
          onPress={() => {
            setError('');
            setCaptchaLoading(true);
            setCaptchaModalVisible(true);
          }}
          accessibilityLabel={captchaToken ? 'CAPTCHA verified' : 'Complete CAPTCHA verification'}
          accessibilityHint={captchaToken ? undefined : 'Opens the CAPTCHA check'}
          style={[styles.captchaRow, captchaToken ? styles.captchaRowVerified : null]}
        >
          {captchaToken ? (
            <ShieldCheck size={22} color={colors.status.green.fg} strokeWidth={1.75} />
          ) : (
            <Shield size={22} color={colors.accentStrong} strokeWidth={1.75} />
          )}
          <Text style={[styles.captchaText, captchaToken ? styles.captchaTextVerified : null]}>
            {captchaToken ? 'CAPTCHA verified' : 'Complete CAPTCHA verification'}
          </Text>
          {captchaToken ? null : <ChevronRight size={20} color={colors.textSecondary} strokeWidth={1.75} />}
        </ScalePressable>
      )}

      {error ? (
        <AuthNotice tone="error" message={error}>
          {error === DUPLICATE_EMAIL_MESSAGE ? (
            <View style={styles.noticeActions}>
              <Button
                variant="outlined"
                label="Sign in"
                disabled={loading}
                onPress={() => router.replace({ pathname: '/login', params: { email: formData.email, ...referralParams } } as any)}
                style={styles.noticeButton}
              />
              <Button
                variant="outlined"
                label="Reset password"
                disabled={loading}
                onPress={() =>
                  router.push(
                    Object.keys(referralParams).length > 0
                      ? ({ pathname: '/forgot-password', params: referralParams } as any)
                      : '/forgot-password',
                  )
                }
                style={styles.noticeButton}
              />
            </View>
          ) : null}
        </AuthNotice>
      ) : null}

      <Button
        label="Create account"
        busyLabel="Creating account"
        onPress={() => void handleRegister()}
        busy={loading}
        disabled={!recaptchaSiteKey}
        haptic="medium"
      />

      <Modal
        visible={captchaModalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setCaptchaModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} accessibilityViewIsModal>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} accessibilityRole="header">Verify you are human</Text>
              <ScalePressable
                static
                pressBg
                onPress={() => setCaptchaModalVisible(false)}
                accessibilityLabel="Close"
                style={styles.modalClose}
              >
                <X size={22} color={colors.textSecondary} strokeWidth={2} />
              </ScalePressable>
            </View>
            <Text style={styles.modalDescription}>
              Complete the CAPTCHA challenge to continue account creation.
            </Text>
            {!recaptchaSiteKey ? (
              <AuthNotice tone="error" message={CAPTCHA_MISSING_MESSAGE} />
            ) : (
              <View style={styles.webviewWrap}>
                {captchaLoading ? (
                  <View style={styles.webviewLoader}>
                    <ActivityIndicator size="small" color={colors.primary} />
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

const bodySmall = {
  fontFamily: font.inter.regular,
  fontSize: type.bodySmall.fontSize,
  lineHeight: type.bodySmall.lineHeight,
};

const styles = StyleSheet.create({
  section: { gap: space.md, marginTop: space.sm },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: type.titleSmall.fontSize,
    lineHeight: type.titleSmall.lineHeight,
    letterSpacing: type.titleSmall.letterSpacing,
  },
  choiceList: { gap: space.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceBg,
  },
  choiceSelected: { borderColor: colors.accentStrong, backgroundColor: colors.tone.violet.bg },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.tileSm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tone.violet.bg,
  },
  choiceIconSelected: { backgroundColor: colors.primary },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: {
    color: colors.textPrimary,
    fontFamily: font.inter.semiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  choiceBody: { ...bodySmall, color: colors.textSecondary },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: space.xxs },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.inputBorder },
  orText: { ...bodySmall, color: colors.textSecondary },
  // Concentric: 24pt panel = 12pt choice radius + 12pt padding.
  newcomerPanel: { gap: space.md, padding: space.md, borderRadius: radius.sheet, backgroundColor: colors.subtleBg },
  newcomerTitle: {
    color: colors.textPrimary,
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  dobBlock: { gap: 6 },
  fieldLabel: {
    color: colors.textPrimary,
    fontFamily: font.inter.medium,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  dobField: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    backgroundColor: colors.inputBg,
  },
  dobFieldError: { borderColor: colors.status.red.solid },
  dobValue: { color: colors.textPrimary, fontFamily: font.inter.regular, fontSize: 16, lineHeight: 22 },
  dobPlaceholder: { color: colors.textMuted },
  errorText: { color: colors.status.red.fg },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  // Top-aligned so wrapped terms at large text keep the box beside the first line.
  termsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  // The 22pt box sits in a full touch-sized target; -11pt lines the box up with the fields' left edge.
  checkHit: {
    width: touch.min,
    height: touch.min,
    marginLeft: -(touch.min - 22) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBg,
  },
  checkBoxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  termsText: {
    flex: 1,
    paddingTop: (touch.min - type.bodyMedium.lineHeight) / 2,
    color: colors.textPrimary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: type.bodyMedium.lineHeight,
  },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, marginLeft: touch.min, marginTop: -space.sm },
  captchaRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 14,
    paddingVertical: space.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.nested,
    backgroundColor: colors.surfaceBg,
  },
  captchaRowVerified: { borderColor: colors.status.green.bg, backgroundColor: colors.status.green.bg },
  captchaText: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  captchaTextVerified: { color: colors.status.green.fg },
  noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  noticeButton: { flexGrow: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: space.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.surfaceBg,
    borderRadius: radius.sheet,
    padding: space.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  modalTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: type.titleLarge.fontSize,
    lineHeight: type.titleLarge.lineHeight,
    letterSpacing: type.titleLarge.letterSpacing,
  },
  modalClose: {
    width: touch.min,
    height: touch.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDescription: {
    marginTop: space.xs,
    marginBottom: space.lg,
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: type.bodyMedium.lineHeight,
  },
  webviewWrap: {
    height: 280,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    overflow: 'hidden',
    backgroundColor: colors.subtleBg,
  },
  webviewLoader: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.subtleBg,
    zIndex: 1,
  },
  webviewLoaderText: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
  },
});
