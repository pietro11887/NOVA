# Quanto Basta 🍳

**Cosa cucino oggi?** — Seleziona gli ingredienti che hai in casa e gli strumenti che puoi usare (fornelli, forno, microonde, friggitrice ad aria, moka, bollitore…): l'app ti mostra subito le ricette che puoi fare davvero, con quantità e istruzioni passo passo, divise in **primi, secondi e dolci**.

Il nome viene da **q.b.**, l'abbreviazione che sta su ogni ricetta italiana: con quello che hai, quanto basta.

## Come funziona

Dalla **Home** scegli dove andare:

- **Trova ricette** — il flusso in tre passi: selezioni gli **ingredienti** che hai (sale, pepe, olio e acqua sono dati per scontati), spunti gli **strumenti** nella cucina illustrata interattiva, e vedi le **ricette** divise tra *"Pronte da cucinare"* (hai tutto) e *"Ti manca poco"* (mancano 1-2 ingredienti, ti dice quali)
- **Sfoglia il ricettario** — tutte le ricette per categoria, con ricerca per nome o ingrediente e filtri (preferiti, sotto i 20 minuti, vegetariano, facile)
- **Modalità cucina** — dalla scheda di una ricetta: un passaggio alla volta a caratteri grandi, si avanza toccando lo schermo, gli ingredienti restano a portata di mano e lo schermo non si spegne mentre cucini (Wake Lock). Dove il passaggio descrive una tecnica riconoscibile (soffriggere, bollire, infornare, sbattere le uova, frullare, tagliare, grattugiare, cuocere il sugo) compare una **foto d'esempio della tecnica**, con didascalia che dice cosa mostra: non è una foto di quella ricetta specifica
- **Preferiti** — il cuore su ogni ricetta, con il filtro dedicato nel ricettario
- **Lista della spesa** — funziona anche da sola: scrivi quello che ti serve (anche cose non da ricetta) e lo trovi diviso per reparto del supermercato; dalla scheda di una ricetta un pulsante aggiunge gli ingredienti che ti mancano, con le quantità già adattate alle porzioni scelte
- **Crea una ricetta** — campi guidati (nome, categoria, tempi, strumenti, ingredienti con quantità, passaggi), scegli l'illustrazione del piatto o **carichi una tua foto**; le tue ricette entrano nell'app, si possono modificare ed eliminare, e partecipano al match con i tuoi ingredienti

Le selezioni vengono ricordate tra una visita e l'altra. Funziona su telefono e desktop, con tema chiaro e scuro automatico.

## Come provarla

Nessuna installazione, nessun server: apri `index.html` nel browser e basta.

Per metterla online gratis: **Settings → Pages → Deploy from branch** su questo repository, e sarà raggiungibile da qualsiasi telefono.

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | Interfaccia e logica dell'app (nessuna dipendenza esterna) |
| `data.js` | ~85 ingredienti, 7 strumenti e 49 ricette con quantità e passaggi |
| `icons.js` | Libreria di illustrazioni SVG (`QB_ICON`, `QB_DISH`, `QB_KITCHEN`, `QB_UI`): icone di ingredienti e strumenti, piatti delle ricette |
| `photos.js` | Foto dei piatti incorporate (generato, non modificare a mano) |
| `photos/` | Foto sorgente in JPEG più `credits.json` con autore e licenza di ognuna |
| `photos/steps/` | Foto delle tecniche di cottura, con i loro crediti |
| `steps.js` | Foto delle tecniche incorporate (generato) |
| `tools/steps-coverage.js` | Riporta quanti passaggi vengono coperti da una foto di tecnica |
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

36 ricette hanno una foto reale; le altre usano l'illustrazione del piatto. Le foto vengono da **Wikimedia Commons** e hanno tutte licenza libera verificata (CC BY, CC BY-SA, CC0 o pubblico dominio): autore e licenza di ciascuna sono in `photos/credits.json` e consultabili nell'app dalla Home, sotto «Autori e licenze».

Le foto sono incorporate in `photos.js` come data URI, così l'app resta autosufficiente e funziona anche offline. Dopo aver aggiunto o sostituito un file in `photos/`, rigenera con:

```
node tools/build-photos.js
```

Se aggiungi una foto, aggiungi anche la sua riga in `photos/credits.json` (`id`, `file`, `license`, `author`, `page`): senza licenza verificata la foto non va pubblicata.
