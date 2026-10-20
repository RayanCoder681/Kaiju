import { networkInterfaces } from 'node:os';

/**
 * Détermine l'adresse IPv4 LAN de la machine organisateur.
 * Essentiel : le QR et l'URL de connexion ne doivent JAMAIS contenir
 * « localhost » ni 127.0.0.1 pour les smartphones.
 *
 * Retourne la meilleure IP privée (192.168.*, 10.*, 172.16-31.*),
 * sinon null si seules des adresses de loopback existent.
 */
export function detectLanIPv4(): string | null {
  const ifaces = networkInterfaces();
  const candidates: string[] = [];

  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4') continue;
      if (a.internal) continue;
      candidates.push(a.address);
    }
  }

  // Préférence aux plages privées usuelles, 192.168.* en premier (Wi-Fi domestique/campus).
  const score = (ip: string): number => {
    if (ip.startsWith('192.168.')) return 3;
    if (ip.startsWith('10.')) return 2;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    return 1;
  };

  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0] ?? null;
}

/** Construit l'URL de connexion participant accessible sur le LAN. */
export function buildJoinUrl(host: string, port: number, path = '/'): string {
  return `http://${host}:${port}${path}`;
}
