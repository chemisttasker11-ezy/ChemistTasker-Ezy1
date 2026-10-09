import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const mobileRoot = path.join(repoRoot, 'frontend_mobile');
const appRoot = path.join(mobileRoot, 'app');
const webRoot = path.join(repoRoot, 'frontend_web', 'src');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function normalizeRouteFile(file) {
  let rel = path.relative(appRoot, file).replaceAll(path.sep, '/');
  if (!rel.endsWith('.tsx') && !rel.endsWith('.ts')) return null;
  rel = rel.replace(/\.(tsx|ts)$/, '');
  if (rel.endsWith('/_layout') || rel === '_layout' || rel.includes('/_context') || rel.startsWith('+')) return null;
  const parts = rel.split('/').filter(Boolean);
  if (parts.at(-1) === 'index') parts.pop();
  const route = '/' + parts.join('/');
  return route === '/' ? '/' : route.replace(/\/$/, '');
}

function routeRegex(route) {
  if (route === '/') return /^\/$/;
  const escaped = route.split('/').map((part) => {
    if (!part) return '';
    if (/^\[\.\.\..+\]$/.test(part)) return '.+';
    if (/^\[.+\]$/.test(part)) return '[^/]+';
    return part.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  }).join('/');
  return new RegExp('^' + escaped + '/?$');
}

const routePatterns = walk(appRoot).map(normalizeRouteFile).filter(Boolean).map((route) => ({ route, regex: routeRegex(route) }));

function staticNativeRouteExists(raw) {
  const route = raw.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  return routePatterns.some(({ regex }) => regex.test(route));
}

const failures = [];
const metrics = { mobileFiles: 0, webFiles: 0, mobileControls: 0, webControls: 0, mobileStaticNavigationTargets: 0, mobileDirectTransportCalls: 0, webDirectTransportCalls: 0 };

const mobileFiles = [
  ...walk(path.join(mobileRoot, 'app')),
  ...walk(path.join(mobileRoot, 'roles')),
  ...walk(path.join(mobileRoot, 'features')),
  ...walk(path.join(mobileRoot, 'components')),
].filter((file) => /\.(tsx|ts)$/.test(file));

