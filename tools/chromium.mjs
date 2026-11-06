/**
 * Dove sta Chromium, trovato invece che scritto a mano.
 *
 * Il percorso contiene il numero di versione del browser, e quel numero
 * cambia quando l'ambiente di lavoro viene aggiornato: tutti i collaudi si
 * fermavano con "executable doesn't exist" e andava corretto a mano in otto
 * file. Qui si cerca, e la cartella la si prende cosi' com'e'.
 *
 * Playwright cambia anche la forma della cartella interna fra una versione e
 * l'altra (chrome-linux, chrome-linux64), quindi si guardano tutte.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';

function cerca() {
  if (!fs.existsSync(BASE)) return null;
  // le versioni piu' recenti per prime: il numero in coda al nome e' crescente
  const cartelle = fs.readdirSync(BASE)
    .filter((n) => n.startsWith('chromium-'))
    .sort((a, b) => (parseInt(b.split('-').pop(), 10) || 0) - (parseInt(a.split('-').pop(), 10) || 0));
  for (const c of cartelle) {
    for (const sub of ['chrome-linux64', 'chrome-linux', 'chrome-mac', 'chrome-win']) {
      for (const bin of ['chrome', 'chrome.exe']) {
        const p = path.join(BASE, c, sub, bin);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

export const CHROMIUM = cerca();

if (!CHROMIUM) {
  console.error(`Chromium non trovato sotto ${BASE}. I collaudi visivi hanno bisogno`
    + ' del browser di Playwright: controlla PLAYWRIGHT_BROWSERS_PATH.');
}
