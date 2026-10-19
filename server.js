// Kaiju — serveur HTTP natif (page unique + modules statiques) et WebSocket (ws) sur /ws.
// Lancement : npm start  (PORT=3000 par défaut, écoute sur 0.0.0.0 pour les téléphones du réseau local)
// Les tests importent createServer() et démarrent sur le port 0.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import qrcode from 'qrcode-generator';

import { Rooms } from './src/rooms.js';
import { systemClock } from './src/game.js';
import { parseQuiz } from './src/quiz-parser.js';
import { isValidRoomCode } from './src/room-code.js';
import { parseMessage, makeError, createRateLimiter, MAX_PAYLOAD_BYTES } from './src/protocol.js';
import { getLanAddresses, pickBestAddress, joinUrl } from './src/lan-addresses.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Liste blanche des fichiers servis : aucune résolution de chemin à partir de l'URL.
const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/index.html': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['public/style.css', 'text/css; charset=utf-8'],
  '/lib/quiz-parser.js': ['src/quiz-parser.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['public/favicon.svg', 'image/svg+xml'],
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

// Codes de fermeture applicatifs (le client ne se reconnecte pas automatiquement sur 4001 et 4002).
export const CLOSE_REPLACED = 4001;
export const CLOSE_KICKED = 4002;
export const CLOSE_RATE_LIMITED = 4003;

const LOCAL_HOSTNAMES = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i;
const SAFE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:]+\](:\d{1,5})?$/i;

export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

/**
 * Adresse que les téléphones doivent ouvrir.
 * - PUBLIC_URL si défini (mise en ligne) ;
 * - sinon l'hôte par lequel l'animateur est venu, s'il n'est pas « localhost » ;
 * - sinon la meilleure adresse IPv4 locale (Wi-Fi, hotspot).
 */
export function baseUrlFor(req, port, publicUrl = process.env.PUBLIC_URL) {
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  const hostHeader = String(req?.headers?.host ?? '');
  const hostname = hostHeader.replace(/:\d+$/, '');
  if (hostHeader && SAFE_HOST.test(hostHeader) && !LOCAL_HOSTNAMES.test(hostname)) {
    const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    return `${proto}://${hostHeader}`;
  }
  const best = pickBestAddress(getLanAddresses());
  return best ? joinUrl(best.address, port).replace(/\/$/, '') : `http://localhost:${port}`;
}

const withCode = (base, code) => `${base}/?code=${code}`;

