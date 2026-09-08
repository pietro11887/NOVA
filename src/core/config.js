// Parametri globali del mondo. Tenerli in un solo posto rende facile
// ribilanciare la citta' senza andare a caccia di numeri magici.
export const CFG = {
  // --- griglia della citta' ---
  N: 8,            // numero di isolati per lato
  ROAD: 16,        // larghezza carreggiata + marciapiedi
  WALK: 3,         // larghezza marciapiede
  LANE: 3.2,       // scostamento della corsia dal centro strada

  // --- gameplay ---
  // Densita' della citta'. Le auto in circolazione seguono corsie e
  // semafori, quindi si possono tenere alte senza che si accavallino.
  /*
   * Quanta vita c'e' in giro. Il telefono aveva quattordici auto in tutta
   * l'area caricata: in una citta' di questa taglia sembrava deserta. Ora
   * il numero e' quello di una metropoli e a diradarlo, se il telefono
   * arranca, ci pensa la qualita' automatica.
   */
  PED_MAX_DESKTOP: 170,
  PED_MAX_MOBILE: 70,
  CAR_MAX_DESKTOP: 84,
  CAR_MAX_MOBILE: 38,
  PARKED_DESKTOP: 120,
  PARKED_MOBILE: 45,
  STREAM_RADIUS: 210,   // oltre questa distanza i bot vengono riciclati
  VIEW_FAR_DESKTOP: 420,
  VIEW_FAR_MOBILE: 260,

  DAY_LENGTH: 420,      // secondi per un ciclo giorno/notte completo
  WANTED_DECAY: 26,     // secondi senza crimini prima di perdere una stella

  SAVE_KEY: 'novacity.save.v1',
};

/**
 * La griglia non e' regolare: ogni colonna e ogni riga ha la sua larghezza,
 * cosi' la citta' non sembra un foglio a quadretti. Le misure sono
 * deterministiche, quindi la mappa e' sempre la stessa.
 */
function spans(seed, n) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sizes = [56, 64, 72, 84, 96, 112, 128];
  const out = [];
  let prev = -1;
  for (let i = 0; i < n; i++) {
    let v;
    do { v = sizes[(rnd() * sizes.length) | 0]; } while (Math.abs(v - prev) < 8 && rnd() < 0.7);
    prev = v;
    out.push(v);
  }
  return out;
}

function lines(spanList) {
  const total = spanList.reduce((a, b) => a + b, 0);
  const out = [-total / 2];
  for (const s of spanList) out.push(out[out.length - 1] + s);
  return out;
}

export const SPAN_X = spans(0x51ce, CFG.N);
export const SPAN_Z = spans(0x9d3b, CFG.N);
export const ROAD_X = lines(SPAN_X);
export const ROAD_Z = lines(SPAN_Z);

const clampIdx = (i, n) => (i < 0 ? 0 : i > n ? n : i);
/** Centro della i-esima strada nord-sud / est-ovest. */
export const roadX = (i) => ROAD_X[clampIdx(i, CFG.N)];
export const roadZ = (j) => ROAD_Z[clampIdx(j, CFG.N)];

export const WORLD_MIN = Math.min(ROAD_X[0], ROAD_Z[0]) - CFG.ROAD / 2;
export const WORLD_MAX = Math.max(ROAD_X[CFG.N], ROAD_Z[CFG.N]) + CFG.ROAD / 2;

// Estremi di un isolato (i,j): l'area edificabile tra due strade.
export function blockBounds(i, j) {
  const h = CFG.ROAD / 2;
  return {
    x0: roadX(i) + h, x1: roadX(i + 1) - h,
    z0: roadZ(j) + h, z1: roadZ(j + 1) - h,
    cx: (roadX(i) + roadX(i + 1)) / 2,
    cz: (roadZ(j) + roadZ(j + 1)) / 2,
  };
}
