/**
 * Crea una versione del gioco in un unico file HTML (CSS, JavaScript e
 * three.js inclusi): comoda da mandare via chat, da aprire con doppio clic
 * o da pubblicare dove non si possono caricare piu' file.
 *
 *   npm i -D esbuild && node tools/build-single.mjs
 *
 * Il risultato finisce in dist/nova-city.html. Il file non contiene i tag
 * <html>/<head>/<body>: i browser li aggiungono da soli ed e' il formato
 * richiesto dagli host che incapsulano la pagina.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  console.error('Serve esbuild:  npm i -D esbuild');
  process.exit(1);
}

const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
const css = await readFile(resolve(ROOT, 'styles.css'), 'utf8');

const bundle = await esbuild.build({
  entryPoints: [resolve(ROOT, 'src/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  legalComments: 'inline',
  alias: { three: resolve(ROOT, 'vendor/three.module.min.js') },
  write: false,
});
const js = bundle.outputFiles[0].text;

/*
 * Le texture fotografiche finiscono dentro la pagina come data URI: il file
 * unico non puo' andare a prendersi assets/tex/ da nessuna parte. Il gioco
 * cerca prima globalThis.NOVA_TEX e solo se manca scarica dalla cartella.
 */
const texDir = resolve(ROOT, 'assets/tex');
const tex = {};
let texBytes = 0;
try {
  for (const f of await readdir(texDir)) {
    if (!f.endsWith('.jpg')) continue;
    const raw = await readFile(resolve(texDir, f));
    texBytes += raw.length;
    tex[f] = `data:image/jpeg;base64,${raw.toString('base64')}`;
  }
} catch { /* nessuna texture: il gioco usa quelle disegnate a mano */ }

// stessa cosa per i modelli dei veicoli
const meshDir = resolve(ROOT, 'assets/models');
const meshes = {};
let meshBytes = 0;
try {
  for (const f of await readdir(meshDir)) {
    if (!f.endsWith('.bin')) continue;
    const raw = await readFile(resolve(meshDir, f));
    meshBytes += raw.length;
    meshes[f] = `data:application/octet-stream;base64,${raw.toString('base64')}`;
  }
} catch { /* nessun modello: restano le auto costruite a mano */ }

// dall'index tengo solo il contenuto del body, senza gli script esterni
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

const out = `<title>NOVA CITY</title>
<style>
${css}
</style>
${body}
<script>globalThis.NOVA_TEX = ${JSON.stringify(tex)};globalThis.NOVA_MESH = ${JSON.stringify(meshes)};</script>
<script type="module">
${js}
</script>
`;

await mkdir(resolve(ROOT, 'dist'), { recursive: true });
await writeFile(resolve(ROOT, 'dist/nova-city.html'), out);
console.log(`dist/nova-city.html — ${(out.length / 1024).toFixed(0)} KB` +
  ` — texture ${(texBytes / 1024).toFixed(0)} KB, modelli ${(meshBytes / 1024).toFixed(0)} KB`);
