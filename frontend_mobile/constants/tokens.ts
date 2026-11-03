import { Platform } from 'react-native';

export const font = {
  outfit: {
    medium: Platform.OS === 'ios' ? 'Outfit-Medium' : 'Outfit_500Medium',
    semiBold: Platform.OS === 'ios' ? 'Outfit-SemiBold' : 'Outfit_600SemiBold',
  },
  inter: {
    regular: Platform.OS === 'ios' ? 'Inter-Regular' : 'Inter_400Regular',
    medium: Platform.OS === 'ios' ? 'Inter-Medium' : 'Inter_500Medium',
    semiBold: Platform.OS === 'ios' ? 'Inter-SemiBold' : 'Inter_600SemiBold',
  },
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const radius = {
  sheet: 24,
  card: 20,
  banner: 20,
  nested: 14,
  control: 12,
  tileSm: 9,
  pill: 999,
} as const;

export const elevation = {
  floating: {
    shadowColor: '#06123A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

export const touch = {
  min: Platform.OS === 'android' ? 48 : 44,
} as const;

export const type = {
  displayLarge: {
    fontFamily: font.outfit.medium,
    family: font.outfit.medium,
    fontSize: 36,
    size: 36,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 40,
    letterSpacing: -0.9,
  },
  displayMedium: {
    fontFamily: font.outfit.medium,
    family: font.outfit.medium,
    fontSize: 28,
    size: 28,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 32,
    letterSpacing: -0.7,
  },
  displaySmall: {
    fontFamily: font.outfit.medium,
    family: font.outfit.medium,
    fontSize: 26,
    size: 26,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 30,
    letterSpacing: -0.65,
  },
  headlineLarge: {
    fontFamily: font.outfit.medium,
    family: font.outfit.medium,
    fontSize: 26,
    size: 26,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 30,
    letterSpacing: -0.65,
  },
  headlineMedium: {
    fontFamily: font.outfit.medium,
    family: font.outfit.medium,
    fontSize: 24,
    size: 24,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  headlineSmall: {
    fontFamily: font.outfit.medium,
    family: font.outfit.medium,
    fontSize: 22,
    size: 22,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  titleLarge: {
    fontFamily: font.outfit.medium,
    family: font.outfit.medium,
    fontSize: 20,
    size: 20,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  titleMedium: {
    fontFamily: font.outfit.medium,
    family: font.outfit.medium,
    fontSize: 18,
    size: 18,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 23,
    letterSpacing: -0.27,
  },
  titleSmall: {
    fontFamily: font.outfit.medium,
    family: font.outfit.medium,
    fontSize: 16,
    size: 16,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  bodyLarge: {
    fontFamily: font.inter.regular,
    family: font.inter.regular,
    fontSize: 15,
    size: 15,
    fontWeight: '400' as const,
    weight: '400' as const,
    lineHeight: 23,
    letterSpacing: 0,
  },
  bodyMedium: {
    fontFamily: font.inter.regular,
    family: font.inter.regular,
    fontSize: 14,
    size: 14,
    fontWeight: '400' as const,
    weight: '400' as const,
    lineHeight: 21,
    letterSpacing: 0,
  },
  bodySmall: {
    fontFamily: font.inter.regular,
    family: font.inter.regular,
    fontSize: 13,
    size: 13,
    fontWeight: '400' as const,
    weight: '400' as const,
    lineHeight: 19,
    letterSpacing: 0,
  },
  labelLarge: {
    fontFamily: font.inter.semiBold,
    family: font.inter.semiBold,
    fontSize: 14,
    size: 14,
    fontWeight: '600' as const,
    weight: '600' as const,
    lineHeight: 20,
    letterSpacing: 0,
  },
  labelMedium: {
    fontFamily: font.inter.semiBold,
    family: font.inter.semiBold,
    fontSize: 12.5,
    size: 12.5,
    fontWeight: '600' as const,
    weight: '600' as const,
    lineHeight: 16,
    letterSpacing: 0,
  },
  labelSmall: {
    fontFamily: font.inter.medium,
    family: font.inter.medium,
    fontSize: 11.5,
    size: 11.5,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 16,
    letterSpacing: 0,
  },
} as const;

export const tokens = {
  light: {
    brandNavy: '#06214A',
    primary: '#5222B8',
    primaryPressed: '#40168F',
    primarySoft: '#EFE7FF',
    accentStrong: '#3C18A8',
    secondary: '#C000B4',
    pageBg: '#F7F9FC',
    surfaceBg: '#FFFFFF',
    elevatedBg: '#FFFFFF',
    subtleBg: '#F7F8FC',
    inputBg: '#FFFFFF',
    pressBg: 'rgba(226,232,240,0.50)',
    border: '#E5ECF7',
    inputBorder: '#D9E0EC',
    textPrimary: '#06123A',
    textSecondary: '#5E6B8D',
    textMuted: '#63708C',
    disabledBg: '#F1F5F9',
    disabledFg: '#94A3B8',
    scrim: 'rgba(6,18,58,0.48)',
    tone: {
      violet: { bg: '#EFE9FD', fg: '#3C18A8' },
      blue: { bg: '#E6F1FC', fg: '#0063A8' },
      cyan: { bg: '#DFF7F9', fg: '#007486' },
      magenta: { bg: '#FCE6F8', fg: '#A3008F' },
    },
    status: {
      green: { solid: '#117A50', bg: '#E4F5EA', fg: '#17663A' },
      amber: { solid: '#A15C07', bg: '#FDF0D9', fg: '#8A4B00' },
      red: { solid: '#C9364A', bg: '#FDE8E7', fg: '#B42318' },
    },
    persona: {
      owner: { softBg: '#EEF2FF', accentFill: '#4F46E5', textAA: '#4F46E5' },
      pharmacist: { softBg: '#E0F2FE', accentFill: '#0EA5E9', textAA: '#0369A1' },
      otherStaff: { softBg: '#DCFCE7', accentFill: '#22C55E', textAA: '#17663A' },
      explorer: { softBg: '#FFEDD5', accentFill: '#F97316', textAA: '#C2410C' },
      organization: { softBg: '#E0F2FE', accentFill: '#0369A1', textAA: '#0369A1' },
      admin: { softBg: '#EEF2FF', accentFill: '#6366F1', textAA: '#4338CA' },
    },
  },
  dark: {
    brandNavy: '#06214A',
    primary: '#AA81E9',
    primaryPressed: '#7D45CB',
    primarySoft: 'rgba(170,129,233,0.18)',
    accentStrong: '#B9A5F5',
    secondary: '#F09BE4',
    pageBg: '#08111F',
    surfaceBg: '#101A2D',
    elevatedBg: '#142036',
    subtleBg: 'rgba(255,255,255,0.03)',
    inputBg: '#0C1628',
    pressBg: 'rgba(255,255,255,0.06)',
    border: 'rgba(148,163,184,0.24)',
    inputBorder: 'rgba(148,163,184,0.24)',
    textPrimary: '#EAF1FF',
    textSecondary: '#A9B8D3',
    textMuted: '#8E9BB5',
    disabledBg: 'rgba(255,255,255,0.08)',
    disabledFg: 'rgba(234,241,255,0.38)',
    scrim: 'rgba(2,8,23,0.68)',
    tone: {
      violet: { bg: 'rgba(139,108,240,0.18)', fg: '#C6B6F7' },
      blue: { bg: 'rgba(63,155,232,0.18)', fg: '#8CC6F5' },
      cyan: { bg: 'rgba(34,184,201,0.18)', fg: '#7FDCE6' },
      magenta: { bg: 'rgba(214,59,196,0.18)', fg: '#F09BE4' },
    },
    status: {
      green: { solid: '#34C27A', bg: 'rgba(52,194,122,0.18)', fg: '#8EE0B3' },
      amber: { solid: '#F5B85A', bg: 'rgba(240,168,58,0.18)', fg: '#F6C77E' },
      red: { solid: '#FF8A97', bg: 'rgba(240,106,94,0.18)', fg: '#F7A39B' },
    },
    persona: {
      owner: { softBg: '#EEF2FF', accentFill: '#4F46E5', textAA: '#C6B6F7' },
      pharmacist: { softBg: '#E0F2FE', accentFill: '#0EA5E9', textAA: '#7DD3FC' },
      otherStaff: { softBg: '#DCFCE7', accentFill: '#22C55E', textAA: '#8EE0B3' },
      explorer: { softBg: '#FFEDD5', accentFill: '#F97316', textAA: '#FDBA74' },
      organization: { softBg: '#E0F2FE', accentFill: '#0369A1', textAA: '#8CC6F5' },
      admin: { softBg: '#EEF2FF', accentFill: '#6366F1', textAA: '#A5B4FC' },
    },
  },
  space,
  radius,
  elevation,
  font,
  type,
  touch,
} as const;

export const colors = tokens.light;
export const tone = tokens.light.tone;
export const status = tokens.light.status;
export const persona = tokens.light.persona;
export const spacing = space;

export type Tokens = typeof tokens;
export type ColorTokens = typeof tokens.light;
export type SpaceTokens = typeof space;
export type RadiusTokens = typeof radius;
export type TypeTokens = typeof type;
