import { test } from '@e2e-dev/web';
import { credentials, expect } from 'e2e';

test('real invoice preview, Save, immutable revisions, PDF and captured delivery agree', async ({ app, browser, screen }) => {
  const worker = credentials.user('worker');
  const destination = '/dashboard/pharmacist/invoice?shift=1';
  await app.open(`/login?next=${encodeURIComponent(destination)}`);
  await expect(screen.getByLabel('Email', { exact: true })).toBeVisible();
  await screen.getByLabel('Email', { exact: true }).fill(worker.username);
  await screen.getByLabel('Password', { exact: true }).fill(worker.password);
  await screen.getByRole('button', 'Login', { exact: true }).tap();
  await browser.waitForURL(/\/dashboard\/pharmacist\/invoice/, { timeout: 60_000 });
  await expect(screen.getByLabel('Qty', { exact: true })).toBeVisible();
  const preview = browser.waitForResponse(/\/finance\/invoices\/preview\/$/);
  await screen.getByLabel('Qty', { exact: true }).fill('7.5');
  expect((await preview).status).toBe(200);
  const save = browser.waitForResponse(/\/finance\/invoices\/$/);
  await screen.getByRole('button', 'Save invoice', { exact: true }).tap();
  expect((await save).status).toBe(201);
  await expect(screen.getByRole('button', 'Open', { exact: true })).toBeVisible();
  const first = await browser.evaluate(async () => {
    const response = await fetch('/api/v1/finance/invoices/', { credentials: 'include' });
    const body = await response.json();
    const rows = body.results ?? body;
    if (response.status !== 200 || rows.length !== 1) throw new Error('Expected one real saved invoice');
    const invoice = rows[0];
    sessionStorage.setItem('acceptanceInvoiceId', String(invoice.id));
    return { version: invoice.version, payable: invoice.calculation.payable, number: invoice.number };
  });
  expect(first.version).toBe(1);
  expect(first.payable).toBe('577.50');
  await screen.getByRole('button', 'Open', { exact: true }).tap();
  await expect(screen.getByRole('button', 'Save revision', { exact: true })).toBeVisible();
  const revisedPreview = browser.waitForResponse(/\/finance\/invoices\/preview\/$/);
  await screen.getByLabel('Qty', { exact: true }).fill('8');
  expect((await revisedPreview).status).toBe(200);
  const revision = browser.waitForResponse(/\/finance\/invoices\/\d+\/$/);
  await screen.getByRole('button', 'Save revision', { exact: true }).tap();
  expect((await revision).status).toBe(200);
  await expect(screen.getByRole('button', `More actions for ${first.number}`, { exact: true })).toBeVisible();
  const immutable = await browser.evaluate(async () => {
    const id = sessionStorage.getItem('acceptanceInvoiceId');
    const root = `/api/v1/finance/invoices/${id}/`;
    const [current, first, second, pdfOne, pdfTwo] = await Promise.all([
      fetch(root), fetch(`${root}revisions/1/`), fetch(`${root}revisions/2/`),
      fetch(`${root}revisions/1/pdf/`), fetch(`${root}revisions/2/pdf/`),
    ]);
    const [saved, old, revised] = await Promise.all([current.json(), first.json(), second.json()]);
    const header = async (response: Response) => new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()).slice(0, 5));
    return { statuses: [current.status, first.status, second.status, pdfOne.status, pdfTwo.status],
      current: saved.calculation.payable, old: old.calculation.payable, revised: revised.calculation.payable,
      sourceIds: saved.source_snapshot.assignment_ids, pdfOne: await header(pdfOne), pdfTwo: await header(pdfTwo) };
  });
  expect(immutable.statuses).toEqual([200, 200, 200, 200, 200]);
  expect([immutable.old, immutable.revised, immutable.current]).toEqual(['577.50', '616.00', '616.00']);
  expect(immutable.sourceIds).toEqual([1]);
  expect([immutable.pdfOne, immutable.pdfTwo]).toEqual(['%PDF-', '%PDF-']);
  await screen.getByRole('button', `More actions for ${first.number}`, { exact: true }).tap();
  await screen.getByRole('menuitem', 'Email to customer', { exact: true }).tap();
  const sent = browser.waitForResponse(/\/finance\/invoices\/\d+\/send\/$/);
  await screen.getByRole('button', 'Send email', { exact: true }).tap();
  expect((await sent).status).toBe(200);
  const recovery = await browser.evaluate(async () => {
    const root = `/api/v1/finance/invoices/${sessionStorage.getItem('acceptanceInvoiceId')}/`;
    const { csrfToken } = await (await fetch('/api/v1/users/csrf/', { credentials: 'include' })).json();
    const post = (version: number) => fetch(`${root}send/`, { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken }, body: JSON.stringify({ version, confirmed: true }) });
    const stale = await post(1);
    const replay = await post(2);
    const current = await (await fetch(root)).json();
    return { stale: stale.status, replay: replay.status, detail: (await replay.json()).detail,
      delivery: current.delivery_status, payable: current.calculation.payable };
  });
  expect(recovery.stale).toBe(400);
  expect(recovery.replay).toBe(200);
  expect(recovery.detail).toContain('already been attempted');
  expect(recovery.delivery).toBe('sent');
  expect(recovery.payable).toBe('616.00');
  await app.screenshot('invoice-saved-revision-two-captured-delivery');
});
