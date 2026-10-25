// Independent checks for the historical B-series (B01-B71) P0/P1 that have no runtime result, refutation or alias yet.
// Source of B statuses: the online agent's PHASE5_CANONICAL_FINDING_STATUS file (path as argv[2]).
// Writes b_findings.json (finding text for the briefs) and appends Y01.. batches to verify.json:
// P0 -> Claude (independent of the GPT-based finders), P1 -> Codex A/B alternating (separate accounts).
// node build-verify-b.mjs <canonical.json>
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const canon = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const todo = canon.entries.filter(e => /^B\d\d$/.test(e.id) && /^P[01]/.test(e.severity) && !/REPRODUCED|REFUTED|ROOT_ALIAS/.test(e.status));
const bf = todo.map(e => ({
  id: e.id, severity: e.severity.slice(0, 2), area: e.area, title: e.title, reviewer: 'online-gpt',
  scenario: e.explanation || '', evidence: (e.source_proof || []).length ? e.source_proof : ['see docs/qa/MAIN_RELEASE_AUDIT_TRACKER.md and docs/qa/MAIN_RELEASE_DISCOVERY_WAVE_*.md for this B-id'],
  test_needed: e.test_needed || '',
}));
fs.writeFileSync(path.join(DIR, 'b_findings.json'), JSON.stringify(bf, null, 1));
const batches = JSON.parse(fs.readFileSync(path.join(DIR, 'verify.json'), 'utf8')).filter(b => !b.id.startsWith('Y'));
const groups = { claude: bf.filter(f => f.severity === 'P0').map(f => f.id), codexA: [], codexB: [] };
bf.filter(f => f.severity === 'P1').forEach((f, i) => groups[i % 2 ? 'codexB' : 'codexA'].push(f.id));
let n = 0;
for (const [checker, ids] of Object.entries(groups))
  for (let i = 0; i < ids.length; i += 6) batches.push({ id: `Y${String(++n).padStart(2, '0')}`, checker, ids: ids.slice(i, i + 6) });
fs.writeFileSync(path.join(DIR, 'verify.json'), JSON.stringify(batches, null, 1));
console.log(`${bf.length} B findings:`, Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), `-> ${n} Y batches`);
