import { MD3LightTheme, configureFonts } from 'react-native-paper';
import { tokens, spacing as tokenSpacing } from './tokens';

export const brandColors = {
  navy: tokens.light.brandNavy,
  purple: tokens.light.primary,
  magenta: tokens.light.secondary,
  cyan: tokens.light.tone.cyan.fg,
  blue: tokens.light.tone.blue.fg,
  mist: tokens.light.pageBg,
  white: tokens.light.surfaceBg,
  text: tokens.light.textPrimary,
  primary: tokens.light.primary,
  secondary: tokens.light.secondary,
  info: tokens.light.tone.blue.fg,
  background: tokens.light.pageBg,
  surface: tokens.light.surfaceBg,
  surfaceMuted: tokens.light.subtleBg,
  body: tokens.light.textSecondary,
  border: tokens.light.border,
  borderSoft: tokens.light.subtleBg,
  success: tokens.light.status.green.solid,
  successSoft: tokens.light.status.green.bg,
  warning: tokens.light.status.amber.solid,
  warningSoft: tokens.light.status.amber.bg,
  danger: tokens.light.status.red.solid,
  dangerSoft: tokens.light.status.red.bg,
} as const;

export const personaPalettes = {
  owner: {
    accent: tokens.light.persona.owner.accentFill,
    soft: tokens.light.persona.owner.softBg,
    textAA: tokens.light.persona.owner.textAA,
  },
  pharmacist: {
    accent: tokens.light.persona.pharmacist.accentFill,
    soft: tokens.light.persona.pharmacist.softBg,
    textAA: tokens.light.persona.pharmacist.textAA,
  },
  otherStaff: {
    accent: tokens.light.persona.otherStaff.accentFill,
    soft: tokens.light.persona.otherStaff.softBg,
    textAA: tokens.light.persona.otherStaff.textAA,
  },
  explorer: {
    accent: tokens.light.persona.explorer.accentFill,
    soft: tokens.light.persona.explorer.softBg,
    textAA: tokens.light.persona.explorer.textAA,
  },
  organization: {
    accent: tokens.light.persona.organization.accentFill,
    soft: tokens.light.persona.organization.softBg,
    textAA: tokens.light.persona.organization.textAA,
  },
  admin: {
    accent: tokens.light.persona.admin.accentFill,
    soft: tokens.light.persona.admin.softBg,
    textAA: tokens.light.persona.admin.textAA,
  },
} as const;

export type PersonaPalette = (typeof personaPalettes)[keyof typeof personaPalettes];

export function getPersonaPalette(role?: string | null): PersonaPalette {
  const normalized = String(role || '').toUpperCase();
  if (['ORGANIZATION', 'ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN'].includes(normalized)) {
    return personaPalettes.organization;
  }
  if (normalized === 'PHARMACIST') return personaPalettes.pharmacist;
  if (normalized === 'OTHER_STAFF') return personaPalettes.otherStaff;
  if (normalized === 'EXPLORER') return personaPalettes.explorer;
  if (normalized === 'ADMIN') return personaPalettes.admin;
  return personaPalettes.owner;
}

export const spacing = {
  xs: tokenSpacing.xs,
  sm: tokenSpacing.sm,
  md: tokenSpacing.lg, // 16
  lg: tokenSpacing['2xl'], // 24
  xl: tokenSpacing['3xl'], // 32
} as const;

export const statusColors = {
  confirmed: tokens.light.status.green.solid,
  pending: tokens.light.status.amber.solid,
  cancelled: tokens.light.status.red.solid,
  completed: tokens.light.primary,
} as const;