function sendJson(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

/**
 * @param {{port?: number, host?: string, clock?: object, heartbeatMs?: number, sweepMs?: number,
 *          allowedOrigins?: string[] | null, log?: (…args) => void}} [opts]
 * @returns {Promise<{httpServer: http.Server, wss: WebSocketServer, rooms: Rooms, port: number, close: () => Promise<void>}>}
 */
export async function createServer({
  port = 0,
  host = '0.0.0.0',
  clock = systemClock,
  heartbeatMs = 25_000,
  sweepMs = 60_000,
  allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : null,
  log = () => {},
} = {}) {
  /** @type {Map<string, {host: import('ws').WebSocket | null, players: Map<string, import('ws').WebSocket>}>} */
  const conns = new Map();
  let listeningPort = port;
  let shuttingDown = false;

  const rooms = new Rooms({
    clock,
    onRemove: (code) => {
      const c = conns.get(code);
      conns.delete(code);
      // À l'arrêt du serveur, on ne dit pas « partie terminée » : à la reconnexion, le client recevra
      // ROOM_NOT_FOUND et affichera que le serveur a redémarré.
      if (!c || shuttingDown) return;
      for (const ws of [c.host, ...c.players.values()]) {
        if (!ws) continue;
        ws.ctx = {};
        sendJson(ws, makeError('ROOM_ENDED'));
      }
    },
  });

  const makeSend = (code) => {
    const c = { host: null, players: new Map() };
    conns.set(code, c);
    return (target, msg) => sendJson(target === 'host' ? c.host : c.players.get(target), msg);
  };

  // ---------- HTTP ----------
  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://kaiju.local');
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS }).end();
        return;
      }
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }).end('ok');
        return;
      }
      if (url.pathname === '/qr.svg') {
        const code = url.searchParams.get('code') ?? '';
        if (!isValidRoomCode(code)) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }).end('Code invalide');
          return;
        }
        const svg = qrSvg(withCode(baseUrlFor(req, listeningPort), code));
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
        res.end(req.method === 'HEAD' ? undefined : svg);
        return;
      }
      const entry = Object.hasOwn(STATIC, url.pathname) ? STATIC[url.pathname] : null;
      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }).end('Introuvable');
        return;
      }
      const body = await readFile(path.join(ROOT, entry[0]));
      res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (err) {
      log('Erreur HTTP :', err);
      if (!res.headersSent) res.writeHead(500, SECURITY_HEADERS);
      res.end();
    }
  });

  // ---------- WebSocket ----------
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://kaiju.local');
    const origin = req.headers.origin;
    if (pathname !== '/ws' || (allowedOrigins && (!origin || !allowedOrigins.includes(origin)))) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  /** Détache une socket de la partie à laquelle elle était liée. */
  function detach(ws) {
    const { code, role, playerId } = ws.ctx ?? {};
    ws.ctx = {};
    const c = code ? conns.get(code) : null;
    const game = code ? rooms.get(code) : null;
    if (!c || !game) return;
    if (role === 'host' && c.host === ws) {
      c.host = null;
      game.setHostConnected(false);
    }
    if (role === 'player' && c.players.get(playerId) === ws) {
      c.players.delete(playerId);
      game.disconnect(playerId);
    }
  }

  function bindHost(ws, game) {
    const c = conns.get(game.code);
    if (c.host && c.host !== ws) {
      const old = c.host;
      old.ctx = {};
      old.close(CLOSE_REPLACED, 'Remplacée par une nouvelle connexion');
    }
    c.host = ws;
    ws.ctx = { code: game.code, role: 'host' };
    game.setHostConnected(true);
  }

  function bindPlayer(ws, game, playerId) {
    const c = conns.get(game.code);
    const old = c.players.get(playerId);
    if (old && old !== ws) {
      old.ctx = {};
      old.close(CLOSE_REPLACED, 'Remplacée par une nouvelle connexion');
    }
    c.players.set(playerId, ws);
    ws.ctx = { code: game.code, role: 'player', playerId };
  }

  function hostGame(ws) {
    if (ws.ctx?.role !== 'host') return { error: makeError('NOT_HOST') };
    const game = rooms.get(ws.ctx.code);
    if (!game) return { error: makeError('ROOM_NOT_FOUND') };
    return { game };
  }

  const handlers = {
    'host:create'(ws, msg, req) {
      const { questions, errors } = parseQuiz(msg.quizText, {
        defaultTimeSec: msg.settings?.defaultTimeSec ?? undefined,
      });
      if (errors.length) {
        sendJson(ws, makeError('QUIZ_INVALID', undefined, errors));
        return;
      }
      detach(ws);
      const game = rooms.create(questions, makeSend);
      bindHost(ws, game);
      log(`Session ${game.code} créée (${questions.length} questions)`);
      sendJson(ws, {
        type: 'host:created',
        code: game.code,
        hostToken: game.hostToken,
        questionCount: questions.length,
        joinUrl: withCode(baseUrlFor(req, listeningPort), game.code),
      });
      sendJson(ws, game.stateFor('host'));
    },

    'host:resume'(ws, msg, req) {
      const game = isValidRoomCode(msg.code) ? rooms.get(msg.code) : null;
      if (!game) return sendJson(ws, makeError('ROOM_NOT_FOUND'));
      if (!game.checkHostToken(msg.hostToken)) return sendJson(ws, makeError('NOT_HOST'));
      if (!(ws.ctx?.role === 'host' && ws.ctx.code === game.code)) detach(ws);
      bindHost(ws, game);
      sendJson(ws, { ...game.stateFor('host'), joinUrl: withCode(baseUrlFor(req, listeningPort), game.code) });
    },

    'host:start'(ws) {
      const { game, error } = hostGame(ws);
      if (error) return sendJson(ws, error);
      const r = game.start();
      if (!r.ok) sendJson(ws, makeError(r.code, r.message));
    },
    'host:close'(ws) {
      const { game, error } = hostGame(ws);
      if (error) return sendJson(ws, error);
      const r = game.close();
      if (!r.ok) sendJson(ws, makeError(r.code, r.message));
    },
    'host:next'(ws) {
      const { game, error } = hostGame(ws);
      if (error) return sendJson(ws, error);
      const r = game.next();
      if (!r.ok) sendJson(ws, makeError(r.code, r.message));
    },
    'host:end'(ws) {
      const { game, error } = hostGame(ws);
      if (error) return sendJson(ws, error);
      const r = game.end();
      if (!r.ok) sendJson(ws, makeError(r.code, r.message));
    },
    'host:kick'(ws, msg) {
      const { game, error } = hostGame(ws);
      if (error) return sendJson(ws, error);
      const r = game.kick(msg.playerId);
      if (!r.ok) return sendJson(ws, makeError(r.code, r.message));
      const c = conns.get(game.code);
      const target = c.players.get(msg.playerId);
      c.players.delete(msg.playerId);
      if (target) {
        target.ctx = {};
        target.close(CLOSE_KICKED, 'Exclu par l’animateur');
      }
    },

    'player:join'(ws, msg) {
      const game = isValidRoomCode(msg.code) ? rooms.get(msg.code) : null;
      if (!game) return sendJson(ws, makeError('ROOM_NOT_FOUND'));
      const r = game.join(msg.nickname, msg.playerToken);
      if (!r.ok) return sendJson(ws, makeError(r.code, r.message));
      // La socket était liée à autre chose (autre partie, autre joueur, hôte) : on libère l'ancien lien.
      if (ws.ctx?.code && !(ws.ctx.code === game.code && ws.ctx.playerId === r.player.id)) detach(ws);
      bindPlayer(ws, game, r.player.id);
      sendJson(ws, {
        type: 'joined',
        playerId: r.player.id,
        playerToken: r.player.token,
        nickname: r.player.nickname,
        resumed: r.resumed,
        code: game.code,
      });
      sendJson(ws, game.stateFor(r.player.id));
    },

    'player:answer'(ws, msg) {
      if (ws.ctx?.role !== 'player') return sendJson(ws, makeError('BAD_REQUEST', 'Rejoins d’abord une partie.'));
      const game = rooms.get(ws.ctx.code);
      if (!game) return sendJson(ws, makeError('ROOM_NOT_FOUND'));
      const r = game.answer(ws.ctx.playerId, msg.questionIndex, msg.choiceIndex);
      if (!r.ok) sendJson(ws, makeError(r.code, r.message));
    },

    ping(ws) {
      sendJson(ws, { type: 'pong' });
    },
  };

  wss.on('connection', (ws, req) => {
    ws.ctx = {};
    ws.isAlive = true;
    const allow = createRateLimiter();
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('error', (err) => log('Erreur socket :', err.message));
    ws.on('close', () => detach(ws));
    ws.on('message', (raw, isBinary) => {
      ws.isAlive = true;
      if (!allow()) {
        sendJson(ws, makeError('RATE_LIMITED'));
        ws.close(CLOSE_RATE_LIMITED, 'Trop de messages');
        return;
      }
      if (isBinary) return sendJson(ws, makeError('BAD_REQUEST', 'Messages binaires refusés.'));
      const parsed = parseMessage(raw);
      if (!parsed.ok) return sendJson(ws, parsed.error);
      try {
        handlers[parsed.msg.type](ws, parsed.msg, req);
      } catch (err) {
        log('Erreur de traitement :', err);
        sendJson(ws, makeError('BAD_REQUEST', 'Erreur interne du serveur.'));
      }
    });
  });

  // Heartbeat : un téléphone en veille ne prévient pas ; sans pong au tour suivant, la socket est coupée
  // et le joueur passe déconnecté, pour que « tout le monde a répondu » reste juste.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  const sweeper = setInterval(() => {
    const removed = rooms.sweep();
    if (removed.length) log(`Sessions supprimées : ${removed.join(', ')}`);
  }, sweepMs);
  sweeper.unref();

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  listeningPort = httpServer.address().port;

  async function close() {
    shuttingDown = true;
    clearInterval(heartbeat);
    clearInterval(sweeper);
    rooms.destroyAll();
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => wss.close(() => resolve()));
    await new Promise((resolve) => httpServer.close(() => resolve()));
  }

  return { httpServer, wss, rooms, port: listeningPort, close };
}

// ---------- Démarrage direct : node server.js ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const PORT = Number(process.env.PORT) || 3000;
  const app = await createServer({ port: PORT, log: (...a) => console.log(...a) });
  const all = getLanAddresses();
  const best = pickBestAddress(all);
  console.log(`Kaiju écoute sur le port ${app.port} (toutes les interfaces).`);
  console.log('Les parties vivent en mémoire : ne fermez pas ce terminal pendant la séance.\n');
  if (best) {
    const url = joinUrl(best.address, app.port);
    console.log(`Participants : ${url}`);
    console.log(`Animateur    : ${url}?host   (ou http://localhost:${app.port}/?host sur cet ordinateur)`);
    console.log(`Réseau       : ${best.name}, ${best.note}`);
    const others = all.filter((a) => a.score > 0 && a !== best);
    if (others.length) console.log(`Autres adresses possibles : ${others.map((a) => joinUrl(a.address, app.port)).join('  ')}`);
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    console.log(`\n${qr.createASCII(1, 1)}`);
  } else {
    console.log(`Aucune adresse locale détectée : connectez l'ordinateur au Wi-Fi ou au hotspot.`);
    console.log(`En local seulement : http://localhost:${app.port}`);
  }
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
