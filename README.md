# NOVA 🍳

**Cosa cucino oggi?** — Seleziona gli ingredienti che hai in casa e gli strumenti che puoi usare (fornelli, forno, microonde, friggitrice ad aria, moka, bollitore…): NOVA ti mostra subito le ricette che puoi fare davvero, con quantità e istruzioni passo passo, divise in **primi, secondi e dolci**.

## Come funziona

Dalla **Home** scegli dove andare:

- **Trova ricette** — il flusso in tre passi: selezioni gli **ingredienti** che hai (sale, pepe, olio e acqua sono dati per scontati), spunti gli **strumenti** nella cucina illustrata interattiva, e vedi le **ricette** divise tra *"Pronte da cucinare"* (hai tutto) e *"Ti manca poco"* (mancano 1-2 ingredienti, ti dice quali)
- **Sfoglia il ricettario** — tutte le ricette senza filtri, per categoria
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
| `icons.js` | Libreria di illustrazioni SVG: icone di ingredienti e strumenti, piatti delle ricette |

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
