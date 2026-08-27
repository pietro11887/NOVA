// ============================================================
// Quanto Basta — costruisce photos.js dalle foto in photos/
// Uso: node tools/build-photos.js
// Le foto vengono incorporate come data URI: l'app resta un file
// che funziona anche offline, senza richieste esterne.
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "photos");
const credits = JSON.parse(fs.readFileSync(path.join(DIR, "credits.json"), "utf8"));

// Le foto restano file separati: il browser scarica solo quelle che servono
// e le tiene in cache. La versione a file unico (anteprima) le incorpora
// al momento della build, vedi tools/build-single.js
let out = "// Foto dei piatti — generato da tools/build-photos.js, non modificare a mano.\n";
out += "// Fonte: Wikimedia Commons. Licenze libere (CC BY, CC BY-SA, CC0, pubblico dominio).\n";
out += "const PHOTOS = {\n";
let n = 0, bytes = 0;
for (const c of credits) {
  const file = path.join(DIR, c.id + ".jpg");
  if (!fs.existsSync(file)) continue;
  out += `  "${c.id}": "photos/${c.id}.jpg",\n`;
  n++; bytes += fs.statSync(file).size;
}
out += "};\n\nconst PHOTO_CREDITS = " + JSON.stringify(credits, null, 1) + ";\n";
fs.writeFileSync(path.join(ROOT, "photos.js"), out);
console.log(`photos.js: ${n} foto (${(bytes / 1048576).toFixed(2)} MB su disco, caricate su richiesta)`);

// ---- foto delle tecniche usate nella modalità cucina ----
const SDIR = path.join(DIR, "steps");
if (fs.existsSync(path.join(SDIR, "credits.json"))) {
  const sc = JSON.parse(fs.readFileSync(path.join(SDIR, "credits.json"), "utf8"));
  let so = "// Foto delle tecniche di cottura — generato da tools/build-photos.js, non modificare a mano.\n";
  so += "// Fonte: Wikimedia Commons, licenze libere. Mostrate nella modalità cucina come esempio della tecnica.\n";
  so += "const STEP_PHOTOS = {\n";
  let sn = 0, sb = 0;
  for (const c of sc) {
    const f = path.join(SDIR, c.id + ".jpg");
    if (!fs.existsSync(f)) continue;
    so += `  "${c.id}": "photos/steps/${c.id}.jpg",\n`;
    sn++; sb += fs.statSync(f).size;
  }
  so += "};\n\nconst STEP_CREDITS = " + JSON.stringify(sc, null, 1) + ";\n";
  fs.writeFileSync(path.join(ROOT, "steps.js"), so);
  console.log(`steps.js: ${sn} foto tecnica (${(sb / 1024).toFixed(0)} KB su disco)`);
}
