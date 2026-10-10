import { test, expect } from '@playwright/test';
import { installApiFixture, json, roleUsers } from './support/apiFixture.mjs';

const room = (id, title) => ({ id, title, type: 'GROUP', pharmacy: null, participant_ids: [702, 704], my_membership_id: 702, unread_count: 0, updated_at: '2026-10-10T09:00:00Z' });
const message = (id, body = `Message ${id}`) => ({ id, conversation: 11, body, sender: { id: 702, pharmacy: 101, user_details: { id: 4, username: 'pharmacist-breadth', first_name: 'Smoke', last_name: 'Worker' } }, created_at: `2026-10-10T09:${String(id % 60).padStart(2, '0')}:00Z`, attachment_url: null, is_deleted: false });
const collection = results => ({ count: results.length, results, next: null, previous: null });

async function openChat(page, { messages = [message(20, 'Original message')], failSend = false, paginate = false } = {}) {
  const sends = []; const edits = []; let moreCalls = 0;
  await installApiFixture(page, roleUsers.pharmacist, async (route, { path, method, url }) => {
    if (path.endsWith('/rooms/')) return json(route, collection([room(11, 'Team One'), room(12, 'Team Two')]));
    if (path.endsWith('/chat-participants/')) return json(route, collection([{ id: 702, user_details: { id: 4, first_name: 'Smoke', last_name: 'Worker' } }, { id: 704, user_details: { id: 8, first_name: 'Jane', last_name: 'Colleague' } }]));
    if (/\/rooms\/\d+\/$/.test(path)) return json(route, room(Number(path.match(/(\d+)\/$/)[1]), 'Team One'));
    if (path.endsWith('/rooms/11/messages/') && method === 'GET') {
      if (url.searchParams.has('page')) {
        moreCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 150));
        return json(route, collection(Array.from({ length: 15 }, (_, i) => message(19 - i))));
      }
      return json(route, { ...collection(messages), next: paginate ? `${url.origin}${path}?page=2` : null });
    }
    if (path.endsWith('/rooms/12/messages/') && method === 'GET') return json(route, collection([]));
    if (/\/rooms\/\d+\/messages\/$/.test(path) && method === 'POST') {
      sends.push({ path, body: route.request().postData(), type: route.request().headers()['content-type'] });
      if (failSend && sends.length === 1) return json(route, { detail: 'Send failed' }, 500);
      return json(route, message(91, 'Sent message'));
    }
    if (/\/messages\/\d+\/$/.test(path) && method === 'PATCH') {
      const body = route.request().postDataJSON(); edits.push({ path, body });
      return json(route, { ...message(20, body.body), is_edited: true });
    }
    return undefined;
  });
  await page.goto('/dashboard/pharmacist/chat?conversationId=11');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  return { sends, edits, moreCalls: () => moreCalls };
}

test('failed send preserves the draft; retry sends once to the same room and clears it after success', async ({ page }) => {
  const { sends } = await openChat(page, { failSend: true });
  const draft = page.getByRole('textbox', { name: 'Message', exact: true });
  await draft.fill('Please keep this draft');
  await draft.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Message not sent' })).toBeVisible();
  await expect(draft).toHaveValue('Please keep this draft');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(draft).toHaveValue('');
  expect(sends.map(send => [send.path, JSON.parse(send.body)])).toEqual([
    ['/api/v1/rooms/11/messages/', { body: 'Please keep this draft' }],
    ['/api/v1/rooms/11/messages/', { body: 'Please keep this draft' }],
  ]);
});

test('Shift+Enter keeps a newline; editing and cancelling restore the parked draft', async ({ page }) => {
  const { sends, edits } = await openChat(page);
  const draft = page.getByRole('textbox', { name: 'Message', exact: true });
  await draft.fill('Unsent draft'); await draft.press('End'); await draft.press('Shift+Enter');
  await expect(draft).toHaveValue('Unsent draft\n'); expect(sends).toHaveLength(0);
  await page.getByRole('log').getByText('Original message', { exact: true }).hover();
  await page.getByRole('button', { name: 'Edit message', exact: true }).click();
  const edit = page.getByRole('textbox', { name: 'Edit message', exact: true });
  await edit.fill('Cancelled change'); await edit.press('Escape');
  await expect(draft).toHaveValue('Unsent draft\n'); expect(edits).toHaveLength(0);
  await page.getByRole('log').getByText('Original message', { exact: true }).hover();
  await page.getByRole('button', { name: 'Edit message', exact: true }).click();
  await edit.fill('Corrected message'); await page.getByRole('button', { name: 'Save edit', exact: true }).click();
  await expect(draft).toHaveValue('Unsent draft\n');
  expect(edits).toEqual([{ path: '/api/v1/messages/20/', body: { body: 'Corrected message' } }]);
});

