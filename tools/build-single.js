// ============================================================
// Quanto Basta — crea una versione a file unico dell'app
// Uso: node tools/build-single.js [destinazione.html]
//
// La versione normale (index.html + photos/) è quella da pubblicare sul web:
// il browser scarica solo le foto che servono e le tiene in cache.
// Questa versione incorpora tutto in un file solo: utile per aprirla senza
// server, mandarla via chat o pubblicarla come pagina singola.
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const dest = process.argv[2] || path.join(ROOT, "quanto-basta.html");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// --- foto: da percorso a data URI ---
const inline = (js) =>
  js.replace(/"(photos\/[^"]+\.jpg)"/g, (m, rel) => {
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return m;
    return `"data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}"`;
  });

let out = html;
for (const f of ["icons.js", "photos.js", "steps.js", "data.js"]) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  out = out.replace(`<script src="${f}"></script>`, "<script>\n" + inline(src) + "\n</script>");
}
// anche l'icona nel manifest e i meta non servono in un file singolo
out = out.replace(/\n<link rel="manifest"[^>]*>/g, "");

fs.writeFileSync(dest, out);
console.log(`${path.relative(ROOT, dest)}: ${(fs.statSync(dest).size / 1048576).toFixed(2)} MB`);
