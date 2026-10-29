const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { verifyAudit, verifyInstalled } = require('./verify-dependency-security.cjs');

const root = path.resolve(__dirname, '..');
function isolated(source) {
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: root, encoding: 'utf8', timeout: 3_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
}

test('installed patches and exact supported leaf versions are present', verifyInstalled);

test('patched deepmerge drops __proto__ for every vulnerable merge shape', () => {
  const merge = require('deepmerge');
  const malicious = JSON.parse('{ "__proto__": { "isAdmin": true } }');

  const nullTarget = Object.create(null);
  nullTarget.debug = false;
  const fromNullTarget = merge(nullTarget, malicious);
  assert.equal(Object.getPrototypeOf(fromNullTarget), Object.prototype);
  assert.equal(fromNullTarget.isAdmin, undefined);
  assert.equal(fromNullTarget.debug, false);

  const nested = merge(
    { session: null },
    JSON.parse('{ "session": { "__proto__": { "isAdmin": true } } }'),
  );
  assert.equal(Object.getPrototypeOf(nested.session), Object.prototype);
  assert.equal(nested.session.isAdmin, undefined);

  const poisonedTarget = JSON.parse('{ "__proto__": { "isAdmin": true }, "debug": false }');
  const fromTarget = merge(poisonedTarget, { verbose: true });
  assert.equal(Object.getPrototypeOf(fromTarget), Object.prototype);
  assert.equal(fromTarget.isAdmin, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(fromTarget, '__proto__'), false);
  assert.equal(fromTarget.debug, false);
  assert.equal(fromTarget.verbose, true);

  const arrayClone = merge(
    { list: [] },
    JSON.parse('{ "list": [ { "__proto__": { "isAdmin": true }, "value": 7 } ] }'),
  );
  assert.equal(Object.getPrototypeOf(arrayClone.list[0]), Object.prototype);
  assert.equal(arrayClone.list[0].isAdmin, undefined);
  assert.equal(arrayClone.list[0].value, 7);
  assert.equal({}.isAdmin, undefined);
});

test('deep brace/parenthesis patterns and direct ASTs stop before recursive overflow', () => {
  isolated(`
    const assert = require('node:assert/strict'), braces = require('braces');
    for (const [left,right] of [['{','}'], ['(',')'], ['({','})']]) {
      const input = left.repeat(4500) + 'a,b' + right.repeat(4500);
      for (const method of ['parse','compile','expand','stringify']) {
        assert.throws(() => braces[method](input), SyntaxError);
      }
    }
    let ast = { type: 'text', value: 'a' };
    for (let i=0;i<4500;i++) ast={type:'root',nodes:[ast]};
    for (const method of ['compile','expand','stringify']) assert.throws(() => braces[method](ast), SyntaxError);
    let iterable = { type:'text', value:'a' }, indexed = { type:'text', value:'a' };
    for(let i=0;i<10000;i++) {
      iterable = {type:'root',nodes:new Set([iterable])};
      indexed = {type:'root',nodes:{0:indexed,length:1}};
    }
    for(const method of ['compile','stringify']) assert.throws(() => braces[method](iterable), SyntaxError);
    assert.throws(() => braces.expand(indexed), SyntaxError);
    const cycle={type:'root',nodes:[]}; cycle.nodes.push(cycle);
    for (const method of ['compile','expand','stringify']) assert.throws(() => braces[method](cycle), SyntaxError);
    let array=['a'];for(let i=0;i<4500;i++) array=[array];
    assert.throws(() => require('braces/lib/utils').flatten(array), SyntaxError);
    assert.throws(() => braces.expand({type:'root',nodes:[{type:'text',value:'start'}, {type:'text',value:array}]}), SyntaxError);
    assert.deepEqual(braces.expand('src/{app,roles}/{a,b}.{ts,tsx}'),
      ['src/app/a.ts','src/app/a.tsx','src/app/b.ts','src/app/b.tsx',
       'src/roles/a.ts','src/roles/a.tsx','src/roles/b.ts','src/roles/b.tsx']);
    assert.deepEqual(require('micromatch')(['src/a.ts','src/b.tsx','doc.md'],'src/*.{ts,tsx}'), ['src/a.ts','src/b.tsx']);
    assert.deepEqual(require('braces/lib/utils').flatten([1,[2,[3]],undefined]), [1,2,3]);
  `);
});

