// Stage 2: Claude independently checks every Codex-found P0/P1 canonical finding (Codex checked Codex in stage 1).
// Appends W01.. batches (checker "claude") to verify.json, keeping the V batches. Claude does not see Codex's verdict.
// node build-verify2.mjs
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const raw = read('raw_findings.json'), dedup = read('DEDUPLICATION_20261025.json');
const alias = new Set(dedup.roots.flatMap(g => g.aliases));
const batches = read('verify.json').filter(b => b.checker !== 'claude');
const todo = raw.filter(f => ['P0', 'P1'].includes(f.severity) && !alias.has(f.id) && /^(codex|gpt6)/.test(f.reviewer))
  .sort((a, b) => a.area.localeCompare(b.area) || a.id.localeCompare(b.id));
for (let i = 0; i < todo.length; i += 6) batches.push({ id: `W${String(i / 6 + 1).padStart(2, '0')}`, checker: 'claude', ids: todo.slice(i, i + 6).map(f => f.id) });
fs.writeFileSync(path.join(DIR, 'verify.json'), JSON.stringify(batches, null, 1));
console.log(`${todo.length} Codex-found findings in ${batches.filter(b => b.checker === 'claude').length} Claude batches`);
