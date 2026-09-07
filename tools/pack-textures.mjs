/**
 * Prepara le texture PBR scaricate (CC0) per il gioco.
 *
 * Da ogni set (colore, normali, rugosita', altezza, occlusione) tira fuori
 * tre soli file, perche' ogni richiesta in piu' e' un caricamento in piu':
 *
 *   <nome>_c.jpg   colore base
 *   <nome>_n.jpg   normali (OpenGL, Y in alto)
 *   <nome>_s.jpg   R = occlusione, G = rugosita', B = altezza
 *
 * Il canale "altezza" e' quello che serve al parallax occlusion mapping:
 * senza, crepe e giunti restano disegnati e piatti.
 *
 *   node tools/pack-textures.mjs <cartella-sorgenti> <cartella-uscita>
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [srcRoot, outDir] = process.argv.slice(2);
if (!srcRoot || !outDir) {
  console.error('uso: node tools/pack-textures.mjs <sorgenti> <uscita>');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

/** Nome nostro -> cartella del set scaricato. */
const SETS = JSON.parse(fs.readFileSync(path.join(srcRoot, 'sets.json'), 'utf8'));

const find = (dir, suffix) => {
  const hit = fs.readdirSync(dir).find((f) => f.endsWith(suffix));
  return hit ? path.join(dir, hit) : null;
};
const dataUri = (file) => `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto('about:blank');

const report = [];
for (const [name, cfg] of Object.entries(SETS)) {
  const dir = path.join(srcRoot, cfg.dir);
  const size = cfg.size || 1024;
  const src = {
    color: dataUri(find(dir, '_Color.jpg')),
    normal: dataUri(find(dir, '_NormalGL.jpg')),
    rough: dataUri(find(dir, '_Roughness.jpg')),
    height: dataUri(find(dir, '_Displacement.jpg')),
    ao: find(dir, '_AmbientOcclusion.jpg') ? dataUri(find(dir, '_AmbientOcclusion.jpg')) : null,
  };

  const outs = await page.evaluate(async ({ src, size, cfg }) => {
    const load = (u) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = u;
    });
    const cv = (w, h = w) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return [c, c.getContext('2d', { willReadFrequently: true })];
    };
    const draw = async (u) => {
      const im = await load(u);
      const [c, x] = cv(size);
      x.drawImage(im, 0, 0, size, size);
      return [c, x];
    };

    // --- colore: si puo' schiarire o desaturare per intonarlo alla citta'
    const [cc, cx] = await draw(src.color);
    if (cfg.gain !== 1 || cfg.saturation !== 1) {
      const g = cx.getImageData(0, 0, size, size), d = g.data;
      const gain = cfg.gain ?? 1, sat = cfg.saturation ?? 1;
      for (let i = 0; i < d.length; i += 4) {
        const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        for (let k = 0; k < 3; k++) {
          d[i + k] = Math.max(0, Math.min(255, (l + (d[i + k] - l) * sat) * gain));
        }
      }
      cx.putImageData(g, 0, 0);
    }

    const [cn] = await draw(src.normal);

    // --- pacchetto in ordine ORM, quello che three.js si aspetta:
    //     R = occlusione (aoMap), G = rugosita' (roughnessMap),
    //     B = altezza (la legge solo il nostro parallax).
    //     Cosi' una sola immagine alimenta tre canali senza campioni in piu'.
    const [, rx] = await draw(src.rough);
    const [, hx] = await draw(src.height);
    const aox = src.ao ? (await draw(src.ao))[1] : null;
    const R = rx.getImageData(0, 0, size, size).data;
    const H = hx.getImageData(0, 0, size, size).data;
    const A = aox ? aox.getImageData(0, 0, size, size).data : null;
    const [cs, sx] = cv(size);
    const out = sx.createImageData(size, size);
    const lo = cfg.roughMin ?? 0, hi = cfg.roughMax ?? 255;
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] = A ? A[i] : 255;
      out.data[i + 1] = lo + (R[i] / 255) * (hi - lo);
      out.data[i + 2] = H[i];
      out.data[i + 3] = 255;
    }
    sx.putImageData(out, 0, 0);

    return {
      c: cc.toDataURL('image/jpeg', cfg.qColor ?? 0.82),
      n: cn.toDataURL('image/jpeg', cfg.qNormal ?? 0.9),
      s: cs.toDataURL('image/jpeg', cfg.qPack ?? 0.85),
    };
  }, { src, size, cfg });

  for (const [suffix, uri] of Object.entries(outs)) {
    const file = path.join(outDir, `${name}_${suffix}.jpg`);
    fs.writeFileSync(file, Buffer.from(uri.split(',')[1], 'base64'));
    report.push([path.basename(file), fs.statSync(file).size]);
  }
}
await browser.close();

let total = 0;
for (const [f, s] of report) { total += s; console.log(`  ${f.padEnd(24)} ${(s / 1024).toFixed(0)} KB`); }
console.log(`totale ${(total / 1024).toFixed(0)} KB`);
