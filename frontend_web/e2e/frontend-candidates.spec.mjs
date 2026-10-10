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
        if (role === 'Student' && reveals === 1) return json(route, { detail: 'Reveal temporarily unavailable' }, 500);
        return json(route, profile);
      }
      if (path.includes('/counter-offers')) return json(route, []);
    });
    await page.goto('/dashboard/owner/shift-center/active?workspace=internal&pharmacy_id=101');
    await page.getByRole('button', { name: 'Manage candidates', exact: true }).click();
    if (!initiallyRevealed) await expect(page.getByText('Candidate biography', { exact: true })).toHaveCount(0);
    const review = page.getByRole('button', { name: initiallyRevealed ? 'Review' : 'Reveal', exact: true });
    await review.click();
    if (role === 'Student' && !initiallyRevealed) {
      await expect(page.getByText('Failed to reveal candidate.', { exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByText('Candidate biography', { exact: true })).toHaveCount(0);
      await review.click();
    }
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(role, { exact: true })).toBeVisible();
    await expect(dialog.getByText('Profile verified', { exact: true })).toBeVisible();
    await expect(dialog.getByText('ID verified', { exact: true })).toBeVisible();
    await expect(dialog.getByText('TEST_SKILL', { exact: true })).toBeVisible();
    await expect(dialog.getByText('3 years experience', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Bendigo, VIC/)).toBeVisible();
    expect(reveals).toBe(initiallyRevealed ? 0 : role === 'Student' ? 2 : 1);
  });
}

test('a slow earlier candidate review cannot replace the candidate selected afterward', async ({ page }) => {
  let releaseFirst;
  let firstStarted = false;
  let firstFinished = false;
  const pendingFirst = new Promise(resolve => { releaseFirst = resolve; });
  await installApiFixture(page, roleUsers.owner, async (route, { path, url }) => {
    if (path.endsWith('/shifts/active/')) return json(route, [{
      id: 51, pharmacy: 101, pharmacy_detail: { id: 101, name: 'Review Pharmacy' },
      visibility: 'PLATFORM', allowed_escalation_levels: ['PLATFORM'], role_needed: 'PHARMACIST',
      employment_type: 'LOCUM', single_user_only: false,
      slots: [{ id: 61, date: '2026-10-31', start_time: '09:00:00', end_time: '15:00:00' }],
    }]);
    if (path.endsWith('/shift-interests/')) return json(route, [81, 82].map(id => ({
      id, shift: 51, slot_id: 61, user_id: id, revealed: true,
      user: id === 81 ? 'First Candidate' : 'Second Candidate',
      user_detail: { id, first_name: id === 81 ? 'First' : 'Second', last_name: 'Candidate', role_label: 'Student' },
    })));
    if (path.endsWith('/ratings/summary/')) {
      if (url.searchParams.get('target_id') === '81') { firstStarted = true; await pendingFirst; }
      return json(route, { average: 4, count: 1 });
    }
    if (path.endsWith('/ratings/')) {
      const id = Number(url.searchParams.get('target_id'));
      await json(route, { count: 1, results: [{ id, stars: 4, comment: id === 81 ? 'First review' : 'Second review' }] });
      if (id === 81) firstFinished = true;
      return true;
    }
  });
  await page.goto('/dashboard/owner/shift-center/active');
  await page.getByRole('button', { name: 'Manage candidates', exact: true }).click();
  const reviews = page.getByRole('button', { name: 'Review', exact: true });
  await reviews.nth(0).click();
  await expect.poll(() => firstStarted).toBe(true);
  await reviews.nth(1).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Second Candidate', { exact: true })).toBeVisible();
  releaseFirst();
  await expect.poll(() => firstFinished).toBe(true);
  await expect(dialog.getByText('Second review', { exact: true })).toBeVisible();
  await expect(dialog.getByText('First Candidate', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('First review', { exact: true })).toHaveCount(0);
});

for (const initiallyRevealed of [true, false]) {
  test(`counteroffer review keeps the full interest profile after ${initiallyRevealed ? 'reload' : 'a failed reveal and retry'}`, async ({ page }) => {
    const profile = { id: 81, first_name: 'Review', last_name: 'Candidate', role_label: 'Student',
      short_bio: 'Full work biography', verified: true, gov_id_verified: true,
      skills: ['COUNTEROFFER_SKILL'], years_experience: 3, suburb: 'Bendigo', state: 'VIC' };
    let reveals = 0;
    await installApiFixture(page, roleUsers.owner, async (route, { path }) => {
      if (path.endsWith('/shifts/active/')) return json(route, [{ id: 51, pharmacy: 101,
        pharmacy_detail: { id: 101, name: 'Review Pharmacy' }, visibility: 'PLATFORM',
        allowed_escalation_levels: ['PLATFORM'], role_needed: 'PHARMACIST', employment_type: 'LOCUM',
        single_user_only: false, slots: [{ id: 61, date: '2026-10-31', start_time: '09:00:00', end_time: '15:00:00' }] }]);
      if (path.endsWith('/shift-interests/')) return json(route, [{ id: 71, shift: 51, slot_id: 61,
        user_id: 81, revealed: initiallyRevealed, user: initiallyRevealed ? 'Review Candidate' : 'Anonymous Interest User',
        user_detail: initiallyRevealed ? profile : null }]);
      const offer = { id: 91, shift: 51, user: 81, status: 'PENDING', user_detail: initiallyRevealed
        ? { id: 81, first_name: 'Review', last_name: 'Candidate', short_bio: 'Basic offer biography' } : null,
        slots: [{ id: 92, slot_id: 61, slot_date: '2026-10-31', proposed_start_time: '09:00:00', proposed_end_time: '15:00:00', proposed_rate: '70.00' }] };
      if (path.endsWith('/shifts/counter-offers-batch/')) return json(route, { 51: [offer] });
      if (path.includes('/counter-offers')) return json(route, [offer]);
      if (path.endsWith('/shifts/51/reveal_profile/')) {
        reveals += 1;
        expect(route.request().postDataJSON()).toEqual({ user_id: 81, slot_id: 61 });
        return reveals === 1 ? json(route, { detail: 'Temporary failure' }, 500) : json(route, profile);
      }
    });
    await page.goto('/dashboard/owner/shift-center/active');
    await page.getByRole('button', { name: 'Manage candidates', exact: true }).click();
    const review = page.getByRole('button', { name: initiallyRevealed ? 'Review offer' : 'Reveal offer', exact: true });
    await review.click();
    if (!initiallyRevealed) {
      await expect(page.getByText('Failed to reveal candidate.', { exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await review.click();
    }
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Student', { exact: true })).toBeVisible();
    await expect(dialog.getByText('COUNTEROFFER_SKILL', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Full work biography', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Profile verified', { exact: true })).toBeVisible();
    expect(reveals).toBe(initiallyRevealed ? 0 : 2);
  });
}
