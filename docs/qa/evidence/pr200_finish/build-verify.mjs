// Build independent-check batches (V01..) for P0/P1 candidates: canonical roots only, not already verified or refuted.
// The checker is always a different account from the finder: Codex B checks Codex A, Codex A checks everyone else.
// node build-verify.mjs -> verify.json
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const raw = read('raw_findings.json'), verified = read('VERIFIED.json'), dedup = read('DEDUPLICATION_20261025.json'), sc = read('SOURCE_CHALLENGE_20261025.json');
const alias = new Set(dedup.roots.flatMap(g => g.aliases));
const refuted = new Set(sc.entries.filter(e => e.status.startsWith('REFUTED')).map(e => e.id));
const todo = raw.filter(f => ['P0', 'P1'].includes(f.severity) && !verified[f.id] && !alias.has(f.id) && !refuted.has(f.id));
const load = { codexA: 0, codexB: 0 };
const fixed = f => (/^codexA/.test(f.reviewer) ? 'codexB' : /^codexB/.test(f.reviewer) ? 'codexA' : null);
for (const f of todo) if (fixed(f)) load[fixed(f)]++;
const pick = {};
for (const f of todo) if (!fixed(f)) { const a = load.codexA <= load.codexB ? 'codexA' : 'codexB'; pick[f.id] = a; load[a]++; }
const checker = f => fixed(f) || pick[f.id];
const SIZE = 6, batches = [];
for (const acct of ['codexA', 'codexB']) {
  const mine = todo.filter(f => checker(f) === acct).sort((a, b) => a.area.localeCompare(b.area) || a.id.localeCompare(b.id));
  for (let i = 0; i < mine.length; i += SIZE) batches.push({ checker: acct, ids: mine.slice(i, i + SIZE).map(f => f.id) });
}
batches.forEach((b, i) => (b.id = `V${String(i + 1).padStart(2, '0')}`));
fs.writeFileSync(path.join(DIR, 'verify.json'), JSON.stringify(batches, null, 1));
console.log(`${todo.length} findings to check in ${batches.length} batches:`, batches.reduce((a, b) => ((a[b.checker] = (a[b.checker] || 0) + 1), a), {}));
