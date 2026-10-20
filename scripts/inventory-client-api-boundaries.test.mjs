import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryBoundarySources } from './inventory-client-api-boundaries.mjs';

test('whole-tree scanner records direct internal request calls with their exact source location', () => {
    const findings = inventoryBoundarySources([{
        path: 'frontend_mobile/roles/example.ts',
        content: [
            "const x = await apiClient.get('/api/v1/pharmacies/1/');",
            "const y = await fetch('/api/v1/work-notes/');",
            "const z = await getPharmacyById(1);",
        ].join('\\n'),
    }]);
    assert.equal(findings.length, 2);
    assert.deepEqual(findings.map(item => item.line), [1, 2]);
    assert.equal(findings[0].kind, 'direct-backend-route');
});

test('scanner respects shared operation calls and cannot silently discard generic escape hatches', () => {
    const findings = inventoryBoundarySources([{
        path: 'frontend_web/src/sample.ts',
        content: [
            "const a = await updatePharmacy(1, payload);",
            "const b = await chemistTaskerApi.marketplace.request('/listing/');",
        ].join('\\n'),
    }]);
    assert.deepEqual(findings.map(item => item.kind), ['generic-client-escape']);
});
