import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryBoundarySources, classifyBoundaryFindings, validateBoundaryManifest } from './inventory-client-api-boundaries.mjs';

test('whole-tree scanner records direct internal request calls with their exact source location', () => {
    const findings = inventoryBoundarySources([{
        path: 'frontend_mobile/roles/example.ts',
        content: [
            "const x = await apiClient.get('/api/v1/pharmacies/1/');",
            "const y = await fetch('/api/v1/work-notes/');",
            "const z = await getPharmacyById(1);",
        ].join('\n'),
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
        ].join('\n'),
    }]);
    assert.deepEqual(findings.map(item => item.kind), ['generic-client-escape']);
});

test('classification requires explicit owner and rationale; strict fails all unexplained legacy debt', () => {
    const items = inventoryBoundarySources([{
        path: 'frontend_web/src/legacy.ts',
        content: "apiClient.get('/api/v1/pharmacies/1/');",
    }]);
    const current = classifyBoundaryFindings(items, {});
    assert.equal(current[0].classification, 'unreviewed');
    assert.equal(validateBoundaryManifest(current, {}).length, 1);
    const key = current[0].key;
    const approved = { [key]: { classification: 'approved-adapter', owner: 'organizations', rationale: 'Boundary adapter with equivalent shared-core contract' } };
    assert.deepEqual(validateBoundaryManifest(classifyBoundaryFindings(items, approved), approved), []);
    const unfinished = { [key]: { ...approved[key], classification: 'legacy-migrate' } };
    assert.equal(validateBoundaryManifest(classifyBoundaryFindings(items, unfinished), unfinished).length, 1);
    assert.equal(validateBoundaryManifest([], approved).length, 1);
});

test('callsite identifiers are stable across line shifts', () => {
    const before = inventoryBoundarySources([{ path: 'frontend_mobile/api.ts', content: "fetch('/api/v1/billing/x');" }]);
    const after = inventoryBoundarySources([{ path: 'frontend_mobile/api.ts', content: "// comment\n\nfetch('/api/v1/billing/x');" }]);
    assert.equal(classifyBoundaryFindings(before)[0].key, classifyBoundaryFindings(after)[0].key);
});
