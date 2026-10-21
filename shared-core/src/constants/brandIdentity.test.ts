import { describe, expect, it } from 'vitest';
import { CHEMISTTASKER_BRAND, CHEMISTTASKER_PERSONA_BRAND } from './brandIdentity';
describe('unchanged cross-platform brand identity', () => {
 it('retains the existing approved five colours exactly', () => {
 expect(CHEMISTTASKER_BRAND).toEqual({ navy: '#06214A', violet: '#5222B8', magenta: '#D600C8', cyan: '#00BDD2', blue: '#008DDB' });
 });
});

describe('semantic persona accents are distinct from role permissions', () => {
  it('keeps the approved identity mapping without changing platform-specific UI defaults', () => {
    expect(CHEMISTTASKER_PERSONA_BRAND).toEqual({
      owner: '#06214A', admin: '#06214A', pharmacist: '#5222B8',
      otherStaff: '#D600C8', explorer: '#00BDD2', organization: '#008DDB',
    });
  });
});
