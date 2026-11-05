import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('./dashboardScope.tsx', import.meta.url), 'utf8');
test('worker 403 uses web-compatible Explorer dashboard fallback and no automatic pharmacy switch', () => {
  assert.match(code, /getExplorerDashboard\(\)/);
  assert.match(code, /const worker = role === 'PHARMACIST' \|\| role === 'OTHER_STAFF'/);
  assert.match(code, /isCurrentDashboardRequest\(request, dashboardRequest\.current\)/);
  assert.doesNotMatch(code.slice(code.indexOf('} catch (error: any) {'), code.indexOf('}, [', code.indexOf('} catch (error: any) {'))), /selectPharmacy\(firstPharmacy\)|selectPlatform\(\)/);
});
test('owner and organization dashboard endpoints remain unchanged', () => {
  assert.match(code, /getOrganizationDashboard\(organizationId, params\)/);
  assert.match(code, /getOwnerDashboard\(params\)/);
});
