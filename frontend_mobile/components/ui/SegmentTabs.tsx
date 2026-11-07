import React, { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { FitChoices } from './FitChoices';
import { sizeIcon } from './icon';
import { colors } from '@/constants/tokens';
export type SegmentTab<T extends string> = { value: T; label: string; accessibilityLabel?: string; icon?: ReactNode };
export function tabPanelProps(idPrefix: string, value: string) { return { nativeID: `${idPrefix}-panel`, accessibilityLabelledBy: `${idPrefix}-tab-${value}` } as const; }
export type SegmentTabsProps<T extends string> = { tabs: SegmentTab<T>[]; value: T; onChange: (value: T) => void; label: string; idPrefix?: string; mobileWrap?: boolean; style?: StyleProp<ViewStyle>; scrollPaddingHorizontal?: number; secondary?: boolean };
export function SegmentTabs<T extends string>({ tabs, value, onChange, label, idPrefix = 'ct-tabs', style, secondary }: SegmentTabsProps<T>) {
  return <FitChoices choices={tabs.map(t => ({ ...t, icon: t.icon ? sizeIcon(t.icon, 16, t.value === value ? colors.accentStrong : colors.textSecondary, t.value === value ? 2 : 1.75) : undefined }))} value={value} onChange={v => onChange(v as T)} label={label} idPrefix={idPrefix} tabs secondary={secondary} style={style} />;
}
