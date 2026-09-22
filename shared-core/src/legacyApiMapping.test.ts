import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureApi,
  fetchHubPollComments,
  fetchMembershipsByPharmacy,
} from './api';

const json = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function configure(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  configureApi({
    baseURL: 'https://example.test/api',
    credentials: 'include',
    getToken: async () => 'legacy-token',
  });
}

describe('legacy api.ts shared mappings', () => {
  it('preserves membership serializer fields and exposes camelCase aliases', async () => {
    const fetchImpl = vi.fn(async () => json({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 12,
        user: 44,
        pharmacy: 7,
        pharmacy_detail: { id: 7, name: 'Central Pharmacy' },
        user_details: {
          id: 44,
          email: 'worker@example.test',
          first_name: 'Casey',
          last_name: 'Worker',
        },
        invited_name: 'Casey W',
        role: 'PHARMACIST',
        employment_type: 'FULL_TIME',
        job_title: 'Pharmacist in Charge',
        is_active: true,
        status: 'ACCEPTED',
        is_pharmacy_owner: false,
        is_pharmacy_admin: true,
        admin_level: 'MANAGER',
        admin_level_label: 'Manager',
        admin_level_description: 'Manages the pharmacy',
      }],
    })) as unknown as typeof fetch;
    configure(fetchImpl);

    const [membership] = await fetchMembershipsByPharmacy(7);

    expect(membership).toMatchObject({
      id: 12,
      user: 44,
      pharmacy: 7,
      pharmacy_id: 7,
      pharmacyId: 7,
      pharmacy_name: 'Central Pharmacy',
      pharmacyName: 'Central Pharmacy',
      invited_name: 'Casey W',
      invitedName: 'Casey W',
      employment_type: 'FULL_TIME',
      employmentType: 'FULL_TIME',
      job_title: 'Pharmacist in Charge',
      jobTitle: 'Pharmacist in Charge',
      is_pharmacy_admin: true,
      isPharmacyAdmin: true,
      admin_level: 'MANAGER',
      adminLevel: 'MANAGER',
    });
    expect(membership.user_details.email).toBe('worker@example.test');
    expect(membership.userDetails.firstName).toBe('Casey');
  });

  it('maps poll comments through the same Hub comment shape used by mobile', async () => {
    const fetchImpl = vi.fn(async () => json([{
      id: 31,
      poll: 9,
      body: 'Looks good',
      created_at: '2026-09-22T00:00:00Z',
      updated_at: '2026-09-22T00:00:00Z',
      deleted_at: null,
      can_edit: true,
      author: {
        id: 4,
        role: 'PHARMACIST',
        employment_type: 'LOCUM',
        job_title: null,
        user_details: {
          id: 10,
          username: 'casey',
          first_name: 'Casey',
          last_name: 'Worker',
          email: 'worker@example.test',
          profile_photo_url: null,
        },
      },
      is_edited: false,
      original_body: 'Looks good',
      edited_at: null,
      edited_by: null,
      is_deleted: false,
    }])) as unknown as typeof fetch;
    configure(fetchImpl);

    const [comment] = await fetchHubPollComments(9);

    expect(comment.postId).toBe(9);
    expect(comment.author.userDetails.firstName).toBe('Casey');
    expect(comment.body).toBe('Looks good');
  });
});
