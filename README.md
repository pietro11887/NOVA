# Quanto Basta 🍳

**Cosa cucino oggi?** — Seleziona gli ingredienti che hai in casa e gli strumenti che puoi usare (fornelli, forno, microonde, friggitrice ad aria, moka, bollitore…): l'app ti mostra subito le ricette che puoi fare davvero, con quantità e istruzioni passo passo, divise in **primi, secondi e dolci**.

Il nome viene da **q.b.**, l'abbreviazione che sta su ogni ricetta italiana: con quello che hai, quanto basta.

## Come funziona

La **Home** è una vetrina: in cima la ricetta che puoi fare stasera con quello che hai (foto grande), poi le strisce «Pronte da cucinare» e «Ti manca poco», la tua cucina in miniatura e le scorciatoie. Al primo avvio la dispensa parte già piena degli ingredienti che quasi tutti hanno in casa, così l'app mostra subito ricette vere invece di una lista vuota: si tolgono con un tocco.

Da lì si va a:

- **Trova ricette** — il flusso in tre passi: selezioni gli **ingredienti** che hai (sale, pepe, olio e acqua sono dati per scontati), spunti gli **strumenti** nella cucina illustrata interattiva, e vedi le **ricette** divise tra *"Pronte da cucinare"* (hai tutto) e *"Ti manca poco"* (mancano 1-2 ingredienti, ti dice quali)
- **Sfoglia il ricettario** — tutte le ricette per categoria, con ricerca per nome o ingrediente e filtri (preferiti, sotto i 20 minuti, vegetariano, facile)
- **Modalità cucina** — dalla scheda di una ricetta: un passaggio alla volta a caratteri grandi, si avanza toccando lo schermo, gli ingredienti restano a portata di mano e lo schermo non si spegne mentre cucini (Wake Lock). Dove il passaggio descrive una tecnica riconoscibile (soffriggere, bollire, infornare, sbattere le uova, frullare, tagliare, grattugiare, cuocere il sugo) compare una **foto d'esempio della tecnica**, con didascalia che dice cosa mostra: non è una foto di quella ricetta specifica
- **Preferiti** — il cuore su ogni ricetta, con il filtro dedicato nel ricettario
- **La dispensa si aggiorna da sola** — spunti una cosa al supermercato e finisce in dispensa; quando finisci di cucinare l'app chiede cosa è terminato e lo sposta dalla dispensa alla lista della spesa. Così resta vera nel tempo senza rifarla a mano
- **Timer nei passaggi** — dove il passaggio dice «cuoci 10 minuti» compare un pulsante che avvia il conto alla rovescia, con suono e vibrazione a fine tempo; se ne possono tenere accesi più d'uno
- **Incolla una ricetta** — nel modulo di creazione: incolli il testo di una ricetta (da un messaggio, da un sito) e i campi si riempiono da soli, poi si correggono
- **Salvataggio e ripristino** — un file con dispensa, preferiti, spesa e ricette tue, da riprendere su un altro telefono
- **Prepara la spesa** — dalla lista: scegli le ricette che *potresti* fare in questi giorni (nessun giorno da decidere), e l'app mette insieme quello che serve, **somma gli ingredienti in comune** e toglie quelli che hai già. Se poi non cucini una di quelle ricette non si rompe niente: gli ingredienti restano in dispensa
- **Lista della spesa** — funziona anche da sola: scrivi quello che ti serve (anche cose non da ricetta) e lo trovi diviso per reparto del supermercato; dalla scheda di una ricetta un pulsante aggiunge gli ingredienti che ti mancano, con le quantità già adattate alle porzioni scelte
- **Crea una ricetta** — campi guidati (nome, categoria, tempi, strumenti, ingredienti con quantità, passaggi), scegli l'illustrazione del piatto o **carichi una tua foto**; le tue ricette entrano nell'app, si possono modificare ed eliminare, e partecipano al match con i tuoi ingredienti

Le selezioni vengono ricordate tra una visita e l'altra. Funziona su telefono e desktop.

**Intestazione** — in cima c'è il titolo grande; appena scorri si contrae in una barretta sottile che resta lì, con il nome della schermata e il pulsante del tema. Quello che era già appiccicato in alto (ricerca, filtri, categorie, campo della spesa) si posiziona sotto: l'altezza da contratta viene misurata, non indovinata, perché dipende dal telefono.

Le barre che restano sono in **vetro smerigliato**: semitrasparenti, con il contenuto sfocato che ci scorre sotto (`backdrop-filter`). Dove il browser non lo sostiene, o dove l'utente ha chiesto meno trasparenza nelle impostazioni di sistema, tornano piene.

Nel ricettario la riga dei filtri si ritira mentre scorri per non mangiare schermo, ma **solo se non hai filtri attivi**: uno acceso resta sempre visibile, altrimenti non si capisce perché la lista è corta.

