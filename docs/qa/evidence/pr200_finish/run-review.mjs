// PR #200 finish: run every review chunk through the agent fleet, read-only.
// node run-review.mjs            -> runs until both queues are empty; safe to restart (skips chunks with a valid out_Cxxx.json)
// Pause an account: create file  pause_<slotAccount>  (e.g. pause_claudeA) in this folder; it stops taking new chunks.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const ROOT = path.resolve(DIR, '../../../..');
const RUNS = path.join(DIR, 'runs');
fs.mkdirSync(RUNS, { recursive: true });
const STACK = 'C:\\dev\\my-stack';
const HOME = process.env.USERPROFILE;
const TIMEOUT_MIN = 45;
const LIMIT_RE = /rate.?limit|usage limit|quota|\b429\b|RESOURCE_EXHAUSTED|\b401\b|logged out|not logged in|hit your limit/i;

const chunks = JSON.parse(fs.readFileSync(path.join(DIR, 'chunks.json'), 'utf8'));
const files = id => fs.readFileSync(path.join(DIR, `files_${id}.txt`), 'utf8').trim().split('\n');
const isDeep = c => /^(backend|shared-core)\//.test(c.first);
const done = id => { try { return validate(id, JSON.parse(fs.readFileSync(path.join(DIR, `out_${id}.json`), 'utf8'))).ok; } catch { return false; } };
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const want = c => !done(c.id) && (!only || only.includes(c.id));
const deep = chunks.filter(c => isDeep(c) && want(c)).map(c => c.id);
const broad = chunks.filter(c => !isDeep(c) && want(c)).map(c => c.id);
const attempts = {};

const AGY_PRE = 'Work alone: do not start subagents or parallel research tasks; read only the files this brief names or that you must edit.\nRun every command in the foreground and wait for it to finish before you reply. Never start a command in the background.';
const CODEX_PRE = 'Work alone.\nReview by reading code only. Do not run builds, tests or installs: the gate results are below.\nGate summary: none apply (source-reading audit). CI on baseline b77e9fd2 passed except the mobile dependency-advisory check (fast-uri GHSA-w74x-v6f9-j3xg, unrelated to review scope).';
const CLAUDE_PRE = 'Work alone: do not start subagents; read only the files this brief names, the known-findings list, and files you must open to understand them.';

function brief(id, pre) {
  const f = files(id);
  return fs.readFileSync(path.join(DIR, 'BRIEF_TEMPLATE.md'), 'utf8')
    .replace('{{PREAMBLE}}', pre).replaceAll('{{CHUNK}}', id).replaceAll('{{N}}', String(f.length))
    .replace('{{FILES}}', f.map(p => `- ${p}`).join('\n'));
}

// account -> how to run one chunk; returns {code, text}
const RUNNERS = {
  claude: (acct, model, effort) => (id, out) => run('claude.cmd',
    ['-p', '--model', model, '--effort', effort, '--allowedTools', 'Read Grep Glob', '--disallowedTools', 'Edit Write Bash PowerShell NotebookEdit Agent', '--output-format', 'text'],
    { cwd: ROOT, stdin: brief(id, CLAUDE_PRE), env: acct === 'B' ? { CLAUDE_CONFIG_DIR: `${HOME}\\.claude-b` } : { CLAUDE_CONFIG_DIR: undefined } }, out),
  codex: acct => (id, out) => {
    const bf = path.join(out, 'brief.md'); fs.writeFileSync(bf, brief(id, CODEX_PRE));
    return run('node', [`${STACK}\\skills\\codex-delegate\\scripts\\relay.mjs`, '--lane', 'review', '--brief', bf, '--cd', ROOT, '--out-dir', path.join(out, 'relay'), '--timeout', `${TIMEOUT_MIN}m`],
      { cwd: ROOT, env: acct === 'B' ? { CODEX_HOME: `${HOME}\\.codex-b` } : { CODEX_HOME: undefined } }, out, path.join(out, 'relay', 'result.json'));
  },
  agy: g => (id, out) => {
    const bf = path.join(out, 'brief.md'); fs.writeFileSync(bf, brief(id, AGY_PRE + '\nThis is a read-only review: do not edit any file.'));
    const wt = `C:\\dev\\worktrees\\chemisttasker-pr200-${g}`;
    return run('powershell', ['-ExecutionPolicy', 'Bypass', '-File', `${STACK}\\bin\\agy-relay.ps1`, g, '--lane', 'complex', '--brief', bf, '--cd', wt, '--out-dir', path.join(out, 'relay'), '--timeout', `${TIMEOUT_MIN}m`],
      { cwd: wt }, out, path.join(out, 'relay', 'result.json'));
  },
};

