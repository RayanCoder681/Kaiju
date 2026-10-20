#!/usr/bin/env node
/** Copie les migrations .sql de src vers dist (tsc ne copie pas les fichiers non-TS). */
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(serverRoot, 'src/db/migrations');
const destDir = join(serverRoot, 'dist/db/migrations');

mkdirSync(destDir, { recursive: true });
let n = 0;
for (const f of readdirSync(srcDir)) {
  if (f.endsWith('.sql')) {
    copyFileSync(join(srcDir, f), join(destDir, f));
    n++;
  }
}
console.log(`Migrations copiées : ${n}`);
