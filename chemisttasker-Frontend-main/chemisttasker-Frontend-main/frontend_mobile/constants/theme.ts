import { MD3LightTheme } from 'react-native-paper';

// ChemistTasker Purple Theme - Matching MVP Design
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6366F1', // Indigo/Purple primary color
    primaryContainer: '#E0E7FF', // Light purple background
    secondary: '#EC4899', // Pink accent for certain actions
    secondaryContainer: '#FCE7F3',
    tertiary: '#10B981', // Green for success/confirmed
    tertiaryContainer: '#D1FAE5',
    error: '#EF4444',
    errorContainer: '#FEE2E2',
    background: '#F9FAFB', // Light gray background
    surface: '#FFFFFF',
    surfaceVariant: '#F3F4F6',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#312E81',
    onSecondary: '#FFFFFF',
    onBackground: '#111827',
    onSurface: '#111827',
    onSurfaceVariant: '#6B7280',
    outline: '#E5E7EB',
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
  confirmed: '#10B981',
  pending: '#F59E0B',
  cancelled: '#EF4444',
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
