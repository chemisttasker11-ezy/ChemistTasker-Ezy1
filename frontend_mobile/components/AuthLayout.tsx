import React, { type ReactNode, type Ref, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronLeft, CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { ScalePressable } from '@/components/ui';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { durations, easings } from '@/constants/motion';

export const officialLogo = require('../assets/images/official-logo.png');
const LOGO_RATIO = 900 / 436;
// Below this width the gutters and card padding drop to 16pt, so fields, the CTA and 44pt code boxes fit a 360pt phone.
const COMPACT_WIDTH = 380;

type AuthLayoutProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  showTitle?: boolean;
  /** Adds a labelled back chevron at the left; the logo stays centred either way. */
  onBack?: () => void;
  /** Greys the back chevron and swallows hardware Back while a request runs, so the screen cannot be left mid-submit. */
  backDisabled?: boolean;
  /** Below the card: the "Don't have an account?" line, terms. */
  footer?: ReactNode;
};

/** Signed-out frame: logo, Outfit title, one hairline card for the form, footer; keyboard-safe and capped at 480pt. */
export default function AuthLayout({ title, subtitle, children, showTitle = true, onBack, backDisabled = false, footer }: AuthLayoutProps) {
  const compact = useWindowDimensions().width < COMPACT_WIDTH;
  const navigation = useNavigation();
  // Swallow Android Back while a request or redirect runs, like the on-screen chevron.
  useEffect(() => {
    if (!backDisabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [backDisabled]);
  // And the iOS swipe-back: the root Stack enables it for every screen.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !backDisabled });
  }, [backDisabled, navigation]);
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Edge-to-edge Android no longer resizes the window for the keyboard, so both platforms avoid it here. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, compact ? styles.scrollContentCompact : null]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            <View style={styles.header}>
              {onBack ? (
                <ScalePressable onPress={onBack} disabled={backDisabled} accessibilityLabel="Back" style={styles.back} pressBg>
                  <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
                </ScalePressable>
              ) : null}
              <Image
                source={officialLogo}
                style={styles.logo}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel="ChemistTasker"
              />
            </View>

            {showTitle ? (
              <Animated.View entering={FadeIn.duration(durations.fast).easing(easings.smoothOut)} style={styles.titleBlock}>
                <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={1.6}>
                  {title}
                </Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </Animated.View>
            ) : null}

            <Animated.View
              entering={FadeIn.duration(durations.fast).delay(durations.micro).easing(easings.smoothOut)}
              style={[styles.card, compact ? styles.cardCompact : null]}
            >
              {children}
            </Animated.View>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type NoticeTone = 'error' | 'success' | 'info';

const noticeTone = {
  error: { ...colors.status.red, Icon: CircleAlert },
  success: { ...colors.status.green, Icon: CircleCheck },
  info: { bg: colors.tone.violet.bg, fg: colors.tone.violet.fg, Icon: Info },
} as const;

/** Inline form message. Android reads it through the live region; iOS gets an explicit announcement. */
export function AuthNotice({ tone, message, children }: { tone: NoticeTone; message: string; children?: ReactNode }) {
  const { bg, fg, Icon } = noticeTone[tone];
  useEffect(() => {
    if (Platform.OS === 'ios' && message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <Animated.View
      entering={FadeIn.duration(durations.quick)}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      style={[styles.notice, { backgroundColor: bg }]}
    >
      <View style={styles.noticeRow}>
        <Icon size={18} color={fg} strokeWidth={2} style={styles.noticeIcon} />
        <Text style={[styles.noticeText, { color: fg }]}>{message}</Text>
      </View>
      {children}
    </Animated.View>
  );
}

/** Text-weight action with a full touch target ("Forgot password?", "Create account"). */
export function AuthLink({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScalePressable
      static
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.link, style]}
    >
      <Text style={[styles.linkText, disabled ? styles.linkDisabled : null]}>{label}</Text>
    </ScalePressable>
  );
}

