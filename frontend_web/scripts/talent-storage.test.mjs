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

for (const file of ['../src/pages/dashboard/sidebar/TalentBoard/index.tsx', '../landing_next/migrated/pages/dashboard/sidebar/TalentBoard/index.tsx']) {
  test(`${file}: create recovery is limited to creates`, () => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /if \(!existingPostId && !detail && !err\?\.status\)/);
    assert.match(source, /if \(!existingPostId && err\?\.status === 400/);
    assert.match(source, /if \(!existingPostId && \["IDEMPOTENCY_PAYLOAD_MISMATCH"/);
  });
  test(`${file}: deletion cleanup failure cannot prevent closing and reload`, () => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /await pendingStore\?\.resolve\(pending\.key\)\.catch\([\s\S]*?console\.(?:warn|error)[\s\S]*?setExistingPostId\(null\);[\s\S]*?setPitchOpen\(false\);[\s\S]*?await reload\(\)/);
  });
}
for (const file of ['../src/pages/dashboard/sidebar/TalentBoard/index.tsx', '../landing_next/migrated/pages/dashboard/sidebar/TalentBoard/index.tsx']) {
  test(`${file}: pending and saved pitch use the same public slot mapping`, () => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /availabilitySlots: \(payload\.availability_days \|\| \[\]\)\.map\(mapSavedPitchSlot\)/);
    assert.match(source, /mine\.availabilityDays\.map\(mapSavedPitchSlot\)/);
    assert.match(source, /const mapSavedPitchSlot[\s\S]*?start_time \|\| entry\?\.startTime[\s\S]*?end_time \|\| entry\?\.endTime[\s\S]*?is_all_day \?\? entry\?\.isAllDay[\s\S]*?notes: entry\?\.notes/);
  });
}
