// Kaiju — client unique (animateur et participant). Aucune logique de jeu ici :
// le serveur fait autorité, la page affiche les vues dictées par ses messages.
// Tout texte venant d'un utilisateur est inséré avec textContent.
import { parseQuiz, formatErrors } from '/lib/quiz-parser.js';

// ---------- Utilitaires ----------
const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const SHAPE_NAMES = ['triangle', 'losange', 'cercle', 'carré'];

function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

/** Forme blanche (triangle, losange, cercle, carré) pour ne pas dépendre de la couleur seule. */
function shape(index) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'shape');
  let s;
  if (index === 0) {
    s = document.createElementNS(SVG_NS, 'path');
    s.setAttribute('d', 'M12 3 L22 21 H2 Z');
  } else if (index === 1) {
    s = document.createElementNS(SVG_NS, 'path');
    s.setAttribute('d', 'M12 2 L22 12 L12 22 L2 12 Z');
  } else if (index === 2) {
    s = document.createElementNS(SVG_NS, 'circle');
    s.setAttribute('cx', '12');
    s.setAttribute('cy', '12');
    s.setAttribute('r', '10');
  } else {
    s = document.createElementNS(SVG_NS, 'rect');
    s.setAttribute('x', '3');
    s.setAttribute('y', '3');
    s.setAttribute('width', '18');
    s.setAttribute('height', '18');
  }
  s.setAttribute('fill', 'currentColor');
  svg.append(s);
  return svg;
}

const store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* navigation privée : on continue sans mémoire */
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* idem */
    }
  },
};

const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

let toastTimer = null;
function toast(message, ms = 4500) {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

function show(viewId) {
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== viewId;
  if (!viewId.startsWith('view-host') && viewId !== 'view-create') document.body.classList.remove('host-mode');
  else document.body.classList.add('host-mode');
  window.scrollTo(0, 0);
}

function setTopbar(text) {
  $('topbar-info').textContent = text || '';
}

// ---------- État local (affichage uniquement) ----------
const params = new URLSearchParams(location.search);
const isHostPage = params.has('host');

/** @type {null | {role: 'host', code: string, hostToken: string} | {role: 'player', code: string, nickname: string, playerToken: string}} */
let session = null;
let joinUrl = '';
let pendingJoin = null; // { code, nickname } en attente de « joined »
let currentQuestion = null; // dernier message question
let answered = null; // index choisi par ce participant pour la question courante

// ---------- WebSocket et reconnexion ----------
let ws = null;
let retry = 0;
let retryTimer = null;
let stopped = false; // plus de reconnexion automatique (exclu, session ouverte ailleurs)
let outbox = null; // message à envoyer dès l'ouverture (création, première connexion)

const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

function connect() {
  clearTimeout(retryTimer);
  if (stopped) return;
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  const sock = new WebSocket(wsUrl());
  ws = sock;
  sock.addEventListener('open', () => {
    retry = 0;
    updateBanner();
    if (session) resumeSession();
    else if (outbox) {
      sock.send(JSON.stringify(outbox));
      outbox = null;
    }
  });
  sock.addEventListener('message', (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    handle(msg);
  });
  sock.addEventListener('close', (e) => {
    if (ws !== sock) return;
    ws = null;
    if (e.code === 4001) {
      stopped = true;
      updateBanner();
      toast('Cette session a été ouverte ailleurs (autre onglet ou appareil).', 8000);
      return;
    }
    if (e.code === 4002 || stopped) return;
    updateBanner();
    const delay = Math.min(1000 * 2 ** retry, 10000); // 1 s, 2 s, 4 s, 8 s, puis 10 s
    retry += 1;
    retryTimer = setTimeout(connect, delay);
  });
}

function reconnectNow() {
  if (stopped) return;
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    retry = 0;
    connect();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') reconnectNow();
});
window.addEventListener('online', reconnectNow);