/** "Don't have an account? Create account" line. */
export function AuthPrompt({ text, action }: { text: string; action: ReactNode }) {
  return (
    <View style={styles.prompt}>
      <Text style={styles.promptText}>{text}</Text>
      {action}
    </View>
  );
}

type OtpCodeInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  inputRef?: Ref<TextInputInstance>;
  invalid?: boolean;
  disabled?: boolean;
  /** Read after the label, e.g. where the code was sent. */
  accessibilityHint?: string;
  /** Android autofill source: the SMS code, or a code from email / a password manager. */
  autoComplete?: Extract<TextInputProps['autoComplete'], 'sms-otp' | 'one-time-code'>;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
};

/**
 * Six code boxes over one real TextInput, so SMS / email one-time-code autofill, paste and screen readers all
 * work on a normal field; the boxes only draw it.
 */
export function OtpCodeInput({
  value,
  onChangeText,
  inputRef,
  invalid = false,
  disabled = false,
  accessibilityHint,
  onSubmitEditing,
  autoFocus = false,
  autoComplete = 'sms-otp',
}: OtpCodeInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.otp}>
      <View style={styles.otpRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Array.from({ length: 6 }, (_, index) => {
          const digit = value[index] ?? '';
          // The ring marks the next empty box; a full code shows no ring.
          const active = focused && index === value.length;
          return (
            <View
              key={index}
              style={[
                styles.otpBox,
                digit ? styles.otpBoxFilled : null,
                active ? styles.otpBoxActive : null,
                invalid ? styles.otpBoxInvalid : null,
                disabled ? styles.otpBoxDisabled : null,
              ]}
            >
              <Text style={styles.otpDigit} maxFontSizeMultiplier={1.4}>
                {digit}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete={autoComplete}
        maxLength={6}
        caretHidden
        autoFocus={autoFocus}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel="6-digit code"
        accessibilityHint={accessibilityHint}
        selectionColor="transparent"
        style={styles.otpInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space['3xl'],
  },
  scrollContentCompact: { paddingHorizontal: space.lg },
  column: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: space.lg },
  header: { alignItems: 'center', justifyContent: 'center', minHeight: touch.min },
  back: {
    position: 'absolute',
    left: 0,
    width: touch.min,
    height: touch.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { height: 52, width: 52 * LOGO_RATIO },
  titleBlock: { gap: space.sm },
  title: {
    color: colors.textPrimary,
    fontFamily: type.displayMedium.fontFamily,
    fontSize: type.displayMedium.fontSize,
    lineHeight: type.displayMedium.lineHeight,
    letterSpacing: type.displayMedium.letterSpacing,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
  },
  card: {
    gap: space.lg,
    padding: space.xl,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
  },
  cardCompact: { padding: space.lg },
  footer: { gap: space.md, alignItems: 'center' },
  notice: { gap: space.md, padding: space.md, borderRadius: radius.nested },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noticeIcon: { marginTop: 1 },
  noticeText: {
    flex: 1,
    fontFamily: font.inter.medium,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: type.bodyMedium.lineHeight,
  },
  link: { minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space.xs },
  linkText: {
    color: colors.accentStrong,
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  linkDisabled: { color: colors.textMuted },
  prompt: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: space.xs },
  promptText: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: type.bodyMedium.lineHeight,
  },
  otp: { position: 'relative' },
  // 6pt gaps keep every box at least 44pt wide inside a 360pt phone's card.
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  otpBox: {
    flex: 1,
    maxWidth: 56,
    minHeight: 56,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: { borderColor: colors.textSecondary },
  otpBoxActive: { borderColor: colors.primary, outlineColor: colors.primarySoft, outlineWidth: 3, outlineStyle: 'solid' },
  otpBoxInvalid: { borderColor: colors.status.red.solid },
  otpBoxDisabled: { backgroundColor: colors.disabledBg },
  otpDigit: {
    color: colors.textPrimary,
    fontFamily: font.outfit.medium,
    fontSize: 24,
    lineHeight: 30,
    fontVariant: ['tabular-nums'],
  },
  otpInput: {
    ...StyleSheet.absoluteFill,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 1,
  },
});
