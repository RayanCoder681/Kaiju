#!/usr/bin/env node
/**
 * Lancement Kaiju en une commande (mode démo/production local).
 *  1. Vérifie la version de Node.
 *  2. Compile shared → server → client si nécessaire.
 *  3. Démarre le serveur compilé (qui applique les migrations et sert le client).
 *
 * Développement (rechargement à chaud) : préférez deux terminaux —
 *   npm run dev:server   puis   npm run dev:client
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) {
    console.error(`\nÉchec de la commande : ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

// 1. Version de Node.
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`Node 20+ requis. Version détectée : ${process.versions.node}`);
  process.exit(1);
}

// 2. Builds nécessaires.
const sharedDist = join(root, 'packages/shared/dist/index.js');
const serverDist = join(root, 'server/dist/index.js');
const clientDist = join(root, 'client/dist/index.html');

if (!existsSync(sharedDist)) run('npm', ['run', 'build:shared']);
if (!existsSync(serverDist)) run('npm', ['run', 'build:server']);
if (!existsSync(clientDist)) run('npm', ['run', 'build:client']);

// 3. Démarrage serveur.
console.log('\nDémarrage du serveur Kaiju…');
const child = spawn('node', ['server/dist/index.js'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
