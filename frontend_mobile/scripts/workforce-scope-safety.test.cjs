const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const source=readFileSync(resolve(__dirname,'../app/workforce-settings.tsx'),'utf8');
test('old pharmacy responses cannot replace the current workforce or payroll state',()=>{
  assert.match(source,/requestGeneration = useRef\(0\)/);
  assert.match(source,/currentPharmacy\.current === pharmacyId/);
  assert.match(source,/if \(!current\(\)\) return/);
  assert.match(source,/if \(current\(\)\) setError/);
  assert.match(source,/requestGeneration\.current \+= 1/);
});
test('a pending save disables pharmacy switching and stale refresh callbacks',()=>{
  assert.match(source,/disabled=\{busyKey != null\} selected=\{pharmacyId === pharmacy\.id\}/);
  assert.match(source,/if \(currentPharmacy\.current === pharmacyId\) await load\(\)/);
  assert.match(source,/if \(currentPharmacy\.current === pharmacyId\) \{ setPayroll\(next\); await load\(\); \}/);
});
