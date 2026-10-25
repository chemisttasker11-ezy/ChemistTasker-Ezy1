// Combine independent checks into one status per finding: out_V* (Codex, never the finder's account) and
// out_W* (Claude, on Codex-found findings, without seeing Codex's verdict). Writes VERIFIED_INDEPENDENT.json.
// Final status: CONFIRMED when every checker confirms; DISPUTED when checkers split; REFUTED / DUPLICATE as given.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const raw = new Map(read('raw_findings.json').map(f => [f.id, f]));
const checks = {};
for (const f of fs.readdirSync(DIR).filter(f => /^out_[VWX]\d+\.json$/.test(f))) {
  const j = read(f);
  for (const v of j.verdicts) (checks[v.id] ||= []).push({ ...v, checker: j.reviewer, batch: j.chunk });
}
const yes = v => v.verdict.startsWith('CONFIRMED');
const rank = { P0: 0, P1: 1, P2: 2 };
const out = {};
for (const [id, cs] of Object.entries(checks)) {
  const f = raw.get(id) || {};
  const conf = cs.filter(yes), dup = cs.find(c => c.verdict === 'DUPLICATE_OF');
  const status = conf.length === cs.length ? 'CONFIRMED_SOURCE'
    : conf.length && cs.every(c => yes(c) || c.verdict === 'DUPLICATE_OF') ? 'CONFIRMED_SOURCE_ALIAS'
    : conf.length ? 'DISPUTED'
    : dup ? 'DUPLICATE' : cs.some(c => c.verdict === 'NEEDS_RUNTIME') ? 'NEEDS_RUNTIME' : 'REFUTED';
  // Lowest severity any confirming checker gave (checkers may only narrow a claim, never raise it).
  const severity = conf.map(c => c.severity).sort((a, b) => rank[b] - rank[a])[0] || f.severity;
  out[id] = {
    status, severity, claimed_severity: f.severity, area: f.area, title: f.title, finder: f.reviewer,
    duplicate_of: dup?.duplicate_of || '', ui_visible: cs.some(c => c.ui_visible), kind: cs.some(c => c.kind === 'DECISION') ? 'DECISION' : 'FIX',
    checks: cs.map(c => ({ checker: c.checker, batch: c.batch, verdict: c.verdict, severity: c.severity, reason: c.reason, evidence: c.evidence })),
    s3: 'NOT_EXECUTED',
  };
}
fs.writeFileSync(path.join(DIR, 'VERIFIED_INDEPENDENT.json'), JSON.stringify(out, null, 1));
const tally = k => Object.values(out).reduce((a, v) => ((a[v[k]] = (a[v[k]] || 0) + 1), a), {});
const conf = Object.values(out).filter(v => v.status.startsWith('CONFIRMED'));
console.log('checked', Object.keys(out).length, 'status', JSON.stringify(tally('status')));
console.log('confirmed by severity', JSON.stringify(conf.reduce((a, v) => ((a[v.severity] = (a[v.severity] || 0) + 1), a), {})),
  'kind', JSON.stringify(conf.reduce((a, v) => ((a[v.kind] = (a[v.kind] || 0) + 1), a), {})), 'ui_visible', conf.filter(v => v.ui_visible).length);
for (const [id, v] of Object.entries(out)) if (v.status === 'DISPUTED') console.log('DISPUTED', id, v.checks.map(c => `${c.checker}:${c.verdict}`).join(' '));
