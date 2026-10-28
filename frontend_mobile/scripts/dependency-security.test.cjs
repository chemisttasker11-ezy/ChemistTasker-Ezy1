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

test('patched fast-uri rejects percent-encoded dangerous URI schemes', () => {
  const uri = require('fast-uri');
  for (const value of ['%6Aavascript:alert(1)', '%u006Aavascript:alert(1)']) {
    let normalized;
    try { normalized = uri.normalize(value); }
    catch { continue; } // Rejecting malformed URI schemes is also safe.
    assert.notEqual(normalized, 'javascript:alert(1)');
  }
});
