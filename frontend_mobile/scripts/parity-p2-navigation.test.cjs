const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = p => fs.readFileSync(require('node:path').join(__dirname, '..', p), 'utf8');
test('worker timesheets is restricted to roster delegates', () => {
  const s = read('components/shell/useWorkerShell.ts');
  assert.match(s, /label: 'Timesheets',[^\n]*route: '\/workforce-timesheets', hidden: !canRoster/);
  assert.match(s, /canRoster = hasCapability\('MANAGE_ROSTER', selectedPharmacyId\)/);
});
test('manager navigation exposes leave under existing roster permissions', () => {
  assert.match(read('app/owner/_layout.tsx'), /label: 'Leave',[^\n]*route: '\/workforce\/leave-requests'/);
  assert.match(read('app/admin/_layout.tsx'), /label: 'Leave',[^\n]*route: '\/workforce\/leave-requests', hidden: !canManageRoster/);
  assert.match(read('app/organization/_layout.tsx'), /label: 'Leave',[^\n]*route: '\/workforce\/leave-requests', hidden: !can\.roster/);
});
test('invoice expenses link to existing receipt management', () => {
  const workspace = read('roles/shared/invoices/FinanceWorkspace.tsx');
  const flow = read('features/parity/finance.tsx');
  assert.match(workspace, /\/finance\/expenses\/\$\{e\.id\}\/receipt/);
  assert.match(flow, /finance\.uploadReceipt\(/);
  assert.match(flow, /openReceipt\(accountScope, receiptId\)/);
  assert.match(read('features/parity/receiptShare.ts'), /finance\.receipt\(id\)/);
});
const vm = require('node:vm');
const ts = require('typescript');
test('worker shell shows timesheets only with MANAGE_ROSTER', () => {
 const source = read('components/shell/useWorkerShell.ts');
 const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 let allowed = false;
 const mod = {exports:{}};
 vm.runInNewContext(js, {module:mod,exports:mod.exports,require: id => {
  if (id === 'react') return {useMemo:fn=>fn(),useEffect:()=>{},useRef:()=>({current:null})};
  if (id === 'expo-router') return {usePathname:()=>'',useRouter:()=>({})};
  if (id === '@/context/AuthContext') return {useAuth:()=>({hasCapability:(cap,id)=>allowed && cap==='MANAGE_ROSTER' && id===12})};
  if (id === '@/context/WorkspaceContext') return {useWorkspace:()=>({workspace:'internal',isLoading:false,selectedPharmacyId:12})};
  if (id.includes('workerHomeLogic')) return {workerTab3:()=> 'roster'};
  return {};
 }});
 for (const value of [true,false]) { allowed=value; const item=mod.exports.useWorkerShell('pharmacist').more.flatMap(g=>g.items).find(i=>i.label==='Timesheets'); assert.equal(item.hidden,!value); }
});

test('manager leave visibility follows roster permission', () => {
 for (const [role, gate] of [['admin','canManageRoster'],['organization','can.roster']]) {
  const row = read(`app/${role}/_layout.tsx`).split(/\r?\n/).find(line => line.includes("label: 'Leave'"));
  assert.ok(row && row.includes(`hidden: !${gate}`));
  const expression = row.match(/hidden: ([^ }]+)/)[1];
  for (const allowed of [true,false]) assert.equal(vm.runInNewContext(expression, {canManageRoster:allowed,can:{roster:allowed}}), !allowed);
 }
 const owner = read('app/owner/_layout.tsx').split(/\r?\n/).find(line => line.includes("label: 'Leave'"));
 assert.ok(owner && !owner.includes('hidden:'));
});
