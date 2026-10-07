import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'styles.css', 'script.js', 'backend.js', 'config.js', 'assets']) {
  await cp(resolve(root, name), resolve(output, name), { recursive: true });
}
console.log('Built kiosk frontend in dist/');
