import { describe, expect, it } from 'vitest';
import { apiUrl, assertAllowedPath } from './urls';

describe('linear API URL normalization', () => {
  it('normalizes a long slash suffix in one pass', () => {
    expect(apiUrl('https://example.test/api' + '/'.repeat(100000), '/resource/').href)
      .toBe('https://example.test/api/resource/');
  });
  it('retains slash runs inside a path rather than erasing resource identity', () => {
    expect(apiUrl('https://example.test/api///nested/', '/resource/').pathname)
      .toBe('/api///nested/resource/');
  });
  it('rejects URL credentials after normalization', () => {
    expect(() => apiUrl('https://secret@example.test/api///', '/resource/')).toThrow('Invalid API base');
  });
  it('does not broaden a normalized finance boundary', () => {
    const root = 'https://example.test/api///';
    expect(() => assertAllowedPath(root, new URL('https://example.test/api/finance/invoices/'), '/finance///')).not.toThrow();
    expect(() => assertAllowedPath(root, new URL('https://example.test/api/finance-other/'), '/finance///')).toThrow();
  });
});
