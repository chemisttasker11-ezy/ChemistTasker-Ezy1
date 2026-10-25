// Fix plan: every confirmed plain-bug finding (kind FIX), grouped into the 9 agreed areas, P0s first.
// DECISION findings are left out (they go to the grill). Items already fixed by PR #201 are marked, not dropped.
// Inputs: VERIFIED_INDEPENDENT.json, VERIFIED.json (3 P0), raw/b findings, and the online agent's canonical file (argv[2])
// for its runtime-reproduced ids. node build-fix-plan.mjs <canonical.json> -> FIX_PLAN_BY_AREA.json + ../../MAIN_RELEASE_FIX_PLAN.md
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const indep = read('VERIFIED_INDEPENDENT.json'), p0 = read('VERIFIED.json');
const text = new Map([...read('raw_findings.json'), ...read('b_findings.json')].map(f => [f.id, f]));
const canon = new Map(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).entries.map(e => [e.id, e]));
const PR201 = new Set(['B06', 'B07', 'B15', 'B33', 'B36', 'F03-N1', 'F04-N1', 'F04-N2', 'F10-N5']);

const AREAS = [
  ['1 Tenancy, permissions, auth', /tenan|organi|membership|admin|auth|session|permission|role|region|chain|privacy|pharmacy admins|re-invite/i],
  ['2 Shifts, booking, payments', /shift|booking|offer|roster|cover|cancel|escalat|posting|slot|workforce/i],
  ['3 Billing and Stripe', /billing|stripe|subscription|seat|checkout|pills|reward|payment/i],
  ['4 Invoicing and finance', /invoic|finance|bas|super|payroll|wage/i],
  ['5 Attendance, kiosk, timesheets', /attendance|kiosk|timesheet|leave|clock/i],
  ['6 Chat, Hub, notifications', /chat|hub|notif|push|message|poll|mention/i],
  ['7 Onboarding and verification', /onboard|ahpra|identity|referee|verification|sign.?up|skill/i],
  ['8 Talent, marketplace, public pages', /talent|marketplace|public|rating|learning|publish|catalogue|job board/i],
  ['9 Parity and UX', /mobile|web|parity|ui|ux|shared-core|tooling|expo|next/i],
];
// The finding's own area label decides; its title only when the label matches nothing.
const areaOf = f => (AREAS.find(([, re]) => re.test(f.area)) || AREAS.find(([, re]) => re.test(f.title)) || AREAS[8])[0];

const items = new Map();
const add = (id, sev, status, evidence, extra = {}) => {
  const f = text.get(id) || canon.get(id) || {};
  items.set(id, { id, severity: sev, area: areaOf({ area: f.area || '', title: f.title || '' }), title: f.title, status,
    evidence: evidence || f.evidence || f.source_proof || [], test: f.test_needed || '', fixed_in_pr201: PR201.has(id), ...extra });
};
for (const [id, v] of Object.entries(p0)) add(id, 'P0', 'CONFIRMED_SOURCE + RUNTIME_REPRODUCED', v.evidence);
for (const [id, v] of Object.entries(indep)) if (v.status.startsWith('CONFIRMED') && v.kind === 'FIX' && !items.has(id))
  add(id, v.severity, v.status + (v.s3 && v.s3 !== 'NOT_EXECUTED' ? ` + ${v.s3}` : ''), v.checks[0]?.evidence, { ui_visible: v.ui_visible });
for (const [id, e] of canon) if (/REPRODUCED/.test(e.status) && !items.has(id) && !(indep[id] && indep[id].kind === 'DECISION'))
  add(id, (e.severity || 'P1').slice(0, 2), `${e.status} (online agent)`, e.source_proof);

const rank = { P0: 0, P1: 1, P2: 2 };
const plan = AREAS.map(([name]) => ({ area: name, items: [...items.values()].filter(i => i.area === name)
  .sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id)) }));
fs.writeFileSync(path.join(DIR, 'FIX_PLAN_BY_AREA.json'), JSON.stringify(plan, null, 1));
const md = ['# PR200 fix plan by area', '', 'Every confirmed plain bug (decisions go to the grill). P0 first within each area. `[201]` = already fixed in PR #201 (verify, do not redo).', ''];
for (const a of plan) {
  const c = a.items.reduce((o, i) => ((o[i.severity] = (o[i.severity] || 0) + 1), o), {});
  md.push(`## ${a.area} (${a.items.length}: ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')})`, '');
  for (const i of a.items) md.push(`- ${i.fixed_in_pr201 ? '[201] ' : ''}**${i.id}** ${i.severity}: ${i.title}`);
  md.push('');
}
fs.writeFileSync(path.join(DIR, '..', '..', 'MAIN_RELEASE_FIX_PLAN.md'), md.join('\n'));
console.log(plan.map(a => `${a.area}: ${a.items.length} (P0 ${a.items.filter(i => i.severity === 'P0').length}, in 201 ${a.items.filter(i => i.fixed_in_pr201).length})`).join('\n'), '\ntotal', items.size);
