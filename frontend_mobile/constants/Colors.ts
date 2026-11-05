/**
 * Application colors mapped to the design system tokens.
 */

import { tokens } from './tokens';

const tintColorLight = tokens.light.primary;
const tintColorDark = tokens.dark.primary;

export const Colors = {
  light: {
    text: tokens.light.textPrimary,
    background: tokens.light.surfaceBg,
    tint: tintColorLight,
    icon: tokens.light.textSecondary,
    tabIconDefault: tokens.light.textSecondary,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: tokens.dark.textPrimary,
    background: tokens.dark.surfaceBg,
    tint: tintColorDark,
    icon: tokens.dark.textSecondary,
    tabIconDefault: tokens.dark.textSecondary,
    tabIconSelected: tintColorDark,
  },
} as const;
