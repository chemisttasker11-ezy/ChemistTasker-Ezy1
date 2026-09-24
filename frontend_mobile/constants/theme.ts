import { MD3LightTheme } from 'react-native-paper';

export const brandColors = {
  navy: '#06214A',
  purple: '#5222B8',
  magenta: '#D600C8',
  cyan: '#00BDD2',
  blue: '#008DDB',
  mist: '#F5F8FC',
  white: '#FFFFFF',
  body: '#59677E',
  border: '#E6EAF2',
  borderSoft: '#EDF0F5',
  surfaceMuted: '#F8FAFC',
  success: '#0E8A6A',
  successSoft: '#E9F8F2',
  warning: '#B7791F',
  warningSoft: '#FFF7E8',
  danger: '#C53B47',
  dangerSoft: '#FDEEEF',
} as const;

export const personaPalettes = {
  owner: {
    accent: brandColors.navy,
    soft: '#F1F5F9',
    deep: '#04142E',
    gradient: ['#04142E', '#06214A', '#0D3F78'] as const,
  },
  pharmacist: {
    accent: brandColors.purple,
    soft: '#F0EAFF',
    deep: '#281457',
    gradient: ['#281457', '#5222B8', '#6F49D9'] as const,
  },
  otherStaff: {
    accent: brandColors.magenta,
    soft: '#FDE9FA',
    deep: '#401454',
    gradient: ['#401454', '#8E2CC3', '#D600C8'] as const,
  },
  explorer: {
    accent: brandColors.cyan,
    soft: '#E5FBFD',
    deep: '#073D5B',
    gradient: ['#073D5B', '#007B96', '#00BDD2'] as const,
  },
  organization: {
    accent: brandColors.blue,
    soft: '#E8F5FB',
    deep: '#07476D',
    gradient: ['#07476D', '#0073A9', '#008DDB'] as const,
  },
  admin: {
    accent: brandColors.navy,
    soft: '#F1F5F9',
    deep: '#04142E',
    gradient: ['#04142E', '#06214A', '#0D3F78'] as const,
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

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: brandColors.purple,
    primaryContainer: '#F0EAFF',
    secondary: brandColors.blue,
    secondaryContainer: '#E8F5FB',
    tertiary: brandColors.cyan,
    tertiaryContainer: '#E5FBFD',
    error: brandColors.danger,
    errorContainer: brandColors.dangerSoft,
    background: brandColors.mist,
    surface: brandColors.white,
    surfaceVariant: '#F0F4F8',
    onPrimary: brandColors.white,
    onPrimaryContainer: '#281457',
    onSecondary: brandColors.white,
    onSecondaryContainer: '#064C72',
    onTertiary: '#043D46',
    onTertiaryContainer: '#043D46',
    onBackground: brandColors.navy,
    onSurface: brandColors.navy,
    onSurfaceVariant: brandColors.body,
    outline: brandColors.border,
    outlineVariant: brandColors.borderSoft,
    elevation: {
      level0: 'transparent',
      level1: brandColors.white,
      level2: '#FAFBFD',
      level3: '#F7F9FC',
      level4: '#F3F6FA',
      level5: '#EEF3F8',
    },
  },
  roundness: 14,
};

export const statusColors = {
  confirmed: brandColors.success,
  pending: brandColors.warning,
  cancelled: brandColors.danger,
  completed: brandColors.purple,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