test('RSA verifier rejects nested padding and preserves valid SHA signatures', () => {
  const forge = require('node-forge');
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 3 });
  const digest = forge.md.sha256.create().update('candidate profile');
  const valid = keys.privateKey.sign(digest);
  assert.equal(keys.publicKey.verify(digest.digest().getBytes(), valid), true);
  const a = forge.asn1;
  const node = (type, constructed, value) => a.create(a.Class.UNIVERSAL, type, constructed, value);
  // Use raw private exponentiation: the encoded block already contains padding.
  function rawSignature(parameters, extra) {
    const algorithm = node(a.Type.SEQUENCE, true,
      [node(a.Type.OID, false, a.oidToDer(forge.pki.oids.sha256).getBytes()), ...parameters, ...extra]);
    const info = node(a.Type.SEQUENCE, true, [algorithm, node(a.Type.OCTETSTRING, false, digest.digest().getBytes())]);
    const bytes = a.toDer(info).getBytes();
    const size = Math.ceil(keys.privateKey.n.bitLength()/8);
    return forge.pki.rsa.encrypt('\x00\x01'+'\xff'.repeat(size-bytes.length-3)+'\x00'+bytes, keys.privateKey, false);
  }
  for (const parameters of [[], [node(a.Type.NULL, false, '')]]) {
    assert.equal(keys.publicKey.verify(digest.digest().getBytes(), rawSignature(parameters, [])), true);
    assert.throws(() => keys.publicKey.verify(digest.digest().getBytes(),
      rawSignature(parameters, [node(a.Type.OCTETSTRING, false, 'extra')])), /DigestInfo/);
  }
  assert.throws(() => keys.publicKey.verify(digest.digest().getBytes(),
    rawSignature([node(a.Type.NULL, false, 'garbage')], [])), /DigestInfo/);
  const expoCertificates = require('@expo/code-signing-certificates');
  const certificate = expoCertificates.generateSelfSignedCodeSigningCertificate({
    keyPair: keys, commonName: 'Artificial security compatibility test',
    validityNotBefore: new Date(Date.now() - 60_000), validityNotAfter: new Date(Date.now() + 60_000),
  });
  assert.doesNotThrow(() => expoCertificates.validateSelfSignedCertificate(certificate, keys));
  assert.ok(expoCertificates.signBufferRSASHA256AndVerify(keys.privateKey, certificate, Buffer.from('valid update')));
});

test('patched deepmerge rejects returned-object prototype poisoning and preserves normal merges', () => {
  const merge = require('deepmerge');
  const values = [
    merge(Object.create(null), JSON.parse('{"__proto__":{"isAdmin":true}}')),
    merge({ session: null }, JSON.parse('{"session":{"__proto__":{"isAdmin":true}}}')).session,
    merge(JSON.parse('{"__proto__":{"isAdmin":true},"debug":false}'), {}),
    merge({ list: [] }, JSON.parse('{"list":[{"__proto__":{"isAdmin":true}}]}')).list[0],
  ];
  for (const value of values) {
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.equal(value.isAdmin, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(value, '__proto__'), false);
  }
  assert.equal(({}).isAdmin, undefined);
  assert.deepEqual(
    merge({ a: { x: 1 }, list: [1] }, { a: { y: 2 }, list: [2] }),
    { a: { x: 1, y: 2 }, list: [1, 2] },
  );
});

test('patched image parsers reject zero-size entries and Metro keeps valid dimensions', () => {
  isolated(`
    const assert=require('node:assert/strict'), size=require('image-size').imageSize;
    const icns=Buffer.alloc(16);icns.write('icns');icns.writeUInt32BE(16,4);icns.write('ic07',8);
    assert.throws(()=>size(icns));
    const jxl=Buffer.from('0000000c4a584c200d0a870a000000006a786c7000000000','hex');
    assert.throws(()=>size(jxl));
    const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489','hex');
    assert.deepEqual(require('metro/private/Assets').getAssetSize('png',png,'valid.png'),{width:1,height:1});
    assert.throws(()=>require('metro/private/Assets').getAssetSize('png',icns,'renamed.png'));
  `);
});

test('Metro reads filesystem images as bytes for image-size v2', () => {
  isolated(`
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
    const dir = mkdtempSync(path.join(require('node:os').tmpdir(), 'ct-metro-image-'));
    const asset = path.join(dir, 'pixel.png');
    writeFileSync(asset, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex'));
    (async () => {
      try {
        const data = await require('metro/private/Assets').getAssetData(asset, 'pixel.png', [], 'web', '/assets');
        assert.equal(data.width, 1);
        assert.equal(data.height, 1);
        assert.equal(data.type, 'png');
      } finally { rmSync(dir, { recursive: true, force: true }); }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `);
});

