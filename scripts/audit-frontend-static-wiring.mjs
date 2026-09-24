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
  metrics.mobileFiles += 1;
  metrics.mobileControls += (source.match(/\b(onPress|onSubmit|onValueChange|onChangeText|onChange)\s*=/g) || []).length;
  metrics.mobileDirectTransportCalls += (source.match(/\b(?:fetch\s*\(|axios\.(?:get|post|put|patch|delete)\s*\(|apiClient\.(?:get|post|put|patch|delete)\s*\()/g) || []).length;
  if (/on(?:Press|Submit)\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(source)) failures.push(path.relative(repoRoot, file) + ' contains an empty interactive handler');
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
  metrics.webFiles += 1;
  metrics.webControls += (source.match(/\b(onClick|onSubmit|onChange|onInput|onBlur)\s*=/g) || []).length;
  metrics.webDirectTransportCalls += (source.match(/\b(?:fetch\s*\(|axios\.(?:get|post|put|patch|delete)\s*\(|apiClient\.(?:get|post|put|patch|delete)\s*\()/g) || []).length;
  if (/on(?:Click|Submit)\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(source)) failures.push(path.relative(repoRoot, file) + ' contains an empty interactive handler');
}

console.log(JSON.stringify({ metrics, routePatterns: routePatterns.length, failures }, null, 2));
if (failures.length) process.exit(1);
