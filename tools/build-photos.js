// ============================================================
// NOVA — costruisce photos.js dalle foto in photos/
// Uso: node tools/build-photos.js
// Le foto vengono incorporate come data URI: l'app resta un file
// che funziona anche offline, senza richieste esterne.
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "photos");
const credits = JSON.parse(fs.readFileSync(path.join(DIR, "credits.json"), "utf8"));

let out = "// Foto dei piatti — generato da tools/build-photos.js, non modificare a mano.\n";
out += "// Fonte: Wikimedia Commons. Licenze libere (CC BY, CC BY-SA, CC0, pubblico dominio).\n";
out += "const PHOTOS = {\n";
let n = 0, bytes = 0;
for (const c of credits) {
  const file = path.join(DIR, c.id + ".jpg");
  if (!fs.existsSync(file)) continue;
  const b64 = fs.readFileSync(file).toString("base64");
  out += `  "${c.id}": "data:image/jpeg;base64,${b64}",\n`;
  n++; bytes += b64.length;
}
out += "};\n\nconst PHOTO_CREDITS = " + JSON.stringify(credits, null, 1) + ";\n";
fs.writeFileSync(path.join(ROOT, "photos.js"), out);
console.log(`photos.js: ${n} foto, ${(bytes / 1048576).toFixed(2)} MB in base64`);
