import React, { type ComponentProps } from 'react';
import { type GestureResponderEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Icon } from 'react-native-paper';
import { colors } from '@/constants/tokens';
import { FitChoices } from './FitChoices';
type Button = { value: string; label: string; icon?: ComponentProps<typeof Icon>['source']; disabled?: boolean; onPress?: (event: GestureResponderEvent) => void; style?: StyleProp<ViewStyle>; labelStyle?: StyleProp<TextStyle> };
type Props = { value: string; onValueChange: (value: string) => void; buttons: Button[]; style?: StyleProp<ViewStyle>; accessibilityLabel?: string };
export function ResponsiveSegmentedButtons({ value, onValueChange, buttons, style, accessibilityLabel = 'Options' }: Props) {
  return <FitChoices choices={buttons.map(b => ({ ...b, icon: b.icon ? <Icon source={b.icon} size={18} color={b.value === value ? colors.accentStrong : colors.textSecondary} /> : undefined }))} value={value} onChange={onValueChange} label={accessibilityLabel} secondary style={style} />;
}
