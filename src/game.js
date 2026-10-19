// Kaiju — une partie : machine à états, joueurs, réponses, points.
// Ne dépend ni de ws ni de http : les envois passent par send(target, message),
// où target vaut 'host' ou l'identifiant d'un joueur. L'horloge est injectable pour les tests.
import { randomBytes } from 'node:crypto';
import { computePoints, isOnTime, rankPlayers, ANSWER_GRACE_MS } from './scoring.js';
import { normalizeNickname } from './protocol.js';

export const PHASE = Object.freeze({
  LOBBY: 'LOBBY',
  QUESTION: 'QUESTION',
  REVEAL: 'REVEAL',
  PODIUM: 'PODIUM',
});

export const MAX_PLAYERS = 300;
export const REVEAL_TOP = 5;
export const PODIUM_TOP = 3;
/** Délai pendant lequel un joueur déconnecté sans avoir répondu reste attendu. */
export const DISCONNECT_GRACE_MS = 5000;

export const systemClock = Object.freeze({
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
});

const token = () => randomBytes(16).toString('hex');
const fail = (code, message) => ({ ok: false, code, message });

export class Game {
  /**
   * @param {{code: string, questions: Array<{text: string, choices: string[], correctIndex: number, timeSec: number}>,
   *          send?: (target: string, msg: object) => void,
   *          clock?: {now: () => number, setTimeout: Function, clearTimeout: Function}}} opts
   */
  constructor({ code, questions, send = () => {}, clock = systemClock }) {
    if (!Array.isArray(questions) || questions.length === 0) throw new Error('Une partie a besoin d’au moins une question.');
    this.code = code;
    this.questions = questions;
    this.send = send;
    this.clock = clock;
    this.hostToken = token();
    this.hostConnected = false;
    this.phase = PHASE.LOBBY;
    this.index = -1;
    /** @type {Map<string, any>} */
    this.players = new Map();
    this.bannedKeys = new Set();
    this.nextPlayerSeq = 1;
    this.current = null; // { startedAt, endsAt, durationMs, timer, closed, answers: Map<playerId, answer>, counts }
    this.createdAt = clock.now();
    this.lastActivityAt = this.createdAt;
    this.endedAt = null;
  }

  // ---------- Connexions ----------

  touch() {
    this.lastActivityAt = this.clock.now();
  }

  /** Nombre de sockets attachées (hôte + joueurs connectés). */
  connectedCount() {
    let n = this.hostConnected ? 1 : 0;
    for (const p of this.players.values()) if (p.connected) n += 1;
    return n;
  }

  setHostConnected(connected) {
    this.hostConnected = connected;
    this.touch();
  }

  checkHostToken(hostToken) {
    return typeof hostToken === 'string' && hostToken === this.hostToken;
  }

  /**
   * Un participant rejoint ou reprend sa place.
   * @returns {{ok: true, player: object, resumed: boolean} | {ok: false, code: string}}
   */
  join(nickname, playerToken) {
    this.touch();
    if (this.phase === PHASE.PODIUM) return fail('ROOM_ENDED');

    // 1. Reprise par jeton : prioritaire, quel que soit le pseudo saisi.
    if (typeof playerToken === 'string' && playerToken) {
      for (const p of this.players.values()) {
        if (p.token === playerToken) return this.#resume(p);
      }
    }

    const nick = normalizeNickname(nickname);
    if (!nick.ok) return fail('NICK_INVALID');
    if (this.bannedKeys.has(nick.key)) return fail('NICK_TAKEN');

    // 2. Reprise par pseudo seul : uniquement si le joueur d'origine est déconnecté.
    for (const p of this.players.values()) {
      if (p.key === nick.key) {
        if (p.connected) return fail('NICK_TAKEN');
        return this.#resume(p);
      }
    }

    // 3. Nouveau joueur (accepté en cours de partie, avec 0 point).
    if (this.players.size >= MAX_PLAYERS) return fail('ROOM_FULL');
    const player = {
      id: `p${this.nextPlayerSeq++}`,
      token: token(),
      nickname: nick.value,
      key: nick.key,
      score: 0,
      correctTimeMs: 0,
      joinedAt: this.clock.now(),
      connected: true,
      lastPoints: 0,
    };
    this.players.set(player.id, player);
    this.#broadcastLobby();
    if (this.phase === PHASE.QUESTION) this.#sendProgress();
    return { ok: true, player, resumed: false };
  }

