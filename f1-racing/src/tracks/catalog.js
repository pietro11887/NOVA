import { CONTROL_POINTS } from '../trackData.js';

// Elenco dei circuiti per il menu: nome, dati principali e sagoma per l'anteprima.
// (la sagoma di Baku è una versione leggera del tracciato OSM, così il menu non deve
// caricare tutta la città)
function smoothLoop(P, k = 8) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, e) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (-a + 3 * b - 3 * c + e) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

export const TRACKS = [
  {
    id: 'nova', name: 'Circuito Nova', place: 'Circuito permanente', flag: ['#6a2cd8', '#ff8a1c'],
    km: '3,75', corners: 26, info: 'Tornanti, esse e chicane tra lago e colline',
    outline: smoothLoop(CONTROL_POINTS.map(p => [p[0], p[2]])),
  },
  {
    id: 'baku', name: 'Baku City Circuit', place: 'Azerbaigian · cittadino', flag: ['#00b5e2', '#ef3340', '#509e2f'],
    km: '6,00', corners: 20, info: 'Rettilineo di 2,2 km, castello largo 7,6 m, mura della Città Vecchia',
    outline: smoothLoop([[1034,-367],[1222,-449],[1225,-463],[1211,-501],[1193,-542],[1181,-567],[1136,-660],[1129,-677],[1120,-696],[1096,-752],[1087,-760],[1074,-759],[940,-708],[920,-700],[913,-697],[772,-639],[755,-632],[525,-528],[509,-521],[300,-423],[295,-412],[316,-347],[319,-338],[323,-327],[368,-218],[363,-202],[329,-183],[279,-161],[230,-140],[215,-134],[119,-75],[99,-60],[88,-48],[85,-40],[85,-31],[96,4],[95,13],[92,20],[37,63],[-146,204],[-183,232],[-193,241],[-201,246],[-218,246],[-223,243],[-284,63],[-289,60],[-296,60],[-304,63],[-309,62],[-332,49],[-337,48],[-345,48],[-364,49],[-378,49],[-383,49],[-388,46],[-391,41],[-407,-8],[-410,-12],[-417,-14],[-430,-13],[-510,16],[-522,21],[-628,70],[-705,114],[-752,144],[-761,151],[-764,156],[-772,167],[-776,178],[-793,236],[-823,334],[-827,346],[-829,361],[-829,379],[-824,448],[-817,551],[-817,587],[-816,594],[-814,597],[-808,600],[-639,688],[-591,712],[-526,746],[-506,750],[-494,744],[-448,661],[-401,573],[-282,462],[-246,421],[-235,401],[-223,366],[-202,275],[-190,254],[-186,250],[-177,242],[-114,194],[11,97],[71,52],[86,42],[187,-5],[413,-101],[575,-171],[669,-211],[680,-216],[830,-279],[843,-285],[932,-323]], 3),
  },
];

// sagoma come percorso SVG nel riquadro w × h
export function outlinePath(t, w, h, pad = 8) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of t.outline) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const s = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (z1 - z0));
  const ox = (w - (x1 - x0) * s) / 2, oz = (h - (z1 - z0) * s) / 2;
  const P = t.outline.map(([x, z]) => [ox + (x - x0) * s, oz + (z - z0) * s]);
  return { d: 'M' + P.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z', start: P[0] };
}
