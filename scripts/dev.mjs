import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const vite = resolve(require.resolve('vite/package.json'), '..', 'bin', 'vite.js');
const children = [
  spawn(process.execPath, ['--experimental-transform-types', 'local/server.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, [vite, '--host', '0.0.0.0'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 250);
}
children.forEach(child => { child.on('error', error => { console.error(error.message); stop(1); }); child.on('exit', code => stop(code || 0)); });
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
