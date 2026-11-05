import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Explorer home distinguishes backend recommendations from general open boards', () => {
 const source = read('./dashboard.tsx');
 assert.match(source, /getExplorerDashboard\(\)/);
 assert.match(source, /explorerDashboardFacts\(dashboard\.value\)/);
 assert.match(source, /title="Recommended for you"/);
 assert.match(source, /title="Your shift activity"/);
 assert.match(source, /title="Open opportunities"/);
 assert.match(source, /data\.dashboard\.recommended\.slice/);
 assert.match(source, /data\.dashboard\.commitments\.slice/);
 assert.match(source, /Personalized matches could not load/);
});
test('Explorer direct Talent Board publishing action opens native pitch editor, browsing does not', () => {
 const source = read('./dashboard.tsx');
 const route = read('../../app/explorer/talent-board.tsx');
 const board = read('../shared/talent-board/index.tsx');
 assert.match(source, /\/explorer\/talent-board\?compose=1/);
 assert.match(route, /openPitchOnMount=\{compose === '1'\}/);
 assert.match(board, /setPitchOpen\(true\)/);
});
