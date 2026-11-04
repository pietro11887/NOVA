// Meteo della sessione: asciutto, pioggia leggera o pioggia forte.
// Si legge una volta all'avvio dalle impostazioni salvate (cambiarlo ricarica la pagina, come l'ora del giorno),
// così fisica, linea ideale, bot e grafica usano tutti la stessa pista bagnata.

let mode = 'dry';
try {
  const s = JSON.parse(localStorage.getItem('novaf1.settings') || '{}');
  if (s && (s.weather === 'light' || s.weather === 'heavy')) mode = s.weather;
} catch (e) { /* storage non disponibile: asciutto */ }

// rain: quanta pioggia cade (grafica); wet: quanta acqua c'è sull'asfalto (aderenza)
export const WX = {
  mode,
  rain: mode === 'heavy' ? 1 : mode === 'light' ? 0.42 : 0,
  wet: mode === 'heavy' ? 1 : mode === 'light' ? 0.5 : 0,
};
export const WET = WX.wet > 0;

// aderenza delle gomme rispetto alla slick sull'asciutto, a seconda di quanta acqua c'è (0, 0.5, 1)
// slick: sul bagnato non scarica l'acqua e scivola; intermedia: la migliore con poca acqua;
// da bagnato: la migliore con tanta acqua; sull'asciutto le gomme da pioggia sono lente
const TABLE = {
  slick: [1.0, 0.72, 0.56],
  I: [0.9, 0.9, 0.78],
  W: [0.85, 0.86, 0.87],
};
export function wetGrip(compound, speed = 0, wet = WX.wet) {
  const T = TABLE[compound === 'I' || compound === 'W' ? compound : 'slick'];
  const k = Math.max(0, Math.min(1, wet)) * 2, i = Math.min(1, Math.floor(k)), f = k - i;
  let g = T[i] + (T[i + 1] - T[i]) * f;
  // acquaplaning: in rettilineo veloce le slick (e un po' le intermedie) galleggiano sull'acqua
  if (wet > 0 && speed > 40) {
    const a = compound === 'W' ? 0.01 : compound === 'I' ? 0.05 : 0.18;
    g *= 1 - a * wet * Math.min(1, (speed - 40) / 35);
  }
  return g;
}

// gomma migliore per la pista di oggi
export function bestCompound(fallback = 'M', wet = WX.wet) {
  if (wet <= 0.05) return fallback;
  return wet > 0.72 ? 'W' : 'I';
}

// quanto più piano si va in curva e in frenata (linea ideale e bot), con la gomma giusta
export const LINE_GRIP = WET ? wetGrip(bestCompound()) : 1;
