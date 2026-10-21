import { CHEMISTTASKER_BRAND } from '@chemisttasker/shared-core';

/**
 * ChemistTasker Brand Design Tokens
 * Source of truth: this maintained module.
 */

export const BRAND_COLORS = {
  // Identity & Primary Typography
  navy: CHEMISTTASKER_BRAND.navy,
  
  // Primary Interactive Actions & Active Controls
  purple: CHEMISTTASKER_BRAND.violet,
  purpleHover: '#43199B',
  purpleLight: '#F3EEFF',

  // Small Brand Accents & Attention Badges
  magenta: CHEMISTTASKER_BRAND.magenta,
  magentaLight: '#FDF0FC',

  // Highlights, Network Accents & Active Badges
  cyan: CHEMISTTASKER_BRAND.cyan,
  cyanLight: '#E6FAF8',

  // Focus & Secondary Accents
  blue: CHEMISTTASKER_BRAND.blue,
  blueLight: '#EEF8FD',
  // Text on light surfaces: the accent blue is 3.3:1, this one is AA (5.5:1 on blueLight).
  blueText: '#0369A1',

  // Backgrounds & Surfaces
  mist: '#F5F8FC',
  white: '#FFFFFF',

  // Supporting Text & Borders
  body: '#59677E',
  border: '#E6EAF2',
  borderHover: '#CBD5E1',

  // Semantic Status
  success: '#10B981',
  successText: '#117A50',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  error: '#EF4444',
  errorLight: '#FEF2F2',
};

export const BRAND_FONTS = {
  heading: 'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

export const BRAND_SHADOWS = {
  card: '0 16px 50px rgba(6, 33, 74, 0.04)',
  cardHover: '0 20px 60px rgba(6, 33, 74, 0.08)',
  dialog: '0 25px 60px rgba(6, 33, 74, 0.12)',
};