test('NYC YAML loading and Firestore Node client retain their public APIs', async () => {
  const folder = mkdtempSync(path.join(process.env.SECURITY_TEST_TMP || tmpdir(), 'mobile-security-yaml-'));
  try {
    writeFileSync(path.join(folder, 'package.json'), '{}');
    writeFileSync(path.join(folder, '.nycrc.yml'), 'all: true\ninclude:\n  - src/**/*.ts\n');
    const config = await require('@istanbuljs/load-nyc-config').loadNycConfig({ cwd: folder });
    assert.equal(config.all, true);
    assert.deepEqual(config.include, ['src/**/*.ts']);
  } finally {
    assert.equal(path.dirname(folder), path.resolve(process.env.SECURITY_TEST_TMP || tmpdir()));
    rmSync(folder, { recursive: true, force: true });
  }
  const app = require('firebase/app').initializeApp({ projectId: 'security-compatibility-test' }, 'security-compatibility-test');
  const firestore = require('firebase/firestore');
  assert.ok(firestore.getFirestore(app));
  await firestore.terminate(firestore.getFirestore(app));
  await require('firebase/app').deleteApp(app);
});

test('security gate rejects new advisories and unpatched duplicate dependency copies', () => {
  const report = { auditReportVersion: 2, metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {
    braces: { nodes: ['node_modules/braces'], via: [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }] },
  } };
  verifyAudit(report);
  report.vulnerabilities.braces.nodes.push('node_modules/other/node_modules/braces');
  assert.throws(() => verifyAudit(report), /unpatched duplicate/);
  report.vulnerabilities.braces.nodes.pop();
  report.vulnerabilities.braces.via[0].url = 'https://github.com/advisories/NEW';
  assert.throws(() => verifyAudit(report), /Unresolved advisory/);
});

test('security gate reports every new advisory and only accepts the fingerprinted deepmerge location', () => {
  const report = { auditReportVersion: 2, metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {
    deepmerge: { nodes: ['node_modules/deepmerge'], via: [{ url: 'https://github.com/advisories/GHSA-gcqx-w48m-w2h4' }] },
  } };
  verifyAudit(report);
  report.vulnerabilities.deepmerge.nodes.push('node_modules/other/node_modules/deepmerge');
  assert.throws(() => verifyAudit(report), /unpatched duplicate/);
  report.vulnerabilities.deepmerge.nodes.pop();
  report.vulnerabilities.deepmerge.via.push({ url: 'https://github.com/advisories/NEW-DEEPMERGE' });
  report.vulnerabilities.qs = {
    nodes: ['node_modules/qs'], via: [{ url: 'https://github.com/advisories/GHSA-6pq8-jhm2-2vcw' }],
  };
  assert.throws(() => verifyAudit(report), error => {
    assert.match(error.message, /NEW-DEEPMERGE/);
    assert.match(error.message, /GHSA-6pq8-jhm2-2vcw/);
    return true;
  });
});

test('patched fast-uri rejects percent-encoded dangerous URI schemes', () => {
  const uri = require('fast-uri');
  for (const value of ['%6Aavascript:alert(1)', '%u006Aavascript:alert(1)']) {
    let normalized;
    try { normalized = uri.normalize(value); }
    catch { continue; } // Rejecting malformed URI schemes is also safe.
    assert.notEqual(normalized, 'javascript:alert(1)');
  }
});

