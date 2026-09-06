// Parametri globali del mondo. Tenerli in un solo posto rende facile
// ribilanciare la citta' senza andare a caccia di numeri magici.
export const CFG = {
  // --- griglia della citta' ---
  N: 8,            // numero di isolati per lato
  CELL: 80,        // passo della griglia (isolato + strada)
  ROAD: 16,        // larghezza carreggiata + marciapiedi
  WALK: 3,         // larghezza marciapiede
  LANE: 3.2,       // scostamento della corsia dal centro strada

  // --- gameplay ---
  PED_MAX_DESKTOP: 42,
  PED_MAX_MOBILE: 17,
  CAR_MAX_DESKTOP: 20,
  CAR_MAX_MOBILE: 9,
  PARKED_DESKTOP: 34,
  PARKED_MOBILE: 12,
  STREAM_RADIUS: 190,   // oltre questa distanza i bot vengono riciclati
  VIEW_FAR_DESKTOP: 420,
  VIEW_FAR_MOBILE: 260,

  DAY_LENGTH: 420,      // secondi per un ciclo giorno/notte completo
  WANTED_DECAY: 26,     // secondi senza crimini prima di perdere una stella

  SAVE_KEY: 'novacity.save.v1',
};

// Coordinata del centro della i-esima strada (i da 0 a N incluso).
export const road = (i) => i * CFG.CELL - (CFG.N * CFG.CELL) / 2;
export const WORLD_MIN = road(0) - CFG.ROAD / 2;
export const WORLD_MAX = road(CFG.N) + CFG.ROAD / 2;

// Estremi di un isolato (i,j): l'area edificabile tra due strade.
export function blockBounds(i, j) {
  const h = CFG.ROAD / 2;
  return {
    x0: road(i) + h, x1: road(i + 1) - h,
    z0: road(j) + h, z1: road(j + 1) - h,
    cx: (road(i) + road(i + 1)) / 2,
    cz: (road(j) + road(j + 1)) / 2,
  };
}
