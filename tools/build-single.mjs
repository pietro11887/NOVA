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
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
<script type="module">
${js}
</script>
`;

await mkdir(resolve(ROOT, 'dist'), { recursive: true });
await writeFile(resolve(ROOT, 'dist/nova-city.html'), out);
console.log(`dist/nova-city.html — ${(out.length / 1024).toFixed(0)} KB`);
