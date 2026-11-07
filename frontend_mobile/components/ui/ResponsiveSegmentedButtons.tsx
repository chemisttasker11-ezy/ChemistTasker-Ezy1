import React, { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Icon } from 'react-native-paper';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';

type Button = {
  value: string;
  label: string;
  icon?: ComponentProps<typeof Icon>['source'];
  disabled?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  buttons: Button[];
  style?: StyleProp<ViewStyle>;
};

/** A bounded set of form choices that wraps to its actual container width. */
export function ResponsiveSegmentedButtons({ value, onValueChange, buttons, style }: Props) {
  return (
    <View accessibilityRole="radiogroup" style={[styles.group, style]}>
      {buttons.map((button) => {
        const checked = button.value === value;
        return (
          <Pressable
            key={button.value}
            accessibilityRole="radio"
            accessibilityLabel={button.label}
            accessibilityState={{ checked, disabled: !!button.disabled }}
            disabled={button.disabled}
            onPress={(event) => {
              if (button.disabled) return;
              button.onPress?.(event);
              onValueChange(button.value);
            }}
            style={[styles.button, checked && styles.selected, button.disabled && styles.disabled, button.style]}
          >
            <Text accessible={false} style={[styles.check, { opacity: checked ? 1 : 0 }]}>✓</Text>
            {button.icon ? <Icon source={button.icon} size={18} color={checked ? colors.accentStrong : colors.textSecondary} /> : null}
            <Text style={[styles.label, button.labelStyle]}>{button.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'stretch' },
  button: { maxWidth: '100%', flexShrink: 1, minHeight: Math.max(48, touch.min), flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.nested, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceBg },
  selected: { borderColor: colors.accentStrong, backgroundColor: colors.tone.violet.bg },
  disabled: { opacity: 0.5 },
  check: { width: 18, color: colors.accentStrong, fontSize: 16 },
  label: { flexShrink: 1, color: colors.textPrimary, fontFamily: font.inter.medium, fontSize: type.labelMedium.fontSize },
});
