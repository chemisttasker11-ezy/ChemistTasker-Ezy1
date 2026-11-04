import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(process.cwd(), 'frontend_mobile/app');
const shellPath = path.resolve(appRoot, '../components/shell/PersonaShell.tsx');
const shell = fs.readFileSync(shellPath, 'utf8');
const personaDirs = ['owner', 'organization', 'pharmacist', 'otherstaff', 'explorer'];
const failures = [];

// PersonaShell deliberately renders only its configured tabs plus More through a
// custom tabBar. Expo Router still registers the other screens for deep links.
// The older audit incorrectly treated an index Tabs.Screen child as proof that
// *every* direct screen needed a second, duplicate Tabs.Screen registration.
const controlledShell =
  shell.includes('tabBar={(props) => <TabsBar') &&
  shell.includes('const allTabs = useMemo(() => [...tabs, MORE_TAB]') &&
  shell.includes('<ShellTabBar');

for (const persona of personaDirs) {
  const dir = path.join(appRoot, persona);
  const layout = fs.readFileSync(path.join(dir, '_layout.tsx'), 'utf8');
  const directRoutes = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.startsWith('_'))
    .map((entry) => entry.name.replace(/\.tsx$/, ''));

  if (layout.includes('<PersonaShell')) {
    if (!controlledShell) {
      failures.push(`${persona} uses PersonaShell without a verified configured tab bar`);
      continue;
    }
    // Every direct route requires a human-readable header. Only explicitly
    // configured tabs appear in the bottom bar; other routes remain reachable.
    const titleStart = layout.indexOf('const titles:');
    const titleEnd = layout.indexOf('\n};', titleStart);
    if (titleStart < 0 || titleEnd < 0) {
      failures.push(`${persona}/_layout.tsx is missing a static titles registry`);
      continue;
    }
    const titleBlock = layout.slice(titleStart, titleEnd);
    const titled = new Set(
      [...titleBlock.matchAll(/(?:^|\n)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_-]+))\s*:/g)]
        .map((match) => match[1] ?? match[2] ?? match[3]),
    );
    for (const route of directRoutes) {
      if (!titled.has(route)) failures.push(`${persona}/${route}.tsx has no registered screen title`);
    }
    continue;
  }

  if (!layout.includes('<Tabs')) continue;
  const declared = new Set(
    [...layout.matchAll(/<Tabs\.Screen\s+(?:\n\s*)?name=["']([^"']+)["']/g)].map((match) => match[1]),
  );
  for (const route of directRoutes) {
    if (!declared.has(route)) failures.push(`${persona}/${route}.tsx is not explicitly declared in ${persona}/_layout.tsx`);
  }
}

if (failures.length) {
  console.error('Native tab route audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Native tab route audit passed: custom shell tab visibility and direct route titles verified.');
