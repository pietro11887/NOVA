// Modalità di guida.
// - REALISTICA: la simulazione completa (gomme in temperatura, freni che si scaldano, danni e guasti).
// - ARCADE: guida indulgente sullo stile di iRacing Arcade. Stesse vetture e piste, ma la macchina
//   resta in strada da sola (si gira solo con le ruote sull'erba), frena di più, il freno motore conta,
//   gomme semplici (solo usura), danni come "salute" senza ritiri, taglio pista = +2 s,
//   scia più forte ed effetto elastico regolabili, rimessa in pista automatica.

export const ARCADE = {
  grip: 1.22,          // aderenza in più
  aiGrip: 1.10,        // quanto ne sfruttano i bot nel calcolo della velocità in curva (forza bassa)
  aiGripTop: 1.22,     // ...e alla forza massima: a 110 vanno come un giocatore perfetto
  aiPower: 0.12,       // potenza in più dei bot alla forza massima
  rear: 1.12,          // posteriore più piantato: niente sovrasterzo
  brake: 1.12,         // frenata più forte
  engineBrake: 1.8,    // freno motore (si frena poco, si alza il piede)
  wear: 0.5,           // usura gomme dimezzata
  dmgFx: 0.4,          // effetto dei danni sulla guida
  cutPenalty: 2,       // secondi per ogni taglio di pista
};

// scia: normale / forte / molto forte; elastico: spento / medio / forte
export const TOW_LEVELS = [1, 1.6, 2.2];
export const TOW_NAMES = ['Normale', 'Forte', 'Molto forte'];
export const RUBBER_NAMES = ['Spento', 'Medio', 'Forte'];