/** Envoie si la socket est ouverte ; sinon renvoie false (l'appelant décide). */
function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

/** Envoie maintenant, ou dès que la connexion est (r)établie. */
function sendSoon(msg) {
  if (!send(msg)) {
    outbox = msg;
    reconnectNow();
  }
}

function updateBanner() {
  const open = ws && ws.readyState === WebSocket.OPEN;
  $('conn-banner').hidden = Boolean(open) || !session || stopped;
}

function resumeSession() {
  if (session.role === 'host') send({ type: 'host:resume', code: session.code, hostToken: session.hostToken });
  else send({ type: 'player:join', code: session.code, nickname: session.nickname, playerToken: session.playerToken });
}

function forgetSession(message) {
  if (session?.role === 'host') store.del('kaiju:host');
  if (session?.role === 'player') {
    store.del(`kaiju:${session.code}`);
    store.del('kaiju:last');
  }
  session = null;
  stopTimer();
  updateBanner();
  setTopbar('');
  if (isHostPage) showCreate();
  else showJoin();
  if (message) toast(message, 8000);
}

// ---------- Messages du serveur ----------
function handle(msg) {
  switch (msg.type) {
    case 'host:created':
      session = { role: 'host', code: msg.code, hostToken: msg.hostToken };
      store.set('kaiju:host', { code: msg.code, hostToken: msg.hostToken });
      joinUrl = msg.joinUrl || '';
      break;
    case 'joined':
      session = { role: 'player', code: msg.code, nickname: msg.nickname, playerToken: msg.playerToken };
      store.set(`kaiju:${msg.code}`, { nickname: msg.nickname, playerToken: msg.playerToken });
      store.set('kaiju:last', msg.code);
      pendingJoin = null;
      $('join-btn').disabled = false;
      if (msg.resumed) toast('Te revoilà dans la partie.', 2500);
      break;
    case 'state':
      if (msg.joinUrl) joinUrl = msg.joinUrl;
      if (msg.role === 'host') renderHostState(msg);
      else renderPlayerState(msg);
      updateBanner();
      break;
    case 'lobby':
      if (session?.role === 'host') renderLobbyPlayers(msg.players);
      else $('wait-count').textContent = `${plural(msg.players.length, 'participant')} dans la partie`;
      break;
    case 'question':
      if (session?.role === 'host') renderHostQuestion(msg);
      else renderPlayerQuestion(msg, null);
      break;
    case 'answer:ack':
      $('pq-status').textContent = 'Réponse enregistrée. Attends les résultats.';
      break;
    case 'progress':
      $('hq-progress').textContent = `${msg.answered} / ${msg.expected} réponses`;
      break;
    case 'reveal':
      stopTimer();
      if (session?.role === 'host') renderHostReveal(msg);
      else renderPlayerReveal(msg);
      break;
    case 'podium':
      stopTimer();
      if (session?.role === 'host') renderHostPodium(msg);
      else renderPlayerPodium(msg);
      break;
    case 'kicked':
      stopped = true;
      forgetSession('L’animateur t’a retiré de la partie.');
      break;
    case 'error':
      handleError(msg);
      break;
    default:
      break;
  }
}

function handleError({ code, message, details }) {
  switch (code) {
    case 'ROOM_NOT_FOUND':
      if (session) return forgetSession('Cette partie n’existe plus (le serveur a peut-être redémarré).');
      return joinFailed(message);
    case 'ROOM_ENDED':
      if (session?.role === 'host') return; // l'animateur reste sur le podium
      if (session && !$('view-final').hidden) {
        // Reconnexion après la fin : on garde l'écran final, on oublie simplement la partie.
        store.del(`kaiju:${session.code}`);
        session = null;
        updateBanner();
        return;
      }
      if (session) return forgetSession('Cette partie est terminée.');
      return joinFailed(message);
    case 'NICK_TAKEN':
    case 'NICK_INVALID':
    case 'ROOM_FULL':
      if (session?.role === 'player') return forgetSession(message);
      return joinFailed(message);
    case 'NOT_HOST':
      if (session?.role === 'host' || isHostPage) return forgetSession('Impossible de reprendre cette session d’animation.');
      return toast(message);
    case 'QUIZ_INVALID':
      $('create-btn').disabled = false;
      showQuizErrors(details ? formatErrors(details) : message);
      return;
    case 'ALREADY_ANSWERED':
    case 'TOO_LATE':
    case 'STALE_QUESTION':
    case 'INVALID_CHOICE':
      $('pq-status').textContent = message;
      return;
    default:
      toast(message || 'Erreur.');
  }
}

