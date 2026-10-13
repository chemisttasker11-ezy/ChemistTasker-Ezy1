import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const [artifact, app] = process.argv.slice(2);
if (!artifact || !app) throw new Error('Pass the packed shared-core artifact and application directory');
const root = path.resolve(import.meta.dirname, '..');
const appRoot = path.resolve(app);
if (!appRoot.startsWith(root + path.sep)) throw new Error('Application must be inside this checkout');
const scratchRoot = path.join(root, '.ci-artifacts');
mkdirSync(scratchRoot, { recursive: true });
const extracted = mkdtempSync(path.join(scratchRoot, 'shared-core-'));
const result = spawnSync('tar', ['-xzf', path.resolve(artifact), '-C', extracted], { stdio: 'inherit', windowsHide: true });
if (result.status !== 0) process.exit(result.status ?? 1);
const source = path.join(extracted, 'package');
const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
if (manifest.name !== '@chemisttasker/shared-core' || manifest.version !== '1.1.1') throw new Error('Unexpected shared-core artifact');
const target = path.join(appRoot, 'node_modules', '@chemisttasker', 'shared-core');
// Replace only a package symlink, never follow it to mutate the canonical source checkout.
if (existsSync(target) && lstatSync(target).isSymbolicLink()) unlinkSync(target);
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`Installed ${manifest.name}@${manifest.version}; other locked dependencies unchanged.`);
