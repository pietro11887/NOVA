# AI TOWN — simulazione economica 3D

Una città in 3D dove cinque intelligenze artificiali vivono, lavorano, investono,
si divertono e ogni tanto vanno in rovina. Un solo file HTML: nessun build,
nessuna dipendenza da installare, nessuna chiamata a modelli esterni.

Apri `index.html` in un browser e premi **Prossimo giorno**.
(La prima apertura richiede connessione: Three.js viene caricato da CDN.)

---

## I cinque cittadini

| Personaggio | Ruolo | Motore economico | Tratti dominanti |
|---|---|---|---|
| **Gemini** | L'Imprenditore Rischioso | impresa + leva finanziaria ×1,70 | rischio 92, parsimonia 15 |
| **GPT** | Il Lavoratore Stabile | stipendio + competenza composta | lavoro 95, caos 10 |
| **Midjourney** | L'Artista Creativa | progetti personali, spesa impulsiva | edonismo 85, caos 62 |
| **Claude** | Il Risparmiatore Prudente | conto risparmio a interesse | parsimonia 95, rischio 12 |
| **Grok** | L'Opportunista Caotico | scommesse e colpi di fortuna | caos 95, socialità 80 |

Tutti partono con **1.000 $**, energia 100, felicità 70, salute 100.

## Come decidono (mock logic, zero API)

Ogni giorno ciascun personaggio assegna un **punteggio di utilità** a 15 azioni
possibili e sceglie la migliore. Il punteggio nasce da:

* i tratti caratteriali (rischio, lavoro, edonismo, socialità, parsimonia, caos);
* i bisogni correnti — energia, felicità, salute, contante, debiti;
* lo stato del mercato e gli **eventi attivi**, che spostano i pesi per due giorni;
* un rumore casuale proporzionale al tratto *caos* (Grok è imprevedibile, GPT no);
* una penalità di noia: ripetere la giornata di ieri costa punti.

Il generatore casuale ha un seed, quindi una partita è riproducibile.

## Meccaniche che rendono la simulazione viva

* **Bisogni che si accumulano** — il *desiderio di spendere* cresce ogni giorno in
  proporzione all'edonismo e si scarica solo facendo shopping; la *solitudine*
  cresce finché non si esce con gli altri. Senza questi, i luoghi di svago non
  venivano mai scelti e mercato, diner e parco restavano vuoti.
* **Burnout** — lavorare più di tre giorni di fila erode la felicità; il cinema
  azzera lo stress accumulato.
* **Rendimenti decrescenti della felicità** — più uno è felice, meno gli dà lo
  stesso piacere. Senza, tutti si stabilizzavano a 100 e la classifica felicità
  era piatta.
* **La salute va mantenuta** — cala ogni giorno, la palestra la ricostruisce,
  sotto 48 scatta il ricovero d'urgenza. Influisce sul rendimento del lavoro.
* **Leva finanziaria** — chi ha alta propensione al rischio investe a leva:
  stesse notizie, oscillazioni molto più violente.
* **L'impresa si consolida** — ogni progetto personale riuscito aumenta il
  moltiplicatore dei successivi. È il motore che permette all'imprenditore di
  superare il lavoratore stabile, quando le cose vanno bene.
* **Le crisi rientrano** — prezzi, salari e tasse tornano lentamente verso la
  normalità e il mercato ha un ritorno alla media. Senza questo, ogni evento
  negativo era un cricchetto a senso unico e la città collassava in modo
  irreversibile entro il giorno 40.
* **Bancarotta** — sotto −1.800 $ di patrimonio i debiti vengono azzerati, si
  riparte da 250 $ con una forte perdita di felicità.

## Eventi (20, lanciabili anche a mano)

**Catastrofi** — aumento delle tasse, crollo del mercato, multa, inflazione,
licenziamenti, influenza stagionale, truffa telematica, caro affitti.
**Opportunità** — boom tecnologico, bolla speculativa (che poi può scoppiare
davvero), opportunità d'affare, sussidio comunale, festival, bonus, lotteria.
**Caos** — mania speculativa, tempesta, trend virale, colpo alla banca,
reddito universale.

Ogni evento ha un effetto globale, un effetto individuale e una **reazione
diversa per ciascuna personalità**. Esempio reale dal feed:

> ⚡ **CROLLO DEL MERCATO** — l'indice NX-500 perde il 24%.
> **Gemini** brucia 148 $ di portafoglio — *«Saldi!» — e cerca liquidità per comprare il ribasso.*
> **GPT** non era esposto — *spegne il telefono e torna a lavorare.*
> **Claude** non era esposto — *controlla il conto risparmio e tira un sospiro di sollievo.*

## La città

Nove isolati su griglia stradale, con Banca Centrale, Borsa NX-500, NexCorp
Tower, Ospedale, Università, palestra, mercato, cinema, diner, casinò, stazione
di polizia, parco con fontana e cinque case private. Traffico, pedoni,
lampioni che si accendono, finestre illuminate e ciclo giorno/notte.
I personaggi si muovono davvero lungo le strade fino alla destinazione scelta.

## Controlli

| | |
|---|---|
| **Prossimo giorno** / `Spazio` | avanza di un turno |
| **Autoplay** / `A` | esecuzione continua, fino a ~2 giorni al secondo |
| **Eventi** / `E` | console per lanciare a mano uno dei 20 eventi |
| **Reset** | nuova partita con un nuovo seed |
| trascina · rotella | ruota e zooma la camera |
| clic su un cittadino | apre il dossier e lo seleziona |
| Orbita / Alto / Strada / Segui | inquadrature predefinite |

## Nota sull'equilibrio

Su 8 partite da 60 giorni: **GPT vince 6 volte**, Claude 1, Gemini 1. La
diligenza ha il valore atteso più alto; il rischio ha le code — in una partita
Gemini ha chiuso a 7.168 $ e Grok a 6.988 $, ben oltre il lavoratore stabile,
in un'altra entrambi erano sotto zero. Midjourney è quasi sempre in rosso: è il
suo arco narrativo, non un bug.

## Stack

HTML5 + CSS custom (estetica cyberpunk) + JavaScript vanilla, Three.js r128 da
CDN per il 3D. ~2.000 righe in un unico file, commentate in italiano.
