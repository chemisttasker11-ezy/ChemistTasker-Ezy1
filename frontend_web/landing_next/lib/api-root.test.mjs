import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_API_ROOT, backendOrigin, canonicalApiRoot } from './api-root.mjs';

test('every configured form resolves to the canonical /api/v1 root', () => {
  for (const value of [
    'http://web:8000',
    'http://web:8000/',
    'http://web:8000/api',
    'http://web:8000/api/',
    'http://web:8000/api/v1',
    'http://web:8000/api/v1/',
    '  http://web:8000/api  ',
  ]) {
    assert.equal(canonicalApiRoot(value), 'http://web:8000/api/v1', value);
  }
});

test('unset configuration uses the local canonical default', () => {
  assert.equal(canonicalApiRoot(undefined), DEFAULT_API_ROOT);
  assert.equal(canonicalApiRoot(''), DEFAULT_API_ROOT);
});

test('WebSocket and media rewrites target the backend origin, never an API root', () => {
  assert.equal(backendOrigin('http://web:8000/api/v1'), 'http://web:8000');
  assert.equal(backendOrigin('http://web:8000/api'), 'http://web:8000');
  assert.equal(backendOrigin('https://backend.example/api/v1/'), 'https://backend.example');
});
