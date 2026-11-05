import React, { memo, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { radius } from '@/constants/tokens';
import { sizeIcon } from './icon';
import { type Tone, toneVars } from './tone';

export type IconTileProps = {
  /** A Lucide element; size, colour and stroke come from the tile. */
  icon: ReactNode;
  tone?: Tone;
  /** 44 metric/action tiles, 36 shift rows, 32 activity rows. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Rounded tinted square holding an outline icon. Decorative: the row or card next to it carries the meaning. */
export const IconTile = memo(function IconTile({ icon, tone = 'violet', size = 44, style }: IconTileProps) {
  const { bg, fg } = toneVars(tone);
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size >= 40 ? radius.control : radius.tileSm, backgroundColor: bg },
        style,
      ]}
    >
      {sizeIcon(icon, Math.round(size * 0.45), fg)}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
