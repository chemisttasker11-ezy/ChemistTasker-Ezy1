// Round 3: batch every finding not yet independently checked: new P0/P1 (F13, re-reads, flows) and all agy-ux (U) items.
// Checker never shares the finder's tool: Codex-found -> Claude; agy/Claude-found -> Codex (A/B alternating).
// Appends X01.. batches to verify.json. node build-verify3.mjs
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const raw = read('raw_findings.json'), old = read('VERIFIED.json'), indep = read('VERIFIED_INDEPENDENT.json');
const alias = new Set(read('DEDUPLICATION_20261025.json').roots.flatMap(g => g.aliases));
const batches = read('verify.json').filter(b => !b.id.startsWith('X'));
const todo = raw.filter(f => !old[f.id] && !indep[f.id] && !alias.has(f.id) && (['P0', 'P1'].includes(f.severity) || f.reviewer === 'agy-ux'))
  .sort((a, b) => a.area.localeCompare(b.area) || a.id.localeCompare(b.id));
const groups = { claude: [], codexA: [], codexB: [] };
let flip = 0;
for (const f of todo) (/^(codex|gpt6)/.test(f.reviewer) ? groups.claude : groups[flip++ % 2 ? 'codexB' : 'codexA']).push(f.id);
let n = fs.readdirSync(DIR).filter(f => /^out_X\d+\.json$/.test(f)).length; // never reuse a finished X id
for (const [checker, ids] of Object.entries(groups))
  for (let i = 0; i < ids.length; i += 6) batches.push({ id: `X${String(++n).padStart(2, '0')}`, checker, ids: ids.slice(i, i + 6) });
fs.writeFileSync(path.join(DIR, 'verify.json'), JSON.stringify(batches, null, 1));
console.log(`${todo.length} unchecked findings:`, Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), `-> ${n} X batches`);