for (const file of mobileFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const executableSource = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  metrics.mobileFiles += 1;
  metrics.mobileControls += (source.match(/\b(onPress|onSubmit|onValueChange|onChangeText|onChange)\s*=/g) || []).length;
  metrics.mobileDirectTransportCalls += (source.match(/\b(?:fetch\s*\(|axios\.(?:get|post|put|patch|delete)\s*\(|apiClient\.(?:get|post|put|patch|delete)\s*\()/g) || []).length;
  if (/on(?:Press|Submit)\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(executableSource)) failures.push(path.relative(repoRoot, file) + ' contains an empty interactive handler');
  const targetRegex = /(?:router\.(?:push|replace)\s*\(\s*|\broute\s*:\s*)['"]((?:\/)[^'"]*)['"]/g;
  for (const match of source.matchAll(targetRegex)) {
    const target = match[1];
    metrics.mobileStaticNavigationTargets += 1;
    if (!staticNativeRouteExists(target)) failures.push(path.relative(repoRoot, file) + ' points to missing native route ' + target);
  }
}

const webFiles = walk(webRoot).filter((file) => /\.(tsx|ts)$/.test(file));
for (const file of webFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const executableSource = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  metrics.webFiles += 1;
  metrics.webControls += (source.match(/\b(onClick|onSubmit|onChange|onInput|onBlur)\s*=/g) || []).length;
  metrics.webDirectTransportCalls += (source.match(/\b(?:fetch\s*\(|axios\.(?:get|post|put|patch|delete)\s*\(|apiClient\.(?:get|post|put|patch|delete)\s*\()/g) || []).length;
  if (/on(?:Click|Submit)\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(executableSource)) failures.push(path.relative(repoRoot, file) + ' contains an empty interactive handler');
}

function readWeb(relativePath) {
  return fs.readFileSync(path.join(webRoot, relativePath), 'utf8');
}

function requireWebContains(relativePath, patterns) {
  const source = readWeb(relativePath);
  for (const [label, pattern] of patterns) {
    if (!pattern.test(source)) {
      failures.push(`frontend_web/src/${relativePath} lost dashboard shell contract: ${label}`);
    }
  }
}

function requireWebAbsent(relativePath, patterns) {
  const source = readWeb(relativePath);
  for (const [label, pattern] of patterns) {
    if (pattern.test(source)) {
      failures.push(`frontend_web/src/${relativePath} violates dashboard shell contract: ${label}`);
    }
  }
}

// Dashboard redesign contract: preserve working Vite controls while moving desktop
// navigation into one shared sidebar. These checks deliberately verify wiring,
// not visual implementation details.
requireWebContains('layouts/DashboardTopShell.tsx', [
  ['shared sidebar', /<DashboardSideNav\b/],
  ['pharmacy or workspace selector', /showPharmacySelector/],
  ['persona and admin switching', /selectAdminPersona/],
  ['top-bar actions', /<TopBarActions\b/],
  ['mobile dashboard menu trigger', /Open dashboard navigation/],
]);
requireWebAbsent('layouts/DashboardTopShell.tsx', [
  ['dashboard search hidden', /<TopBarActions[\s\S]{0,180}\bhideSearch\b/],
]);
requireWebContains('layouts/DashboardSideNav.tsx', [
  ['authoritative navigation context', /useDashboardNavigation\(\)/],
  ['scoped route helper', /addDashboardScopeParams/],
  ['accessible current-page state', /aria-current=/],
]);
requireWebContains('layouts/TopBarActions.tsx', [
  ['authoritative dashboard search navigation', /useDashboardNavigation\(\)/],
  ['search route normalization', /normalizeDashboardSegment/],
  ['search pharmacy scope propagation', /addDashboardScopeParams/],
]);
requireWebAbsent('layouts/TopBarActions.tsx', [
  ['duplicate static dashboard search routes', /ROLE_SEARCH_OPTIONS|CHAT_ROUTES|DASHBOARD_ROUTES/],
]);
requireWebAbsent('navigation.tsx', [
  ['dead Explorer availability route', /dashboard\/explorer\/availability/],
  ['dead Explorer confirmed route', /dashboard\/explorer\/shifts\/confirmed/],
  ['dead Explorer history route', /dashboard\/explorer\/shifts\/history/],
]);
requireWebAbsent('pages/dashboard/organization/OrganizationOverviewPage.tsx', [
  ['all-pharmacy organization scope mislabeled as public platform', /badge=\{selectedPharmacy \? "Internal workspace" : "Public platform"\}/],
]);
requireWebContains('App.tsx', [
  ['organization membership capability source', /getOrganizationMembership\(user\)/],
  ['organization capabilities passed to navigation', /getOrganizationNav\(hasUnreadMessages, orgMembership\?\.capabilities \?\? \[\]\)/],
]);
requireWebContains('navigation.tsx', [
  ['organization roster capability gate', /capabilitySet\.has\("manage_roster"\)/],
  ['organization invite capability gate', /capabilitySet\.has\("invite_staff"\)/],
  ['organization communications capability gate', /capabilitySet\.has\("manage_communications"\)/],
]);
requireWebAbsent('pages/dashboard/admin/AdminOverview.tsx', [
  ['delegated admin invoice billing KPI', /label:\s*"Unpaid Invoices"/],
]);
requireWebContains('pages/dashboard/sidebar/owner/OwnerOverviewContainer.tsx', [
  ['working owner workforce settings route', /navigate\("\/dashboard\/workforce\/settings"\)/],
]);
requireWebAbsent('pages/dashboard/sidebar/owner/OwnerOverviewContainer.tsx', [
  ['dead owner settings action', /goToSettings\s*=\s*\(\)\s*=>\s*undefined/],
]);


// Visual system regression: the Next public and Vite operational apps must
// ship the same real typefaces, rather than relying on browser/system fallbacks.
// This checks source contracts; browser-level optical QA remains a separate pass.
function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
function requireRepoContains(relativePath, patterns) {
  const source = readRepoFile(relativePath);
  for (const [label, pattern] of patterns) {
    if (!pattern.test(source)) failures.push(relativePath + ' lost shared visual system: ' + label);
  }
}
// Both apps load exactly the faces main's Next site uses (owner decision 2026-10-09):
// Inter 400/500/600 and Outfit 500/600. Heavier requested weights resolve to 600.
const approvedFontFaces = ['inter/400', 'inter/500', 'inter/600', 'outfit/500', 'outfit/600'];
for (const relativePath of ['frontend_web/src/main.tsx', 'frontend_web/landing_next/app/layout.tsx']) {
  const source = readRepoFile(relativePath);
  const loaded = [...source.matchAll(/@fontsource\/(inter|outfit)\/(\d00)\.css/g)].map((match) => match[1] + '/' + match[2]);
  for (const face of approvedFontFaces) {
    if (!loaded.includes(face)) failures.push(relativePath + ' lost shared visual system: bundled ' + face);
  }
  for (const face of loaded) {
    if (!approvedFontFaces.includes(face)) failures.push(relativePath + ' loads unapproved font face ' + face);
  }
}
requireRepoContains('frontend_web/src/layouts/AuthLayout.tsx', [
  ['legacy auth form uses shared Inter', /fontFamily: 'Inter, "Segoe UI", Arial, sans-serif'/],
  ['legacy auth headings use Outfit', /h4: \{ fontFamily: 'Outfit, Inter, sans-serif'/],
]);
for (const file of ['frontend_web/src/layouts/AuthLayout.tsx', 'frontend_web/index.html']) {
  if (/Bai\s*Jamjuree|Bai\+Jamjuree/.test(readRepoFile(file))) {
    failures.push(file + ' reintroduced the deprecated Bai Jamjuree web font');
  }
}
requireRepoContains('frontend_web/src/index.css', [
  ['Inter as Vite body face', /--ct-font-body:[^;]*Inter/],
  ['Outfit as Vite display face', /--ct-font-display:[^;]*Outfit/],
  ['body uses shared font token', /body\s*\{[\s\S]*?font-family:\s*var\(--ct-font-body\)/],
]);
requireRepoContains('frontend_web/src/theme/sleekTheme.tsx', [
  ['Inter material body', /fontFamily: "Inter, Segoe UI, Arial, sans-serif"/],
  ['Outfit material headings', /h1:\s*\{ fontFamily: "Outfit, Inter, sans-serif"/],
  ['Next public violet', /primary:\s*\{ main: primary\[600\]/],
]);
requireRepoContains('frontend_web/landing_next/public/theme.ts', [
  ['Next Outfit headings', /h1:\s*\{ fontFamily: 'Outfit, sans-serif'/],
  ['Next Inter body', /fontFamily: 'Inter, sans-serif'/],
]);
requireRepoContains('frontend_web/src/layouts/DashboardTopShell.tsx', [
  ['authenticated heading uses display face', /fontFamily: "var\(--ct-font-display\)"/],
  ['dark workspace accent stays legible', /--ct-dashboard-accent": isDark \? "#C8B5FF"/],
]);
// The owner overview's page heading is the shared Figma welcome banner.
requireRepoContains('frontend_web/src/components/ui/BrandBanner.tsx', [
  ['banner heading uses display face', /component="h1"[\s\S]{0,105}fontFamily: "var\(--ct-font-display\)"/],
]);
requireRepoContains('frontend_web/src/pages/dashboard/sidebar/owner/OwnerOverviewHome.tsx', [
  ['owner heading uses the shared banner', /<BrandBanner[\s\S]{0,40}title=\{`Welcome back/],
]);
const vitePackage = JSON.parse(readRepoFile('frontend_web/package.json'));
const viteLock = JSON.parse(readRepoFile('frontend_web/package-lock.json'));
const nextLock = JSON.parse(readRepoFile('frontend_web/landing_next/package-lock.json'));
for (const face of ['inter', 'outfit']) {
  const name = '@fontsource/' + face;
  if (!vitePackage.dependencies?.[name] || !viteLock.packages?.['node_modules/' + name]) {
    failures.push('Vite package/lock lost bundled ' + face + ' font dependency');
  }
  if (viteLock.packages?.['node_modules/' + name]?.version !== nextLock.packages?.['node_modules/' + name]?.version) {
    failures.push('Next and Vite bundle different versions of ' + face);
  }
}

console.log(JSON.stringify({ metrics, routePatterns: routePatterns.length, failures }, null, 2));
if (failures.length) process.exit(1);
