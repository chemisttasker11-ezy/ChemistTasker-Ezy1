import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const executable = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  isWindows ? 'tauri.cmd' : 'tauri',
);

if (!existsSync(executable)) {
  console.error('Tauri CLI is missing. Run npm install in frontend_web first.');
  process.exit(1);
}

const extraPaths = [];
if (isWindows) {
  extraPaths.push(
    path.join(homedir(), '.cargo', 'bin'),
    'C:\\Strawberry\\perl\\bin',
    'C:\\Strawberry\\c\\bin',
  );
}

const args = process.argv.slice(2);
if (args[0] === 'build' && process.env.KIOSK_BUILD_PROFILE === 'acceptance') {
  args.push('--config', 'src-tauri/tauri.acceptance.conf.json');
}

const child = spawn(executable, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PATH: [...extraPaths, process.env.PATH || ''].join(path.delimiter),
    CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '1',
    CARGO_INCREMENTAL: process.env.CARGO_INCREMENTAL || '0',
  },
  stdio: 'inherit',
  shell: isWindows,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