// name, account key (for pause files), queues it pulls from in order, runner
const SLOTS = [
  ...[1, 2, 3].map(i => ({ name: `claudeA-${i}`, acct: 'claudeA', queues: [deep, broad], go: RUNNERS.claude('A', 'claude-opus-5-5', 'high') })),
  ...[1, 2].map(i => ({ name: `claudeB-${i}`, acct: 'claudeB', queues: [deep, broad], go: RUNNERS.claude('B', 'claude-opus-5-5', 'high') })),
  ...[1, 2].map(i => ({ name: `codexA-${i}`, acct: 'codexA', queues: [deep, broad], go: RUNNERS.codex('A') })),
  ...[1, 2].map(i => ({ name: `codexB-${i}`, acct: 'codexB', queues: [deep, broad], go: RUNNERS.codex('B') })),
  ...['g1', 'g2', 'g3'].map(g => ({ name: `agy-${g}`, acct: `agy${g}`, queues: [broad], go: RUNNERS.agy(g) })),
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
      if (resultJson && fs.existsSync(resultJson)) {
        const r = JSON.parse(fs.readFileSync(resultJson, 'utf8'));
        text = r.finalMessage || ''; if (r.status !== 'completed') code = code || 1;
      }
      res({ code, text, err: se + so.slice(-2000) });
    });
  });
}

function parse(text) {
  const m = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop();
  return JSON.parse(m ? m[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}
function validate(id, j) {
  const want = new Set(files(id));
  const got = new Set((j.files || []).filter(f => /^(OK|ISSUE|NOTE|NA)$/.test(f.verdict)).map(f => f.path));
  const missing = [...want].filter(p => !got.has(p));
  return { ok: missing.length <= Math.floor(want.size * 0.02), missing };
}

const status = {};
const log = (...a) => { const s = `${new Date().toISOString()} ${a.join(' ')}`; console.log(s); fs.appendFileSync(path.join(DIR, 'runner.log'), s + '\n'); };
const save = () => fs.writeFileSync(path.join(DIR, 'status.json'), JSON.stringify({ deepLeft: deep.length, broadLeft: broad.length, status }, null, 1));

async function slot(s) {
  for (;;) {
    if (fs.existsSync(path.join(DIR, `pause_${s.acct}`))) { status[s.name] = 'paused'; save(); return; }
    const q = s.queues.find(q => q.length); if (!q) { status[s.name] = 'idle'; save(); return; }
    const id = q.shift(); const n = (attempts[id] = (attempts[id] || 0) + 1);
    const out = path.join(RUNS, `${id}_${s.name}_${n}`); fs.mkdirSync(out, { recursive: true });
    status[s.name] = `${id} since ${new Date().toISOString()}`; save(); log(s.name, 'start', id);
    const r = await s.go(id, out);
    let j, v;
    try { j = parse(r.text); v = validate(id, j); } catch (e) { v = { ok: false, missing: ['unparsable'] }; }
    if (v.ok) { j.reviewer = s.name; fs.writeFileSync(path.join(DIR, `out_${id}.json`), JSON.stringify(j, null, 1)); log(s.name, 'done', id, `files=${j.files.length} findings=${(j.findings || []).length}`); continue; }
    const limited = LIMIT_RE.test(r.err) || LIMIT_RE.test(r.text.slice(-500));
    log(s.name, limited ? 'LIMIT' : 'FAIL', id, `code=${r.code} missing=${v.missing.length}`);
    if (n < 3) q.unshift(id); else log('GIVEUP', id);
    if (limited) { status[s.name] = 'limit'; save(); return; }
  }
}

// --slots claudeA-1,codexB-1 runs only those slots (pilot)
const pick = process.argv.includes('--slots') ? process.argv[process.argv.indexOf('--slots') + 1].split(',') : null;
log('runner start deep', deep.length, 'broad', broad.length);
await Promise.all(SLOTS.filter(s => !pick || pick.includes(s.name)).map((s, i) => new Promise(r => setTimeout(r, i * 4000)).then(() => slot(s))));
log('runner end'); save();