**Barra della ricetta** — dentro la scheda una barretta resta in cima con chiudi, preferiti e condividi; scorrendo compaiono anche il nome della ricetta e il pulsante **Cucina**, così si può partire da qualsiasi punto senza risalire.

**Tema** — il pulsante in alto a destra gira fra *Automatico*, *Chiaro* e *Scuro*; in fondo alla Home ci sono le tre voci per esteso. La scelta viene ricordata.

Una scelta esplicita non si limita a mettere `data-theme` sull'elemento radice: scrive anche i colori come proprietà in linea. L'attributo, da solo, non basta quando la pagina è ospitata da un contenitore che imposta il proprio tema e lo riscrive dopo l'avvio (è il caso dell'anteprima): le proprietà in linea vincono su qualsiasi foglio di stile, e un osservatore rimette l'attributo se qualcuno lo cambia.

## Come provarla

Serve un piccolo server locale, perché le foto sono file separati:

```
python3 -m http.server 8000     # poi apri http://localhost:8000
```

In alternativa, `node tools/build-single.js` genera `quanto-basta.html`: **un file solo** con tutto dentro (foto comprese), che si apre con un doppio clic anche senza server e funziona offline.

Per metterla online gratis: **Settings → Pages → Deploy from branch**, e sarà raggiungibile da qualsiasi telefono.

### Installarla come app

Una volta online, dal browser del telefono si aggiunge alla schermata Home (su iPhone: Condividi → Aggiungi a Home; su Android compare da sola la proposta di installazione). Da lì in poi si comporta come un'app installata: icona propria, si apre a tutto schermo senza barre del browser e **funziona anche senza connessione**, perché il service worker (`sw.js`) tiene in cache l'app e tutte le foto.

L'icona sulla schermata Home si mette **una volta sola**: gli aggiornamenti arrivano da soli, non serve reinstallare nulla.

Quando pubblichi una nuova versione, alza `VERSIONE` in `sw.js` (`qb-v3` → `qb-v4`): le cache vecchie vengono buttate e i telefoni prendono i file aggiornati. Rientrando nell'app viene controllato se c'è una versione nuova; quando è pronta compare in basso un riquadro **«Nuova versione pronta — Ricarica»**, così non si continua a vedere quella vecchia fino alla riapertura successiva.

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | Interfaccia e logica dell'app (nessuna dipendenza esterna) |
| `data.js` | 92 ingredienti, 7 strumenti e 74 ricette con quantità e passaggi |
| `icons.js` | Libreria di illustrazioni SVG (`QB_ICON`, `QB_DISH`, `QB_KITCHEN`, `QB_UI`): icone di ingredienti e strumenti, piatti delle ricette |
| `photos.js` | Foto dei piatti incorporate (generato, non modificare a mano) |
| `photos/` | Foto sorgente in JPEG più `credits.json` con autore e licenza di ognuna |
| `photos/steps/` | Foto delle tecniche di cottura, con i loro crediti |
| `steps.js` | Foto delle tecniche incorporate (generato) |
| `tools/steps-coverage.js` | Riporta quanti passaggi vengono coperti da una foto di tecnica |
| `tools/build-single.js` | Genera la versione a file unico, con le foto incorporate |
| `manifest.webmanifest`, `icons/` | Installazione sulla schermata Home e icone dell'app |
| `sw.js` | Service worker: fa funzionare l'app anche senza connessione |
| `tools/build-photos.js` | Rigenera `photos.js` dalle foto in `photos/` |

## Aggiungere una ricetta

Basta aggiungere un oggetto a `RECIPES` in `data.js`:

```js
{
  id: "mia-ricetta", cat: "primi", name: "Nome", img: { k: "short", a: "#d94f3d" },
  time: 20, serves: "2 persone", diff: "Facile",
  app: ["fornelli"],            // "forno|airfryer" = basta uno dei due; [] = senza cottura
  ing: [
    ["pastacorta", "180 g"],
    ["basilico", "qualche foglia", true],   // true = facoltativo
  ],
  steps: ["Passo 1…", "Passo 2…"],
}
```

## Foto dei piatti

67 ricette su 74 hanno una foto reale; le altre usano l'illustrazione del piatto. Le foto vengono da **Wikimedia Commons** e da **Openverse** (che raccoglie materiale con licenza libera da Flickr e altri archivi) e hanno tutte licenza libera verificata (CC BY, CC BY-SA, CC0 o pubblico dominio): autore e licenza di ciascuna sono in `photos/credits.json` e consultabili nell'app dalla Home, sotto «Autori e licenze».

Le foto sono incorporate in `photos.js` come data URI, così l'app resta autosufficiente e funziona anche offline. Dopo aver aggiunto o sostituito un file in `photos/`, rigenera con:

```
node tools/build-photos.js
```

Se aggiungi una foto, aggiungi anche la sua riga in `photos/credits.json` (`id`, `file`, `license`, `author`, `page`): senza licenza verificata la foto non va pubblicata.
