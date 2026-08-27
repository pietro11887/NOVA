// ============================================================
// Quanto Basta — service worker
// Fa funzionare l'app anche senza connessione, una volta installata.
// Cambia VERSIONE quando aggiorni i file: le vecchie cache vengono buttate.
// ============================================================
const VERSIONE = "qb-v1";
const GUSCIO = "guscio-" + VERSIONE;   // i file dell'app
const MEDIA = "media-" + VERSIONE;     // le foto, salvate man mano che servono

const FILE_APP = [
  "./", "./index.html", "./icons.js", "./photos.js", "./steps.js", "./data.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(GUSCIO)
      // addAll fallisce tutto se un file manca: meglio uno per uno
      .then((c) => Promise.all(FILE_APP.map((f) => c.add(f).catch(() => null))))
      .then(() => { scaldaFoto(); return self.skipWaiting(); })
  );
});

// Scarica in sottofondo tutte le foto, così l'app è completa anche offline
// dalla prima volta. Se qualcosa non arriva, pazienza: verrà presa più avanti.
async function scaldaFoto() {
  try {
    const res = await fetch("./photos.js");
    const res2 = await fetch("./steps.js");
    const testo = (await res.text()) + (await res2.text());
    const perc = [...testo.matchAll(/"(photos\/[^"]+\.jpg)"/g)].map((m) => "./" + m[1]);
    const c = await caches.open(MEDIA);
    for (const p of perc) {
      if (await c.match(p)) continue;
      await c.add(p).catch(() => null);
    }
  } catch (e) { /* si riempirà navigando */ }
}

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((n) => !n.endsWith(VERSIONE)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Pagina: prima la rete (così vedi subito gli aggiornamenti), poi la cache
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(GUSCIO).then((c) => c.put("./index.html", copia));
          return r;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Foto: prima la cache, e quando arriva dalla rete la conserviamo
  if (url.pathname.includes("/photos/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(MEDIA).then((c) => c.put(req, copia)); }
        return r;
      }))
    );
    return;
  }

  // Resto (script, icone, manifest): cache, con aggiornamento in sottofondo
  e.respondWith(
    caches.match(req).then((hit) => {
      const rete = fetch(req).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(GUSCIO).then((c) => c.put(req, copia)); }
        return r;
      }).catch(() => hit);
      return hit || rete;
    })
  );
});
