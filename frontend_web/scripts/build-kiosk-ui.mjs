import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const executable = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);

if (!existsSync(executable)) {
  console.error('Vite is missing. Run npm install in frontend_web first.');
  process.exit(1);
}

const child = spawn(executable, ['build'], {
  cwd: process.cwd(),
  env: { ...process.env, VITE_KIOSK_BUILD: '1' },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 1));
