/**
 * Collaudo del solo servizio taxi, ripetuto.
 *
 * Una chiamata sola non dice niente: il risultato cambia molto a seconda di
 * dove sei e di com'e' messo il traffico in quel momento. Qui si chiama il
 * taxi N volte da posti diversi e si classifica ogni esito, cosi' si vede
 * se il problema e' sistematico o occasionale, e di che tipo e'.
 *
 *   node tools/test-taxi.mjs [chiamate] [secondi per chiamata]
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const CALLS = Number(process.argv[2] || 6);
const LIMIT = Number(process.argv[3] || 90);

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 420, height: 240 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await p.goto('http://127.0.0.1:8123/index.html?q=2&shot=1');
await p.waitForFunction(() => window.game && window.game.phone, null, { timeout: 240000 });
await p.evaluate(() => window.game.start());

const out = await p.evaluate(async ({ CALLS, LIMIT }) => {
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

  const results = [];
  for (let call = 0; call < CALLS; call++) {
    // il giocatore si sposta a piedi in un punto diverso della citta'
    const walk = g.city.walkNodes[(Math.random() * g.city.walkNodes.length) | 0];
    g.player.place(walk.x, walk.z, 0);
    g.taxi.drop();
    g.taxi.state = null;
    g.taxi.taxi = null;

    // un po' di traffico prima di chiamare, cosi' non parte tutto fermo
    for (let i = 0; i < 240; i++) g.update(1 / 60);

    const ok = g.taxi.call();
    if (!ok) { results.push({ esito: 'rifiutata' }); continue; }

    const partenza = Math.hypot(g.taxi.taxi.x - g.player.x, g.taxi.taxi.z - g.player.z);
    const dalTraffico = !!g.taxi.hired;
    let t = 0, minDist = Infinity, fuori = 0, campioni = 0, retro = 0;
    let ultimo = null;
    const primi = [];   // i primi secondi: dicono se parte o no
    while (t < LIMIT && g.taxi.state === 'coming') {
      g.update(1 / 60);
      t += 1 / 60;
      const v = g.taxi.taxi;
      if (!v) break;
      campioni++;
      if (v.speed < -0.5) retro++;
      if (offRoad(v) > half + 1.6) fuori++;
      minDist = Math.min(minDist, Math.hypot(v.x - g.taxi.stop.x, v.z - g.taxi.stop.z));
      ultimo = {
        allaMeta: +Math.hypot(v.x - g.taxi.stop.x, v.z - g.taxi.stop.z).toFixed(0),
        aTe: +Math.hypot(v.x - g.player.x, v.z - g.player.z).toFixed(0),
        vel: +v.speed.toFixed(1),
        asse: +offRoad(v).toFixed(1),
        i: g.taxi.st.i, n: g.taxi.path.length,
        dbg: g.taxi.dbg,
      };
      if (primi.length < 6 && Math.round(t * 60) % 60 === 0) {
        primi.push({
          s: +t.toFixed(0),
          vel: +v.speed.toFixed(1),
          thr: g.taxi.dbg ? g.taxi.dbg.throttle : null,
          stop: g.taxi.dbg ? g.taxi.dbg.stopDist : null,
          lead: g.taxi.dbg ? g.taxi.dbg.leadD : null,
          i: g.taxi.st.i, n: g.taxi.path.length,
          want: g.taxi.dbg ? g.taxi.dbg.wanted : null,
          // taxi rimasti "presi in carico" e quindi non guidati da nessuno:
          // se questo numero cresce c'e' una perdita
          congelati: g.traffic.cars.filter((c) => c.hired).length,
        });
      }
      if (Math.round(t * 60) % 900 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    let esito;
    if (g.taxi.state === 'waiting') esito = 'arrivato';
    else if (!g.taxi.taxi) esito = 'rinunciato';
    else if (minDist < 8) esito = 'arrivato ma non si ferma';
    else esito = 'bloccato per strada';

    results.push({
      esito,
      secondi: +t.toFixed(0),
      partenzaDaTe: +partenza.toFixed(0),
      dalTraffico,
      distanzaMinima: minDist === Infinity ? null : +minDist.toFixed(0),
      fuoriStrada: +((fuori / Math.max(1, campioni)) * 100).toFixed(0),
      retromarce: +((retro / Math.max(1, campioni)) * 100).toFixed(0),
      ultimo, primi,
    });

    g.taxi.drop();
    g.taxi.state = null;
    g.taxi.taxi = null;
  }
  return results;
}, { CALLS, LIMIT });

for (const r of out) {
  console.log(JSON.stringify(r));
}
const ok = out.filter((r) => r.esito === 'arrivato').length;
console.log(`\narrivati ${ok} su ${out.length}`);
await b.close();
