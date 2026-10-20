import { describe, expect, it } from 'vitest';
import { CHEMISTTASKER_BRAND } from './brandIdentity';
describe('unchanged cross-platform brand identity', () => {
 it('retains the existing approved five colours exactly', () => {
 expect(CHEMISTTASKER_BRAND).toEqual({ navy: '#06214A', violet: '#5222B8', magenta: '#D600C8', cyan: '#00BDD2', blue: '#008DDB' });
 });
});
