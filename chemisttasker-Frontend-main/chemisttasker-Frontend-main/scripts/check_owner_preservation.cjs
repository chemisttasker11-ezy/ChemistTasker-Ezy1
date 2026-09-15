// Compare actual AST bindings/hooks against the immutable pre-refinement source.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('../frontend_web/node_modules/typescript');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'docs/rebuild/owner-workflows');
const archive = spawnSync('python', ['-c', 'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode("utf-8-sig") for n in z.namelist()}))', path.join(folder, 'source-before.zip')], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
if (archive.status !== 0) throw new Error(archive.stderr);
const originals = JSON.parse(archive.stdout);
const printer = ts.createPrinter({ removeComments: true });
const format = (node, source) => printer.printNode(ts.EmitHint.Unspecified, node, source);
function inventory(text, file) {
 const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
 const records = { controls: [], hooks: [], handlers: [], conditions: [] };
 function walk(n) {
  if (ts.isJsxAttribute(n)) {
   const name = n.name.getText(source);
   if (/^on[A-Z]/.test(name) || ['value','checked','disabled','required','href','to','error','helperText'].includes(name)) records.controls.push({ name, value: n.initializer ? format(n.initializer, source) : true });
  }
  if (ts.isCallExpression(n) && /^(React\.)?use[A-Z]/.test(n.expression.getText(source))) {
   const parentName = ts.isVariableDeclaration(n.parent) ? n.parent.name.getText(source) : '';
   // Only these two explicitly reviewed presentation callbacks change colours.
   if (!['eventStyleGetter', 'heroGradient'].includes(parentName)) records.hooks.push(format(n, source));
  }
  if (ts.isVariableDeclaration(n) && /^handle[A-Z]/.test(n.name.getText(source))) records.handlers.push(format(n, source));
  if (ts.isIfStatement(n)) records.conditions.push(format(n.expression, source));
  ts.forEachChild(n, walk);
 }
 walk(source); return records;
}
const allowed = ['frontend_web/src/pages/dashboard/sidebar/PostShiftPage.tsx', 'frontend_web/src/pages/dashboard/shiftCenter/ShiftCenterPage.tsx'];
const results = { untouched: 0, changed: [], failures: [] };
const inventoryBefore = {};
for (const [file, old] of Object.entries(originals)) {
 const now = fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');
 if (old.replace(/\r\n/g, '\n') === now.replace(/\r\n/g, '\n')) { results.untouched++; continue; }
 if (!allowed.includes(file)) { results.failures.push('Unexpected changed source: ' + file); continue; }
 const before = inventory(old, file), after = inventory(now, file);
 inventoryBefore[file] = before;
 const counts = {};
 for (const key of Object.keys(before)) {
  const remaining = after[key].map(x => JSON.stringify(x));
  for (const entry of before[key]) {
   const index = remaining.indexOf(JSON.stringify(entry));
   if (index === -1) results.failures.push(`${file}: removed/changed ${key}: ${JSON.stringify(entry).slice(0, 200)}`);
   else remaining.splice(index, 1);
  }
  // Additional keyboard handlers/guards are intentional. Existing expressions must all survive.
  counts[key] = { preserved: before[key].length, added: remaining.length };
 }
 results.changed.push({ file, counts });
}
fs.writeFileSync(path.join(folder, 'interaction-inventory-before.json'), JSON.stringify(inventoryBefore, null, 2));
fs.writeFileSync(path.join(folder, 'preservation-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.failures.length) process.exitCode = 1;
