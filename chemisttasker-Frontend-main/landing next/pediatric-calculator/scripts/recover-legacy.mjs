// Recover only the literal regimen array supplied by the user. Never execute the bundle.
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('../ChemistTasker Paediatric anti-infective dosing/_next/static/chunks/3mar-9hyfnije.js', 'utf8');
const start = source.indexOf('x=[{id:"sepsis-cefotaxime"') + 2;
if(start < 2) throw new Error('Expected legacy data marker absent');
let depth = 0, quote = '', escaped = false, end = start;
for (;end < source.length;end++) {
  const c = source[end];
  if (quote) { if(escaped) escaped=false; else if(c==='\\') escaped=true; else if(c===quote) quote=''; continue; }
  if(c==='"'||c==="'") { quote=c; continue; }
  if(c==='[') depth++;
  if(c===']' && --depth===0) {end++;break;}
}
const data = vm.runInNewContext('('+source.slice(start,end)+')', Object.create(null), { timeout: 1000, contextCodeGeneration: {strings:false,wasm:false} });
if(!Array.isArray(data)||data.length!==94) throw new Error('Unexpected legacy regimen count');
fs.mkdirSync('src/data',{recursive:true});
fs.writeFileSync('src/data/legacy-regimens.json',JSON.stringify(data,null,2)+'\n');
console.log(`Recovered ${data.length} reference records; these are not enabled calculations.`);
