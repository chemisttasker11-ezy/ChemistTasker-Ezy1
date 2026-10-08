import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const landing = read('app/landing-page.tsx');
const header = read('public/header.tsx');
const personas = read('app/persona-data.ts');
const routes = read('public/routes.ts');

const routeContract = {
  home: '/',
  register: '/register',
  dashboard: '/dashboard',
  marketplace: '/marketplace',
  marketplaceNew: '/marketplace/new',
  publicShifts: '/shifts/public-board',
  publicTalent: '/talent/public-board',
  hubs: '/hubs',
  news: '/news',
  pricing: '/pricing',
  learning: '/learning',
  blog: '/blog',
  calculator: '/calculator',
  organizationPricing: '/pricing/organization',
  contact: '/contact',
  privacy: '/privacy-policy',
  terms: '/terms-of-service',
};

test('canonical public route registry keeps production destinations', () => {
  for (const [key, route] of Object.entries(routeContract)) {
    assert.match(routes, new RegExp(`${key}: '${route.replaceAll('/', '\\/')}'`));
  }
});

test('public header and landing use the canonical route registry and account wiring', () => {
  for (const key of [
    'marketplace',
    'marketplaceNew',
    'publicShifts',
    'publicTalent',
    'hubs',
    'news',
    'pricing',
    'learning',
    'blog',
    'calculator',
    'organizationPricing',
    'contact',
  ]) {
    assert.match(header, new RegExp(`publicRoutes\\.${key}`));
  }

  for (const key of [
    'register',
    'dashboard',
    'publicShifts',
    'publicTalent',
    'calculator',
    'hubs',
    'pricing',
    'organizationPricing',
    'privacy',
    'terms',
  ]) {
    assert.match(landing, new RegExp(`publicRoutes\\.${key}`));
  }

  assert.match(landing, /const startPath=status==='anonymous'\?publicRoutes\.register:publicRoutes\.dashboard;/);
  assert.match(landing, /<AccountControls\/>/);
  assert.match(header, /<AccountControls\s*\/>/);
});

test('public landing keeps production app-store destinations and one app promo', () => {
  assert.match(routes, /googlePlay: 'https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.chemisttasker\.app'/);
  assert.match(routes, /appStore: 'https:\/\/apps\.apple\.com\/sb\/app\/chemisttasker\/id6759088580'/);
  assert.match(landing, /mobileAppLinks\.googlePlay/);
  assert.match(landing, /mobileAppLinks\.appStore/);

  const appPromoCount = (landing.match(/Take ChemistTasker with you/g) || []).length;
  assert.equal(appPromoCount, 1);
});

test('public landing keeps the current nine-persona model', () => {
  const labels = [...personas.matchAll(/\blabel:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, [
    'Pharmacy Owner',
    'Pharmacy Manager',
    'Pharmacist',
    'Locum Pharmacist',
    'Pharmacy Assistant',
    'Dispensary Technician',
    'Intern Pharmacist',
    'Pharmacy Student',
    'Junior Pharmacy Staff',
  ]);
});

test('public landing does not inherit unapproved comparison-copy claims', () => {
  for (const unsupported of [
    'Award-compliant',
    'built for the Pharmacy Industry Award',
    'HTTPS, JWT',
    '0 min',
    '+15 min',
    '+30 min',
    '+45 min',
    '+60 min',
  ]) {
    assert.equal(landing.toLowerCase().includes(unsupported.toLowerCase()), false, unsupported);
  }
});
