import { describe, expect, it } from 'vitest';
import { apiUrl, assertAllowedPath } from './urls';

describe('linear API URL normalization', () => {
  it('normalizes a long slash suffix in one pass', () => {
    expect(apiUrl('https://example.test/api/v1' + '/'.repeat(100000), '/resource/').href)
      .toBe('https://example.test/api/v1/resource/');
  });
  it('retains slash runs inside a path rather than erasing resource identity', () => {
    expect(apiUrl('https://example.test/api/v1///nested/', '/resource/').pathname)
      .toBe('/api/v1///nested/resource/');
  });
  it('rejects URL credentials after normalization', () => {
    expect(() => apiUrl('https://secret@example.test/api///', '/resource/')).toThrow('Invalid API base');
  });
  it('does not broaden a normalized finance boundary', () => {
    const root = 'https://example.test/api/v1///';
    expect(() => assertAllowedPath(root, new URL('https://example.test/api/v1/finance/invoices/'), '/finance///')).not.toThrow();
    expect(() => assertAllowedPath(root, new URL('https://example.test/api/v1/finance-other/'), '/finance///')).toThrow();
  });
});
