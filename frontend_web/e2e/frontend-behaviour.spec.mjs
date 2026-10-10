// Behaviour tests for interactions the static audits cannot see: in-app navigation and keyboard use.
import { test, expect } from '@playwright/test';
import { installApiFixture, json, roleUsers } from './support/apiFixture.mjs';

const page1 = (results) => ({ count: results.length, next: null, previous: null, results });

const invoice = (id, number) => ({
  id, invoice_id: id, number, version: 1, request_key: `k${id}`, kind: 'invoice', source: 'external',
  payload: {
    request_key: `k${id}`, customer_id: 7, invoice_date: '2026-10-11', due_date: '2026-10-25', issuer_name: 'Smoke Worker',
    issuer_abn: '', issuer_address: '', gst_registered: false, price_mode: 'exclusive', super_mode: 'none', super_rate: '12.00',
    super_confirmed: false, bank_account_name: '', bsb: '', account_number: '', super_fund_name: '', super_usi: '',
    super_member_number: '', reference: '', notes: '', lines: [],
    customer: { name: 'Harbour Health', legal_name: '', address: '', abn: '', email: '', contact_name: '' },
  },
  calculation: { lines: [], subtotal: '0.00', gst: '0.00', payable: '100.00', sales_gross: '0.00', super: '0.00', automatic_super: '0.00' },
  locked: false, editable: true, voided: false, status: 'sent', review_status: 'NONE', delivery_status: null,
  paid: '0.00', balance: '100.00', super_document_id: null, payments: [], revisions: [], review_requests: [],
});

/** Finance API for a worker with two invoices. `failFirstLoad` makes the first invoice list request fail. */
function financeApi({ failFirstLoad = false } = {}) {
  let invoiceListCalls = 0;
  const invoices = [invoice(41, 'INV-0041'), invoice(42, 'INV-0042')];
  return async (route, { path }) => {
    if (!path.includes('/finance/')) return undefined;
    const tail = path.replace(/.*\/finance\//, '');
    if (tail === 'invoices/') {
      invoiceListCalls += 1;
      if (failFirstLoad && invoiceListCalls === 1) return json(route, { detail: 'Temporarily unavailable' }, 503);
      return json(route, page1(invoices));
    }
    if (tail === 'invoices/internal-sources/') return json(route, []);
    if (tail === 'invoices/defaults/') return json(route, { issuer_name: 'Smoke Worker', issuer_abn: '', issuer_address: '', gst_registered: false, bank_account_name: '', bsb: '', account_number: '', super_fund_name: '', super_usi: '', super_member_number: '', super_rate: '12.00' });
    if (tail === 'invoices/preview/') return json(route, invoices[0].calculation);
    const one = tail.match(/^invoices\/(\d+)\/$/);
    if (one) return json(route, invoices.find((item) => item.id === Number(one[1])) ?? {}, invoices.some((item) => item.id === Number(one[1])) ? 200 : 404);
    return json(route, page1([]));
  };
}

/** Client-side navigation, as a link or notification inside the app does it (no page reload). */
async function navigateInApp(page, url) {
  await page.evaluate((next) => {
    window.history.pushState({}, '', next);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }, url);
}

const INVOICES = '/dashboard/pharmacist/invoice';

test.describe('invoice links while the workspace is open', () => {
  test('first-load ?new=1 opens a blank composer without saving anything', async ({ page }) => {
    const writes = [];
    page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/finance/invoices/') && !request.url().includes('preview')) writes.push(request.url()); });
    await installApiFixture(page, roleUsers.pharmacist, financeApi());
    await page.goto(`${INVOICES}?new=1`);
    await expect(page.getByRole('heading', { level: 1, name: 'New invoice' })).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('same-route ?new=1 and consecutive ?invoice= links each open, and Back returns to the list', async ({ page }) => {
    await installApiFixture(page, roleUsers.pharmacist, financeApi());
    await page.goto(INVOICES);
    await expect(page.getByRole('heading', { level: 1, name: 'Invoices' })).toBeVisible();

    await navigateInApp(page, `${INVOICES}?new=1`);
    await expect(page.getByRole('heading', { level: 1, name: 'New invoice' })).toBeVisible();

    await navigateInApp(page, `${INVOICES}?invoice=41`);
    await expect(page.getByRole('heading', { level: 1, name: 'Invoice INV-0041' })).toBeVisible();
    await navigateInApp(page, `${INVOICES}?invoice=42`);
    await expect(page.getByRole('heading', { level: 1, name: 'Invoice INV-0042' })).toBeVisible();

    await page.getByRole('button', { name: 'Back to invoices' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Invoices' })).toBeVisible();
  });

  test('a link that arrives during a failed load still opens after Try again', async ({ page }) => {
    await installApiFixture(page, roleUsers.pharmacist, financeApi({ failFirstLoad: true }));
    await page.goto(`${INVOICES}?invoice=42`);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Invoice INV-0042' })).toBeVisible();
  });
});

test.describe('shared section tabs', () => {
  test('arrow keys, Home and End move focus; Enter opens the section', async ({ page }) => {
    await installApiFixture(page, roleUsers.owner);
    await page.goto('/dashboard/owner/shift-center/active');
    const tabs = page.getByRole('tablist', { name: 'Shift Centre sections' }).getByRole('tab');
    await expect(tabs).toHaveCount(3);

    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tabs.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(2)).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/shift-center\/history$/);
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', await tabs.nth(2).getAttribute('id'));
  });
});

test.describe('legacy invoice links', () => {
  test('/invoice/new?shiftId= opens a composer and keeps the shift through the shell settling the workspace', async ({ page }) => {
    const prefills = [];
    await installApiFixture(page, roleUsers.pharmacist, async (route, ctx) => {
      if (ctx.path.endsWith('/finance/invoices/internal-sources/')) {
        prefills.push('sources');
        return json(route, [{ assignment_id: 9, shift_id: 56, slot_id: 1, date: '2026-10-11', start_time: '09:00', end_time: '17:00', hours: '8.00', rate: '62.50', pharmacy: { id: 101, name: 'Smoke Pharmacy', abn: '', legal_name: '', email: '', address: '' } }]);
      }
      if (ctx.path.endsWith('/finance/invoices/internal-prefill/')) {
        prefills.push('prefill');
        return json(route, { ...invoice(0, '').payload, lines: [{ description: 'Locum shift', quantity: '8.00', unit_price: '62.50', discount: '0.00', unit: 'Hours', source_assignment_id: 9 }], source_assignment_ids: [9] });
      }
      return financeApi()(route, ctx);
    });
    await page.goto('/dashboard/pharmacist/invoice/new?shiftId=56');
    await expect(page.getByRole('heading', { level: 1, name: 'New invoice' })).toBeVisible();
    await expect.poll(() => prefills).toContain('prefill');
  });

  test('/invoice/:id of a managed invoice opens it in Invoices', async ({ page }) => {
    await installApiFixture(page, roleUsers.pharmacist, financeApi());
    await page.goto('/dashboard/pharmacist/invoice/42');
    await expect(page.getByRole('heading', { level: 1, name: 'Invoice INV-0042' })).toBeVisible();
    await page.goBack();
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'Invoice INV-0042' })).toBeVisible();
  });
});
