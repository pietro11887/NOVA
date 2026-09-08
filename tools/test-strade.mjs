/**
 * Come si comporta il traffico, in numeri.
 *
 * Misura le cose che si notano giocando e che non si vedono da un
 * fotogramma: quante botte prendono le auto, quante restano ferme in mezzo
 * alla carreggiata, quanto stanno nella loro corsia e quante volte vanno
 * contromano.
 *
 *   node tools/test-strade.mjs [secondi]
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const SECONDI = Number(process.argv[2] || 90);
const URL = process.env.NOVA_URL || 'http://127.0.0.1:8123/index.html?q=2&shot=1';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await p.goto(URL);
await p.waitForFunction(() => window.game && window.game.phone, null, { timeout: 300000 });
await p.evaluate(() => {
  window.game.start();
  // la qualita' automatica cambia il numero di auto a meta' misura e rende
  // i confronti privi di senso: qui resta ferma
  window.game.quality.mode = 'fisso';
});

const out = await p.evaluate(async (SECONDI) => {
  const g = window.game;
  const LANE = 2.5, HALF = 5;

  /*
   * Dove si trova un veicolo rispetto alla strada: distanza dall'asse,
   * scarto dalla propria corsia e se sta a destra o a sinistra rispetto a
   * dove sta andando. Il segno e' quello che dice se va contromano.
   */
  const suStrada = (v) => {
    let best = null, bd = Infinity;
    for (const n of g.city.roadNodes) {
      for (const k of n.links) {
        const m = g.city.roadNodes[k];
        const dx = m.x - n.x, dz = m.z - n.z;
        const len2 = dx * dx + dz * dz;
        if (!len2) continue;
        let t = ((v.x - n.x) * dx + (v.z - n.z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = n.x + dx * t, pz = n.z + dz * t;
        const d = Math.hypot(px - v.x, pz - v.z);
        if (d < bd) { bd = d; best = { n, m, px, pz, dx, dz, len: Math.sqrt(len2) }; }
      }
    }
    if (!best) return null;
    const ux = best.dx / best.len, uz = best.dz / best.len;
    // destra rispetto alla direzione del tratto
    const rx = uz, rz = -ux;
    const lat = (v.x - best.px) * rx + (v.z - best.pz) * rz;
    // verso di marcia lungo il tratto: +1 se va come il tratto
    const verso = (v.fx * ux + v.fz * uz) >= 0 ? 1 : -1;
    // la corsia giusta e' a destra di dove si va: lat*verso deve valere +LANE
    return { dist: bd, lat, verso, scarto: Math.abs(lat * verso - LANE), controsenso: lat * verso < 0 };
  };

  // --- ferme dove non dovrebbero: si guarda la geometria, non il movimento
  let parcheggiateInCarreggiata = 0;
  for (const v of g.traffic.parked) {
    const s = suStrada(v);
    if (s && s.dist < 3.6) parcheggiateInCarreggiata++;
  }

  // --- urti: si intercetta la collisione alla radice
  let urti = 0, urtiForti = 0;
  // di che tipo sono le botte: tamponamento, incrocio, frontale, o contro
  // qualcosa di fermo. Sapere quale serve a sapere cosa aggiustare.
  const tipi = { tamponamento: 0, incrocio: 0, frontale: 0, controFermo: 0 };
  const schede = [];
  const dovePiu = new Map();
  const proto = Object.getPrototypeOf(g.traffic.cars[0].v);
  const orig = proto.collideWith;
  proto.collideWith = function (o) {
    const r = orig.call(this, o);
    if (r > 4) {
      urti++;
      if (r > 8) urtiForti++;
      const cos = this.fx * o.fx + this.fz * o.fz;
      const fermo = Math.abs(this.speed) < 0.5 || Math.abs(o.speed) < 0.5;
      if (fermo) tipi.controFermo++;
      else if (cos > 0.6) tipi.tamponamento++;
      else if (cos < -0.6) tipi.frontale++;
      else tipi.incrocio++;
      /*
       * Chi aveva il verde. L'asse di marcia si legge dal muso; se in un
       * urto una delle due aveva il rosso ed era lanciata, il semaforo non
       * lo stava rispettando nessuno.
       */
      const asse = (u) => (Math.abs(u.fx) > Math.abs(u.fz) ? 0 : 1);
      const rosso = (u) => asse(u) !== g.trafficAxis || g.trafficAllRed;
      if (rosso(this) && Math.abs(this.speed) > 3) tipi.colRosso = (tipi.colRosso || 0) + 1;
      if (rosso(o) && Math.abs(o.speed) > 3) tipi.colRosso = (tipi.colRosso || 0) + 1;
      // scheda del singolo urto: com'erano messe le due vetture
      if (schede.length < 14) {
        const dati = (u) => {
          const t2 = g.traffic.cars.find((c) => c.v === u);
          const mk = t2 && t2.marks && t2.marks[Math.min(t2.st.i, t2.marks.length - 1)];
          return {
            vel: +u.speed.toFixed(1),
            dir: +(Math.atan2(-u.fz, u.fx) * 57.3).toFixed(0),
            asse: mk ? mk.axis : null,
            svolta: mk ? mk.svolta : null,
            allIncrocio: mk ? +(Math.hypot(u.x - mk.node.x, u.z - mk.node.z) - 6.6).toFixed(1) : null,
            sorpasso: t2 ? +(t2.sorpassoT || 0).toFixed(1) : null,
            fuori: t2 ? +(t2.fuoriT || 0).toFixed(1) : null,
          };
        };
        schede.push({
          forza: +r.toFixed(1), verde: g.trafficAxis,
          fase: g.trafficAllRed ? 'tuttoRosso' : g.trafficAmber ? 'giallo' : 'verde',
          a: dati(this), b: dati(o),
        });
      }
      // vicino a un incrocio?
      let vicino = false;
      for (const n of g.city.roadNodes) {
        if (Math.abs(n.x - this.x) < 12 && Math.abs(n.z - this.z) < 12) { vicino = true; break; }
      }
      dovePiu.set(vicino ? 'incrocio' : 'rettilineo',
        (dovePiu.get(vicino ? 'incrocio' : 'rettilineo') || 0) + 1);
    }
    return r;
  };

  const st = {
    campioni: 0, fuoriStrada: 0, controsenso: 0, inMoto: 0, fermeAlRosso: 0,
    scartoMedio: 0, ferme6s: 0, ferme6sConStradaLibera: 0, velocitaMedia: 0,
    motivoSemaforo: 0, motivoCoda: 0, motivoNessuno: 0,
    dentroIncrocio: 0, dentroColRosso: 0, passatiSulGiallo: 0, passatiSulTuttoRosso: 0,
    controsensoSorpasso: 0, controsensoDopoSorpasso: 0, controsensoRientro: 0, controsensoMistero: 0,
  };
  const stopMotivo = true;
  const fermoDa = new Map(), liberoDa = new Map(), prevD = new Map();

  const frames = SECONDI * 60;
  let msTotali = 0;
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    g.update(1 / 60);
    msTotali += performance.now() - t0;
    for (const t of g.traffic.cars) {
      const v = t.v;
      st.campioni++;
      st.velocitaMedia += Math.abs(v.speed);
      const s = suStrada(v);
      if (s) {
        if (s.dist > HALF + 1.5) st.fuoriStrada++;
        else {
          st.scartoMedio += s.scarto;
          // dentro l'incrocio la nozione di corsia non ha senso: si guarda
          // solo chi va contromano in rettilineo, e con uno scarto vero
          let inIncrocio = false;
          for (const n of g.city.roadNodes) {
            if (Math.abs(n.x - v.x) < 11 && Math.abs(n.z - v.z) < 11) { inIncrocio = true; break; }
          }
          if (!inIncrocio && s.controsenso && Math.abs(s.lat) > 0.8 && Math.abs(v.speed) > 1) {
            st.controsenso++;
            /*
             * Perche' e' finito nella corsia opposta: sta sorpassando, sta
             * rientrando da fuori strada, oppure ci e' finito e basta. E'
             * la domanda che decide cosa aggiustare.
             */
            if (t.sorpassoT > 0) st.controsensoSorpasso++;
            else if ((t.dopoSorpasso || 0) > 0) st.controsensoDopoSorpasso++;
            else if (t.fuoriT > 0 || t._rientrando) st.controsensoRientro++;
            else st.controsensoMistero++;
          }
        }
      }
      /*
       * Attraversamenti della linea d'arresto, contati nel momento esatto in
       * cui avvengono e con il semaforo che riguarda quel tratto: e' l'unico
       * modo di sapere chi passa col rosso davvero.
       */
      {
        const mark = t.marks && t.marks[Math.min(t.st.i, t.marks.length - 1)];
        if (mark) {
          const d = Math.hypot(v.x - mark.node.x, v.z - mark.node.z) - 6.6;
          const prima = prevD.get(t);
          if (prima !== undefined && prima > 0 && d <= 0 && Math.abs(v.speed) > 1) {
            st.dentroIncrocio++;
            if (mark.axis !== g.trafficAxis) st.dentroColRosso++;
            else if (g.trafficAllRed) st.passatiSulTuttoRosso++;
            else if (g.trafficAmber) st.passatiSulGiallo++;
          }
          prevD.set(t, d);
        }
      }
      if (Math.abs(v.speed) < 0.4) {
        // perche' e' fermo: semaforo, coda, o niente di niente
        const lead0 = g.leaderAhead(v, 26, true);
        if (t.dbgStop === undefined) t.dbgStop = 0;
        if (stopMotivo) {
          const mark = t.marks && t.marks[Math.min(t.st.i, t.marks.length - 1)];
          const rosso = mark && g.trafficAxis !== undefined
            ? Math.hypot(v.x - mark.node.x, v.z - mark.node.z) < 22 : false;
          if (rosso) st.motivoSemaforo++;
          else if (lead0.d < 9) st.motivoCoda++;
          else st.motivoNessuno++;
        }
        const k = (fermoDa.get(t) || 0) + 1 / 60;
        fermoDa.set(t, k);
        if (k > 6) {
          st.ferme6s++;
          const lead = g.leaderAhead(v, 26, true);
          const l = (liberoDa.get(t) || 0) + (lead.d > 9 ? 1 / 60 : -999);
          liberoDa.set(t, Math.max(0, l));
          if (l > 2) st.ferme6sConStradaLibera++;
        } else st.fermeAlRosso++;
      } else { fermoDa.set(t, 0); liberoDa.set(t, 0); st.inMoto++; }
    }
    if (i % 600 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  const pc = (n) => +((n / Math.max(1, st.campioni)) * 100).toFixed(1);
  let sorpassi = 0, abortiti = 0, retro = 0;
  for (const t of g.traffic.cars) {
    sorpassi += t.nSorpassi || 0;
    abortiti += t.nSorpassiAbortiti || 0;
    retro += t.nRetro || 0;
  }
  return {
    auto: g.traffic.cars.length,
    millisecondiPerFotogramma: +(msTotali / frames).toFixed(2),
    sorpassiIniziati: sorpassi, sorpassiAbortiti: abortiti, retromarce: retro,
    fermePerSemaforo: pc(st.motivoSemaforo), fermeInCoda: pc(st.motivoCoda),
    fermeSenzaMotivo: pc(st.motivoNessuno),
    parcheggiate: g.traffic.parked.length,
    parcheggiateInCarreggiata,
    urtiAlMinuto: +(urti / (SECONDI / 60)).toFixed(1),
    urtiPerTipo: tipi,
    schede,
    attraversamenti: st.dentroIncrocio,
    attraversamentiColRosso: st.dentroColRosso,
    attraversamentiSulGiallo: st.passatiSulGiallo,
    attraversamentiSulTuttoRosso: st.passatiSulTuttoRosso,
    percentualeColRosso: +((st.dentroColRosso / Math.max(1, st.dentroIncrocio)) * 100).toFixed(1),
    urtiDove: Object.fromEntries(dovePiu),
    urtiFortiAlMinuto: +(urtiForti / (SECONDI / 60)).toFixed(1),
    fuoriStradaPercento: pc(st.fuoriStrada),
    controsensoPercento: pc(st.controsenso),
    controsensoPerche: {
      sorpassoInCorso: st.controsensoSorpasso,
      appenaDopoIlSorpasso: st.controsensoDopoSorpasso,
      rientroDaFuoriStrada: st.controsensoRientro,
      senzaSpiegazione: st.controsensoMistero,
    },
    inMotoPercento: pc(st.inMoto),
    ferme6sPercento: pc(st.ferme6s),
    ferme6sStradaLiberaPercento: pc(st.ferme6sConStradaLibera),
    scartoMedioDallaCorsia: +(st.scartoMedio / Math.max(1, st.campioni - st.fuoriStrada)).toFixed(2),
    velocitaMedia: +(st.velocitaMedia / Math.max(1, st.campioni)).toFixed(2),
  };
}, SECONDI);

console.log(JSON.stringify(out, null, 1));
await b.close();
