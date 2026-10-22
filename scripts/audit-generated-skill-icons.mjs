#!/usr/bin/env node
/** Verify generated Expo icon mapping and assets still match the shared registry.
 * Non-destructive: no art is redrawn or regenerated; safe in CI without Playwright.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'shared-core/skills_registry.json'), 'utf8'));
const iconDir = path.join(root, 'frontend_mobile/assets/skill-symbols');
const index = fs.readFileSync(path.join(iconDir, 'index.ts'), 'utf8');
const skills = new Set(registry.skills.filter(skill => !skill.logo).map(skill => skill.code));
const section = index.split('export const SKILL_SYMBOLS: Record<string, number> = {')[1]?.split('};')[0];
assert.ok(section, 'Missing generated SKILL_SYMBOLS mapping');
const mapped = new Map();
const mappingPattern = /^\s*([A-Z0-9_]+): require\('\.\/([A-Z0-9_]+)\.png'\),?\s*$/gm;
let match;
while ((match = mappingPattern.exec(section)) !== null) {
  assert.equal(match[1], match[2], 'Mapping points to a different skill: ' + match[1]);
  assert.ok(!mapped.has(match[1]), 'Duplicate generated skill key: ' + match[1]);
  mapped.set(match[1], match[2]);
}
const missing = [...skills].filter(code => !mapped.has(code));
const extra = [...mapped.keys()].filter(code => !skills.has(code));
assert.deepEqual(missing, [], 'Registry skills missing native artwork mapping');
assert.deepEqual(extra, [], 'Obsolete native artwork keys');
const badges = index.split('export const BADGE_SYMBOLS: Record<string, number> = {')[1]?.split('};')[0];
assert.ok(badges, 'Missing generated badge mapping');
const allMapped = [...mapped.values()];
for (const [, line] of badges.matchAll(/require\('\.\/([A-Z0-9_]+)\.png'\)/g)) allMapped.push(line);
const disk = fs.readdirSync(iconDir).filter(name => name.endsWith('.png')).map(name => name.slice(0, -4));
assert.deepEqual([...new Set(allMapped)].sort(), disk.sort(), 'Generated PNG files and index mapping diverged');
console.log('Generated skill icon integrity PASS:', skills.size, 'skills,', allMapped.length - skills.size, 'badges.');
