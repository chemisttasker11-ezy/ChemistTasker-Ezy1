import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'frontend_mobile/app');
const personaDirs = ['owner', 'organization', 'pharmacist', 'otherstaff', 'explorer'];
const failures = [];

for (const persona of personaDirs) {
  const dir = path.join(root, persona);
  const layoutPath = path.join(dir, '_layout.tsx');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  if (!layout.includes('<Tabs')) continue;

  const declared = new Set(
    [...layout.matchAll(/<Tabs\.Screen\s+(?:\n\s*)?name=["']([^"']+)["']/g)].map((match) => match[1]),
  );

  const directRoutes = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.startsWith('_'))
    .map((entry) => entry.name.replace(/\.tsx$/, ''));

  for (const route of directRoutes) {
    if (!declared.has(route)) {
      failures.push(`${persona}/${route}.tsx is not explicitly declared in ${persona}/_layout.tsx`);
    }
  }
}

if (failures.length) {
  console.error('Native tab route audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Native tab route audit passed: every direct route in a Tabs persona is explicitly visible or hidden.');
