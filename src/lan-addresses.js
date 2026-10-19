// Kaiju — détection des adresses IPv4 locales utilisables par les téléphones.
// Usage CLI : node lan-addresses.js [port]
// Usage module : import { getLanAddresses, pickBestAddress } from './lan-addresses.js'
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const VIRTUAL_NAME = /(vEthernet|VirtualBox|VMware|Hyper-V|WSL|docker|br-|veth|virbr|vmnet|utun|tailscale|zerotier|Loopback|Bluetooth|ham|npcap)/i;

/** Classe une adresse IPv4 et lui donne un score (plus haut = plus probable pour les téléphones). */
export function classify(name, address) {
  const [a, b, c] = address.split('.').map(Number);
  if (a === 127) return { kind: 'loopback', score: -100, note: 'boucle locale, inaccessible aux téléphones' };
  if (a === 169 && b === 254) return { kind: 'link-local', score: -50, note: 'pas d’adresse DHCP : réseau mal configuré' };
  if (address === '192.168.137.1') return { kind: 'windows-hotspot', score: 90, note: 'point d’accès mobile de Windows (8 appareils maximum)' };
  if (a === 192 && b === 168 && c === 56) return { kind: 'virtual', score: -20, note: 'réseau hôte VirtualBox' };
  if (a === 172 && b === 17) return { kind: 'virtual', score: -20, note: 'réseau Docker' };
  if (VIRTUAL_NAME.test(name)) return { kind: 'virtual', score: -10, note: 'carte virtuelle' };
  const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  if (a === 192 && b === 168 && c === 43) return { kind: 'android-hotspot', score: 80, note: 'connecté au partage de connexion d’un téléphone Android (plage courante)' };
  if (a === 100 && b >= 64 && b <= 127) return { kind: 'cgnat', score: 0, note: 'plage opérateur / VPN, rarement joignable en local' };
  if (isPrivate) {
    const wifi = /(wi-?fi|wlan|wl|en0|wireless|sans fil)/i.test(name);
    return { kind: 'lan', score: wifi ? 70 : 60, note: wifi ? 'réseau Wi-Fi local' : 'réseau local' };
  }
  return { kind: 'public', score: 10, note: 'adresse publique : vérifier le pare-feu avant d’exposer le serveur' };
}

/** @returns {Array<{name: string, address: string, kind: string, score: number, note: string}>} trié par score décroissant */
export function getLanAddresses(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const info of list ?? []) {
      const isV4 = info.family === 'IPv4' || info.family === 4; // Node 18.0–18.3 utilisait 4
      if (!isV4) continue;
      out.push({ name, address: info.address, ...classify(name, info.address) });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

export function pickBestAddress(addresses = getLanAddresses()) {
  return addresses.find((a) => a.score > 0) ?? null;
}

export function joinUrl(address, port, code) {
  return `http://${address}:${port}/${code ? `?code=${code}` : ''}`;
}

// ---- CLI ----
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] || process.env.PORT || 3000);
  const all = getLanAddresses();
  const best = pickBestAddress(all);
  console.log('Adresses détectées (la plus probable en premier) :');
  for (const a of all) {
    console.log(`  ${a.score > 0 ? '•' : ' '} ${joinUrl(a.address, port).padEnd(30)} ${a.name} — ${a.note}`);
  }
  if (best) {
    console.log(`\nÀ donner aux participants : ${joinUrl(best.address, port)}`);
  } else {
    console.log('\nAucune adresse locale exploitable : l’ordinateur est-il connecté au Wi-Fi ou au hotspot ?');
    process.exitCode = 1;
  }
}
