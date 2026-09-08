/**
 * La visuale si gira anche da passeggero?
 *
 * Simula il taxi in corsa e muove il dito: se l'angolo della camera non
 * cambia, il giocatore e' inchiodato a guardare la nuca del tassista.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 420, height: 240 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await p.goto('http://127.0.0.1:8123/index.html?q=2&shot=1');
await p.waitForFunction(() => window.game && window.game.phone, null, { timeout: 240000 });
await p.evaluate(() => window.game.start());

const out = await p.evaluate(() => {
  const g = window.game;
  const gira = (etichetta) => {
    const prima = g.player.camYaw;
    for (let i = 0; i < 10; i++) { g.input.look.x = 0.05; g.update(1 / 60); }
    return { dove: etichetta, girato: +(g.player.camYaw - prima).toFixed(3) };
  };
  const res = [];
  res.push(gira('a piedi'));

  // passeggero: stato di corsa con una vettura del traffico sotto
  const auto = g.traffic.cars[0].v;
  g.player.inTaxi = true;
  g.player.rideCar = auto;
  const statoVero = g.taxi.state;
  g.taxi.state = 'riding';
  res.push(gira('in taxi'));
  g.taxi.state = statoVero;
  g.player.inTaxi = false;
  g.player.rideCar = null;

  // e a menu aperto deve restare ferma
  g.map.open = true;
  res.push(gira('con la mappa aperta'));
  g.map.open = false;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
