// Merge out_Cxxx.json into the per-file ledger (99% plan columns) and a raw findings list.
// node merge.mjs  -> MAIN_RELEASE_FINISH_LEDGER.csv, raw_findings.json, prints coverage
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const EV = path.resolve(DIR, '..');
const q = s => `"${String(s ?? '').replaceAll('"', '""')}"`;
const inv = fs.readFileSync(path.join(EV, 'MAIN_RELEASE_SOURCE_COVERAGE.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
  .map(l => l.match(/"([^"]*)"/g).map(x => x.slice(1, -1))).map(([p, sha]) => ({ p, sha }));
const outs = fs.readdirSync(DIR).filter(f => /^out_C\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));

const byPath = new Map();
const findings = [];
for (const o of outs) {
  const local = {};
  for (const f of o.findings || []) { const gid = `${o.chunk}-${f.id}`; local[f.id] = gid; findings.push({ ...f, id: gid, chunk: o.chunk, reviewer: o.reviewer }); }
  for (const f of o.files) byPath.set(f.path, { ...f, ids: (f.ids || []).map(i => local[i] || i), reviewer: o.reviewer, chunk: o.chunk });
}
const rows = ['path,blob_sha,scope,review_method,reviewed_at,reviewer,security_notes,test_contract,conclusion,issue_id,proof_ref'];
let reviewed = 0;
for (const { p, sha } of inv) {
  const r = byPath.get(p);
  if (r) reviewed++;
  rows.push([p, sha, p.split('/')[0], r ? 'FULL_FILE_READ_AGENT_SEMANTIC' : 'PENDING', r ? '2026-10-25' : '', r?.reviewer || '', r?.verdict === 'ISSUE' ? r.note : '', '', r ? r.verdict : 'PENDING', (r?.ids || []).join(';'), r ? `out_${r.chunk}.json` : ''].map(q).join(','));
}
fs.writeFileSync(path.join(EV, 'MAIN_RELEASE_FINISH_LEDGER.csv'), rows.join('\n') + '\n');
fs.writeFileSync(path.join(DIR, 'raw_findings.json'), JSON.stringify(findings, null, 1));
fs.writeFileSync(path.join(DIR, 'FILE_PASS_TITLES.md'), '# Found by the file pass (do not re-report)\n' + findings.map(f => `${f.id} | ${f.area} | ${f.title}`).join('\n') + '\n');
const sev = findings.reduce((a, f) => ((a[f.severity] = (a[f.severity] || 0) + 1), a), {});
console.log(`reviewed ${reviewed}/${inv.length} = ${(100 * reviewed / inv.length).toFixed(2)}%  chunks ${outs.length}  new findings ${findings.length}`, JSON.stringify(sev));
