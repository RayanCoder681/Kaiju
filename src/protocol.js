// Kaiju — validation des messages entrants, codes d'erreur, pseudos, limite de débit.
// Module pur : ni ws ni http. Spécification : docs/protocol.md.

export const MAX_PAYLOAD_BYTES = 64 * 1024;
export const RATE_LIMIT_PER_SEC = 20;
export const NICK_MAX_LENGTH = 20;
// Caractères de contrôle C0, DEL et séparateurs de ligne Unicode.
const FORBIDDEN_NICK_CHARS = new RegExp('[\\u0000-\\u001F\\u007F\\u2028\\u2029]');

/** Messages d'erreur en français, courts, affichables tels quels. */
export const ERROR_MESSAGES = Object.freeze({
  BAD_REQUEST: 'Message invalide.',
  QUIZ_INVALID: 'Le quiz contient des erreurs.',
  ROOM_NOT_FOUND: 'Aucune partie avec ce code. Vérifie le code ou demande-le à l’animateur.',
  ROOM_ENDED: 'Cette partie est terminée.',
  ROOM_FULL: 'La partie est complète.',
  NICK_INVALID: 'Pseudo invalide : 1 à 20 caractères.',
  NICK_TAKEN: 'Ce pseudo est déjà pris dans cette partie.',
  NOT_HOST: 'Action réservée à l’animateur.',
  WRONG_PHASE: 'Action impossible à ce moment de la partie.',
  ALREADY_ANSWERED: 'Tu as déjà répondu à cette question.',
  TOO_LATE: 'Trop tard : le temps est écoulé.',
  STALE_QUESTION: 'Cette question n’est plus en cours.',
  INVALID_CHOICE: 'Choix de réponse invalide.',
  RATE_LIMITED: 'Trop de messages envoyés : connexion fermée.',
});

export function makeError(code, message, details) {
  const msg = { type: 'error', code, message: message || ERROR_MESSAGES[code] || 'Erreur.' };
  if (details !== undefined) msg.details = details;
  return msg;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isString = (v) => typeof v === 'string';
const isIndex = (v) => Number.isInteger(v) && v >= 0 && v < 1000;

// Schéma minimal par type : renvoie un message d'erreur (string) ou null si valide.
// Seuls les champs listés sont recopiés : tout champ supplémentaire envoyé par le client est ignoré.
const SCHEMAS = {
  'host:create': (m) => {
    if (!isString(m.quizText)) return 'quizText manquant.';
    if (m.settings !== undefined) {
      if (!isObject(m.settings)) return 'settings invalide.';
      const t = m.settings.defaultTimeSec;
      if (t !== undefined && !(Number.isInteger(t) && t >= 5 && t <= 240)) return 'Durée par défaut entre 5 et 240 s.';
    }
    return null;
  },
  'host:resume': (m) => (isString(m.code) && isString(m.hostToken) ? null : 'code et hostToken requis.'),
  'host:start': () => null,
  'host:close': () => null,
  'host:next': () => null,
  'host:end': () => null,
  'host:kick': (m) => (isString(m.playerId) && m.playerId.length <= 64 ? null : 'playerId requis.'),
  'player:join': (m) => {
    if (!isString(m.code)) return 'code requis.';
    if (!isString(m.nickname)) return 'nickname requis.';
    if (m.playerToken !== undefined && m.playerToken !== null && !isString(m.playerToken)) return 'playerToken invalide.';
    return null;
  },
  'player:answer': (m) => (isIndex(m.questionIndex) ? null : 'questionIndex invalide.'),
  ping: () => null,
};

const FIELDS = {
  'host:create': ['quizText', 'settings'],
  'host:resume': ['code', 'hostToken'],
  'host:kick': ['playerId'],
  'player:join': ['code', 'nickname', 'playerToken'],
  'player:answer': ['questionIndex', 'choiceIndex'],
};

/**
 * Analyse un message brut reçu sur la socket.
 * @param {string|Buffer} raw
 * @returns {{ok: true, msg: object} | {ok: false, error: object}}
 */
export function parseMessage(raw) {
  let data;
  try {
    data = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return { ok: false, error: makeError('BAD_REQUEST', 'JSON invalide.') };
  }
  if (!isObject(data) || !isString(data.type)) {
    return { ok: false, error: makeError('BAD_REQUEST', 'Champ « type » manquant.') };
  }
  const schema = Object.hasOwn(SCHEMAS, data.type) ? SCHEMAS[data.type] : null;
  if (!schema) return { ok: false, error: makeError('BAD_REQUEST', 'Type de message inconnu.') };
  const problem = schema(data);
  if (problem) return { ok: false, error: makeError('BAD_REQUEST', problem) };
  const msg = { type: data.type };
  for (const f of FIELDS[data.type] ?? []) if (data[f] !== undefined) msg[f] = data[f];
  return { ok: true, msg };
}

/**
 * Normalise un pseudo : trim, NFC, 1 à 20 caractères, pas de caractères de contrôle.
 * @returns {{ok: true, value: string, key: string} | {ok: false}}
 */
export function normalizeNickname(input) {
  if (typeof input !== 'string') return { ok: false };
  const trimmed = input.normalize('NFC').trim();
  if (FORBIDDEN_NICK_CHARS.test(trimmed)) return { ok: false }; // avant de fusionner les espaces : \n, \t refusés
  const value = trimmed.replace(/ {2,}/g, ' ');
  if (value.length < 1 || [...value].length > NICK_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, value, key: value.toLocaleLowerCase('fr') };
}

/**
 * Limiteur de débit à fenêtre fixe d'une seconde, par socket.
 * @param {{now: () => number}} clock
 * @returns {() => boolean} renvoie false quand la limite est dépassée
 */
export function createRateLimiter(clock = { now: Date.now }, maxPerSec = RATE_LIMIT_PER_SEC) {
  let windowStart = clock.now();
  let count = 0;
  return () => {
    const t = clock.now();
    if (t - windowStart >= 1000) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    return count <= maxPerSec;
  };
}
