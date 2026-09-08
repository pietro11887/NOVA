/**
 * Collaudo di traffico e taxi senza guardare lo schermo.
 *
 * Fa girare la simulazione per un po' e misura le cose che si notano
 * giocando: auto finite sul marciapiede, auto piantate, quante si fermano
 * col rosso, e per il taxi se arriva davvero, in quanto tempo e quante
 * manovre strane fa per strada.
 *
 *   node tools/test-traffic.mjs [secondi]
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const SECONDS = Number(process.argv[2] || 120);

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await p.goto('http://127.0.0.1:8123/index.html?q=2&shot=1');
await p.waitForFunction(() => window.game && window.game.phone, null, { timeout: 240000 });
await p.evaluate(() => window.game.start());

const out = await p.evaluate(async (SECONDS) => {
  const g = window.game;
  const CFG = { ROAD: 16, WALK: 3 };
  const half = CFG.ROAD / 2 - CFG.WALK;      // mezza carreggiata

  // distanza dall'asse stradale piu' vicino: dice se un'auto e' fuori strada
  const offRoad = (v) => {
    let best = Infinity;
    for (const n of g.city.roadNodes) {
      for (const k of n.links) {
        const m = g.city.roadNodes[k];
        const dx = m.x - n.x, dz = m.z - n.z;
        const len2 = dx * dx + dz * dz;
        let t = ((v.x - n.x) * dx + (v.z - n.z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = n.x + dx * t, pz = n.z + dz * t;
        best = Math.min(best, Math.hypot(px - v.x, pz - v.z));
      }
    }
    return best;
  };

  const stats = {
    campioni: 0, fuoriStrada: 0, piantate: 0, fermeAlRosso: 0, inMoto: 0,
    velocitaMedia: 0, retromarce: 0, bloccateSenzaMotivo: 0,
  };
  const stuckTime = new Map();
  const freeStuck = new Map();

  const stepOnce = () => {
    g.update(1 / 60);
    for (const t of g.traffic.cars) {
      const v = t.v;
      stats.campioni++;
      if (offRoad(v) > half + 1.6) stats.fuoriStrada++;
      const sp = Math.abs(v.speed);
      stats.velocitaMedia += sp;
      if (v.speed < -0.6) stats.retromarce++;
      if (sp < 0.4) {
        const k = stuckTime.get(t) || 0;
        stuckTime.set(t, k + 1 / 60);
        if (k > 12) stats.piantate++;
        else stats.fermeAlRosso++;
        /*
         * Ferma con la strada libera davanti e il semaforo che non la
         * riguarda: questa e' l'unica che conta come guasto. Una in coda o
         * al rosso e' ferma per un motivo valido.
         */
        const lead = g.leaderAhead(v, 26, true);
        const libera = lead.d > 8;
        const f = libera ? (freeStuck.get(t) || 0) + 1 / 60 : 0;
        freeStuck.set(t, f);
        if (f > 6) stats.bloccateSenzaMotivo++;
      } else {
        stuckTime.set(t, 0);
        freeStuck.set(t, 0);
        stats.inMoto++;
      }
    }
  };

  // --- traffico da solo
  const frames = SECONDS * 60;
  for (let i = 0; i < frames; i++) {
    stepOnce();
    if (i % 600 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  stats.velocitaMedia = +(stats.velocitaMedia / Math.max(1, stats.campioni)).toFixed(2);
  for (const k of ['fuoriStrada', 'piantate', 'fermeAlRosso', 'inMoto', 'retromarce', 'bloccateSenzaMotivo']) {
    stats[k] = +((stats[k] / Math.max(1, stats.campioni)) * 100).toFixed(1);
  }

  // --- taxi: chiamata, arrivo, corsa
  const taxi = { chiamato: false };
  g.waypoint = null;
  const start = { x: g.player.x, z: g.player.z };
  taxi.chiamato = g.taxi.call();
  let t = 0, arrivo = -1, manovre = 0, fuori = 0, campioni = 0;
  const traccia = [];
  while (t < 200 && g.taxi.state === 'coming') {
    g.update(1 / 60);
    t += 1 / 60;
    const v = g.taxi.taxi;
    if (v) {
      campioni++;
      if (v.speed < -0.6) manovre++;
      if (offRoad(v) > half + 1.6) fuori++;
      if (Math.round(t * 60) % 600 === 0) {
        traccia.push({
          s: +t.toFixed(0),
          allaMeta: +Math.hypot(v.x - g.taxi.stop.x, v.z - g.taxi.stop.z).toFixed(0),
          vel: +v.speed.toFixed(1),
          fuoriAsse: +offRoad(v).toFixed(1),
          punti: g.taxi.path.length - g.taxi.st.i,
          dbg: g.taxi.dbg,
        });
      }
    }
    if (Math.round(t * 60) % 600 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  taxi.traccia = traccia;
  if (g.taxi.state === 'waiting') arrivo = t;
  taxi.arrivoSecondi = arrivo > 0 ? +arrivo.toFixed(1) : null;
  taxi.manovrePercento = +((manovre / Math.max(1, campioni)) * 100).toFixed(1);
  taxi.fuoriStradaPercento = +((fuori / Math.max(1, campioni)) * 100).toFixed(1);
  taxi.distanzaDaTe = g.taxi.taxi
    ? +Math.hypot(g.taxi.taxi.x - g.player.x, g.taxi.taxi.z - g.player.z).toFixed(1) : null;
  taxi.distanzaDaAsse = g.taxi.taxi ? +offRoad(g.taxi.taxi).toFixed(1) : null;
  taxi.statoFinale = g.taxi.state;
  taxi.secondiTrascorsi = +t.toFixed(1);

  // --- corsa vera: destinazione lontana
  if (g.taxi.state === 'waiting') {
    const far = g.city.roadNodes.find((n) => Math.hypot(n.x - start.x, n.z - start.z) > 180)
      || g.city.roadNodes[0];
    g.setWaypoint({ x: far.x, z: far.z });
    taxi.saliBordo = g.taxi.board();
    let t2 = 0, m2 = 0, f2 = 0, c2 = 0;
    while (t2 < 300 && g.taxi.state === 'riding') {
      g.update(1 / 60);
      t2 += 1 / 60;
      const v = g.taxi.taxi;
      if (v) { c2++; if (v.speed < -0.6) m2++; if (offRoad(v) > half + 1.6) f2++; }
      if (Math.round(t2 * 60) % 600 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    taxi.corsaSecondi = +t2.toFixed(1);
    taxi.corsaCompletata = g.taxi.state === null;
    taxi.corsaManovrePercento = +((m2 / Math.max(1, c2)) * 100).toFixed(1);
    taxi.corsaFuoriStradaPercento = +((f2 / Math.max(1, c2)) * 100).toFixed(1);
    taxi.arrivoADistanza = +Math.hypot(g.player.x - far.x, g.player.z - far.z).toFixed(1);
  }

  return {
    auto: g.traffic.cars.length,
    parcheggiate: g.traffic.parked.length,
    pedoni: g.peds.peds ? g.peds.peds.length : null,
    traffico: stats,
    taxi,
  };
}, SECONDS);

console.log(JSON.stringify(out, null, 1));
await b.close();
