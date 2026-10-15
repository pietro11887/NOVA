// Flashback (come nei giochi di F1): ogni mezzo secondo si salva lo stato completo della gara
// (fisica, danni, gomme e benzina di tutte le vetture, piloti automatici, classifica, safety car,
// rottami). Dal menu di pausa si torna indietro fino a 10 secondi e si riparte da lì.

export const FB_EVERY = 0.5, FB_KEEP = 10.5;

// copia profonda dei dati (le istanze di classi diverse da vettori/colori restano condivise)
function dc(v, depth = 0) {
  if (v === null || typeof v !== 'object') return v;
  if (depth > 6) return v;
  if (ArrayBuffer.isView(v)) return v.slice();
  if (Array.isArray(v)) return v.length > 4000 ? v : v.map(x => dc(x, depth + 1));
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, dc(x, depth + 1)]));
  if (v instanceof Set) return new Set(v);
  if (v.isVector3 || v.isVector2 || v.isQuaternion || v.isEuler || v.isColor) return v.clone();
  const proto = Object.getPrototypeOf(v);
  if (proto === Object.prototype || proto === null) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = dc(v[k], depth + 1);
    return o;
  }
  return v;
}

// proprietà dell'oggetto (refs: chiavi da tenere come riferimento)
export function snapOwn(obj, refs = []) {
  const R = new Set(refs), o = {};
  for (const k of Object.keys(obj)) o[k] = R.has(k) ? obj[k] : dc(obj[k]);
  return o;
}
export function restoreOwn(obj, saved, refs = []) {
  const R = new Set(refs);
  // le proprietà nate dopo il salvataggio (guasti, errori, attacchi...) spariscono
  for (const k of Object.keys(obj)) if (!(k in saved) && !R.has(k)) delete obj[k];
  for (const k of Object.keys(saved)) obj[k] = R.has(k) ? saved[k] : dc(saved[k]);
}
// istanza intera (es. sosta ai box in corso)
export function snapInst(inst, refs = []) { return inst ? { proto: Object.getPrototypeOf(inst), own: snapOwn(inst, refs) } : null; }
export function restoreInst(s, refs = []) {
  if (!s) return null;
  const o = Object.create(s.proto);
  restoreOwn(o, s.own, refs);
  return o;
}

const CAR_REFS = ['phys', 'ai', 'model', 'team', 'pit'];
const PIT_REFS = ['lane', 'car', 'plan'];
const PHYS_REFS = ['track', 'hazards', 'listeners', '_listeners', 'events', 'handlers'];
const AI_REFS = ['phys', 'line', 'track', 'chicane', 'nextApex'];
const SC_REFS = ['race', 'track', 'line', 'debris', 'scene', 'model', 'onEvent', 'lightMat', '_seen'];
const RACE_REFS = ['track', 'line', 'cars', 'pitLane', 'onEvent', 'player'];

// stato di tutta la gara
export function snapRace(race, sc, debris, extra) {
  return {
    t: race.t,
    race: snapOwn(race, RACE_REFS),
    cars: race.cars.map(c => ({
      own: snapOwn(c, CAR_REFS),
      pit: snapInst(c.pit, PIT_REFS),
      phys: snapOwn(c.phys, PHYS_REFS),
      ai: c.ai ? snapOwn(c.ai, AI_REFS) : null,
    })),
    sc: sc ? { own: snapOwn(sc, SC_REFS), vis: sc.model ? sc.model.root.visible : false } : null,
    debris: {
      parts: debris.parts.length,
      items: debris.items.map(it => ({ it, p: it.obj.position.clone(), q: it.obj.quaternion.clone(), v: it.v.clone(), w: it.w.clone(), rest: it.rest, hint: it.hint, kick: it.kick })),
    },
    extra: dc(extra),
  };
}

export function restoreRace(S, race, sc, debris, scene) {
  restoreOwn(race, S.race, RACE_REFS);
  race.cars.forEach((c, k) => {
    const s = S.cars[k];
    restoreOwn(c, s.own, CAR_REFS);
    c.pit = restoreInst(s.pit, PIT_REFS);
    restoreOwn(c.phys, s.phys, PHYS_REFS);
    if (c.ai && s.ai) restoreOwn(c.ai, s.ai, AI_REFS);
  });
  if (sc && S.sc) { restoreOwn(sc, S.sc.own, SC_REFS); if (sc.model) sc.model.root.visible = S.sc.vis; }
  // pezzi staccati dopo il salvataggio: tornano sulle vetture
  const D = S.debris;
  while (debris.parts.length > D.parts) { const o = debris.parts.pop(); o.userData.detached = false; o.visible = true; }
  const keep = new Set(D.items.map(x => x.it));
  for (const it of debris.items) if (!keep.has(it)) scene.remove(it.obj);
  debris.items = D.items.map(x => {
    const it = x.it;
    if (!it.obj.parent) scene.add(it.obj);             // rimosso dai commissari dopo il salvataggio
    it.obj.position.copy(x.p); it.obj.quaternion.copy(x.q); it.v.copy(x.v); it.w.copy(x.w);
    it.rest = x.rest; it.hint = x.hint; it.kick = x.kick;
    return it;
  });
  return dc(S.extra);
}
