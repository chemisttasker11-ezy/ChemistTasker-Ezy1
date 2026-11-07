import React, { useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { GuardedModal as Modal } from '@/components/security/GuardedModal';
import { Check, ChevronDown } from 'lucide-react-native';
import { colors, font, radius, type } from '@/constants/tokens';

const trackGap = 4, trackPadding = 4, border = 1, itemPadding = 7, itemGap = 4;

export type Choice = { value: string; label: string; accessibilityLabel?: string; icon?: ReactNode; disabled?: boolean; onPress?: (event: GestureResponderEvent) => void; style?: StyleProp<ViewStyle>; labelStyle?: StyleProp<TextStyle> };
export function FitChoices({ choices, value, onChange, label, idPrefix, tabs = false, secondary = false, style }: { choices: Choice[]; value: string; onChange: (value: string) => void; label: string; idPrefix?: string; tabs?: boolean; secondary?: boolean; style?: StyleProp<ViewStyle> }) {
  const { fontScale, height: windowHeight } = useWindowDimensions();
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [width, setWidth] = useState(0);
  const [measurements, setMeasurements] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const trigger = useRef<React.ElementRef<typeof View>>(null);
  const current = choices.find(c => c.value === value) ?? choices[0];
  const keyFor = (c: Choice) => `${fontScale}:${c.value}`;
  const available = (width - 2 * (trackPadding + border) - Math.max(0, choices.length - 1) * trackGap) / choices.length;
  const allMeasured = choices.every(c => measurements[keyFor(c)] !== undefined);
  const fits = !allMeasured || (width > 0 && choices.every(c => measurements[keyFor(c)] + (c.icon ? (tabs ? 16 : 18) + itemGap : 0) + 2 * (itemPadding + border) <= available && available >= 48));
  const menuHeight = Math.min(choices.length * 48 + 8, windowHeight - 32);
  const below = windowHeight - anchor.y - anchor.height;
  const top = below >= menuHeight + 4 || below >= anchor.y ? anchor.y + anchor.height + 4 : Math.max(8, anchor.y - menuHeight - 4);
  const maxHeight = Math.max(48, Math.min(menuHeight, top > anchor.y ? windowHeight - top - 8 : anchor.y - top - 4));
  const dismiss = () => { setOpen(false); requestAnimationFrame(() => { const handle = findNodeHandle(trigger.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); }); };
  const pick = (choice: Choice, event: GestureResponderEvent) => { if (choice.disabled) return; choice.onPress?.(event); if (!tabs || choice.value !== value) onChange(choice.value); if (open) dismiss(); };
  const item = (c: Choice, selected: boolean, selector: boolean) => <Pressable key={c.value} nativeID={tabs && idPrefix && !selector ? `${idPrefix}-tab-${c.value}` : undefined} accessibilityRole={selector || !tabs ? 'radio' : 'tab'} accessibilityLabel={c.accessibilityLabel ?? c.label} accessibilityState={selector || !tabs ? { checked: selected, disabled: !!c.disabled } : { selected, disabled: !!c.disabled }} disabled={c.disabled} onPress={event => pick(c, event)} style={[styles.item, selector ? styles.option : styles.equal, selected && styles.selected, c.disabled && styles.disabled, c.style]}>{c.icon}<Text numberOfLines={1} style={[styles.text, c.labelStyle, selected && styles.selectedText]}>{c.label}</Text>{selector && selected ? <Check size={18} color={colors.accentStrong} style={styles.check} /> : null}</Pressable>;
  return <View style={style} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.measure}>{choices.map(c => <Text key={keyFor(c)} onLayout={event => { const measured = event.nativeEvent.layout.width; setMeasurements(prev => prev[keyFor(c)] === measured ? prev : { ...prev, [keyFor(c)]: measured }); }} style={[styles.text, c.labelStyle, styles.measureText]}>{c.label}</Text>)}</View>
    {fits ? <View accessibilityRole={tabs ? 'tablist' : 'radiogroup'} accessibilityLabel={label} style={styles.row}>{choices.map(c => item(c, c.value === value, false))}</View> : current ? <Pressable ref={trigger} nativeID={tabs && idPrefix ? `${idPrefix}-tab-${value}` : undefined} accessibilityRole="button" accessibilityLabel={`${label}, ${current.accessibilityLabel ?? current.label}, double tap to change`} onPress={() => trigger.current?.measureInWindow((x, y, width, height) => { setAnchor({ x, y, width, height }); setOpen(true); })} style={[styles.item, styles.trigger, styles.selected, secondary && styles.secondary]}>{current.icon}<Text numberOfLines={1} style={[styles.text, styles.selectedText]}>{current.label}</Text><ChevronDown size={18} color={colors.accentStrong} /></Pressable> : null}
    <Modal transparent visible={open} statusBarTranslucent onRequestClose={dismiss}>{open ? <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close menu" accessibilityRole="button" /><View style={[styles.menu, { left: anchor.x, top, width: anchor.width, maxHeight }]}><ScrollView accessibilityRole="radiogroup" accessibilityLabel={label} keyboardShouldPersistTaps="handled">{choices.map(c => item(c, c.value === value, true))}</ScrollView></View></View> : null}</Modal>
  </View>;
}
const styles = StyleSheet.create({
  measure: { position: 'absolute', opacity: 0, alignItems: 'flex-start' }, measureText: { fontFamily: font.inter.semiBold },
  row: { flexDirection: 'row', gap: trackGap, padding: trackPadding, borderRadius: radius.card, borderWidth: border, borderColor: colors.border, backgroundColor: colors.surfaceBg },
  item: { minHeight: 48, minWidth: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: itemGap, paddingHorizontal: itemPadding, borderRadius: radius.nested, borderWidth: border, borderColor: colors.border, backgroundColor: colors.surfaceBg },
  equal: { flex: 1, flexBasis: 0 }, trigger: { width: '100%' }, option: { justifyContent: 'flex-start', borderWidth: 0, borderRadius: 12 }, check: { marginLeft: 'auto' }, secondary: { backgroundColor: colors.surfaceBg, borderColor: colors.tone.violet.border }, overlay: { flex: 1 }, menu: { position: 'absolute', padding: 4, borderRadius: 16, backgroundColor: colors.surfaceBg, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.16)' }, selected: { backgroundColor: colors.tone.violet.bg, borderColor: colors.tone.violet.bg }, disabled: { opacity: 0.5 },
  text: { flexShrink: 1, textAlign: 'center', color: colors.textSecondary, fontFamily: font.inter.medium, fontSize: type.labelMedium.fontSize, lineHeight: type.labelMedium.lineHeight }, selectedText: { color: colors.accentStrong, fontFamily: font.inter.semiBold },
});
