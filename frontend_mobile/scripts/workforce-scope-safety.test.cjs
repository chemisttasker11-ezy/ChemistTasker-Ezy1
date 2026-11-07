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
test('source wiring: pending writes lock selection and apply saved rows without reloading other drafts',()=>{
  assert.match(source,/accessibilityState=\{\{ checked: pharmacyId === pharmacy\.id, disabled: busyKey != null \|\| loading \|\| refreshing \}\} disabled=\{busyKey != null \|\| loading \|\| refreshing\}/);
  assert.match(source,/if \(!isMountedRef\.current \|\| currentPharmacy\.current !== pharmacyId\) return/);
  assert.match(source,/const nextBaseline = \{ \.\.\.loadedHoursRef\.current, \[row\.membership_id\]: formatted \}/);
  assert.doesNotMatch(source.slice(source.indexOf('const saveHours')), /await load\(/);
});
