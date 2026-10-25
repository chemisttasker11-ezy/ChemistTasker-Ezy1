const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, imports = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (id) => imports[id] || {} });
  return exports;
}

test('mobile searches mapped participant names and email and starts DM by membership', async () => {
  const serialization = load('../../shared-core/src/utils/serialization.ts');
  const { mapChatParticipantRecord } = load('../../shared-core/src/domains/chat/mappers.ts', {
    '../../utils/serialization': serialization,
  });
  const participant = mapChatParticipantRecord({
    id: 7, user_details: { id: 91, first_name: 'Omar', last_name: 'Ali', email: 'contact@example.test' },
  });
  const calls = [];
  const { searchParticipants, startDirectChat } = load('../roles/shared/chat/hooks.ts', {
    '@chemisttasker/shared-core': {
      fetchChatParticipants: async () => [participant],
      startDirectMessageByMembership: async (id) => { calls.push(['membership', id]); return { id: 12 }; },
      startDirectMessageByUser: async (id) => { calls.push(['user', id]); return { id: 13 }; },
    },
  });
  for (const query of ['omar', 'ALI', 'contact@']) {
    const matches = await searchParticipants(query);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 7);
    assert.equal(matches[0].membership_id, 7);
  }
  assert.equal((await searchParticipants('unrelated')).length, 0);
  assert.equal((await startDirectChat({ membershipId: participant.membership_id })).id, 12);
  assert.deepEqual(calls, [['membership', 7]]);
  assert.equal((await startDirectChat({ userId: 91 })).id, 13);
  assert.deepEqual(calls[1], ['user', 91]);
});
