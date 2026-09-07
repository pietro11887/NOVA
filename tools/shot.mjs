/**
 * Collaudo visivo: apre il gioco in un browser headless, lo fa partire,
 * mette il giocatore dove serve e salva uno screenshot.
 *
 *   node tools/shot.mjs <uscita.png> [--url=...] [--hour=13] [--pos=x,z]
 *                       [--look=gradi] [--pitch=gradi] [--wait=ms] [--eval=js]
 *
 * Nota: in headless i fotogrammi arrivano solo quando qualcuno li chiede,
 * quindi si scatta due volte con una pausa in mezzo — il primo scatto
 * spesso torna nero o a meta'.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const out = args[0];
const opt = (k, d) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};

const url = opt('url', 'http://127.0.0.1:8123/index.html?q=3&shot=1');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(String(e)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.game && window.game.phone && window.game.weather, null, { timeout: 180000 });
await page.evaluate(() => window.game.start());

const hour = Number(opt('hour', '13'));
const pos = opt('pos', '');
const look = Number(opt('look', '0'));
const pitch = Number(opt('pitch', '-8'));
await page.evaluate(({ hour, pos, look, pitch }) => {
  const g = window.game;
  g.clock = hour;
  if (pos) {
    const [x, z] = pos.split(',').map(Number);
    g.player.place(x, z, 0);
  }
  g.player.camYaw = look * Math.PI / 180;
  g.player.camPitch = pitch * Math.PI / 180;
  g.sky.update(g.clock, g.player.mesh ? g.player.mesh.position : { x: 0, y: 0, z: 0 });
}, { hour, pos, look, pitch });

// qualche passo di simulazione perche' luci, streaming e LOD si assestino
await page.evaluate(async () => {
  for (let i = 0; i < 20; i++) {
    window.game.update(1 / 60);
    await new Promise((r) => requestAnimationFrame(r));
  }
});

const extra = opt('eval', '');
if (extra) await page.evaluate(extra);

await page.waitForTimeout(Number(opt('wait', '600')));

/*
 * Il fotogramma si legge dal canvas, non dalla finestra: lo screenshot del
 * browser in headless cattura spesso un frame a meta' (mezzo schermo nero).
 * Con preserveDrawingBuffer attivo (?shot=1) il contenuto resta nel buffer
 * e toDataURL restituisce sempre l'ultimo disegno completo.
 */
const cam = opt('cam', '');
const png = await page.evaluate(async (cam) => {
  const g = window.game;
  for (let i = 0; i < 3; i++) {
    g.update(1 / 60);
    await new Promise((r) => requestAnimationFrame(r));
  }
  // disegno e lettura nello stesso blocco sincrono: se in mezzo ci finisce
  // un await, il compositore puo' svuotare il buffer e si legge nero
  if (cam.startsWith('road:')) {
    // in mezzo alla carreggiata, all'altezza degli occhi di chi guida:
    // il punto di vista che conta per giudicare l'asfalto
    const [idx, h] = cam.slice(5).split(',').map(Number);
    const nodes = g.city.roadNodes;
    const a = nodes[idx % nodes.length];
    const b = nodes[a.links[0]];
    g.camera.position.set(a.x, h || 1.5, a.z);
    g.camera.lookAt(b.x, (h || 1.5) - 0.55, b.z);
  } else if (cam) {
    // camera libera: utile per guardare la citta' dall'alto nei collaudi
    const n = cam.split(',').map(Number);
    g.camera.position.set(n[0], n[1], n[2]);
    g.camera.lookAt(n[3], n[4], n[5]);
  } else {
    g.player.applyCamera(g.camera);
  }
  if (g.post && g.post.enabled) g.post.render(1 / 60);
  else g.renderer.render(g.scene, g.camera);
  // SwiftShader rasterizza su piu' thread: senza finish() si legge un
  // fotogramma disegnato a meta' (mezzo schermo nero)
  g.renderer.getContext().finish();
  return document.getElementById('scene').toDataURL('image/png');
}, cam);
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));

const info = await page.evaluate(() => ({
  fps: Math.round(window.game.fpsAvg),
  tier: window.game.quality.tier,
  road: window.game.city.mats.road.map ? window.game.city.mats.road.map.image?.src?.slice(-24) : 'nessuna',
  pbr: !!window.game.pbr,
}));
console.log(JSON.stringify(info));
if (problems.length) console.log('ERRORI:\n' + problems.slice(0, 12).join('\n'));
await browser.close();
