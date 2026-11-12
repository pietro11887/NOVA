// Mette il numero di versione negli indirizzi dei moduli, così Safari (che tiene i file in memoria a lungo)
// non mescola file vecchi e nuovi dopo un aggiornamento.
//   uso: node tools/stamp.mjs 156
// - moduli che importano altri moduli: ?v=<versione> (cambiano a ogni versione)
// - moduli "foglia" (dati delle piste, ecc.): ?v=<impronta del contenuto> (si riscaricano solo se cambiano)
// - index.html: main.js e style.css con la versione, etichetta "vNNN" nel menu e nella diagnostica
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const N = process.argv[2];
if (!/^\d+$/.test(N || '')) { console.error('uso: node tools/stamp.mjs <numero versione>'); process.exit(1); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } })(SRC);

const STATIC = /((?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"?]+\.js)(\?v=[^'"]*)?\2/g;
const DYN = /(import\(\s*`)(\.\/[^`?]*\$\{[^`]*\.js)(\?v=[^`]*)?`/g;
const clean = s => s.replace(STATIC, (m, a, q, p) => a + q + p + q).replace(DYN, (m, a, p) => a + p + '`');
const hasImports = s => { STATIC.lastIndex = 0; const r = STATIC.test(s) || /import\(\s*`/.test(s); STATIC.lastIndex = 0; return r; };

const src = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
const stampOf = new Map();
for (const [f, s] of src) {
  const c = clean(s);
  stampOf.set(f, hasImports(c) ? N : crypto.createHash('sha1').update(c).digest('hex').slice(0, 8));
}
let changed = 0;
for (const [f, s] of src) {
  const out = s.replace(STATIC, (m, a, q, p) => {
    const target = path.resolve(path.dirname(f), p);
    const v = stampOf.get(target) || N;
    return `${a}${q}${p}?v=${v}${q}`;
  }).replace(DYN, (m, a, p) => `${a}${p}?v=${N}\``);
  if (out !== s) { fs.writeFileSync(f, out); changed++; }
}
const idx = path.join(ROOT, 'index.html');
let h = fs.readFileSync(idx, 'utf8');
h = h.replace(/src="src\/main\.js(\?v=\d+)?"/, `src="src/main.js?v=${N}"`)
  .replace(/href="style\.css(\?v=\d+)?"/, `href="style.css?v=${N}"`)
  .replace(/>v\d+<\/span>/, `>v${N}</span>`);
fs.writeFileSync(idx, h);
const main = path.join(SRC, 'main.js');
fs.writeFileSync(main, fs.readFileSync(main, 'utf8').replace(/`v\d+ \$\{mode\}/, '`v' + N + ' ${mode}'));
console.log(`versione ${N}: ${changed} moduli aggiornati`);