test('switching rooms resets the composer and sends to the selected room', async ({ page }) => {
  const { sends } = await openChat(page);
  const draft = page.getByRole('textbox', { name: 'Message', exact: true });
  await draft.fill('Draft in first room');
  await page.getByText('Team Two', { exact: true }).click();
  await expect(draft).toHaveValue('');
  await draft.fill('Second room message'); await draft.press('Enter');
  await expect(draft).toHaveValue('');
  expect(sends).toHaveLength(1); expect(sends[0].path).toBe('/api/v1/rooms/12/messages/');
});

test('attachment previews survive a failed upload and release their object URL on removal', async ({ page }) => {
  await page.addInitScript(() => {
    window.previewUrls = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = file => { const url = create(file); window.previewUrls.created.push(url); return url; };
    URL.revokeObjectURL = url => { window.previewUrls.revoked.push(url); return revoke(url); };
  });
  await openChat(page, { failSend: true });
  await page.locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=', 'base64') });
  const preview = page.getByRole('img', { name: 'photo.png', exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Message not sent' })).toBeVisible();
  await expect(preview).toBeVisible();
  const url = await preview.getAttribute('src');
  await page.getByRole('button', { name: 'Remove photo.png', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect.poll(() => page.evaluate(url => window.previewUrls.revoked.includes(url), url)).toBe(true);
});

test('loading older messages preserves the visible message and issues one pagination request', async ({ page }) => {
  const fixture = await openChat(page, { paginate: true, messages: Array.from({ length: 30 }, (_, i) => message(49 - i, `Current ${49 - i}`)) });
  const scroller = page.getByRole('log');
  await expect(page.getByText('Current 20', { exact: true })).toBeAttached();
  await scroller.evaluate(el => { el.scrollTop = 20; el.dispatchEvent(new Event('scroll', { bubbles: true })); });
  const before = await page.getByText('Current 20', { exact: true }).boundingBox();
  await expect.poll(fixture.moreCalls).toBe(1);
  await expect(page.getByText('Message 5', { exact: true })).toBeAttached();
  const after = await page.getByText('Current 20', { exact: true }).boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThan(5);
  expect(fixture.moreCalls()).toBe(1);
});

test('chat attachments reject executable schemes and unrelated hosts while retaining backend media links', async ({ page }) => {
  const messages = [
    { ...message(81, ''), attachment_url: 'javascript:alert(1)//.png', attachment_filename: 'unsafe-script.png' },
    { ...message(82, ''), attachment_url: 'data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%3E', attachment_filename: 'unsafe-data.png' },
    { ...message(83, ''), attachment_url: 'https://untrusted.example/attachment.png', attachment_filename: 'unsafe-host.png' },
    { ...message(84, ''), attachment_url: '/media/chat/allowed-image.png', attachment_filename: 'allowed-image.png' },
    { ...message(85, ''), attachment_url: 'http://127.0.0.1:8000/media/chat/allowed-file.pdf', attachment_filename: 'allowed-file.pdf' },
    { ...message(86, ''), attachment_url: 'https://exampleaccount.blob.core.windows.net/attachments/allowed-azure.png?sv=1', attachment_filename: 'allowed-azure.png' },
  ];
  await openChat(page, { messages });
  const log = page.getByRole('log');
  await expect(log.getByText('Attachment unavailable', { exact: true })).toHaveCount(3);
  await expect(log.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(log.locator('a[href^="data:"]')).toHaveCount(0);
  await expect(log.locator('a[href*="untrusted.example"]')).toHaveCount(0);
  await expect(log.locator('img[src*="untrusted.example"]')).toHaveCount(0);
  await expect(log.getByRole('link', { name: 'Open image allowed-image.png' }))
    .toHaveAttribute('href', 'http://127.0.0.1:8000/media/chat/allowed-image.png');
  await expect(log.getByRole('link', { name: 'allowed-file.pdf' }))
    .toHaveAttribute('href', 'http://127.0.0.1:8000/media/chat/allowed-file.pdf');
  await expect(log.getByRole('link', { name: 'Open image allowed-azure.png' }))
    .toHaveAttribute('href', 'https://exampleaccount.blob.core.windows.net/attachments/allowed-azure.png?sv=1');
});
