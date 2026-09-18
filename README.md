# NOVA

Agente IA per Windows, in versione beta.

Questo repository contiene **il sito pubblico di NOVA** e **la configurazione
che l'applicazione legge all'avvio**. Il codice dell'applicazione Windows non
sta qui.

## File

| File | A cosa serve |
| --- | --- |
| `index.html` | La pagina di vendita. Un unico file: testo, grafica e script sono dentro. |
| `status.json` | Configurazione letta dall'app e dal sito (vedi sotto). |
| `.nojekyll` | Dice a GitHub Pages di pubblicare i file così come sono. |

## `status.json`

E' l'unico punto da modificare per cambiare messaggio o link d'acquisto: lo
leggono sia l'applicazione sia la pagina di vendita.

```json
{
  "beta_attiva": true,
  "messaggio": "",
  "url_acquisto": "https://gumroad.com/l/nova-pro"
}
```

- `beta_attiva` — `false` chiude le iscrizioni alla beta e mostra l'avviso sul sito.
- `messaggio` — se non è vuoto, compare come banner in cima alla pagina. Vuoto = nessun banner.
- `url_acquisto` — l'indirizzo del checkout. **Deve essere il link del tuo
  prodotto.** Se è vuoto, non inizia con `https://`, o è ancora
  `https://gumroad.com/l/nova-pro` (che appartiene a un altro venditore), il
  sito non mostra il bottone di acquisto: propone la beta. E' una protezione
  voluta, per non mandare clienti sul prodotto di qualcun altro.

Dopo ogni modifica di `status.json` il cambiamento è online in circa un minuto,
senza ripubblicare nulla.

## Pubblicare il sito

Settings → Pages → *Source: Deploy from a branch* → branch `main`, cartella `/ (root)`.

Il sito esce su <https://pietro11887.github.io/NOVA/> e `status.json` resta
raggiungibile su <https://pietro11887.github.io/NOVA/status.json>: è
l'indirizzo che l'app interroga, quindi **non va rinominato né spostato**.

> Attenzione: oggi Pages pubblica un altro branch di questo repository (il
> gioco *NOVA CITY*). Cambiando sorgente su `main`, quel gioco non sara' più
> raggiungibile a questo indirizzo: se ti serve, spostalo in un repository suo.

## Da completare prima di mandare traffico alla pagina

Nel file `index.html` i punti da personalizzare sono segnati con `✏️ MODIFICA`:

- il link di download della beta;
- le tre funzioni reali di NOVA (più sono concrete, meglio vendono);
- prezzo e contenuto della versione Pro;
- la risposta sulla privacy e la data di uscita nelle FAQ.
