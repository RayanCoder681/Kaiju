// Kaiju — simulateur de participants pour tester la charge avant une séance.
// Suit le protocole de kaiju-core/references/protocol.md (player:join, question, player:answer).
// Usage : node load-bots.js <url-ws> <code> [nombre=30]
//   ex.  : node load-bots.js ws://192.168.137.1:3000/ws 4821 40
// Lancer depuis un AUTRE appareil que le serveur si possible, pour passer réellement par le Wi-Fi.
// Dépendance : ws (celle du projet Kaiju). Ctrl+C pour arrêter.
import WebSocket from 'ws';

const [url, code, countArg] = process.argv.slice(2);
if (!url || !code) {
  console.error('Usage : node load-bots.js <url-ws> <code> [nombre]');
  process.exit(1);
}
const count = Math.min(Number(countArg) || 30, 200);

const stats = { joined: 0, answered: 0, acks: 0, errors: {}, latencies: [] };

function bot(i) {
  const ws = new WebSocket(url);
  const nickname = `bot-${String(i).padStart(3, '0')}`;
  let sentAt = 0;
  ws.on('open', () => ws.send(JSON.stringify({ type: 'player:join', code, nickname })));
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'joined') stats.joined++;
    if (msg.type === 'question') {
      // Réponse aléatoire entre 10 % et 90 % du temps restant
      const delay = msg.remainingMs * (0.1 + Math.random() * 0.8);
      setTimeout(() => {
        sentAt = performance.now();
        ws.send(JSON.stringify({
          type: 'player:answer',
          questionIndex: msg.index,
          choiceIndex: Math.floor(Math.random() * msg.choices.length),
        }));
        stats.answered++;
      }, delay);
    }
    if (msg.type === 'answer:ack') {
      stats.acks++;
      stats.latencies.push(performance.now() - sentAt);
    }
    if (msg.type === 'error') stats.errors[msg.code] = (stats.errors[msg.code] ?? 0) + 1;
  });
  ws.on('error', (e) => { stats.errors[e.code ?? 'SOCKET'] = (stats.errors[e.code ?? 'SOCKET'] ?? 0) + 1; });
}

// Connexions étalées (20 par seconde) pour ressembler à une vraie salle
for (let i = 1; i <= count; i++) setTimeout(() => bot(i), i * 50);

setInterval(() => {
  const l = [...stats.latencies].sort((a, b) => a - b);
  const p = (q) => (l.length ? l[Math.min(l.length - 1, Math.floor(q * l.length))].toFixed(0) : '-');
  console.log(
    `rejoints ${stats.joined}/${count} | réponses ${stats.answered} | accusés ${stats.acks} | ` +
    `latence p50 ${p(0.5)} ms p95 ${p(0.95)} ms | erreurs ${JSON.stringify(stats.errors)}`
  );
}, 2000);
