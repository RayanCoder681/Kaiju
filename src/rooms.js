// Kaiju — sessions en mémoire, indexées par code à 4 chiffres, avec nettoyage périodique.
// Un redémarrage du serveur efface toutes les parties : choix assumé du projet (aucune base de données).
import { Game, PHASE, systemClock } from './game.js';
import { generateRoomCode } from './room-code.js';

export const PODIUM_TTL_MS = 30 * 60 * 1000; // session au podium depuis plus de 30 min
export const IDLE_TTL_MS = 2 * 60 * 60 * 1000; // aucune socket connectée depuis plus de 2 h

export class Rooms {
  /**
   * @param {{clock?: object, onRemove?: (code: string, game: Game) => void}} [opts]
   */
  constructor({ clock = systemClock, onRemove = () => {} } = {}) {
    this.clock = clock;
    this.onRemove = onRemove;
    /** @type {Map<string, Game>} */
    this.games = new Map();
  }

  /** Crée une partie avec un code libre. `makeSend(code)` fournit la fonction d'envoi. */
  create(questions, makeSend = () => () => {}) {
    const code = generateRoomCode(this.games);
    const game = new Game({ code, questions, send: makeSend(code), clock: this.clock });
    this.games.set(code, game);
    return game;
  }

  get(code) {
    return this.games.get(code) ?? null;
  }

  get size() {
    return this.games.size;
  }

  remove(code) {
    const game = this.games.get(code);
    if (!game) return false;
    game.destroy();
    this.games.delete(code);
    this.onRemove(code, game);
    return true;
  }

  /** Supprime les sessions terminées ou abandonnées. Renvoie les codes supprimés. */
  sweep(now = this.clock.now()) {
    const removed = [];
    for (const [code, game] of this.games) {
      const podiumExpired = game.phase === PHASE.PODIUM && game.endedAt !== null && now - game.endedAt > PODIUM_TTL_MS;
      const abandoned = game.connectedCount() === 0 && now - game.lastActivityAt > IDLE_TTL_MS;
      if (podiumExpired || abandoned) {
        this.remove(code);
        removed.push(code);
      }
    }
    return removed;
  }

  destroyAll() {
    for (const code of [...this.games.keys()]) this.remove(code);
  }
}
