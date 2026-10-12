#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const coreDir = path.join(root, 'shared-core');
const core = JSON.parse(fs.readFileSync(path.join(coreDir, 'package.json'), 'utf8'));

const clients = [
  { dir: 'frontend_web', dependency: 'file:../shared-core', resolved: '../shared-core', preinstall: 'node ../scripts/prepare-shared-core.mjs' },
  { dir: 'frontend_web/landing_next', dependency: 'file:../../shared-core', resolved: '../../shared-core', preinstall: 'node ../../scripts/prepare-shared-core.mjs' },
  { dir: 'frontend_mobile', dependency: 'file:../shared-core', resolved: '../shared-core', preinstall: 'node ../scripts/prepare-shared-core.mjs' },
];

const failures = [];
const tarballs = fs.readdirSync(coreDir).filter((name) => /^chemisttasker-shared-core-.*\.tgz$/.test(name));
if (tarballs.length) {
  failures.push(`checked-in shared-core tarball(s) remain: ${tarballs.join(', ')}`);
}

for (const client of clients) {
  const packagePath = path.join(root, client.dir, 'package.json');
  const lockPath = path.join(root, client.dir, 'package-lock.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

  if (pkg.dependencies?.['@chemisttasker/shared-core'] !== client.dependency) {
    failures.push(`${client.dir}/package.json must link shared-core via ${client.dependency}`);
  }
  if (pkg.scripts?.preinstall !== client.preinstall) {
    failures.push(`${client.dir}/package.json must prepare repository shared-core before install`);
  }

  const rootPackage = lock.packages?.[''];
  if (rootPackage?.dependencies?.['@chemisttasker/shared-core'] !== client.dependency) {
    failures.push(`${client.dir}/package-lock.json root dependency does not match package.json`);
  }
  if (rootPackage?.hasInstallScript !== true) {
    failures.push(`${client.dir}/package-lock.json must record the preinstall lifecycle`);
  }

  const link = lock.packages?.['node_modules/@chemisttasker/shared-core'];
  const copied = fs.existsSync(path.join(root, client.dir, '.npmrc')) && /^install-links=true$/m.test(fs.readFileSync(path.join(root, client.dir, '.npmrc'), 'utf8'));
  if (!link || link.resolved !== (copied ? client.dependency : client.resolved) || 'integrity' in link || (copied ? link.link === true : link.link !== true)) {
    failures.push(`${client.dir}/package-lock.json must contain a local shared-core link without tarball integrity`);
  }

  const sourceEntry = copied ? link : lock.packages?.[client.resolved];
  if (!sourceEntry || sourceEntry.version !== core.version) {
    failures.push(`${client.dir}/package-lock.json must pin the linked shared-core source version ${core.version}`);
  }
}

if (failures.length) {
  console.error('Shared-core package convergence audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Shared-core package convergence audit passed.');

// Domain/transport convergence is part of the same required architecture check.
await import('./audit-shared-core-transport.mjs');
