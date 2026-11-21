import React, { memo, useState } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { EyeOff } from 'lucide-react-native';
import { colors, font, radius } from '@/constants/tokens';
import { durations } from '@/constants/motion';
import { alpha, type StatusTone, toneColors } from './tone';

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export type InitialsAvatarProps = {
  name: string;
  tone?: StatusTone;
  /** Platform candidates before reveal: EyeOff on neutral, never a photo or initials. */
  anonymous?: boolean;
  size?: number;
  photoUrl?: string | null;
  style?: StyleProp<ViewStyle>;
};

/** Photo, or two initials on a tone, or EyeOff when anonymous. Decorative: the row says who it is. */
export const InitialsAvatar = memo(function InitialsAvatar({
  name,
  tone = 'violet',
  anonymous = false,
  size = 34,
  photoUrl,
  style,
}: InitialsAvatarProps) {
  // Remembers which URL failed, so a new URL gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = !anonymous && photoUrl && photoUrl !== failedUrl ? photoUrl : null;
  const { bg, fg } = toneColors(anonymous ? 'neutral' : tone);

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.circle,
        { width: size, height: size, backgroundColor: bg },
        // The neutral fill is near-white; a hairline keeps the circle visible on white cards.
        anonymous ? styles.outline : null,
        style,
      ]}
    >
      {photo ? (
        <>
          <Image
            source={{ uri: photo }}
            contentFit="cover"
            transition={durations.quick}
            onError={() => setFailedUrl(photo)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.ring]} />
        </>
      ) : anonymous ? (
        <EyeOff size={Math.round(size * 0.45)} color={fg} strokeWidth={2} />
      ) : (
        // Fixed-size circle: initials do not scale with the OS font size (the row's name does).
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.initials, { color: fg, fontSize: Math.round(size * 0.36) }]}
        >
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  outline: { borderWidth: 1, borderColor: colors.border },
  // make-interfaces-feel-better §11: a dark 10% edge, not the pale border, so photos never get a light halo.
  ring: { borderRadius: radius.pill, borderWidth: 1, borderColor: alpha(colors.textPrimary, 0.1), pointerEvents: 'none' },
  initials: { fontFamily: font.inter.semiBold },
});
