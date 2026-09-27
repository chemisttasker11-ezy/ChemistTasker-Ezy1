import { MD3LightTheme } from 'react-native-paper';

export const brandColors = {
  navy: '#06214A',
  purple: '#5222B8',
  magenta: '#D600C8',
  cyan: '#00BDD2',
  blue: '#008DDB',
  mist: '#F5F8FC',
  white: '#FFFFFF',
  text: '#111827',
  primary: '#6366F1',
  secondary: '#EC4899',
  info: '#0369A1',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  body: '#6B7280',
  border: '#E5E7EB',
  borderSoft: '#F3F4F6',
  success: '#10B981',
  successSoft: '#ECFDF5',
  warning: '#F59E0B',
  warningSoft: '#FFF7ED',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
} as const;

export const personaPalettes = {
  owner: { accent: '#4F46E5', soft: '#EEF2FF' },
  pharmacist: { accent: '#0EA5E9', soft: '#E0F2FE' },
  otherStaff: { accent: '#22C55E', soft: '#DCFCE7' },
  explorer: { accent: '#F97316', soft: '#FFEDD5' },
  organization: { accent: '#0369A1', soft: '#E0F2FE' },
  admin: { accent: '#6366F1', soft: '#EEF2FF' },
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

// ChemistTasker Purple Theme - Matching MVP Design
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: brandColors.primary, // Indigo/Purple primary color
    primaryContainer: '#E0E7FF', // Light purple background
    secondary: brandColors.secondary, // Pink accent for certain actions
    secondaryContainer: '#FCE7F3',
    tertiary: brandColors.success, // Green for success/confirmed
    tertiaryContainer: '#D1FAE5',
    error: brandColors.danger,
    errorContainer: '#FEE2E2',
    background: brandColors.background, // Light gray background
    surface: brandColors.surface,
    surfaceVariant: brandColors.surfaceMuted,
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#312E81',
    onSecondary: '#FFFFFF',
    onBackground: brandColors.text,
    onSurface: brandColors.text,
    onSurfaceVariant: brandColors.body,
    outline: brandColors.border,
    elevation: {
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#F9FAFB',
      level3: '#F3F4F6',
      level4: '#E5E7EB',
      level5: '#D1D5DB',
    },
  },
  roundness: 12, // Rounded corners like MVP
};

// Status Colors
export const statusColors = {
  confirmed: brandColors.success,
  pending: brandColors.warning,
  cancelled: brandColors.danger,
  completed: '#8B5CF6',
};

// Common spacing
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
