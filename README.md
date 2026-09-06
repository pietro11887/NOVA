# NOVA CITY

Open world 3D in stile GTA, giocabile **direttamente dal browser del telefono**.
Nessun download, nessun motore esterno: HTML + moduli ES + Three.js (incluso nel
repo, quindi funziona anche offline).

![NOVA CITY](https://img.shields.io/badge/three.js-r160-000?style=flat-square)

## Come si gioca

Apri `index.html` con un qualsiasi server statico e premi **GIOCA**.

```bash
# dalla cartella del progetto
python3 -m http.server 8000
# poi apri http://localhost:8000 (dal telefono: http://IP-DEL-PC:8000)
```

Su GitHub Pages basta pubblicare la branch: il gioco è già pronto così com'è.

### Comandi

| Azione | Telefono | PC |
| --- | --- | --- |
| Muoversi / guidare | joystick a sinistra | `W A S D` |
| Camera | trascina nella metà destra | mouse |
| Corri | pulsante **CORSA** | `Shift` |
| Salta / freno a mano | pulsante **SALTA** | `Spazio` |
| Entra in auto, nei negozi, parla | pulsante **AZIONE** | `E` |
| Colpisci / spara / clacson | pulsante **COLPO** | click sinistro |
| Pausa | pulsante **II** in alto | `Esc` |

### Versione in un unico file

`dist/nova-city.html` contiene tutto il gioco (CSS, JavaScript e three.js) in
un solo file: si apre con un doppio clic, si manda via chat o si carica dove
non è possibile pubblicare più file. Per rigenerarlo dopo una modifica:

```bash
npm i -D esbuild
node tools/build-single.mjs
```

## Cosa c'è nella città

- **Città procedurale 8×8 isolati**: centro con grattacieli, zona commerciale,
  periferia con villette, parchi con fontana e alberi. Strade a due corsie con
  semafori sincronizzati, strisce pedonali, marciapiedi, lampioni e idranti.
- **Negozi in cui si entra davvero** (insegna al neon verde sulla minimappa):
  Burger Shot, Farmacia, Mini Market, Ammu Nova, Threads, Bar Luna, Garage e
  Casa. Ogni locale ha il suo interno, il commesso e un menu di acquisto:
  cure, armatura, pistola, vestiti, riparazioni, auto nuove, salvataggio.
- **Traffico vero**: le auto seguono il grafo stradale, tengono la destra,
  si fermano al rosso e in coda, suonano il clacson. Le auto in sosta si
  possono rubare; quelle in marcia anche, ma costa una stella.
- **Pedoni** che camminano sui marciapiedi, attraversano agli incroci,
  scappano quando succede qualcosa e vengono investiti se guidi male.
- **Polizia**: ogni crimine alza il livello di ricercato (fino a 5 stelle).
  Arrivano le volanti, scendono gli agenti, ti sparano e possono arrestarti
  (multa e stelle azzerate). Se li semini abbastanza a lungo, le stelle calano.
- **Lavori**: taxi, consegne e gare a checkpoint, con marker gialli in giro
  per la città, tempo limite e ricompensa in denaro.
- **Ciclo giorno/notte** con vetrine e lampioni che si accendono, fari delle
  auto e insegne al neon.
- **Salvataggio automatico** su `localStorage` (soldi, salute, arma, ora,
  missioni completate). Si può azzerare dal menu di pausa.

## Prestazioni sul telefono

- geometria della città unita per isolato (poche decine di draw call);
- niente ombre dinamiche: ogni personaggio e veicolo ha la sua ombra finta;
- pedoni e traffico "streammati" attorno al giocatore, quelli lontani si
  aggiornano a frequenza ridotta;
- risoluzione adattiva: se gli FPS calano, il gioco abbassa da solo il
  pixel ratio (in pausa si può forzare Qualità Alta/Bassa).

## Struttura del codice

```
index.html          markup, HUD, controlli touch
styles.css          interfaccia (mobile first, safe-area, landscape)
vendor/             three.js r160 (module build)
src/core/           config, utilità e geometria, input, audio sintetizzato
src/world/          generatore città, texture procedurali, modelli, interni
src/entities/       giocatore, veicoli, pedoni, traffico, polizia
src/systems/        HUD + minimappa, missioni
src/main.js         ciclo di gioco, giorno/notte, regole, salvataggi
```

Tutte le texture (asfalto, facciate, insegne, marciapiedi) e tutti i suoni
(motore, sirena, spari, clacson) sono generati a runtime: il gioco non
carica un solo asset esterno.