for (const entry of ['deepmerge', 'deepmerge/dist/umd.js']) {
  test(`${entry} cannot change a returned object's prototype through source or target keys`, async t => {
    const merge = require(entry);
    const payload = () => JSON.parse('{"__proto__":{"mobilePrototypeInjected":true},"safe":"kept"}');
    const cases = [
      ['null-prototype target', () => merge(Object.create(null), payload())],
      ['own prototype key on target', () => merge(payload(), { extra: true })],
      ['own prototype keys on both sides', () => merge(payload(), payload())],
      ['cloned array element', () => merge({ rows: [] }, { rows: [payload()] }).rows[0]],
      ...[null, undefined, false, 0, 'placeholder'].map(value => [
        `nested ${String(value)} placeholder`,
        () => merge({ session: value }, { session: payload() }).session,
      ]),
    ];
    for (const [name, run] of cases) {
      await t.test(name, () => {
        const result = run();
        assert.equal(Object.getPrototypeOf(result), Object.prototype);
        assert.equal(result.mobilePrototypeInjected, undefined);
        assert.equal(Object.hasOwn(result, '__proto__'), false);
        assert.equal(result.safe, 'kept');
        assert.equal({}.mobilePrototypeInjected, undefined);
      });
    }

    await t.test('ordinary nested data, symbols, arrays and custom merges remain compatible', () => {
      const symbol = Symbol('config');
      const target = { nested: { one: 1 }, rows: [1], [symbol]: { left: true } };
      const source = { nested: { two: 2 }, rows: [2], [symbol]: { right: true } };
      assert.deepEqual(merge(target, source), {
        nested: { one: 1, two: 2 }, rows: [1, 2], [symbol]: { left: true, right: true },
      });
      assert.deepEqual(target.rows, [1]);
      assert.deepEqual(source.rows, [2]);
      assert.deepEqual(merge({ rows: [1] }, { rows: [2] }, {
        arrayMerge: (_target, values) => values,
      }).rows, [2]);
      assert.deepEqual(merge({ nested: { one: 1 } }, { nested: { two: 2 } }, {
        customMerge: key => key === 'nested' ? (left, right) => [left, right] : undefined,
      }).nested, [{ one: 1 }, { two: 2 }]);
      assert.deepEqual(merge.all([{ one: 1 }, { two: 2 }]), { one: 1, two: 2 });
      assert.deepEqual(merge(JSON.parse('{"constructor":{"name":"data"},"prototype":{"label":"data"}}'), {}),
        JSON.parse('{"constructor":{"name":"data"},"prototype":{"label":"data"}}'));
    });
  });
}

test('Expo config modifications preserve valid plugin merging without inherited injected flags', async () => {
  const { readFileSync } = require('node:fs');
  const folder = mkdtempSync(path.join(tmpdir(), 'ct-expo-config-security-'));
  const configPath = path.join(folder, 'app.json');
  const initial = JSON.stringify({ expo: {
    name: 'Security fixture', slug: 'security-fixture', extra: { session: null },
    plugins: [['fixture-plugin', { settings: { one: 1 }, rows: [1] }]],
  } });
  try {
    writeFileSync(path.join(folder, 'package.json'), '{"name":"security-fixture","version":"1.0.0"}');
    writeFileSync(configPath, initial);
    const result = await require('@expo/config').modifyConfigAsync(folder, {
      extra: { session: JSON.parse('{"__proto__":{"mobilePrototypeInjected":true},"safe":"kept"}') },
      plugins: [['fixture-plugin', { settings: { two: 2 }, rows: [2] }]],
    }, { skipSDKVersionRequirement: true, skipPlugins: true }, { dryRun: true });
    assert.equal(result.type, 'success');
    assert.equal(result.config.name, 'Security fixture');
    assert.equal(Object.getPrototypeOf(result.config.extra.session), Object.prototype);
    assert.equal(result.config.extra.session.mobilePrototypeInjected, undefined);
    assert.equal(result.config.extra.session.safe, 'kept');
    assert.deepEqual(result.config.plugins, [['fixture-plugin', { settings: { one: 1, two: 2 }, rows: [1, 2] }]]);
    assert.equal(readFileSync(configPath, 'utf8'), initial);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('qs comma serialization handles hostile toString data and retains Places query encoding', () => {
  const qs = require('qs');
  for (const value of [
    qs.parse('a[0][toString]=x', { allowPrototypes: true }),
    qs.parse('a[][b]=c', { plainObjects: true }),
    JSON.parse('{"a":[{"toString":"x"}]}'),
  ]) {
    for (const encodeValuesOnly of [false, true]) {
      assert.doesNotThrow(() => qs.stringify(value, { arrayFormat: 'comma', encodeValuesOnly }));
    }
  }
  assert.equal(qs.stringify({ a: ['one', 'two'] }, { arrayFormat: 'comma' }), 'a=one%2Ctwo');
  const query = { input: 'Gold Coast & Tweed', key: 'fixture-key', components: 'country:au', language: 'en' };
  const encoded = qs.stringify(query);
  assert.equal(encoded, 'input=Gold%20Coast%20%26%20Tweed&key=fixture-key&components=country%3Aau&language=en');
  assert.deepEqual(qs.parse(encoded), query);
});
