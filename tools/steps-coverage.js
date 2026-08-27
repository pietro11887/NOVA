// Quanto Basta — quanti passaggi verrebbero coperti da una foto di tecnica
const fs = require("fs"), vm = require("vm"), path = require("path");
const R = path.join(__dirname, "..");
const ctx = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(R, "data.js"), "utf8") + ";globalThis.D={RECIPES};", ctx);
const { RECIPES } = ctx.D;

// stessa tabella usata dall'app (tenere allineata con TECNICHE in index.html)
const RULES = [
  ["moka",        /\b(moka|caffè con la moka|caffettiera)\b/i],
  ["frullare",    /\bfrulla|frullatore|minipimer\b/i],
  ["airfryer",    /\bair ?fryer|friggitrice ad aria|cestello\b/i],
  ["microonde",   /\bmicroonde|\d+\s?W\b/i],
  ["forno",       /\bforno|inforna|°\s?C|teglia|pirofila|gratina\b/i],
  ["scolare",     /\bscola\b/i],
  ["bollire",     /\bbollire|bollore|acqua (poco |abbondante )?salata|butta (gli|la|le)|cuoci (la pasta|gli|le)|vengono a galla|porta a cottura|brodo\b/i],
  ["uova-sbattere", /\bsbatt|monta (le uova|i tuorli|gli albumi)|tuorli|albumi\b/i],
  ["impastare",   /\bimpasta|amalgama|incorpora (la )?farina|briciole|setaccia\b/i],
  ["grattugiare", /\bgrattugia\b/i],
  ["tagliare",    /\btaglia|affetta|trita|a cubetti|a fettine|a rondelle|a spicchi\b/i],
  ["soffriggere", /\bsoffrigg|rosola|dora|scalda .*olio|cipolla tritata\b/i],
  ["sugo",        /\bpassata|sugo|pomodor/i],
  ["condire",     /\bcondisci|condire|mescola tutto|servi|spolvera|completa con|un giro d.olio|pepe a piacere|a piacere\b/i],
  ["mescolare",   /\bmescola|manteca|gira|salta in padella|unisci|aggiungi|versa|sgrana|allunga\b/i],
  ["padella",     /\bpadella|tegame|pentolino|fuoco (vivo|medio|basso|dolce)\b/i],
];
const tecnica = (t) => (RULES.find(([, re]) => re.test(t)) || [null])[0];

let tot = 0, cov = 0;
const perTec = {}, scoperti = [];
for (const r of RECIPES) for (const st of r.steps) {
  tot++;
  const k = tecnica(st);
  if (k) { cov++; perTec[k] = (perTec[k] || 0) + 1; }
  else scoperti.push(r.id + ": " + st.slice(0, 62));
}
console.log(`Passaggi totali: ${tot} | con una tecnica riconosciuta: ${cov} (${Math.round(cov / tot * 100)}%)`);
console.log("Per tecnica:", Object.entries(perTec).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "));
console.log("\nSenza tecnica (" + scoperti.length + "):");
scoperti.slice(0, 12).forEach(x => console.log("  ·", x));
