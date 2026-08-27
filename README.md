# NOVA 🍳

**Cosa cucino oggi?** — Seleziona gli ingredienti che hai in casa e gli strumenti che puoi usare (fornelli, forno, microonde, friggitrice ad aria, moka, bollitore…): NOVA ti mostra subito le ricette che puoi fare davvero, con quantità e istruzioni passo passo, divise in **primi, secondi e dolci**.

## Come funziona

1. **Ingredienti** — cerca e seleziona quello che hai (sale, pepe, olio e acqua sono dati per scontati)
2. **Strumenti** — spunta solo quello che puoi usare davvero
3. **Ricette** — divise tra *"Pronte da cucinare"* (hai tutto) e *"Ti manca poco"* (mancano 1-2 ingredienti, ti dice quali)

Le selezioni vengono ricordate tra una visita e l'altra. Funziona su telefono e desktop, con tema chiaro e scuro automatico.

## Come provarla

Nessuna installazione, nessun server: apri `index.html` nel browser e basta.

Per metterla online gratis: **Settings → Pages → Deploy from branch** su questo repository, e sarà raggiungibile da qualsiasi telefono.

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | Interfaccia e logica dell'app (nessuna dipendenza esterna) |
| `data.js` | ~85 ingredienti, 7 strumenti e 49 ricette con quantità e passaggi |

## Aggiungere una ricetta

Basta aggiungere un oggetto a `RECIPES` in `data.js`:

```js
{
  id: "mia-ricetta", cat: "primi", name: "Nome", e: "🍝",
  time: 20, serves: "2 persone", diff: "Facile",
  app: ["fornelli"],            // "forno|airfryer" = basta uno dei due; [] = senza cottura
  ing: [
    ["pastacorta", "180 g"],
    ["basilico", "qualche foglia", true],   // true = facoltativo
  ],
  steps: ["Passo 1…", "Passo 2…"],
}
```
