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

## Come è fatta la grafica

Tutto è generato a runtime, senza un solo file di asset:

- **cielo atmosferico** (modello di Preetham) con sole, foschia e nuvole
  procedurali; la stessa cupola alimenta una mappa d'ambiente PMREM che dà
  riflessi a vetri, carrozzerie e acqua;
- **ombre dinamiche** proiettate dal sole, con la camera delle ombre
  agganciata al giocatore e allineata ai texel per non sfarfallare;
- **materiali PBR** con mappe di colore, normali e rugosità disegnate su
  canvas: intonaco, mattoni, cemento, vetrate a specchio, asfalto crepato,
  marciapiedi in lastre, sabbia, corteccia, parquet e piastrelle;
- **post-produzione**: tone mapping ACES, bloom sui neon, vignettatura,
  saturazione e una grana appena percettibile;
- **geometria non cubettata**: le carrozzerie nascono da sezioni collegate
  tra loro con normali ammorbidite, gli arti dei personaggi sono tronchi di
  cono, teste e capelli sono calotte sferiche, idranti, cestini e lampioni
  sono cilindri veri.

## Cosa c'è nella città

- **Griglia irregolare**: ogni colonna e ogni riga di isolati ha la sua
  larghezza (da 56 a 128 m), quindi la mappa non è un foglio a quadretti:
  strade a distanze diverse, isolati corti e isolati lunghi.
- **Luoghi riconoscibili** segnati sulla minimappa: commissariato (è lì che
  ti portano se ti arrestano), ospedale con elisuperficie (è lì che ti
  risvegli), tre distributori con pensilina e pompe, campo da basket
  recintato e un molo di legno che entra nel mare con chiosco e barche.
- **Città procedurale 8×8 isolati**: centro con grattacieli a vetri e
  arretramenti, fascia commerciale con palazzine colorate, balconi e scale
  antincendio, periferia con villette, garage e giardini, parchi con fontana,
  parcheggi e una spiaggia sul mare. Strade a due corsie con mezzeria
  tratteggiata, frecce di corsia, linee d'arresto, strisce pedonali,
  marciapiedi con cordolo, tombini, semafori a sbraccio, lampioni ricurvi,
  palme, panchine, cestini, idranti, parchimetri, pensiline e cassonetti.
- **Negozi in cui si entra davvero**, ognuno con un interno costruito su
  misura: la tavola calda con pavimento a scacchi, banco rosso e tavolini;
  la farmacia con croce verde e armadi; il market con corsie, frigoriferi e
  cassa; l'armeria con rastrelliere e vetrina; il negozio di vestiti con
  stender, camerini e manichini; il bar con bottiglie, sgabelli e biliardo;
  il garage col ponte sollevatore e il banco attrezzi; casa tua con letto,
  divano, TV e cucina. Ogni locale ha luci proprie, commesso e menu.
- **Guida vera**: modello a bicicletta con angolo di sterzo, aderenza
  laterale e freno a mano — l'auto non ruota più sul posto e in curva
  scivola invece di girare come una trottola.
- **Traffico vero**: berline, SUV, pick-up, sportive, furgoni, autobus e
  ambulanze seguono il grafo stradale, tengono la destra,
  si fermano al rosso e in coda, suonano il clacson. Le auto in sosta si
  possono rubare; quelle in marcia anche, ma costa una stella.
- **Pedoni con un carattere**: ognuno nasce pauroso, curioso, coraggioso o
  indifferente, e reagisce di conseguenza. Fermi non stanno impalati:
  telefonano, fumano, chiacchierano a coppie, salutano, si appoggiano al
  muro o si siedono sulle panchine.
- **Reazioni ai colpi**: chi viene colpito prima sussulta, poi decide — il
  coraggioso mette su la guardia e ti tira i pugni, gli altri scappano con
  le braccia in aria. Chi è vicino si accuccia, scappa o resta a filmare
  col telefono; il curioso dopo qualche secondo **chiama la polizia** e ti
  becchi una stella. Chi finisce a terra si rialza e scappa, se non l'hai
  conciato troppo male.
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
