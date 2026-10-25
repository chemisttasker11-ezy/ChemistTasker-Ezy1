// PR #200 finish: run every review chunk (Cxxx file chunks, Fxx flow traces) through the agent fleet, read-only.
// node run-review.mjs [--only C001,F01] [--slots claudeA-1,codexB-1]
// Safe to restart and to run twice: a chunk is skipped when out_<id>.json is valid or claims/<id> is younger than CLAIM_MIN.
// Pause an account by hand: create pause_<acct> (e.g. pause_claudeA); slots wait until it is gone.
// Claude accounts are also paused automatically from their live usage (GUARD below).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const ROOT = path.resolve(DIR, '../../../..');
const RUNS = path.join(DIR, 'runs'), CLAIMS = path.join(DIR, 'claims');
fs.mkdirSync(RUNS, { recursive: true }); fs.mkdirSync(CLAIMS, { recursive: true });
const STACK = 'C:\\dev\\my-stack';
const HOME = process.env.USERPROFILE;
const TIMEOUT_MIN = 45, CLAIM_MIN = 55;
// A: keep 5h headroom for the orchestrator session (same account). B: keep its week for the next 3 days.
const GUARD = { claudeA: { five: 75, week: 99 }, claudeB: { five: 85, week: 50 } };
const LIMIT_RE = /rate.?limit|usage limit|quota|\b429\b|RESOURCE_EXHAUSTED|\b401\b|logged out|not logged in|hit your limit|hit your session limit|out of credits/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chunks = JSON.parse(fs.readFileSync(path.join(DIR, 'chunks.json'), 'utf8'));
const flows = JSON.parse(fs.readFileSync(path.join(DIR, 'flows.json'), 'utf8'));
const flowOf = id => flows.find(f => f.id === id);
const files = id => fs.readFileSync(path.join(DIR, `files_${id}.txt`), 'utf8').trim().split(/\r?\n/);
const isDeep = c => /^(backend|shared-core)\//.test(c.first);

