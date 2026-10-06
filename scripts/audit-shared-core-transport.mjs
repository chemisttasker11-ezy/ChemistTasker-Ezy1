#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve(import.meta.dirname, '../shared-core/src');
const failures = [];
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target=path.join(dir,entry.name);
    return entry.isDirectory() ? files(target) : target.endsWith('.ts') && !target.endsWith('.test.ts') ? [target] : [];
  });
}
for (const file of files(source)) {
  const relative=path.relative(source,file).split(path.sep).join('/');
  const code=fs.readFileSync(file,'utf8');
  if (/\/\/\s*@ts-nocheck\b/.test(code)) failures.push(`${relative}: file-wide type suppression`);
  if (relative !== 'transport/client.ts' && /\b(?:fetch|fetchImpl|axios)\s*\(/.test(code)) {
    failures.push(`${relative}: HTTP execution belongs in transport/client.ts`);
  }
  if (relative.startsWith('domains/') && /(?:from|import\s*\()\s*['"](?:\.\.\/)+api['"]/.test(code)) {
    failures.push(`${relative}: domain implementation imports the public facade`);
  }
}
const api=fs.readFileSync(path.join(source,'api.ts'),'utf8');
if (/\b(?:function|const|let|class)\s+\w+/.test(api)) failures.push('api.ts must remain explicit re-exports only');
const config=JSON.parse(fs.readFileSync(path.join(source,'../tsconfig.json'),'utf8'));
if (config.compilerOptions?.strict !== true) failures.push('strict TypeScript checking is required');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Shared-core transport ownership and strict-type audit passed.');
