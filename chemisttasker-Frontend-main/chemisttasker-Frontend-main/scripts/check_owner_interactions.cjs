// Local-only integration tests: exercise real hooks/handlers with synthetic API responses.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/semse/Desktop/chemisttasker/frontend_web/node_modules/playwright-core');
const out = path.resolve(__dirname, '../docs/rebuild/owner-workflows');
const pharmacy = { id: 900001, name: 'Review Pharmacy', has_chain: true, claimed: true, rate_weekday: '65' };
const slot = { id: 900011, date: '2026-12-14', start_time: '09:00', end_time: '17:00', rate: '65' };
const shift = { id: 900010, pharmacy: pharmacy.id, pharmacy_detail: pharmacy, employment_type: 'LOCUM', role_needed: 'PHARMACIST', visibility: 'FULL_PART_TIME', slots: [slot] };
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || 'C:/Users/semse/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe', headless: true });
 const report = { checks: [], errors: [], simulatedWrites: [], darkAccessibility: [] };
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
 let failWrites = false;
 await context.addInitScript(() => localStorage.setItem('ct-theme-mode', 'light'));
 await context.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  if (url.hostname !== 'localhost') return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  let data = [];
  if (url.pathname.endsWith('/calculate-rates/')) data = (req.postDataJSON()?.slots || []).map(() => ({ rate: 65 }));
  else if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
   report.simulatedWrites.push({ method: req.method(), path: url.pathname, payload: req.postDataJSON() });
   await new Promise(resolve => setTimeout(resolve, 250));
   return route.fulfill({ status: failWrites ? 400 : 200, json: failWrites ? { detail: 'Synthetic validation failure' } : { id: 900010, ...req.postDataJSON() } });
  } else if (url.pathname.endsWith('/pharmacies/')) data = [pharmacy];
  else if (/\/active\/900010\/?$/.test(url.pathname)) data = shift;
  return route.fulfill({ status: 200, json: data });
 });
 const page = await context.newPage();
 page.on('pageerror', e => report.errors.push(e.message));
 const check = (name, value) => { assert.ok(value, name); report.checks.push(name); };
 async function open(query = '') {
  await page.goto('http://localhost:4179/qa/owner-workflows.html?entry=' + encodeURIComponent('/dashboard/owner/post-shift' + query));
  await page.getByRole('combobox', { name: 'Pharmacy *', exact: true }).waitFor();
  await page.waitForTimeout(250);
 }
 const next = () => page.getByRole('button', { name: 'Next', exact: true }).last().click();
 const back = () => page.getByRole('button', { name: 'Back', exact: true }).last().click();
 async function choose(label, option) { await page.getByRole('combobox', { name: label, exact: true }).click(); await page.getByRole('option', { name: option, exact: true }).click(); }
 try {
  await open('?pharmacy=900001&role=PHARMACIST&date=2026-12-14');
  await page.getByLabel('Shift Description', { exact: true }).fill('Synthetic owner workflow verification');
  await page.getByLabel('Travel allowance', { exact: true }).check();
  await page.getByRole('button', { name: 'Sole Pharmacist', exact: true }).click();
  check('Workload selected state exposed', await page.getByRole('button', { name: 'Sole Pharmacist', exact: true }).getAttribute('aria-pressed') === 'true');
  await next();
  await page.getByRole('button', { name: 'Required', exact: true }).first().click();
  check('Skill required selection works', await page.getByRole('button', { name: 'Required', exact: true }).first().getAttribute('aria-pressed') === 'true');
  await page.getByRole('button', { name: 'Favorable', exact: true }).first().click();
  check('Skill requirement remains exclusive', await page.getByRole('button', { name: 'Required', exact: true }).first().getAttribute('aria-pressed') === 'false');
  await next();
  const audience = page.getByRole('button', { name: 'Start with Platform (Public)', exact: true });
  await audience.focus(); await page.keyboard.press('Space');
  check('Audience keyboard activates original selector', await audience.getAttribute('aria-pressed') === 'true');
  check('Audience select remains synchronised', (await page.getByRole('combobox', { name: 'Initial Audience' }).textContent()).includes('Platform'));
  await page.getByLabel('Post as anonymous').check();
  await page.getByLabel('Email and notify pharmacy favourite staff').check();
  await next();
  await page.getByRole('button', { name: 'Delete slot 1', exact: true }).click();
  await next();
  check('Empty timetable blocks Next', await page.getByText('Add at least one timetable entry before continuing.').isVisible());
  await page.getByLabel('Start', { exact: true }).first().fill('18:00');
  await page.getByLabel('End', { exact: true }).first().fill('17:00');
  await page.getByRole('button', { name: 'Add slot', exact: true }).click();
  check('Invalid end time rejected', await page.getByText('End time must be after start time.').isVisible());
  await page.getByLabel('Start', { exact: true }).first().fill('09:00');
  await page.getByRole('button', { name: 'Add slot', exact: true }).click();
  check('Manual slot and edit control retained', await page.getByRole('button', { name: 'Edit slot 1' }).isVisible());
  await next();
  await choose('Rate Type', 'Pharmacist Provided');
  check('Provided-rate branch hides base rates', await page.getByText('Base rates ($/hr)', { exact: false }).count() === 0);
  await choose('Rate Type', 'Fixed Rate');
  check('Fixed-rate branch restores base rates', await page.getByLabel('Weekday', { exact: true }).isVisible());
  failWrites = true;
  await page.getByRole('button', { name: 'Post Shift', exact: true }).click();
  check('Submitting state disables button', await page.getByRole('button', { name: 'Submitting...', exact: true }).isDisabled());
  await page.getByText('Synthetic validation failure', { exact: false }).waitFor();
  check('API error preserves retry action', await page.getByRole('button', { name: 'Post Shift', exact: true }).isEnabled());
  const posted = report.simulatedWrites.at(-1).payload;
  check('Original payload preserves selections', posted.has_travel && posted.post_anonymously && posted.notify_favorite_staff && posted.workload_tags.includes('Sole Pharmacist') && posted.nice_to_have.length === 1 && posted.must_have.length === 0 && posted.slots.length === 1);
  failWrites = false;
  await page.getByRole('button', { name: 'Post Shift', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#fixture-path')?.textContent === '/dashboard/owner/shift-center/active');
  check('Simulated success follows existing owner redirect', true);

  await open('?role=ASSISTANT&employment_type=FULL_TIME');
  await next(); await next(); await next();
  check('Full-time omits timetable', await page.getByRole('combobox', { name: 'Pay Basis' }).isVisible());
  await page.getByRole('button', { name: 'Post Shift', exact: true }).click();
  check('Hourly range validation retained', await page.getByText('Enter min and max hourly rates.').isVisible());
  await choose('Pay Basis', 'Annual Package');
  await page.getByRole('button', { name: 'Post Shift', exact: true }).click();
  check('Annual range and super validation retained', await page.getByText('Enter min/max annual and super %.').isVisible());
  await page.getByLabel('Min Annual Package ($)', { exact: true }).fill('70000');
  await page.getByLabel('Max Annual Package ($)', { exact: true }).fill('80000');
  await page.getByLabel('Super (%)', { exact: true }).fill('12');
  failWrites = true;
  await page.getByRole('button', { name: 'Post Shift', exact: true }).click();
  await page.getByText('Synthetic validation failure', { exact: false }).waitFor();
  const annual = report.simulatedWrites.at(-1).payload;
  check('Annual branch preserves exact nulls and values', annual.min_hourly_rate === null && annual.max_hourly_rate === null && annual.min_annual_salary === '70000' && annual.super_percent === '12' && annual.payment_preference === null);

  await open('?edit=900010');
  const editStep = page.getByRole('button', { name: 'Pay Rate', exact: true });
  await editStep.focus(); await page.keyboard.press('Enter');
  check('Edit step keyboard navigation works', await page.getByRole('button', { name: 'Update Shift', exact: true }).isVisible());
  await back();
  check('Editing preserves loaded slot', await page.getByRole('button', { name: 'Edit slot 1', exact: true }).isVisible());

  await open('?embedded=1&role=PHARMACIST&date=2026-12-14&dedicated_user=900099');
  await next(); await next();
  check('Embedded privacy restrictions remain', await page.getByText('Private direct booking').isVisible() && await page.getByRole('combobox', { name: 'Initial Audience' }).count() === 0);

  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 });
   // Override persisted mode after the harness initialiser and reload.
   await page.addInitScript(() => localStorage.setItem('ct-theme-mode', 'dark'));
   await open('?pharmacy=900001&role=PHARMACIST&date=2026-12-14');
   for (const name of ['details', 'skills', 'visibility', 'timetable', 'pay']) {
    await page.screenshot({ path: path.join(out, 'after', `post-${name}-dark-${width}.png`), fullPage: true });
    if (process.env.AXE_SCRIPT) {
     await page.addScriptTag({ path: process.env.AXE_SCRIPT });
     const violations = await page.evaluate(async () => {
      const result = await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } });
      return result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
     });
     report.darkAccessibility.push({ screen: `${name}-${width}`, violations });
    }
    if (name !== 'pay') await next();
   }
  }
  check('No uncaught component errors', report.errors.length === 0);
 } finally {
  fs.writeFileSync(path.join(out, 'interaction-results.json'), JSON.stringify(report, null, 2));
  await browser.close();
 }
 console.log(JSON.stringify({ checks: report.checks, errors: report.errors }));
})().catch(e => { console.error(e); process.exitCode = 1; });
