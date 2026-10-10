import { test, expect } from '@playwright/test';
import { installApiFixture, json, roleUsers } from './support/apiFixture.mjs';

for (const role of ['Student', 'Pharmacist']) for (const initiallyRevealed of [true, false]) {
  test(`${role} platform interest retains the work profile after ${initiallyRevealed ? 'a reload' : 'reveal'}`, async ({ page }) => {
    const profile = {
      id: 81, first_name: 'Review', last_name: 'Candidate', short_bio: 'Candidate biography',
      role_label: role, suburb: 'Bendigo', state: 'VIC', verified: true,
      gov_id_verified: true, skills: ['TEST_SKILL'], years_experience: 3,
      open_to_travel: true, coverage_radius_km: 80, travel_states: ['VIC'],
    };
    let reveals = 0;
    await installApiFixture(page, roleUsers.owner, async (route, { path }) => {
      if (path.endsWith('/shifts/active/')) return json(route, [{
        id: 51, pharmacy: 101, pharmacy_detail: { id: 101, name: 'Review Pharmacy' },
        visibility: 'PLATFORM', allowed_escalation_levels: ['PLATFORM'], role_needed: 'PHARMACIST',
        employment_type: 'LOCUM', single_user_only: false,
        slots: [{ id: 61, date: '2026-10-31', start_time: '09:00:00', end_time: '15:00:00' }],
      }]);
      if (path.endsWith('/shift-interests/')) return json(route, [{
        id: 71, shift: 51, slot_id: 61, user_id: 81, revealed: initiallyRevealed,
        user: initiallyRevealed ? 'Review Candidate' : 'Anonymous Interest User',
        short_bio: initiallyRevealed ? profile.short_bio : null,
        user_detail: initiallyRevealed ? profile : null,
      }]);
      if (path.endsWith('/shifts/51/reveal_profile/')) {
        reveals += 1;
        expect(route.request().postDataJSON()).toEqual({ user_id: 81, slot_id: 61 });
        return json(route, profile);
      }
      if (path.includes('/counter-offers')) return json(route, []);
    });
    await page.goto('/dashboard/owner/shift-center/active?workspace=internal&pharmacy_id=101');
    await page.getByRole('button', { name: 'Manage candidates', exact: true }).click();
    if (!initiallyRevealed) await expect(page.getByText('Candidate biography', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: initiallyRevealed ? 'Review' : 'Reveal', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(role, { exact: true })).toBeVisible();
    await expect(dialog.getByText('Profile verified', { exact: true })).toBeVisible();
    await expect(dialog.getByText('ID verified', { exact: true })).toBeVisible();
    await expect(dialog.getByText('TEST_SKILL', { exact: true })).toBeVisible();
    await expect(dialog.getByText('3 years experience', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Bendigo, VIC/)).toBeVisible();
    expect(reveals).toBe(initiallyRevealed ? 0 : 1);
  });
}
