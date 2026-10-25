// Merge out_Cxxx.json into the per-file ledger (99% plan columns) and a raw findings list.
// node merge.mjs  -> MAIN_RELEASE_FINISH_LEDGER.csv, raw_findings.json, prints coverage
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const EV = path.resolve(DIR, '..');
const q = s => `"${String(s ?? '').replaceAll('"', '""')}"`;
const inv = fs.readFileSync(path.join(EV, 'MAIN_RELEASE_SOURCE_COVERAGE.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
  .map(l => l.match(/"([^"]*)"/g).map(x => x.slice(1, -1))).map(([p, sha]) => ({ p, sha }));
const outs = fs.readdirSync(DIR).filter(f => /^out_[CF]\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));

const byPath = new Map();
const findings = [];
for (const o of outs) {
  const local = {};
  for (const f of o.findings || []) { const gid = `${o.chunk}-${f.id}`; local[f.id] = gid; findings.push({ ...f, id: gid, chunk: o.chunk, reviewer: o.reviewer }); }
  for (const f of o.files || []) byPath.set(f.path, { ...f, ids: (f.ids || []).map(i => local[i] || i), reviewer: o.reviewer, chunk: o.chunk });
}
const rows = ['path,blob_sha,scope,review_method,reviewed_at,reviewer,security_notes,test_contract,conclusion,issue_id,proof_ref'];
let reviewed = 0;
for (const { p, sha } of inv) {
  const r = byPath.get(p);
  if (r) reviewed++;
  // A source-file report is evidence of acquisition/S1 reporting, never proof of independent S2 or executed S3.
  rows.push([p, sha, p.split('/')[0], r ? (r.inspection?.includes('FIRST_PASS') || r.inspection?.includes('FETCH_ANNOTATED') ? 'SOURCE_ACQUIRED_FIRST_PASS_SEMANTIC_PENDING' : 'PRIOR_AGENT_S1_REPORTED_NOT_INDEPENDENT_S2') : 'PENDING', r ? '2026-10-25' : '', r?.reviewer || '', r?.verdict === 'ISSUE' ? r.note : '', '', r ? r.verdict : 'PENDING', (r?.ids || []).join(';'), r ? `out_${r.chunk}.json` : ''].map(q).join(','));
}
fs.writeFileSync(path.join(EV, 'MAIN_RELEASE_FINISH_LEDGER.csv'), rows.join('\n') + '\n');
fs.writeFileSync(path.join(DIR, 'raw_findings.json'), JSON.stringify(findings, null, 1));
fs.writeFileSync(path.join(DIR, 'FILE_PASS_TITLES.md'), '# Found by the file pass (do not re-report)\n' + findings.map(f => `${f.id} | ${f.area} | ${f.title}`).join('\n') + '\n');
// Human-readable history, most severe first. Verified SOURCE / REFUTED SOURCE / alias statuses are separate from S3.
const rank = { P0: 0, P1: 1, P2: 2 };
const sourceVerified = JSON.parse(fs.readFileSync(path.join(DIR, 'VERIFIED.json'), 'utf8'));
const sourceChallenges = JSON.parse(fs.readFileSync(path.join(DIR, 'SOURCE_CHALLENGE_20261025.json'), 'utf8'));
const dedup = JSON.parse(fs.readFileSync(path.join(DIR, 'DEDUPLICATION_20261025.json'), 'utf8'));
const sourceMap = new Map(sourceChallenges.entries.map(e => [e.id, e.status]));
const sourceStatus = id => { const v=sourceVerified[id]; if (v?.runtime_verification==='REPRODUCED_ISOLATED_SQLITE') return `${v.verdict} (synthetic Django/SQLite S3; no production or independent-second-reviewer certification)`; return sourceMap.has(id) ? `${sourceMap.get(id)} (source challenge, not independent S2)` : 'UNCONFIRMED_CANDIDATE (S2/S3 pending)'; };
const rootStatus = id => { const g = dedup.roots.find(g => g.canonical === id || g.aliases.includes(id)); return g ? (id === g.canonical ? `CANONICAL ${g.status}; aliases: ${g.aliases.join(', ')}` : `${g.status}; related to canonical ${g.canonical}`) : 'No root-cluster assignment yet'; };
const md = ['# PR200 finish - candidate findings (source statuses)', '', `Generated from ${outs.length} chunk outputs. Source-level challenges, S3 isolated Django negative reproductions and root-cause aliases are annotated; independent S2 99% is NOT certified. See PHASE5_CANONICAL_FINDING_STATUS_20261025.json.`, ''];
for (const f of [...findings].sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || a.area.localeCompare(b.area))) {
  md.push(`## ${f.id} - ${f.severity} - ${f.area} - ${f.title}`, '', f.scenario, '', `- Evidence: ${(f.evidence || []).map(e => '`' + e + '`').join(', ')}`, `- Confidence: ${f.confidence}; found by ${f.reviewer}`, `- Test that would prove it: ${f.test_needed}`);
  md.push(`- Source status: ${sourceStatus(f.id)}`, `- Deduplication: ${rootStatus(f.id)}`);
  if (f.reference) md.push(`- External reference: ${f.reference}`);
  if (f.owner_question) md.push(`- Owner question: ${f.owner_question.question}`, ...(f.owner_question.options || []).map(o => `  - ${o}`));
  md.push('');
}
fs.writeFileSync(path.join(EV, '..', 'MAIN_RELEASE_FINISH_FINDINGS.md'), md.join('\n'));
const sev = findings.reduce((a, f) => ((a[f.severity] = (a[f.severity] || 0) + 1), a), {});
console.log(`reviewed ${reviewed}/${inv.length} = ${(100 * reviewed / inv.length).toFixed(2)}%  chunks ${outs.length}  new findings ${findings.length}`, JSON.stringify(sev));
