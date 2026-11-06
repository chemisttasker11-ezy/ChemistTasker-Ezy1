import React from 'react';
import { type StyleProp, type ViewProps, type ViewStyle, View } from 'react-native';
import { BrandLoader } from './BrandLoader';

export type BrandActivityIndicatorProps = ViewProps & {
  /** Size mapping: 'small' -> 24, 'large' -> 44, or explicit points number. Defaults to 'small' (24). */
  size?: 'small' | 'large' | number;
  /** Whether the indicator is animating. Defaults to true. If false and hidesWhenStopped is true, renders nothing. */
  animating?: boolean;
  /** Accepted for RN/Paper compatibility; brand loader uses uniform brand asset. */
  color?: string;
  /** Whether to hide when stopped/not animating. Defaults to true. */
  hidesWhenStopped?: boolean;
  /** Accessible progress label. Defaults to 'Loading…'. */
  accessibilityLabel?: string;
  /** Custom view style passed to outer wrapper container. */
  style?: StyleProp<ViewStyle>;
  /** Test identifier forwarded to outer container. */
  testID?: string;
};

/**
 * Drop-in compatibility adapter for React Native / React Native Paper ActivityIndicator.
 * Preserves legacy props (size small/large/numeric, animating, hidesWhenStopped, accessibilityLabel, style, testID)
 * while delegating rendering to the uniform clockwise ChemistTasker BrandLoader.
 * Wrapper props and layout style belong to the outer View, not the inner BrandLoader.
 */
export function BrandActivityIndicator({
  size = 'small',
  animating = true,
  color,
  hidesWhenStopped = true,
  accessibilityLabel = 'Loading…',
  style,
  testID,
  ...rest
}: BrandActivityIndicatorProps) {
  if (!animating && hidesWhenStopped) {
    return null;
  }

  const numericSize =
    typeof size === 'number' ? size : size === 'large' ? 44 : 24;

  return (
    <View testID={testID} style={style} {...rest}>
      <BrandLoader
        size={numericSize}
        animating={animating}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

export { BrandActivityIndicator as ActivityIndicator };
export default BrandActivityIndicator;