function joinFailed(message) {
  pendingJoin = null;
  $('join-btn').disabled = false;
  $('join-error').textContent = message;
  if (!isHostPage) show('view-join');
}

// ---------- Minuteur (décoratif : la fin réelle est décidée par le serveur) ----------
let timerHandle = null;
function startTimer(remainingMs, displayEl, srEl, onZero) {
  stopTimer();
  const deadline = performance.now() + remainingMs;
  let lastSec = null;
  const tick = () => {
    const left = Math.max(0, deadline - performance.now());
    const sec = Math.ceil(left / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      displayEl.textContent = String(sec);
      displayEl.classList.toggle('urgent', sec <= 5);
      if (srEl && (sec === 10 || sec === 5)) srEl.textContent = `${sec} secondes restantes`;
      if (sec === 0) {
        stopTimer();
        onZero?.();
      }
    }
  };
  tick();
  timerHandle = setInterval(tick, 200);
}
function stopTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
}

// ---------- Participant ----------
function showJoin() {
  show('view-join');
  const code = params.get('code');
  if (code && /^\d{4}$/.test(code) && !$('join-code').value) $('join-code').value = code;
  ($('join-code').value ? $('join-nick') : $('join-code')).focus({ preventScroll: true });
}

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('join-code').value.trim();
  const nickname = $('join-nick').value.trim();
  $('join-error').textContent = '';
  if (!/^\d{4}$/.test(code)) {
    $('join-error').textContent = 'Le code fait 4 chiffres.';
    return;
  }
  if (!nickname) {
    $('join-error').textContent = 'Choisis un pseudo.';
    return;
  }
  stopped = false;
  const saved = store.get(`kaiju:${code}`);
  // Le jeton n'est réutilisé que pour le même pseudo : un autre pseudo = un autre joueur.
  const playerToken = saved && saved.nickname?.toLocaleLowerCase('fr') === nickname.toLocaleLowerCase('fr') ? saved.playerToken : undefined;
  pendingJoin = { code, nickname };
  $('join-btn').disabled = true;
  sendSoon({ type: 'player:join', code, nickname, playerToken });
  setTimeout(() => {
    if (pendingJoin) {
      $('join-btn').disabled = false;
      $('join-error').textContent = 'Pas de réponse du serveur. Vérifie que tu es sur le même Wi-Fi que l’animateur.';
    }
  }, 8000);
});

