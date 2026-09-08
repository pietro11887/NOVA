/**
 * Collaudo della corsa in taxi: quanto sbatte e se arriva.
 *
 * Chiama il taxi, sale a bordo con una destinazione lontana e conta gli urti
 * lungo il tragitto, distinguendo il muro dalle altre auto. Il numero che
 * conta e' "urti": e' quello che il giocatore sente.
 *
 *   node tools/test-ride.mjs [corse] [secondi per corsa]
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const RUNS = Number(process.argv[2] || 5);
const LIMIT = Number(process.argv[3] || 200);

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 420, height: 240 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await p.goto('http://127.0.0.1:8123/index.html?q=2&shot=1');
await p.waitForFunction(() => window.game && window.game.phone, null, { timeout: 240000 });
await p.evaluate(() => window.game.start());

const out = await p.evaluate(async ({ RUNS, LIMIT }) => {
  const g = window.game;
  const half = 5;
  const offRoad = (v) => {
    let best = Infinity;
    for (const n of g.city.roadNodes) {
      for (const k of n.links) {
        const m = g.city.roadNodes[k];
        const dx = m.x - n.x, dz = m.z - n.z;
        const len2 = dx * dx + dz * dz;
        let t = ((v.x - n.x) * dx + (v.z - n.z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(n.x + dx * t - v.x, n.z + dz * t - v.z));
      }
    }
    return best;
  };

  // urti con altri veicoli: si intercetta la collisione alla radice
  let seguito = null, urtiAuto = 0, forzaAuto = 0;
  const proto = Object.getPrototypeOf(g.player.car || g.traffic.cars[0].v);
  const orig = proto.collideWith;
  proto.collideWith = function (o) {
    const r = orig.call(this, o);
    if (seguito && r > 4 && (this === seguito || o === seguito)) { urtiAuto++; forzaAuto += r; }
    return r;
  };

  // i messaggi del gioco dicono perche' una corsa e' finita
  const messaggi = [];
  const toast0 = g.toast.bind(g);
  g.toast = (t, k) => { messaggi.push(t); return toast0(t, k); };

  const results = [];
  for (let run = 0; run < RUNS; run++) {
    const walk = g.city.walkNodes[(Math.random() * g.city.walkNodes.length) | 0];
    g.player.place(walk.x, walk.z, 0);
    g.taxi.drop(); g.taxi.state = null; g.taxi.taxi = null;
    for (let i = 0; i < 240; i++) g.update(1 / 60);

    if (!g.taxi.call()) { results.push({ esito: 'chiamata rifiutata' }); continue; }
    let t = 0;
    while (t < 120 && g.taxi.state === 'coming') {
      g.update(1 / 60); t += 1 / 60;
      if (Math.round(t * 60) % 900 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (g.taxi.state !== 'waiting') { results.push({ esito: 'non arrivato', attesa: +t.toFixed(0) }); continue; }

    const far = g.city.roadNodes
      .filter((n) => Math.hypot(n.x - g.player.x, n.z - g.player.z) > 200)
      .sort(() => Math.random() - 0.5)[0] || g.city.roadNodes[0];
    g.setWaypoint({ x: far.x, z: far.z });
    const distanza = Math.hypot(far.x - g.player.x, far.z - g.player.z);
    if (!g.taxi.board()) { results.push({ esito: 'non sale' }); continue; }

    seguito = g.taxi.taxi; urtiAuto = 0; forzaAuto = 0;
    messaggi.length = 0;
    const asseAllaPartenza = +offRoad(g.taxi.taxi).toFixed(1);
    const daTraffico = !!g.taxi.hired;
    seguito.lastCrash = 0;
    let urtiMuro = 0, forzaMuro = 0, t2 = 0, fuori = 0, campioni = 0, somma = 0, retro = 0;
    let vitaIniziale = seguito.health;
    const traccia = [];
    while (t2 < LIMIT && g.taxi.state === 'riding') {
      g.update(1 / 60); t2 += 1 / 60;
      const v = g.taxi.taxi;
      if (!v) break;
      campioni++; somma += Math.abs(v.speed);
      if (v.speed < -0.5) retro++;
      if (offRoad(v) > half + 1.6) fuori++;
      // lastCrash lo scrive sia il muro sia l'urto tra auto: quelli tra auto
      // li abbiamo gia' contati a parte, il resto e' muro o cordolo
      if (v.lastCrash) { urtiMuro++; forzaMuro += v.lastCrash; v.lastCrash = 0; }
      if (Math.round(t2 * 60) % 180 === 0) {
        traccia.push({ s: +t2.toFixed(0), allaMeta: +Math.hypot(v.x - g.taxi.stop.x, v.z - g.taxi.stop.z).toFixed(0),
                       vel: +v.speed.toFixed(1), asse: +offRoad(v).toFixed(1), i: g.taxi.st.i, n: g.taxi.path.length,
                       dbg: g.taxi.dbg });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const v = g.taxi.taxi;
    // "arrivato" vale solo se ti ha lasciato davvero a destinazione: la
    // corsa interrotta chiude allo stesso modo, e prima la contavo buona
    const restanti = Math.hypot(g.player.x - far.x, g.player.z - far.z);
    results.push({
      esito: g.taxi.state === null ? (restanti < 20 ? 'arrivato' : 'corsa interrotta')
        : (g.taxi.state === 'riding' ? 'in corsa (tempo scaduto)' : g.taxi.state),
      restanti: +restanti.toFixed(0),
      distanza: +distanza.toFixed(0),
      asseAllaPartenza, daTraffico,
      secondi: +t2.toFixed(0),
      urtiAuto, urtiMuro,
      urtiTotali: urtiAuto + urtiMuro,
      urtiAlMinuto: +(((urtiAuto + urtiMuro) / Math.max(1, t2)) * 60).toFixed(1),
      forzaMedia: +(((forzaAuto + forzaMuro) / Math.max(1, urtiAuto + urtiMuro))).toFixed(1),
      dannoVettura: +(vitaIniziale - (v ? v.health : 0)).toFixed(0),
      velMedia: +(somma / Math.max(1, campioni)).toFixed(1),
      fuoriStrada: +((fuori / Math.max(1, campioni)) * 100).toFixed(0),
      retromarce: +((retro / Math.max(1, campioni)) * 100).toFixed(0),
      traccia: traccia.slice(0, 14),
      messaggi: messaggi.slice(0, 6),
    });
    seguito = null;
    g.taxi.drop(); g.taxi.state = null; g.taxi.taxi = null;
  }
  return results;
}, { RUNS, LIMIT });

for (const r of out) console.log(JSON.stringify(r));
const ok = out.filter((r) => r.esito === 'arrivato');
const urti = ok.reduce((s, r) => s + r.urtiTotali, 0);
console.log(`\ncorse concluse ${ok.length} su ${out.length} · urti totali ${urti} · media ${(urti / Math.max(1, ok.length)).toFixed(1)} a corsa`);
await b.close();
