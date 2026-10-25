const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = require('./dependency-security-integrity.json');
const mobileRequire = createRequire(path.join(root, 'package.json'));

function verifyInstalled() {
  for (const [relative, expected] of Object.entries(manifest.files)) {
    // Source files may use CRLF after a Windows checkout; compare identical code.
    const source = readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
    const actual = createHash('sha256').update(source).digest('hex');
    assert.equal(actual, expected, `Missing or modified security patch: ${relative}`);
  }
  assert.equal(mobileRequire('@grpc/grpc-js/package.json').version, '1.13.6');
  const metroRequire = createRequire(mobileRequire.resolve('metro/package.json'));
  assert.equal(typeof metroRequire('image-size').imageSize, 'function');
  const yamlRequire = createRequire(mobileRequire.resolve('@istanbuljs/load-nyc-config/package.json'));
  assert.equal(yamlRequire('js-yaml/package.json').version, '4.3.2');
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages['node_modules/image-size'].version, '2.0.4');
  // New GHSA-q3jh-wrc6-jgq8 security release: reject stale redirect clients.
  assert.equal(mobileRequire('follow-redirects/package.json').version, '1.16.1');
  assert.equal(lock.packages['node_modules/follow-redirects'].version, '1.16.1');
  assert.equal(lock.packages['node_modules/fast-uri'].version, '3.1.9');
  assert.equal(mobileRequire('fast-uri/package.json').version, '3.1.9');
  assert.equal(Object.keys(lock.packages).some(name => name.endsWith('node_modules/sprintf-js')), false);
  return lock;
}

function verifyAudit(report) {
  assert.equal(report.auditReportVersion, 2, 'Unexpected npm audit report format');
  assert.ok(report.vulnerabilities && report.metadata, 'Incomplete npm audit report');
  const patched = {
    'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm': 'braces',
    'https://github.com/advisories/GHSA-86w9-cpqp-85rv': 'node-forge',
  };
  const seenAdvisories = new Set();
  function leaves(name, active = new Set()) {
    if (active.has(name)) return new Set();
    const finding = report.vulnerabilities[name];
    assert.ok(finding && Array.isArray(finding.via) && finding.via.length, `Missing advisory details: ${name}`);
    const next = new Set(active).add(name);
    return new Set(finding.via.flatMap(via => typeof via === 'string' ? [...leaves(via, next)] : [via.url]));
  }
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    assert.ok(leaves(name).size, `Advisory chain has no validated leaf: ${name}`);
    for (const node of finding.nodes) {
      assert.ok(!node.includes('..') && !path.isAbsolute(node), 'Unexpected dependency path');
    }
    for (const via of finding.via) {
      if (typeof via === 'string') {
        assert.ok(report.vulnerabilities[via], `Missing advisory dependency: ${via}`);
        continue;
      }
      assert.equal(patched[via.url], name, `Unresolved advisory: ${via.url}`);
      assert.equal(finding.nodes.length, 1, `An unpatched duplicate of ${name} is installed`);
      assert.equal(finding.nodes[0], `node_modules/${name}`);
      seenAdvisories.add(via.url);
    }
  }
  console.log(`Raw npm audit: ${report.metadata.vulnerabilities.total} reported dependency entries; ${seenAdvisories.size} advisories remain in upstream version metadata.`);
  console.log('Every remaining advisory is covered by verified installed patch fingerprints. No other advisory is accepted.');
}

if (require.main === module) {
  verifyInstalled();
  if (!process.argv.includes('--installed-only')) {
    const npmCli = process.env.npm_execpath;
    assert.ok(npmCli, 'Run this gate with npm run security:dependencies');
    const result = spawnSync(process.execPath, [npmCli, 'audit', '--omit=dev', '--json'], {
      cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 10_000_000,
    });
    if (result.error) throw result.error;
    assert.ok([0, 1].includes(result.status), `npm audit failed: ${result.stderr}`);
    verifyAudit(JSON.parse(result.stdout));
  }
  console.log('Mobile installed dependency security verification passed.');
}

module.exports = { verifyAudit, verifyInstalled };
