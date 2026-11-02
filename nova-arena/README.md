# Nova Arena

Gioco di carte e torri in tempo reale (HTML5 + JavaScript, nessuna build): un menu completo da gioco mobile con barra di navigazione in basso e un'arena **3D** (Three.js, caricato da jsDelivr) giocabile contro un bot. Ogni carta ha un personaggio 3D originale con animazioni proprie, usato sia in partita sia come illustrazione nei menu. Ambientazione e carte sono originali: 32 carte divise in 4 fazioni (Neo-Cyber, Bio-Mutant, Steam-Punk, Cosmic Mythos).

Avvio: servi la cartella con un server statico (es. `npx serve nova-arena` oppure `python3 -m http.server` dentro `nova-arena/`) e apri `index.html`. Serve un server perché il codice usa i moduli ES. I progressi vengono salvati in `localStorage`.

## Schermate (barra in basso, anche con lo swipe orizzontale)
| Scheda | Contenuto |
| --- | --- |
| 🛒 **Negozio** | 3 offerte del giorno (cambiano a mezzanotte, uguali per tutti), forzieri Comune / Raro / Cosmico a gemme, pacchetti d'oro (a gemme) e di gemme (pagamento **simulato**) |
| 🃏 **Carte** | mazzo da 8 con elisir medio e ciclo da 4, le altre 24 carte con filtro per fazione e ordinamento, sostituzione nel mazzo ("Usa" → tocca la carta da togliere), scheda carta con tag, descrizione, statistiche e miglioramento (oro + copie) |
| ⚔️ **Battaglia** | arena attuale e percorso dei trofei, banner del Nova Pass, anteprima mazzo, pulsante BATTAGLIA (ricerca avversario → arena), allenamento, 4 slot forzieri con timer |
| 🛡️ **Clan** | Clan: unisciti / crea, chat con richieste e donazioni di carte, guerra tra clan (segnaposto). Amici: online / offline / in battaglia, Amichevole, Guarda, Invita |
| 🏆 **Eventi** | sfide a tempo: Draft a Doppio Elisir, Morte Improvvisa: Arena Cosmica, Sfida di Fazione, con requisiti d'ingresso, vittorie/sconfitte e premi a tappe |

## Struttura
```
nova-arena/
├── index.html                  guscio dell'app: top bar, #screens, root di arena/modali/toast
├── styles/
│   ├── base.css                variabili, reset, layout mobile-first
│   ├── components.css          pulsanti, top bar, barra in basso, carte, modali, toast
│   ├── screens.css             stili delle 5 schermate, pass e profilo
│   └── arena.css               ricerca avversario, VS, HUD della partita, risultato
└── src/
    ├── main.js                 avvio: router + barra in basso + stato → UI + timer unico da 1 s
    ├── router.js               router a hash (#/shop, #/cards, #/battle, #/social, #/events)
    ├── state/
    │   ├── playerState.js      stato globale `playerState`, update(), subscribe(), salvataggio
    │   └── economy.js          regole: valute, carte, miglioramenti, forzieri, XP, pass, trofei
    ├── data/
    │   ├── cards.js            le 32 carte, fazioni, rarità, tag e costi di miglioramento
    │   └── catalog.js          arene, forzieri, negozio, eventi, pass, clan, amici
    ├── game/
    │   ├── battleFlow.js       ricerca → VS → arena → risultato → premi (unico ingresso alle partite)
    │   ├── arena.js            simulazione della partita e bot avversario (vista 2D di riserva senza WebGL)
    │   ├── arena3d.js          vista 3D: campo, fiume, ponti, torri, personaggi, barre vita, effetti, camera
    │   └── models3d.js         modelli 3D procedurali delle 32 carte, delle torri e degli incantesimi, con animazioni
    └── ui/
        ├── dom.js              h() per creare elementi, mount(), formattazione, conti alla rovescia
        ├── components/         topBar, bottomNav, modal, toast, cardTile, cardModal, rewardReveal, passModal, portraits (ritratti 3D)
        └── screens/            shop, collection, battleHub, social, events
```

## Architettura
- **Stato**: `playerState` è un unico oggetto (oro, gemme, trofei, livello/XP, carte sbloccate con livello e copie, mazzo, slot forzieri con `readyAt`, pass, eventi, clan e chat, amici). Si modifica **solo** con `update(fn, reason)`, che salva in `localStorage` e avvisa gli iscritti. Le regole di gioco stanno in `economy.js`, così le schermate non toccano mai i numeri direttamente. In console: `novaState.update(s => s.gems += 1000)`.
- **Router**: ogni schermata è un modulo `{ id, label, icon, render(el), onShow?, onHide? }`. La sezione viene creata la prima volta e poi solo mostrata o nascosta: niente ricaricamenti, scroll conservato, tasto Indietro funzionante grazie all'hash.
- **Aggiornamenti**: a ogni `update()` si ridisegnano top bar, badge e la schermata visibile (raggruppati in un microtask). Un solo timer da 1 s aggiorna tutti gli elementi `[data-ends-at]` e ridisegna quando un conto alla rovescia scade (forziere pronto, nuovo giorno, rotazione eventi).
- **Partite**: `playBattle({ mode, deck, modifiers, fixedLevel })` gestisce classificata, amichevole, evento e spettatore. L'arena restituisce `{ outcome, crowns }` e `economy.applyBattleResult()` assegna trofei, oro, forziere e corone del pass.

## Arena
Campo 18×32 con fiume e due ponti, 3 torri per lato (la torre del re si attiva quando viene colpita o cade una torre laterale), elisir fino a 10 (doppio negli ultimi 40 s), mano da 4 carte più la prossima, 2 minuti più 1 di supplementari a morte improvvisa. Truppe, strutture e incantesimi usano le statistiche del database. Molti tag hanno un effetto reale: Air, Splash, Shields, Split-on-Death, DOT, Spawner, Healer, Lifesteal, Stun, Pull, Knockback, Death Damage, Rewind, Phasing, Rage, Regenerate, Chain Lightning, Targets Buildings (nella scheda carta sono segnati con ◆). Il bot difende la propria metà, usa gli incantesimi sui gruppi e attacca la corsia più debole.

## Personaggi 3D
Ogni modello è costruito con forme semplici (low-poly) e ha la sua animazione: camminata, attesa e attacco.
- **Umanoidi:** colpo di spada, carica di lancia, rinculo del fucile, bastone che si illumina, doppio pugno dei giganti.
- **Mech:** passo pesante, torso che scansiona il campo, fumo dai camini.
- **Animali e mostri:** droni con eliche, vermi che ondeggiano, lucertola con coda e bava acida, ragno a 8 zampe, idra con 3 teste indipendenti, serpente astrale con ali.
- **Altri:** dirigibile che sgancia bombe, folletto con ali e scintille, spettro fluttuante con mantello sfilacciato.
- **Strutture:** scudo che pulsa, nido che respira, torretta con vapore e fiammata, portale che vortica.

Le torri mirano al bersaglio e quella centrale dorme finché non viene colpita. Gli incantesimi cadono sul campo come modelli 3D.
