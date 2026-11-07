import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const file of ['../src/pages/dashboard/sidebar/TalentBoard/index.tsx', '../landing_next/migrated/pages/dashboard/sidebar/TalentBoard/index.tsx']) {
  test(`${file}: storage failure cannot block existing pitch`, () => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /pendingStore\?\.read\(\)\.catch\(/);
    assert.match(source, /existingPostId\s*\?\s*null\s*:\s*await pendingStore\.read\(\)/);
  });
}
