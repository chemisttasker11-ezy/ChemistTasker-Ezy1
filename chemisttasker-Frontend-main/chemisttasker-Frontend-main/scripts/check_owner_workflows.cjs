/* Real component regression harness. All API requests are intercepted locally. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/semse/Desktop/chemisttasker/frontend_web/node_modules/playwright-core');
const root = path.resolve(__dirname, '..');
const phase = process.argv[2] || 'after';
const out = path.join(root, 'docs/rebuild/owner-workflows', phase);
fs.mkdirSync(out, { recursive: true });
const pharmacy = { id: 900001, name: 'Review Pharmacy', suburb: 'Brisbane', state: 'QLD', has_chain: true, claimed: true, rate_weekday: '65', rate_saturday: '75', rate_sunday: '85' };
const slot = { id: 900011, date: '2026-12-14', start_time: '09:00', end_time: '17:00', rate: '65' };
const shift = { id: 900010, pharmacy: pharmacy.id, pharmacy_detail: pharmacy, role_needed: 'PHARMACIST', employment_type: 'LOCUM', visibility: 'FULL_PART_TIME', slots: [slot], description: 'Support our pharmacy team with dispensing and patient care.', must_have: ['VACCINATION'], nice_to_have: ['FRED'], allowed_escalation_levels: ['FULL_PART_TIME', 'LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'] };
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || 'C:/Users/semse/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe', headless: true });
 const results = { phase, screenshots: [], checks: [], errors: [], requests: [], accessibility: [] };
 try {
  for (const width of [1440, 390]) {
   const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
   await context.addInitScript(() => localStorage.setItem('ct-theme-mode', 'light'));
   await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname !== 'localhost') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    results.requests.push({ method: req.method(), path: url.pathname });
    let body = [];
    if (url.pathname.endsWith('/pharmacies/')) body = [pharmacy];
    else if (url.pathname.includes('calculate-rates')) body = (req.postDataJSON()?.slots || []).map(() => ({ rate: 65 }));
    else if (/shifts\/active\/900010\/$/.test(url.pathname)) body = shift;
    else if (/shifts\/(active|confirmed|history)\/$/.test(url.pathname)) body = [shift];
    // Other writes receive an explicit failure; tests do not click production submission actions.
    else if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.fulfill({ status: 409, json: { detail: 'Business writes disabled by test harness' } });
    return route.fulfill({ status: 200, json: body });
   });
   const page = await context.newPage();
   page.on('pageerror', e => results.errors.push(e.message));
   async function open(entry) {
    await page.goto(`http://localhost:4179/qa/owner-workflows.html?entry=${encodeURIComponent(entry)}`);
    await page.locator('main').waitFor();
    await page.waitForTimeout(700);
   }
   async function shot(name) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
    results.screenshots.push(`${name}-${width}.png`);
    results.checks.push({ name: `${name}-${width}-page-width`, pass: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) });
    if (phase !== 'before' && process.env.AXE_SCRIPT) {
     await page.addScriptTag({ path: process.env.AXE_SCRIPT });
     const audit = await page.evaluate(async () => {
      const result = await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
     });
     results.accessibility.push({ screen: `${name}-${width}`, violations: audit });
    }
   }
   await open('/dashboard/owner/post-shift?pharmacy=900001&role=PHARMACIST&date=2026-12-14');
   for (const step of ['details', 'skills', 'visibility', 'timetable', 'pay']) {
    await shot(`post-${step}`);
    if (step !== 'pay') await page.getByRole('button', { name: 'Next', exact: true }).last().click();
   }
   results.checks.push({ name: `submit-connected-${width}`, pass: await page.getByRole('button', { name: 'Post Shift', exact: true }).isEnabled() });
   await open('/dashboard/owner/shift-center/active');
   for (const [section, label] of [['active', 'Active Shifts'], ['confirmed', 'Confirmed Shifts'], ['history', 'Shifts History']]) {
    await page.getByRole('button', { name: label, exact: true }).first().click();
    await page.waitForTimeout(200);
    results.checks.push({ name: `route-${section}-${width}`, pass: (await page.locator('#fixture-path').textContent()).endsWith('/' + section) });
    await shot(`centre-${section}`);
   }
   await context.close();
  }
 } finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
 }
 console.log(JSON.stringify({ phase, screenshots: results.screenshots.length, checks: results.checks, errors: results.errors }));
 if (results.errors.length || results.checks.some(c => !c.pass)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