const paperFontConfig = {
  displayLarge: {
    fontFamily: tokens.type.displayLarge.fontFamily,
    fontSize: tokens.type.displayLarge.fontSize,
    lineHeight: tokens.type.displayLarge.lineHeight,
    letterSpacing: tokens.type.displayLarge.letterSpacing,
    fontWeight: '500' as const,
  },
  displayMedium: {
    fontFamily: tokens.type.displayMedium.fontFamily,
    fontSize: tokens.type.displayMedium.fontSize,
    lineHeight: tokens.type.displayMedium.lineHeight,
    letterSpacing: tokens.type.displayMedium.letterSpacing,
    fontWeight: '500' as const,
  },
  displaySmall: {
    fontFamily: tokens.type.displaySmall.fontFamily,
    fontSize: tokens.type.displaySmall.fontSize,
    lineHeight: tokens.type.displaySmall.lineHeight,
    letterSpacing: tokens.type.displaySmall.letterSpacing,
    fontWeight: '500' as const,
  },
  headlineLarge: {
    fontFamily: tokens.type.headlineLarge.fontFamily,
    fontSize: tokens.type.headlineLarge.fontSize,
    lineHeight: tokens.type.headlineLarge.lineHeight,
    letterSpacing: tokens.type.headlineLarge.letterSpacing,
    fontWeight: '500' as const,
  },
  headlineMedium: {
    fontFamily: tokens.type.headlineMedium.fontFamily,
    fontSize: tokens.type.headlineMedium.fontSize,
    lineHeight: tokens.type.headlineMedium.lineHeight,
    letterSpacing: tokens.type.headlineMedium.letterSpacing,
    fontWeight: '500' as const,
  },
  headlineSmall: {
    fontFamily: tokens.type.headlineSmall.fontFamily,
    fontSize: tokens.type.headlineSmall.fontSize,
    lineHeight: tokens.type.headlineSmall.lineHeight,
    letterSpacing: tokens.type.headlineSmall.letterSpacing,
    fontWeight: '500' as const,
  },
  titleLarge: {
    fontFamily: tokens.type.titleLarge.fontFamily,
    fontSize: tokens.type.titleLarge.fontSize,
    lineHeight: tokens.type.titleLarge.lineHeight,
    letterSpacing: tokens.type.titleLarge.letterSpacing,
    fontWeight: '500' as const,
  },
  titleMedium: {
    fontFamily: tokens.type.titleMedium.fontFamily,
    fontSize: tokens.type.titleMedium.fontSize,
    lineHeight: tokens.type.titleMedium.lineHeight,
    letterSpacing: tokens.type.titleMedium.letterSpacing,
    fontWeight: '500' as const,
  },
  titleSmall: {
    fontFamily: tokens.type.titleSmall.fontFamily,
    fontSize: tokens.type.titleSmall.fontSize,
    lineHeight: tokens.type.titleSmall.lineHeight,
    letterSpacing: tokens.type.titleSmall.letterSpacing,
    fontWeight: '500' as const,
  },
  bodyLarge: {
    fontFamily: tokens.type.bodyLarge.fontFamily,
    fontSize: tokens.type.bodyLarge.fontSize,
    lineHeight: tokens.type.bodyLarge.lineHeight,
    letterSpacing: tokens.type.bodyLarge.letterSpacing,
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontFamily: tokens.type.bodyMedium.fontFamily,
    fontSize: tokens.type.bodyMedium.fontSize,
    lineHeight: tokens.type.bodyMedium.lineHeight,
    letterSpacing: tokens.type.bodyMedium.letterSpacing,
    fontWeight: '400' as const,
  },
  bodySmall: {
    fontFamily: tokens.type.bodySmall.fontFamily,
    fontSize: tokens.type.bodySmall.fontSize,
    lineHeight: tokens.type.bodySmall.lineHeight,
    letterSpacing: tokens.type.bodySmall.letterSpacing,
    fontWeight: '400' as const,
  },
  labelLarge: {
    fontFamily: tokens.type.labelLarge.fontFamily,
    fontSize: tokens.type.labelLarge.fontSize,
    lineHeight: tokens.type.labelLarge.lineHeight,
    letterSpacing: tokens.type.labelLarge.letterSpacing,
    fontWeight: '600' as const,
  },
  labelMedium: {
    fontFamily: tokens.type.labelMedium.fontFamily,
    fontSize: tokens.type.labelMedium.fontSize,
    lineHeight: tokens.type.labelMedium.lineHeight,
    letterSpacing: tokens.type.labelMedium.letterSpacing,
    fontWeight: '600' as const,
  },
  labelSmall: {
    fontFamily: tokens.type.labelSmall.fontFamily,
    fontSize: tokens.type.labelSmall.fontSize,
    lineHeight: tokens.type.labelSmall.lineHeight,
    letterSpacing: tokens.type.labelSmall.letterSpacing,
    fontWeight: '500' as const,
  },
  default: {
    fontFamily: tokens.type.bodyMedium.fontFamily,
    letterSpacing: tokens.type.bodyMedium.letterSpacing,
    fontWeight: '400' as const,
  },
};

// ChemistTasker Purple Theme built from tokens
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: tokens.light.primary,
    primaryContainer: tokens.light.primarySoft,
    secondary: tokens.light.secondary,
    secondaryContainer: tokens.light.tone.violet.bg,
    tertiary: tokens.light.status.green.solid,
    tertiaryContainer: tokens.light.status.green.bg,
    error: tokens.light.status.red.solid,
    errorContainer: tokens.light.status.red.bg,
    background: tokens.light.pageBg,
    surface: tokens.light.surfaceBg,
    surfaceVariant: tokens.light.subtleBg,
    onPrimary: tokens.light.surfaceBg,
    onPrimaryContainer: tokens.light.accentStrong,
    onSecondary: tokens.light.surfaceBg,
    onSecondaryContainer: tokens.light.tone.violet.fg,
    onTertiary: tokens.light.surfaceBg,
    onTertiaryContainer: tokens.light.status.green.fg,
    onError: tokens.light.surfaceBg,
    onErrorContainer: tokens.light.status.red.fg,
    onBackground: tokens.light.textPrimary,
    onSurface: tokens.light.textPrimary,
    onSurfaceVariant: tokens.light.textSecondary,
    outline: tokens.light.inputBorder,
    outlineVariant: tokens.light.border,
    inverseSurface: tokens.dark.surfaceBg,
    inverseOnSurface: tokens.dark.textPrimary,
    inversePrimary: tokens.dark.primary,
    scrim: tokens.light.scrim,
    elevation: {
      level0: 'transparent',
      level1: tokens.light.surfaceBg,
      level2: tokens.light.surfaceBg,
      level3: tokens.light.surfaceBg,
      level4: tokens.light.surfaceBg,
      level5: tokens.light.surfaceBg,
    },
  },
  roundness: tokens.radius.control,
  fonts: configureFonts({ config: paperFontConfig }),
  spacing,
};
