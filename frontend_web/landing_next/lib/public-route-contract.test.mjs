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


test('public shift search and advanced filters update the server query contract', () => {
  const board = read('migrated/pages/dashboard/sidebar/ShiftsBoard/index.tsx');
  const page = read('migrated/pages/PublicJobBoardPage.tsx');
  assert.match(board, /const updateFilterConfig = /);
  assert.match(board, /onFiltersChange\?\.\(next\);/);
  assert.match(board, /setFilterConfig=\{updateFilterConfig\}/);
  assert.match(board, /onChange=\{\(event\) => updateFilterConfig\(/);
  assert.match(page, /const handleFiltersChange = \(nextFilters: FilterConfig\) => \{\s*setPage\(1\);\s*setFilters\(nextFilters\);/);
  assert.match(page, /loadShifts\(debouncedFilters, page\)/);
});

test('public shift cards group qualifications instead of repeating Required on every skill', () => {
  const cards = read('migrated/pages/dashboard/sidebar/ShiftsBoard/components/ShiftList.tsx');
  assert.match(cards, /requiredLabels\.join\('  ·  '\)/);
  assert.match(cards, /preferredLabels\.join\('  ·  '\)/);
  assert.match(cards, /!publicPresentation && \(shift\.mustHave \|\| \[\]\)\.map/);
  assert.match(cards, /\{!publicPresentation && <Button\s+onClick=\{\(\) => toggleExpandedCard\(shift\.id\)\}/);
});


test('public shift filters occupy natural page height without a nested desktop scrollbar', () => {
  const board = read('migrated/pages/dashboard/sidebar/ShiftsBoard/index.tsx');
  const page = read('migrated/pages/PublicJobBoardPage.tsx');
  assert.match(board, /!isMobile && !hideFiltersAndSort && \(/);
  assert.match(board, /component="aside"/);
  assert.match(board, /maxHeight: 'none'/);
  assert.match(board, /overflow: 'visible'/);
  assert.doesNotMatch(board, /calc\(100dvh - 124px\)/);
  assert.doesNotMatch(page, /borderRadius: 3, overflow: 'hidden'/);
});

test('filter controls use legible icons, real checkbox states and responsive time labels', () => {
  const filters = read('migrated/pages/dashboard/sidebar/ShiftsBoard/components/FiltersSidebar.tsx');
  assert.match(filters, /aria-pressed=\{active\}/);
  assert.match(filters, /flexDirection: 'column'/);
  assert.match(filters, /minWidth: 0, minHeight: 68/);
  assert.match(filters, /CommuteOutlined as CommuteIcon/);
  assert.match(filters, /AccessTimeOutlined as AccessTimeIcon/);
  assert.match(filters, /EventRepeat as EventRepeatIcon/);
  assert.match(filters, /min=\{0\}/);
  assert.match(filters, /aria-label="Minimum hourly rate"/);
  assert.match(filters, /onClick=\{\(\) => setIsOpen\(\(open\) => !open\)\}/);
  assert.doesNotMatch(filters, /checkedIcon=\{<BoltIcon/);
  assert.doesNotMatch(filters, /type="range"/);
});

test('job-card chip outlines do not clip the labels or icons', () => {
  const cards = read('migrated/pages/dashboard/sidebar/ShiftsBoard/components/ShiftList.tsx');
  assert.match(cards, /'& \.MuiChip-root': \{ maxWidth: '100%', minHeight: 28, height: 'auto'/);
  assert.match(cards, /whiteSpace: 'normal', overflow: 'visible'/);
  assert.match(cards, /overflowWrap: 'anywhere'/);
  assert.match(cards, /CommuteOutlined as CommuteIcon/);
});


test('public talent filters use the same natural-height collapsible sidebar pattern as the shift board', () => {
  const board = read('migrated/pages/dashboard/sidebar/TalentBoard/index.tsx');
  const filters = read('migrated/pages/dashboard/sidebar/TalentBoard/components/FiltersSidebar.tsx');
  assert.match(board, /component="aside"/);
  assert.match(board, /aria-label="Talent filters"/);
  assert.match(board, /maxHeight: "none"/);
  assert.match(board, /overflow: "visible"/);
  assert.doesNotMatch(board, /calc\(100dvh - 124px\)/);
  assert.match(filters, /const \[isOpen, setIsOpen\] = useState\(true\)/);
  assert.match(filters, /onClick=\{\(\) => setIsOpen\(\(open\) => !open\)\}/);
  assert.match(filters, /CommuteOutlined as CommuteIcon/);
  assert.match(filters, /SchoolOutlined as SchoolIcon/);
  assert.match(filters, /Students & interns seeking placements/);
});
