import React, { forwardRef, useState } from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { ScalePressable } from './ScalePressable';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Shown under the field in red and read with the label; replaces `hint` while present. */
  error?: string;
  hint?: string;
  /** Adds " *" after the label (as web marks required fields) and "required" to the spoken label. */
  required?: boolean;
  /** Password field: hides the text and adds a labelled Show / Hide toggle (`secureTextEntry` does the same). */
  secure?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Label above, 48/44pt input, hint or error below (taste 4.6). Takes every native TextInput prop so screens
 * set textContentType / autoComplete / returnKeyType chains; the ref is the TextInput, for focus().
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    error,
    hint,
    required = false,
    secure = false,
    secureTextEntry = false,
    disabled = false,
    editable = true,
    style,
    onFocus,
    onBlur,
    accessibilityLabel,
    accessibilityHint,
    accessibilityState,
    ...input
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const note = error || hint;
  const locked = disabled || !editable;
  const hidable = secure || secureTextEntry;
  const borderColor = error ? colors.status.red.solid : focused ? colors.primary : colors.inputBorder;

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.label} importantForAccessibility="no" accessibilityElementsHidden>
        {required ? `${label} *` : label}
      </Text>
      <View
        style={[
          styles.box,
          { borderColor },
          focused ? [styles.focusRing, error ? styles.focusRingError : null] : null,
          locked ? styles.boxDisabled : null,
        ]}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          {...input}
          editable={!locked}
          secureTextEntry={hidable && !revealed}
          accessibilityLabel={accessibilityLabel ?? (required ? `${label}, required` : label)}
          // The error is read once, by its own live-region line below.
          accessibilityHint={accessibilityHint ?? hint}
          accessibilityState={{ ...accessibilityState, disabled: locked }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, locked ? styles.inputDisabled : null]}
        />
        {hidable ? (
          <ScalePressable
            static
            onPress={() => setRevealed((value) => !value)}
            disabled={locked}
            accessibilityLabel={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            style={styles.toggle}
          >
            {revealed ? (
              <EyeOff size={20} color={colors.textSecondary} strokeWidth={1.75} />
            ) : (
              <Eye size={20} color={colors.textSecondary} strokeWidth={1.75} />
            )}
          </ScalePressable>
        ) : null}
      </View>
      {note ? (
        <Text
          style={[styles.note, error ? styles.noteError : null]}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
          importantForAccessibility={error ? 'yes' : 'no'}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    color: colors.textPrimary,
    fontFamily: font.inter.medium,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  box: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.control,
    backgroundColor: colors.inputBg,
  },
  // 3pt soft ring outside the border: focus is visible without the box changing size.
  focusRing: { outlineColor: colors.primarySoft, outlineWidth: 3, outlineStyle: 'solid' },
  focusRingError: { outlineColor: colors.status.red.bg },
  boxDisabled: { backgroundColor: colors.disabledBg },
  input: {
    flex: 1,
    minHeight: touch.min,
    paddingHorizontal: 14,
    paddingVertical: space.md,
    color: colors.textPrimary,
    fontFamily: font.inter.regular,
    fontSize: 16, // 16pt stops iOS zooming and reads at arm's length
    lineHeight: 22,
  },
  inputDisabled: { color: colors.textSecondary },
  toggle: {
    width: touch.min,
    minHeight: touch.min,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  note: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  noteError: { color: colors.status.red.fg },
});