  #resume(player) {
    player.connected = true;
    this.#clearGrace(player.id);
    this.#broadcastLobby();
    if (this.phase === PHASE.QUESTION) this.#sendProgress();
    return { ok: true, player, resumed: true };
  }

  /** Appelé quand la socket d'un joueur se ferme. */
  disconnect(playerId) {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return;
    p.connected = false;
    this.touch();
    this.#broadcastLobby();
    if (this.phase === PHASE.QUESTION && !this.current.closed && !this.current.answers.has(playerId)) {
      // Un rechargement de page ne doit pas coûter la question : on l'attend encore un peu.
      const timer = this.clock.setTimeout(() => {
        this.current?.grace.delete(playerId);
        this.#sendProgress();
        this.#closeIfEveryoneAnswered();
      }, DISCONNECT_GRACE_MS);
      this.current.grace.set(playerId, timer);
    }
    if (this.phase === PHASE.QUESTION) {
      this.#sendProgress();
      this.#closeIfEveryoneAnswered();
    }
  }

  // ---------- Actions de l'animateur ----------

  start() {
    if (this.phase !== PHASE.LOBBY) return fail('WRONG_PHASE');
    if (this.players.size === 0) return fail('WRONG_PHASE', 'Il faut au moins un participant pour démarrer.');
    this.#startQuestion(0);
    return { ok: true };
  }

  next() {
    if (this.phase !== PHASE.REVEAL) return fail('WRONG_PHASE');
    if (this.index + 1 < this.questions.length) this.#startQuestion(this.index + 1);
    else this.#toPodium();
    return { ok: true };
  }

  close() {
    if (this.phase !== PHASE.QUESTION) return fail('WRONG_PHASE');
    this.closeQuestion();
    return { ok: true };
  }

  end() {
    if (this.phase === PHASE.PODIUM) return fail('WRONG_PHASE');
    if (this.phase === PHASE.QUESTION) this.#finalizeQuestion(); // les réponses déjà données comptent
    this.#toPodium();
    return { ok: true };
  }

  kick(playerId) {
    if (this.phase !== PHASE.LOBBY) return fail('WRONG_PHASE');
    const p = this.players.get(playerId);
    if (!p) return fail('BAD_REQUEST', 'Participant inconnu.');
    this.players.delete(playerId);
    this.bannedKeys.add(p.key);
    this.touch();
    this.send(playerId, { type: 'kicked' });
    this.#broadcastLobby();
    return { ok: true, playerId };
  }

  // ---------- Réponses ----------

  /**
   * Enregistre la réponse d'un joueur. Le temps est mesuré ici, jamais fourni par le client.
   */
  answer(playerId, questionIndex, choiceIndex) {
    this.touch();
    const p = this.players.get(playerId);
    if (!p) return fail('BAD_REQUEST', 'Tu ne fais pas partie de cette partie.');
    if (this.phase === PHASE.REVEAL) {
      return questionIndex === this.index ? fail('TOO_LATE') : fail('STALE_QUESTION');
    }
    if (this.phase !== PHASE.QUESTION) return fail('WRONG_PHASE');
    if (questionIndex !== this.index) return fail('STALE_QUESTION');
    const cur = this.current;
    if (cur.closed) return fail('TOO_LATE');
    const q = this.questions[this.index];
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= q.choices.length) return fail('INVALID_CHOICE');
    if (cur.answers.has(playerId)) return fail('ALREADY_ANSWERED');
    const receivedAt = this.clock.now();
    if (!isOnTime({ receivedAt, endsAt: cur.endsAt })) return fail('TOO_LATE');

    const elapsedMs = receivedAt - cur.startedAt;
    const correct = choiceIndex === q.correctIndex;
    const points = computePoints({ correct, elapsedMs, durationMs: cur.durationMs });
    cur.answers.set(playerId, { choiceIndex, elapsedMs, correct, points });

    this.send(playerId, { type: 'answer:ack', questionIndex, choiceIndex });
    this.#sendProgress();
    this.#closeIfEveryoneAnswered();
    return { ok: true };
  }

  /** Clôture idempotente : une seule reveal même si minuteur et dernière réponse coïncident. */
  closeQuestion() {
    if (this.phase !== PHASE.QUESTION || !this.current || this.current.closed) return false;
    this.clock.clearTimeout(this.current.timer);
    this.#finalizeQuestion();
    this.phase = PHASE.REVEAL;
    this.touch();
    this.send('host', this.revealFor(null));
    for (const p of this.players.values()) this.send(p.id, this.revealFor(p.id));
    return true;
  }

  // ---------- Vues (instantanés envoyés aux clients) ----------

  ranking() {
    return rankPlayers([...this.players.values()]);
  }

  publicLeaderboard(limit) {
    const ranked = this.ranking().map(({ nickname, score, rank }) => ({ nickname, score, rank }));
    return limit ? ranked.slice(0, limit) : ranked;
  }

  rankOf(playerId) {
    return this.ranking().find((p) => p.id === playerId)?.rank ?? null;
  }

  lobbyPlayers() {
    return [...this.players.values()].map(({ id, nickname, connected }) => ({ id, nickname, connected }));
  }

  /** Message `question` sans la bonne réponse. */
  questionMessage() {
    const q = this.questions[this.index];
    const cur = this.current;
    return {
      type: 'question',
      index: this.index,
      total: this.questions.length,
      text: q.text,
      choices: [...q.choices],
      durationMs: cur.durationMs,
      remainingMs: Math.max(0, cur.endsAt - this.clock.now()),
    };
  }

  progress() {
    const answers = this.current?.answers ?? new Map();
    let expected = 0;
    const grace = this.current?.grace ?? new Map();
    for (const p of this.players.values()) if (p.connected || answers.has(p.id) || grace.has(p.id)) expected += 1;
    return { answered: answers.size, expected };
  }

  revealFor(playerId) {
    const q = this.questions[this.index];
    const msg = {
      type: 'reveal',
      index: this.index,
      total: this.questions.length,
      text: q.text,
      choices: [...q.choices],
      correctIndex: q.correctIndex,
      counts: [...this.current.counts],
      leaderboard: this.publicLeaderboard(REVEAL_TOP),
      isLast: this.index === this.questions.length - 1,
    };
    if (playerId) {
      const p = this.players.get(playerId);
      const a = this.current.answers.get(playerId);
      msg.you = {
        answered: Boolean(a),
        choiceIndex: a ? a.choiceIndex : null,
        correct: Boolean(a?.correct),
        points: a ? a.points : 0,
        score: p.score,
        rank: this.rankOf(playerId),
      };
    }
    return msg;
  }

  podiumFor(playerId) {
    const msg = {
      type: 'podium',
      leaderboard: this.publicLeaderboard(playerId ? PODIUM_TOP : 0),
      playerCount: this.players.size,
    };
    if (playerId) {
      const p = this.players.get(playerId);
      msg.you = { score: p.score, rank: this.rankOf(playerId) };
    }
    return msg;
  }

  /** Instantané complet pour une socket qui (re)prend sa place. target : 'host' ou playerId. */
  stateFor(target) {
    const isHost = target === 'host';
    const state = {
      type: 'state',
      role: isHost ? 'host' : 'player',
      phase: this.phase,
      code: this.code,
      questionCount: this.questions.length,
    };
    if (isHost) state.players = this.lobbyPlayers();
    if (!isHost) {
      const p = this.players.get(target);
      state.you = { playerId: p.id, nickname: p.nickname, score: p.score, rank: this.rankOf(p.id) };
    }
    if (this.phase === PHASE.QUESTION) {
      state.question = this.questionMessage();
      state.remainingMs = state.question.remainingMs;
      if (isHost) state.progress = this.progress();
      else {
        const a = this.current.answers.get(target);
        state.you.answeredChoice = a ? a.choiceIndex : null;
      }
    }
    if (this.phase === PHASE.REVEAL) state.reveal = this.revealFor(isHost ? null : target);
    if (this.phase === PHASE.PODIUM) state.podium = this.podiumFor(isHost ? null : target);
    return state;
  }

  /** Annule le minuteur en cours (suppression de la session). */
  destroy() {
    if (this.current?.timer !== undefined) this.clock.clearTimeout(this.current.timer);
    if (this.current) {
      for (const id of [...this.current.grace.keys()]) this.#clearGrace(id);
      this.current.closed = true;
    }
  }

  // ---------- Interne ----------

  #startQuestion(index) {
    const q = this.questions[index];
    const durationMs = q.timeSec * 1000;
    const startedAt = this.clock.now();
    this.index = index;
    this.phase = PHASE.QUESTION;
    this.current = {
      startedAt,
      endsAt: startedAt + durationMs,
      durationMs,
      closed: false,
      answers: new Map(),
      counts: q.choices.map(() => 0),
      timer: undefined,
      grace: new Map(), // playerId -> minuteur du délai de grâce après déconnexion
    };
    // Le minuteur serveur est la seule source de vérité de la fin de la question.
    this.current.timer = this.clock.setTimeout(() => this.closeQuestion(), durationMs + ANSWER_GRACE_MS);
    for (const p of this.players.values()) p.lastPoints = 0;
    this.touch();
    const msg = this.questionMessage();
    this.send('host', msg);
    for (const p of this.players.values()) this.send(p.id, msg);
    this.#sendProgress();
  }

  /** Applique les points de la question courante (une seule fois). */
  #finalizeQuestion() {
    const cur = this.current;
    if (!cur || cur.closed) return;
    cur.closed = true;
    this.clock.clearTimeout(cur.timer);
    for (const id of cur.grace.keys()) this.#clearGrace(id);
    for (const [playerId, a] of cur.answers) {
      cur.counts[a.choiceIndex] += 1;
      const p = this.players.get(playerId);
      if (!p) continue;
      p.score += a.points;
      p.lastPoints = a.points;
      if (a.correct) p.correctTimeMs += a.elapsedMs;
    }
  }

  #closeIfEveryoneAnswered() {
    if (this.phase !== PHASE.QUESTION || this.current.closed) return;
    const awaited = [...this.players.values()].filter((p) => p.connected || this.current.grace.has(p.id));
    if (awaited.length === 0) return; // personne en ligne : on attend la fin du temps
    if (awaited.every((p) => this.current.answers.has(p.id))) this.closeQuestion();
  }

  #clearGrace(playerId) {
    const timer = this.current?.grace.get(playerId);
    if (timer === undefined) return;
    this.clock.clearTimeout(timer);
    this.current.grace.delete(playerId);
  }

  #toPodium() {
    this.phase = PHASE.PODIUM;
    this.endedAt = this.clock.now();
    this.touch();
    this.send('host', this.podiumFor(null));
    for (const p of this.players.values()) this.send(p.id, this.podiumFor(p.id));
  }

  #sendProgress() {
    if (this.phase !== PHASE.QUESTION) return;
    this.send('host', { type: 'progress', ...this.progress() });
  }

  #broadcastLobby() {
    const players = this.lobbyPlayers();
    this.send('host', { type: 'lobby', players });
    // Les participants ne reçoivent que le nombre de joueurs et les pseudos, pas les identifiants.
    const lite = { type: 'lobby', players: players.map(({ nickname, connected }) => ({ nickname, connected })) };
    for (const p of this.players.values()) this.send(p.id, lite);
  }
}