$('join-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

function renderPlayerState(s) {
  setTopbar(`${s.you.nickname} · ${s.code}`);
  if (s.phase === 'LOBBY') {
    $('wait-code').textContent = s.code;
    $('wait-nick').textContent = s.you.nickname;
    $('wait-msg').textContent = 'Attends le lancement par l’animateur.';
    show('view-wait');
  } else if (s.phase === 'QUESTION') {
    renderPlayerQuestion(s.question, s.you.answeredChoice);
  } else if (s.phase === 'REVEAL') {
    renderPlayerReveal(s.reveal);
  } else if (s.phase === 'PODIUM') {
    renderPlayerPodium(s.podium);
  }
}

function renderPlayerQuestion(q, alreadyAnswered) {
  currentQuestion = q;
  answered = alreadyAnswered ?? null;
  $('pq-counter').textContent = `Question ${q.index + 1} / ${q.total}`;
  $('pq-text').textContent = q.text;
  const box = $('pq-choices');
  box.replaceChildren();
  box.dataset.count = String(q.choices.length);
  q.choices.forEach((text, i) => {
    const btn = el('button', { className: `choice c${i}`, attrs: { type: 'button', 'aria-label': `Réponse ${i + 1} (${SHAPE_NAMES[i]}) : ${text}` } }, [
      shape(i),
      el('span', { className: 'choice-text', text }),
    ]);
    btn.addEventListener('click', () => choose(i));
    box.append(btn);
  });
  applyAnsweredState();
  $('pq-status').textContent = answered === null ? '' : 'Réponse enregistrée. Attends les résultats.';
  show('view-play');
  startTimer(q.remainingMs, $('pq-timer'), $('pq-timer-sr'), () => {
    if (answered === null) {
      $('pq-status').textContent = 'Temps écoulé.';
      for (const b of $('pq-choices').children) b.disabled = true;
    }
  });
}

function applyAnsweredState() {
  [...$('pq-choices').children].forEach((b, i) => {
    b.disabled = answered !== null;
    b.classList.toggle('chosen', answered === i);
    b.classList.toggle('dimmed', answered !== null && answered !== i);
  });
}

function choose(i) {
  if (answered !== null || !currentQuestion) return;
  answered = i;
  applyAnsweredState(); // anti double tap : le serveur reste l'autorité
  $('pq-status').textContent = 'Envoi…';
  if (!send({ type: 'player:answer', questionIndex: currentQuestion.index, choiceIndex: i })) {
    answered = null;
    applyAnsweredState();
    $('pq-status').textContent = 'Connexion perdue : réessaie dans un instant.';
    reconnectNow();
  }
}

function renderPlayerReveal(r) {
  const you = r.you;
  const verdict = $('pr-verdict');
  verdict.className = 'verdict';
  if (!you.answered) {
    verdict.textContent = 'Pas de réponse';
    verdict.classList.add('none');
  } else if (you.correct) {
    verdict.textContent = 'Bonne réponse';
    verdict.classList.add('good');
  } else {
    verdict.textContent = 'Mauvaise réponse';
    verdict.classList.add('bad');
  }
  $('pr-points').textContent = `+${you.points} points`;
  $('pr-answer').textContent = you.correct ? '' : `La bonne réponse était : ${r.choices[r.correctIndex]}`;
  $('pr-score').textContent = String(you.score);
  $('pr-rank').textContent = you.rank ? ordinal(you.rank) : '-';
  show('view-result');
}

function renderPlayerPodium(p) {
  $('pf-rank').textContent = p.you?.rank ? ordinal(p.you.rank) : '-';
  $('pf-score').textContent = `${p.you?.score ?? 0} points`;
  fillBoard($('pf-top'), p.leaderboard);
  show('view-final');
  // La partie est finie : on ne tentera plus de la reprendre au prochain chargement.
  store.del('kaiju:last');
}

// ---------- Animateur ----------
const EXAMPLE = `Quelle est la capitale du Cameroun ?
Douala
*Yaoundé
Bafoussam
Garoua

Combien font 7 x 8 ? [15s]
54
*56
64

Quel protocole garde une connexion ouverte entre le navigateur et le serveur ?
HTTP/1.0
*WebSocket
FTP
SMTP`;

function showCreate() {
  show('view-create');
  setTopbar('Animateur');
  validateQuiz();
}

let validateTimer = null;
function validateQuiz() {
  const text = $('quiz-text').value;
  store.set('kaiju:draft', text);
  const status = $('quiz-status');
  if (!text.trim()) {
    status.textContent = 'Collez vos questions ci-dessus.';
    $('quiz-errors').hidden = true;
    $('create-btn').disabled = true;
    return;
  }
  const { questions, errors } = parseQuiz(text, { defaultTimeSec: Number($('default-time').value) });
  if (errors.length) {
    status.textContent = `${plural(errors.length, 'erreur')} à corriger :`;
    showQuizErrors(formatErrors(errors));
    $('create-btn').disabled = true;
  } else {
    status.textContent = `${plural(questions.length, 'question')} prête${questions.length > 1 ? 's' : ''}.`;
    $('quiz-errors').hidden = true;
    $('create-btn').disabled = false;
  }
}

function showQuizErrors(text) {
  const box = $('quiz-errors');
  box.textContent = text;
  box.hidden = false;
}

$('quiz-text').addEventListener('input', () => {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(validateQuiz, 150);
});
$('default-time').addEventListener('change', validateQuiz);
$('example-btn').addEventListener('click', () => {
  $('quiz-text').value = EXAMPLE;
  validateQuiz();
});
$('create-btn').addEventListener('click', () => {
  $('create-btn').disabled = true;
  stopped = false;
  sendSoon({
    type: 'host:create',
    quizText: $('quiz-text').value,
    settings: { defaultTimeSec: Number($('default-time').value) },
  });
});

$('start-btn').addEventListener('click', () => hostAction('host:start'));
$('close-btn').addEventListener('click', () => hostAction('host:close'));
$('next-btn').addEventListener('click', () => hostAction('host:next'));
$('end-btn').addEventListener('click', () => {
  if (window.confirm('Terminer la partie maintenant et afficher le podium ?')) hostAction('host:end');
});
$('new-btn').addEventListener('click', () => {
  store.del('kaiju:host');
  session = null;
  updateBanner();
  showCreate();
});

function hostAction(type) {
  if (!send({ type })) toast('Connexion au serveur perdue : nouvelle tentative en cours.');
}

function renderHostState(s) {
  setTopbar(`Animateur · ${s.code}`);
  if (s.phase === 'LOBBY') {
    renderHostLobby(s);
  } else if (s.phase === 'QUESTION') {
    renderHostQuestion(s.question);
    if (s.progress) handle({ type: 'progress', ...s.progress });
  } else if (s.phase === 'REVEAL') {
    renderHostReveal(s.reveal);
  } else if (s.phase === 'PODIUM') {
    renderHostPodium(s.podium);
  }
}

function renderHostLobby(s) {
  $('lobby-code').textContent = s.code;
  const base = (joinUrl || `${location.origin}/?code=${s.code}`).replace(/\/?\?code=\d{4}$/, '');
  $('lobby-url').textContent = base.replace(/^https?:\/\//, '');
  $('lobby-qr').src = `/qr.svg?code=${encodeURIComponent(s.code)}`;
  renderLobbyPlayers(s.players || []);
  show('view-host-lobby');
}

function renderLobbyPlayers(players) {
  $('lobby-count').textContent = String(players.length);
  $('start-btn').disabled = players.length === 0;
  const list = $('lobby-players');
  list.replaceChildren(
    ...players.map((p) => {
      const kick = el('button', { className: 'chip-kick', text: 'Retirer', attrs: { type: 'button', 'aria-label': `Retirer ${p.nickname}` } });
      kick.addEventListener('click', () => {
        if (window.confirm(`Retirer « ${p.nickname} » de la partie ?`)) send({ type: 'host:kick', playerId: p.id });
      });
      return el('li', { className: `chip${p.connected ? '' : ' off'}`, attrs: { title: p.connected ? 'connecté' : 'déconnecté' } }, [
        el('span', { text: p.nickname }),
        kick,
      ]);
    })
  );
}

function renderHostQuestion(q) {
  currentQuestion = q;
  $('hq-counter').textContent = `Question ${q.index + 1} / ${q.total}`;
  $('hq-text').textContent = q.text;
  const box = $('hq-choices');
  box.dataset.count = String(q.choices.length);
  box.replaceChildren(
    ...q.choices.map((text, i) =>
      el('div', { className: `choice c${i}` }, [shape(i), el('span', { className: 'choice-text', text })])
    )
  );
  $('hq-progress').textContent = '';
  show('view-host-question');
  startTimer(q.remainingMs, $('hq-timer'), null);
}

function renderHostReveal(r) {
  $('hr-counter').textContent = `Question ${r.index + 1} / ${r.total}`;
  $('hr-text').textContent = r.text;
  const total = r.counts.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...r.counts);
  $('hr-bars').replaceChildren(
    ...r.choices.map((text, i) => {
      const correct = i === r.correctIndex;
      const fill = el('div', { className: `bar-fill c${i}` });
      fill.style.width = `${(r.counts[i] / max) * 100}%`;
      return el('div', { className: `bar-row${correct ? ' correct' : ''}` }, [
        el('div', { className: `bar-label c${i}` }, [shape(i)]),
        el('div', { className: 'bar-main' }, [
          el('div', { className: 'bar-text' }, [
            el('span', { text }),
            correct ? el('span', { className: 'badge', text: 'Bonne réponse' }) : null,
          ]),
          el('div', { className: 'bar-track' }, [fill]),
        ]),
        el('div', { className: 'bar-count', text: String(r.counts[i]) }),
      ]);
    })
  );
  $('hr-bars').append(el('p', { className: 'muted', text: `${plural(total, 'réponse')} au total` }));
  fillBoard($('hr-board'), r.leaderboard);
  $('next-btn').textContent = r.isLast ? 'Voir le podium' : 'Question suivante';
  show('view-host-reveal');
}

function renderHostPodium(p) {
  const top = p.leaderboard.slice(0, 3);
  const order = [1, 0, 2]; // 2e, 1er, 3e
  $('podium').replaceChildren(
    ...order
      .filter((i) => top[i])
      .map((i) =>
        el('div', { className: `step step-${i + 1}` }, [
          el('div', { className: 'step-name', text: top[i].nickname }),
          el('div', { className: 'step-score', text: `${top[i].score} pts` }),
          el('div', { className: 'step-block', text: ordinal(top[i].rank) }),
        ])
      )
  );
  fillBoard($('final-board'), p.leaderboard);
  show('view-host-podium');
}

function fillBoard(list, entries) {
  list.replaceChildren(
    ...entries.map((e) =>
      el('li', {}, [
        el('span', { className: 'rank', text: ordinal(e.rank) }),
        el('span', { className: 'name', text: e.nickname }),
        el('span', { className: 'score', text: String(e.score) }),
      ])
    )
  );
}

// ---------- Démarrage ----------
function boot() {
  if (isHostPage) {
    const draft = store.get('kaiju:draft');
    if (typeof draft === 'string') $('quiz-text').value = draft;
    const saved = store.get('kaiju:host');
    if (saved?.code && saved?.hostToken) session = { role: 'host', code: saved.code, hostToken: saved.hostToken };
    showCreate();
  } else {
    const urlCode = params.get('code');
    const last = store.get('kaiju:last');
    const code = urlCode && /^\d{4}$/.test(urlCode) ? urlCode : last;
    const saved = code ? store.get(`kaiju:${code}`) : null;
    if (saved?.playerToken && saved?.nickname) {
      // Reprise automatique : même code, même pseudo, jeton du serveur.
      session = { role: 'player', code, nickname: saved.nickname, playerToken: saved.playerToken };
      $('join-code').value = code;
      $('join-nick').value = saved.nickname;
      $('wait-code').textContent = code;
      $('wait-nick').textContent = saved.nickname;
      $('wait-msg').textContent = 'Reconnexion à la partie…';
      show('view-wait');
    } else {
      if (saved?.nickname) $('join-nick').value = saved.nickname;
      showJoin();
    }
  }
  connect();
}

boot();
