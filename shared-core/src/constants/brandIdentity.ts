/** Identity tokens used by Vite, Next and Expo. Platform presentation stays local. */
export const CHEMISTTASKER_BRAND = { navy: '#06214A', violet: '#5222B8', magenta: '#D600C8', cyan: '#00BDD2', blue: '#008DDB' } as const;

/** Identity, not permissions: map the active product persona to its brand accent.
 * Do not use these semantic tokens for error, warning, focus or disabled states.
 */
export const CHEMISTTASKER_PERSONA_BRAND = {
  owner: CHEMISTTASKER_BRAND.navy,
  admin: CHEMISTTASKER_BRAND.navy,
  pharmacist: CHEMISTTASKER_BRAND.violet,
  otherStaff: CHEMISTTASKER_BRAND.magenta,
  explorer: CHEMISTTASKER_BRAND.cyan,
  organization: CHEMISTTASKER_BRAND.blue,
} as const;
