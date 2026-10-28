import { describe, expect, it, vi } from 'vitest';
import { canPublishTalent, loadAllTalentPages } from './talent';
import { getExplorerPostForEditing } from './talent';
import { configureApi } from './transport/application';

describe('getExplorerPostForEditing', () => {
  it('loads the owner post even when expired availability is absent from the feed', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => new Response(JSON.stringify({ count: 1, results: [
      { id: 78, author_user_id: 7, availability_days: ['2020-01-01'], post_kind: 'AVAILABILITY' },
    ] }), { headers: { 'Content-Type': 'application/json' } }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'owner-token', fetchImpl });
    await expect(getExplorerPostForEditing()).resolves.toMatchObject({ id: 78, authorUserId: 7, availabilityDays: ['2020-01-01'] });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/explorer-posts/?mine=true');
  });

  it('returns no existing post for a legitimate first-time publisher', async () => {
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'new-owner-token',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ count: 0, results: [] }),
        { headers: { 'Content-Type': 'application/json' } })) });
    await expect(getExplorerPostForEditing()).resolves.toBeNull();
  });
});

describe('canPublishTalent', () => {
  it('allows explorers without the staff-only verification gate', () => {
    expect(canPublishTalent({ role: 'EXPLORER' }, null, '2026-09-29')).toBe(true);
  });

  it('requires mobile and verified onboarding for other staff', () => {
    expect(canPublishTalent(
      { role: 'OTHER_STAFF', is_mobile_verified: false },
      { verified: true },
      '2026-09-29',
    )).toBe(false);
    expect(canPublishTalent(
      { role: 'OTHER_STAFF', is_mobile_verified: true },
      { verified: false },
      '2026-09-29',
    )).toBe(false);
    expect(canPublishTalent(
      { role: 'OTHER_STAFF', is_mobile_verified: true },
      { verified: true },
      '2026-09-29',
    )).toBe(true);
  });

  it('requires current verified pharmacist registration', () => {
    const user = { role: 'PHARMACIST', is_mobile_verified: true };
    expect(canPublishTalent(user, { verified: true, ahpra_verified: false }, '2026-09-29')).toBe(false);
    expect(canPublishTalent(
      user,
      { verified: true, ahpra_verified: true, ahpra_expiry_date: '2026-09-28' },
      '2026-09-29',
    )).toBe(false);
    expect(canPublishTalent(
      user,
      { verified: true, ahpra_verified: true, ahpra_expiry_date: '2026-09-29' },
      '2026-09-29',
    )).toBe(true);
  });
});

describe('loadAllTalentPages', () => {
  it('loads every paginated page instead of truncating at the first page', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      count: 5,
      results: page === 1 ? [1, 2] : page === 2 ? [3, 4] : [5],
    }));
    await expect(loadAllTalentPages(fetchPage, 2)).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('preserves legacy unpaginated array responses', async () => {
    await expect(loadAllTalentPages(async () => [1, 2, 3])).resolves.toEqual([1, 2, 3]);
  });
});
