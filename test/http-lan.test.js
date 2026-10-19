// Tests HTTP (fichiers servis, QR code, en-têtes) et réseau local (adresses, absence de ressources externes).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer, baseUrlFor } from '../server.js';
import { classify, getLanAddresses, pickBestAddress, joinUrl } from '../src/lan-addresses.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = await createServer({ port: 0, host: '127.0.0.1' });
const base = `http://127.0.0.1:${app.port}`;
after(() => app.close());

test('la page, le client, le style et le parseur partagé sont servis', async () => {
  for (const [p, type] of [
    ['/', 'text/html'],
    ['/?code=1234', 'text/html'],
    ['/app.js', 'text/javascript'],
    ['/style.css', 'text/css'],
    ['/lib/quiz-parser.js', 'text/javascript'],
  ]) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-type'), new RegExp(type), p);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('aucun autre fichier n’est servi (liste blanche, pas de traversée de chemin)', async () => {
  for (const p of ['/server.js', '/package.json', '/../server.js', '/%2e%2e/server.js', '/public/app.js', '/src/game.js']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 404, p);
  }
  const post = await fetch(base + '/', { method: 'POST' });
  assert.equal(post.status, 405);
});

test('QR code SVG pour un code valide, 400 sinon', async () => {
  const ok = await fetch(`${base}/qr.svg?code=4821`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/svg+xml');
  assert.match(await ok.text(), /^<svg/);
  for (const bad of ['', '12', '0123', 'abcd', '<script>']) {
    const res = await fetch(`${base}/qr.svg?code=${encodeURIComponent(bad)}`);
    assert.equal(res.status, 400, bad);
  }
});

test('URL donnée aux participants : PUBLIC_URL, sinon hôte utilisé, sinon IP locale', () => {
  assert.equal(baseUrlFor({ headers: { host: 'x' } }, 3000, 'https://kaiju.example.org/'), 'https://kaiju.example.org');
  assert.equal(baseUrlFor({ headers: { host: '192.168.137.1:3000' } }, 3000, ''), 'http://192.168.137.1:3000');
  assert.equal(
    baseUrlFor({ headers: { host: 'kaiju.onrender.com', 'x-forwarded-proto': 'https' } }, 3000, ''),
    'https://kaiju.onrender.com'
  );
  const local = baseUrlFor({ headers: { host: 'localhost:3000' } }, 3000, '');
  assert.match(local, /^http:\/\/[^/]+:3000$/);
  // L'animateur sur « localhost » : les téléphones doivent recevoir l'IP locale, pas localhost.
  if (pickBestAddress()) assert.doesNotMatch(local, /localhost/);
  assert.doesNotMatch(baseUrlFor({ headers: { host: 'evil"><svg' } }, 3000, ''), /evil/);
});

test('adresses locales : hotspot Windows prioritaire, cartes virtuelles et boucle écartées', () => {
  const fake = {
    lo: [{ family: 'IPv4', address: '127.0.0.1' }],
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.22.80.1' }],
    'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.20' }],
    'Connexion au réseau local* 10': [{ family: 'IPv4', address: '192.168.137.1' }],
    eth6: [{ family: 'IPv6', address: 'fe80::1' }],
  };
  const list = getLanAddresses(fake);
  assert.equal(pickBestAddress(list).address, '192.168.137.1');
  assert.equal(list.length, 4, 'IPv6 ignorée');
  assert.equal(classify('vEthernet (WSL)', '172.22.80.1').kind, 'virtual');
  assert.equal(classify('lo', '127.0.0.1').kind, 'loopback');
  assert.equal(joinUrl('192.168.1.20', 3000, '4821'), 'http://192.168.1.20:3000/?code=4821');
});

test('le serveur écoute par défaut sur toutes les interfaces (0.0.0.0)', async () => {
  const lan = await createServer({ port: 0 });
  try {
    assert.equal(lan.httpServer.address().address, '0.0.0.0');
  } finally {
    await lan.close();
  }
});

test('aucune ressource externe dans public/ (fonctionnement sans Internet)', async () => {
  const dir = path.join(ROOT, 'public');
  for (const f of await readdir(dir)) {
    const text = await readFile(path.join(dir, f), 'utf8');
    const urls = (text.match(/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)]*/gi) ?? []).filter(
      (u) => !u.startsWith('http://www.w3.org/') // espace de noms SVG, pas une ressource chargée
    );
    assert.deepEqual(urls, [], `${f} référence une ressource externe`);
  }
});

test('le client n’utilise ni innerHTML ni crypto.randomUUID (contexte non sécurisé en HTTP local)', async () => {
  const js = await readFile(path.join(ROOT, 'public', 'app.js'), 'utf8');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(js, /randomUUID/);
  assert.match(js, /location\.host/, 'URL WebSocket relative à la page');
});
