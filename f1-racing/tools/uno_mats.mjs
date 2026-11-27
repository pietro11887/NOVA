// Fiat Uno Turbo i.e.: il file ha un solo materiale; si assegnano i colori veri pezzo per pezzo (dal nome)
import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO(); const doc = await io.read(process.argv[2]); const root = doc.getRoot();
const M = {};
const mat = (name, rgb, rough = 0.5, metal = 0, alpha = 1) => M[name] || (M[name] = doc.createMaterial(name).setBaseColorFactor([...rgb, alpha]).setRoughnessFactor(rough).setMetallicFactor(metal).setAlphaMode(alpha < 1 ? 'BLEND' : 'OPAQUE'));
const RULES = [
  [/^pneus/, () => mat('UNO_TYRE', [0.04, 0.04, 0.045], 0.9)],
  [/^aro|^parafusos/, () => mat('UNO_RIM', [0.62, 0.64, 0.67], 0.3, 0.75)],
  [/^capo$|^chassis00[14]$|^porta_malas$/, () => mat('UNO_BODY', [0.8, 0.05, 0.06], 0.32, 0.25)],
  [/^vidros$/, () => mat('glass', [0.1, 0.13, 0.19], 0.05, 0, 0.35)],
  [/^lentes$|^farol_frontal$|^lampadas$/, () => mat('CHROME', [0.75, 0.78, 0.8], 0.1, 0.85)],
  [/^farol_traseiro$/, () => mat('Light', [0.7, 0.05, 0.04], 0.3)],
  [/^seta$/, () => mat('UNO_SETA', [0.95, 0.5, 0.08], 0.3)],
  [/^placa$/, () => mat('UNO_PLATE', [0.93, 0.93, 0.9], 0.6)],
  [/^logo/, () => mat('UNO_LOGO', [0.85, 0.86, 0.88], 0.25, 0.6)],
  [/^escape$|^caixa$|^tanque$/, () => mat('UNO_METAL', [0.35, 0.36, 0.38], 0.5, 0.6)],
  // paraurti, spoiler, griglie, guarnizioni, specchi, sottoscocca: plastica nera
  [/.*/, () => mat('UNO_PLASTIC', [0.06, 0.06, 0.065], 0.6)],
];
for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; const nm = n.getName();
  const r = RULES.find(([re]) => re.test(nm)); for (const p of m.listPrimitives()) p.setMaterial(r[1]()); }
for (const m of root.listMaterials()) if (!Object.values(M).includes(m)) m.dispose();
await io.write(process.argv[3], doc);
console.log('materiali', Object.keys(M).join(','));
