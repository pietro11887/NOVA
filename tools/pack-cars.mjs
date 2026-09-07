/**
 * Prepara le texture del pacchetto auto.
 *
 *   node tools/pack-cars.mjs <cartella textures> <uscita> <mappa.json>
 *
 * Per ogni carrozzeria escono due file:
 *   car_<nome>_c.jpg   colore
 *   car_<nome>_s.jpg   R = maschera vernice, G = rugosita', B = metallo
 *
 * La maschera vernice serve alla verniciatura del garage. Il colore in
 * questi modelli e' cotto dentro la texture (la berlina e' gialla e basta),
 * quindi si segna quali pixel appartengono alla carrozzeria — quelli con la
 * tinta dominante e abbastanza saturi — e in gioco si sostituisce solo la
 * tinta, tenendo la luminosita' originale. Cosi' ombreggiature, riflessi e
 * fughe delle portiere restano quelli disegnati.
 *
 * La rugosita' e' il complemento della lucidita' (i modelli usano il flusso
 * "specular/glossiness", three vuole "metallic/roughness").
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [srcDir, outDir, mapFile] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const MAP = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

const files = fs.readdirSync(srcDir);
const findFile = (re) => {
  const hit = files.find((f) => re.test(f));
  return hit ? path.join(srcDir, hit) : null;
};
const uri = (f) => (f ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : null);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto('about:blank');

const report = [];
async function build(outName, colorFile, metalFile, glossFile, size, wantMask) {
  const src = { color: uri(colorFile), metal: uri(metalFile), gloss: uri(glossFile) };
  if (!src.color) { console.warn(`manca il colore per ${outName}`); return; }

  const outs = await page.evaluate(async ({ src, size, wantMask }) => {
    const load = (u) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = u;
    });
    const cv = (w) => {
      const c = document.createElement('canvas');
      c.width = c.height = w;
      return [c, c.getContext('2d', { willReadFrequently: true })];
    };
    const draw = async (u) => {
      if (!u) return null;
      const im = await load(u);
      const [c, x] = cv(size);
      x.drawImage(im, 0, 0, size, size);
      return [c, x];
    };

    const [cc, cx] = await draw(src.color);
    const col = cx.getImageData(0, 0, size, size).data;

    const rgbToHsl = (r, g, b) => {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const l = (mx + mn) / 2;
      if (mx === mn) return [0, 0, l];
      const d = mx - mn;
      const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      let h;
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
      return [h, s, l];
    };

    /*
     * Tinta dominante: si guardano solo i pixel abbastanza saturi e si
     * prende la campana piu' alta dell'istogramma delle tinte. Le auto nere
     * o bianche non ne hanno una, e per quelle la maschera resta vuota:
     * meglio non verniciabili che verniciate a caso.
     */
    let mask = null, dominant = -1, coverage = 0;
    if (wantMask) {
      const bins = new Float64Array(72);
      for (let i = 0; i < col.length; i += 4) {
        const [h, s, l] = rgbToHsl(col[i], col[i + 1], col[i + 2]);
        if (s > 0.2 && l > 0.1 && l < 0.94) bins[Math.min(71, Math.floor(h * 72))] += 1;
      }
      let best = 0;
      for (let i = 0; i < 72; i++) if (bins[i] > bins[best]) best = i;
      if (bins[best] > size * size * 0.02) {
        dominant = best / 72;
        mask = new Uint8Array(size * size);
        let hit = 0;
        for (let i = 0, p = 0; i < col.length; i += 4, p++) {
          const [h, s, l] = rgbToHsl(col[i], col[i + 1], col[i + 2]);
          let dh = Math.abs(h - dominant);
          dh = Math.min(dh, 1 - dh);
          const ok = s > 0.16 && dh < 0.06 && l > 0.06 && l < 0.96;
          mask[p] = ok ? 255 : 0;
          if (ok) hit++;
        }
        coverage = hit / (size * size);
      }
    }

    const mx = await draw(src.metal);
    const gx = await draw(src.gloss);
    const M = mx ? mx[1].getImageData(0, 0, size, size).data : null;
    const G = gx ? gx[1].getImageData(0, 0, size, size).data : null;
    const [cs, sx] = cv(size);
    const out = sx.createImageData(size, size);
    for (let i = 0, p = 0; i < out.data.length; i += 4, p++) {
      out.data[i] = mask ? mask[p] : 0;
      // rugosita' = 1 - lucidita', con un minimo: niente specchi perfetti
      out.data[i + 1] = G ? Math.max(18, 255 - G[i]) : 140;
      out.data[i + 2] = M ? M[i] : 0;
      out.data[i + 3] = 255;
    }
    sx.putImageData(out, 0, 0);

    return {
      c: cc.toDataURL('image/jpeg', 0.84),
      s: cs.toDataURL('image/jpeg', 0.8),
      dominant, coverage,
    };
  }, { src, size, wantMask });

  let bytes = 0;
  for (const suffix of ['c', 's']) {
    const file = path.join(outDir, `${outName}_${suffix}.jpg`);
    const raw = Buffer.from(outs[suffix].split(',')[1], 'base64');
    fs.writeFileSync(file, raw);
    bytes += raw.length;
  }
  report.push({ outName, bytes, tinta: outs.dominant, copertura: outs.coverage });
}

/* --------------------------------------------------------- carrozzerie */

for (const car of MAP.cars) {
  const base = car.tex;
  await build(
    `car_${car.name}`,
    findFile(new RegExp(`^${base}[A-Z][a-z]+\\.png$`)) || findFile(new RegExp(`^${base}\\w*\\.png$`)),
    findFile(new RegExp(`^${base}_Metallic\\.png$`, 'i')),
    findFile(new RegExp(`^${base}_Glossiness\\.png$`, 'i')),
    car.size || 512, true
  );
}

/* -------------------------------------------------------------- cerchi */

for (const rim of MAP.rims) {
  await build(
    `rim_${rim.name.toLowerCase()}`,
    findFile(new RegExp(`^${rim.name}_Diffuse\\.png$`, 'i')),
    findFile(new RegExp(`^${rim.name}_Metallic\\.png$`, 'i')),
    findFile(new RegExp(`^${rim.name}_Glossiness\\.png$`, 'i')),
    rim.size || 256, false
  );
}

await browser.close();

let total = 0;
for (const r of report) {
  total += r.bytes;
  const paint = r.tinta >= 0 ? `tinta ${Math.round(r.tinta * 360)}° su ${(r.copertura * 100).toFixed(0)}% della texture` : 'non verniciabile';
  console.log(`  ${r.outName.padEnd(20)} ${String((r.bytes / 1024).toFixed(0)).padStart(4)} KB   ${paint}`);
}
console.log(`totale ${(total / 1024).toFixed(0)} KB`);
