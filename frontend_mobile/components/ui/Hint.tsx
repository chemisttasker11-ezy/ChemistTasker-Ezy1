import React, { type ReactNode, useState } from 'react';
import { type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';
import { Info } from 'lucide-react-native';
import { colors, font, radius, touch, type } from '@/constants/tokens';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { ScalePressable } from './ScalePressable';

export type HintProps = {
  title: string;
  body?: string;
  /** What the person taps; it stays visible as it is. */
  children: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export type InfoHintProps = { title: string; body?: string; style?: StyleProp<ViewStyle> };

function HintSheet({ open, title, body, onClose }: { open: boolean; title: string; body?: string; onClose: () => void }) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      footer={<Button variant="outlined" label="Done" onPress={onClose} />}
    >
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </BottomSheet>
  );
}

/** Web's hover tooltip, the phone way: tapping the wrapped element explains it in a short sheet. */
export function Hint({ title, body, children, accessibilityLabel, style }: HintProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ScalePressable
        static
        onPress={() => setOpen(true)}
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint="Shows an explanation"
        style={[styles.trigger, style]}
      >
        {children}
      </ScalePressable>
      <HintSheet open={open} title={title} body={body} onClose={() => setOpen(false)} />
    </>
  );
}

/** The small "i" beside a heading; a touch-sized target (16pt glyph) that opens the explanation sheet. */
export function InfoHint({ title, body, style }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <ScalePressable
        onPress={() => setOpen(true)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityLabel={`About ${title}`}
        accessibilityHint="Shows an explanation"
        style={[styles.info, style]}
      >
        <Info size={16} color={open || pressed ? colors.accentStrong : colors.textMuted} strokeWidth={1.75} />
      </ScalePressable>
      <HintSheet open={open} title={title} body={body} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { alignSelf: 'flex-start', minWidth: touch.min, minHeight: touch.min, justifyContent: 'center' },
  // The full touch.min box is laid out (hitSlop stops at a tight parent; negative margins overlap neighbours).
  info: {
    width: touch.min,
    height: touch.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: type.bodyLarge.lineHeight,
  },
});