function parse(text) {
  const m = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop();
  return JSON.parse(m ? m[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}
function validate(id, j) {
  if (flowOf(id)) return { ok: Array.isArray(j.findings) && (j.paths_read || []).length >= 5, missing: [] };
  const want = new Set(files(id));
  const got = new Set((j.files || []).filter(f => /^(OK|ISSUE|NOTE|NA)$/.test(f.verdict)).map(f => f.path));
  const missing = [...want].filter(p => !got.has(p));
  return { ok: missing.length <= Math.floor(want.size * 0.02), missing };
}
const done = id => { try { return validate(id, JSON.parse(fs.readFileSync(path.join(DIR, `out_${id}.json`), 'utf8'))).ok; } catch { return false; } };
const claimed = id => { try { return Date.now() - fs.statSync(path.join(CLAIMS, id)).mtimeMs < CLAIM_MIN * 60_000; } catch { return false; } };

// Pick up answers from runs whose runner died (orphaned children finish on their own).
function salvage() {
  for (const d of fs.readdirSync(RUNS)) {
    const [id, name] = d.split('_'); if (done(id)) continue;
    const rj = path.join(RUNS, d, 'relay', 'result.json'), so = path.join(RUNS, d, 'stdout.txt');
    try {
      const text = fs.existsSync(rj) ? JSON.parse(fs.readFileSync(rj, 'utf8')).finalMessage || '' : fs.existsSync(so) ? fs.readFileSync(so, 'utf8') : '';
      const j = parse(text); if (validate(id, j).ok) { j.reviewer = name; fs.writeFileSync(path.join(DIR, `out_${id}.json`), JSON.stringify(j, null, 1)); log('salvaged', id, name); }
    } catch {}
  }
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const pick = process.argv.includes('--slots') ? process.argv[process.argv.indexOf('--slots') + 1].split(',') : null;
const ids = list => list.map(c => c.id).filter(id => !only || only.includes(id));
const Q = { flow: ids(flows), deep: ids(chunks.filter(isDeep)), broad: ids(chunks.filter(c => !isDeep(c))) };
const attempts = {};

const AGY_PRE = 'Work alone: do not start subagents or parallel research tasks; read only the files this brief names or that you must edit.\nRun every command in the foreground and wait for it to finish before you reply. Never start a command in the background.';
const CODEX_PRE = 'Work alone.\nReview by reading code only. Do not run builds, tests or installs: the gate results are below.\nGate summary: none apply (source-reading audit). CI on baseline b77e9fd2 passed except the mobile dependency-advisory check (fast-uri GHSA-w74x-v6f9-j3xg, unrelated to review scope).';
const CLAUDE_PRE = 'Work alone: do not start subagents; read only the files this brief names, the known-findings list, and files you must open to understand them.';

function brief(id, pre) {
  const fl = flowOf(id);
  if (fl) return fs.readFileSync(path.join(DIR, 'FLOW_TEMPLATE.md'), 'utf8').replace('{{PREAMBLE}}', pre)
    .replaceAll('{{CHUNK}}', id).replace('{{TITLE}}', fl.title).replace('{{SCOPE}}', fl.scope).replace('{{AREA}}', fl.area);
  const f = files(id);
  return fs.readFileSync(path.join(DIR, 'BRIEF_TEMPLATE.md'), 'utf8')
    .replace('{{PREAMBLE}}', pre).replaceAll('{{CHUNK}}', id).replaceAll('{{N}}', String(f.length))
    .replace('{{FILES}}', f.map(p => `- ${p}`).join('\n'));
}

const RUNNERS = {
  claude: (acct, model, effort) => (id, out) => run('claude.cmd',
    ['-p', '--model', model, '--effort', effort, '--allowedTools', 'Read Grep Glob', '--disallowedTools', 'Edit Write Bash PowerShell NotebookEdit Agent', '--output-format', 'text'],
    { cwd: ROOT, stdin: brief(id, CLAUDE_PRE), env: acct === 'B' ? { CLAUDE_CONFIG_DIR: `${HOME}\\.claude-b` } : { CLAUDE_CONFIG_DIR: undefined } }, out),
  codex: acct => (id, out) => {
    const bf = path.join(out, 'brief.md'); fs.writeFileSync(bf, brief(id, CODEX_PRE));
    return run('node', [`${STACK}\\skills\\codex-delegate\\scripts\\relay.mjs`, '--lane', 'review', '--brief', bf, '--cd', ROOT, '--out-dir', path.join(out, 'relay'), '--timeout', `${TIMEOUT_MIN}m`],
      { cwd: ROOT, env: acct === 'B' ? { CODEX_HOME: `${HOME}\\.codex-b` } : { CODEX_HOME: undefined } }, out, path.join(out, 'relay', 'result.json'));
  },
  agy: (g, wt) => (id, out) => {
    const bf = path.join(out, 'brief.md'); fs.writeFileSync(bf, brief(id, AGY_PRE + '\nThis is a read-only review: do not edit any file.'));
    return run('powershell', ['-ExecutionPolicy', 'Bypass', '-File', `${STACK}\\bin\\agy-relay.ps1`, g, '--lane', 'complex', '--brief', bf, '--cd', wt, '--out-dir', path.join(out, 'relay'), '--timeout', `${TIMEOUT_MIN}m`],
      { cwd: wt }, out, path.join(out, 'relay', 'result.json'));
  },
};

// Flow traces are cross-file reasoning: Claude takes them first, Codex helps; agy only gets broad file chunks.
const SLOTS = [
  ...[1, 2, 3].map(i => ({ name: `claudeA-${i}`, acct: 'claudeA', queues: [Q.flow, Q.deep, Q.broad], go: RUNNERS.claude('A', 'claude-opus-5-5', 'high') })),
  ...[1, 2].map(i => ({ name: `claudeB-${i}`, acct: 'claudeB', queues: [Q.deep, Q.flow, Q.broad], go: RUNNERS.claude('B', 'claude-opus-5-5', 'high') })),
  ...[1, 2, 3, 4].map(i => ({ name: `codexA-${i}`, acct: 'codexA', queues: [Q.deep, Q.flow, Q.broad], go: RUNNERS.codex('A') })),
  ...[1, 2, 3, 4].map(i => ({ name: `codexB-${i}`, acct: 'codexB', queues: [Q.deep, Q.flow, Q.broad], go: RUNNERS.codex('B') })),
  ...['g1', 'g2', 'g3'].flatMap(g => [1, 2].map(i => ({ name: i > 1 ? `agy-${g}-${i}` : `agy-${g}`, acct: `agy${g}`, queues: [Q.broad, Q.deep, Q.flow], go: RUNNERS.agy(g, `C:\\dev\\worktrees\\chemisttasker-pr200-${g}${i > 1 ? '-' + i : ''}`) }))),
];

function run(cmd, args, { cwd, stdin, env = {} }, out, resultJson) {
  return new Promise(res => {
    const e = { ...process.env };
    for (const [k, v] of Object.entries(env)) v === undefined ? delete e[k] : (e[k] = v);
    const p = spawn(cmd, args, { cwd, env: e, shell: cmd.endsWith('.cmd') });
    let so = '', se = '';
    p.stdout.on('data', d => (so += d)); p.stderr.on('data', d => (se += d));
    if (stdin !== undefined) { p.stdin.write(stdin); p.stdin.end(); }
    const t = setTimeout(() => p.kill(), (TIMEOUT_MIN + 5) * 60_000);
    p.on('close', code => {
      clearTimeout(t);
      fs.writeFileSync(path.join(out, 'stdout.txt'), so); fs.writeFileSync(path.join(out, 'stderr.txt'), se);
      let text = so;
      try { if (resultJson && fs.existsSync(resultJson)) { const r = JSON.parse(fs.readFileSync(resultJson, 'utf8')); text = r.finalMessage || ''; if (r.status !== 'completed') code = code || 1; } } catch {}
      res({ code, text, err: se + so.slice(-2000) });
    });
  });
}

// Live Claude usage via Fleet Mate's own fetcher, refreshed every 3 minutes.
const usage = {};
async function guardLoop() {
  for (;;) {
    try {
      const py = 'import json,pathlib,fleet_usage as f; h=pathlib.Path.home(); print(json.dumps({n:{"five":r.get("five"),"week":r.get("week")} for n,d in (("claudeA",".claude"),("claudeB",".claude-b")) for r in [f.fetch_claude(n,h/d)]}))';
      Object.assign(usage, JSON.parse(execFileSync('python', ['-c', py], { cwd: `${STACK}\\widget`, encoding: 'utf8', timeout: 60_000 }).trim().split('\n').pop()));
    } catch (e) { log('usage check failed', String(e).slice(0, 120)); }
    await sleep(3 * 60_000);
  }
}
const overGuard = acct => { const g = GUARD[acct], u = usage[acct]; return g && u && (u.five >= g.five || u.week >= g.week); };

const status = {};
const log = (...a) => { const s = `${new Date().toISOString()} ${a.join(' ')}`; console.log(s); fs.appendFileSync(path.join(DIR, 'runner.log'), s + '\n'); };
const save = () => fs.writeFileSync(path.join(DIR, 'status.json'), JSON.stringify({ usage, left: Object.fromEntries(Object.entries(Q).map(([k, q]) => [k, q.filter(id => !done(id)).length])), status }, null, 1));

async function slot(s) {
  let paused = false;
  for (;;) {
    if (fs.existsSync(path.join(DIR, `pause_${s.acct}`)) || overGuard(s.acct)) {
      if (!paused) { log(s.name, 'paused', JSON.stringify(usage[s.acct] || {})); paused = true; }
      status[s.name] = 'paused'; save(); await sleep(60_000); continue;
    }
    if (paused) { log(s.name, 'resumed'); paused = false; }
    salvage();
    let id, q;
    for (q of s.queues) { const i = q.findIndex(x => !done(x) && !claimed(x)); if (i >= 0) { id = q.splice(i, 1)[0]; break; } }
    if (!id) {
      if (s.queues.some(q => q.some(x => !done(x)))) { status[s.name] = 'waiting'; save(); await sleep(120_000); continue; } // claimed elsewhere; retake if it never lands
      status[s.name] = 'idle'; save(); return;
    }
    const n = (attempts[id] = (attempts[id] || 0) + 1);
    fs.writeFileSync(path.join(CLAIMS, id), `${s.name} ${new Date().toISOString()}`);
    const out = path.join(RUNS, `${id}_${s.name}_${Date.now()}`); fs.mkdirSync(out, { recursive: true });
    status[s.name] = `${id} since ${new Date().toISOString()}`; save(); log(s.name, 'start', id);
    const r = await s.go(id, out);
    let j, v;
    try { j = parse(r.text); v = validate(id, j); } catch { v = { ok: false, missing: ['unparsable'] }; }
    if (v.ok) { j.reviewer = s.name; fs.writeFileSync(path.join(DIR, `out_${id}.json`), JSON.stringify(j, null, 1)); log(s.name, 'done', id, `findings=${(j.findings || []).length}`); continue; }
    fs.rmSync(path.join(CLAIMS, id), { force: true });
    const limited = LIMIT_RE.test(r.err) || LIMIT_RE.test(r.text.slice(-500));
    log(s.name, limited ? 'LIMIT' : 'FAIL', id, `code=${r.code} missing=${v.missing.length}`);
    if (n < 3) q.unshift(id); else log('GIVEUP', id);
    if (limited) { status[s.name] = 'limit'; save(); if (s.acct.startsWith('claude')) { await sleep(15 * 60_000); continue; } return; }
  }
}

salvage();
log('runner start', JSON.stringify(Object.fromEntries(Object.entries(Q).map(([k, q]) => [k, q.filter(id => !done(id)).length]))));
guardLoop();
await sleep(5000);
await Promise.all(SLOTS.filter(s => !pick || pick.includes(s.name)).map((s, i) => sleep(i * 4000).then(() => slot(s))));
log('runner end'); save();
process.exit(0);
