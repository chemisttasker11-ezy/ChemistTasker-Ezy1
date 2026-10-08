import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const landing = read('app/landing-page.tsx');
const header = read('public/header.tsx');
const personas = read('app/persona-data.ts');

test('public landing keeps canonical route and account wiring', () => {
  const requiredHeaderRoutes = [
    '/marketplace',
    '/marketplace/new',
    '/shifts/public-board',
    '/talent/public-board',
    '/hubs',
    '/news',
    '/pricing',
    '/learning',
    '/blog',
    '/calculator',
    '/pricing/organization',
    '/contact',
  ];

  for (const route of requiredHeaderRoutes) {
    assert.match(header, new RegExp(route.replaceAll('/', '\\/')));
  }

  const requiredLandingRoutes = [
    '/register',
    '/dashboard',
    '/shifts/public-board',
    '/talent/public-board',
    '/calculator',
    '/hubs',
    '/learning',
    '/pricing',
    '/pricing/organization',
    '/privacy-policy',
    '/terms-of-service',
  ];

  for (const route of requiredLandingRoutes) {
    assert.match(landing, new RegExp(route.replaceAll('/', '\\/')));
  }

  assert.match(landing, /const startPath=status==='anonymous'\?'\/register':'\/dashboard';/);
  assert.match(landing, /<AccountControls\/>/);
  assert.match(header, /<AccountControls\/>/);
});

test('public landing keeps the production app-store destinations and one app promo', () => {
  assert.match(landing, /https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.chemisttasker\.app/);
  assert.match(landing, /https:\/\/apps\.apple\.com\/sb\/app\/chemisttasker\/id6759088580/);

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
