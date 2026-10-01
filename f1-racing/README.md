# Nova Grand Prix

Gioco di corse in 3D (Three.js) con grafica low-poly: si sceglie tra Formula 1 (Red Bull RB22 2026, 798 kg, ~1000 CV, tanto carico aerodinamico) e vetture GT3 (4,65 m, passo 2,6 m, ≈1240 kg, ≈560 CV, poco carico aerodinamico: staccate lunghe, scia e tecnica per superare) su due circuiti: il Circuito Nova (3,75 km, 26 curve: tornanti, esse e chicane) e il **Baku City Circuit** (6,0 km), ricostruito dai dati OpenStreetMap con le stesse curve, larghezze (7,6 m al castello), salita nella Città Vecchia, corsia box vera e la città intorno. Il circuito si sceglie dal menu, dopo GARA o PROVA A TEMPO.

Modalità: **Gara contro i bot** (1–30 giri, box dalle gare da 8 giri con mescole morbide/medie/dure e riparazioni, 1–19 avversari, forza dei bot 1–110, posizione di partenza a scelta) e **Prova a tempo** da solo con fantasma del record.

Avvio: servi la cartella con un server statico (es. `npx serve f1-racing` oppure `python3 -m http.server` dentro `f1-racing/`) e apri `index.html`. Three.js viene caricato da jsDelivr.

## Struttura
- `src/trackData.js` – tracciati (spline, larghezza per punto, cordoli, ghiaia, muri, vie di fuga, corsia box)
- `src/tracks/bakuData.js` – Baku dai dati OSM: tracciato in ordine di gara, quote, larghezze, corsia box, edifici, strade, parchi, costa, alberi
- `src/track.js` – mesh della pista e interrogazione della superficie
- `src/physics.js` – dinamica del veicolo (gomme, sospensioni, aerodinamica, motore, collisioni, danni)
- `src/vehicle.js` – categoria scelta (GT3 o Formula 1): misure, masse, aerodinamica, assetto e parametri dei bot
- `src/gtModel.js` – carica la Porsche 992 GT3 R o la Red Bull RB22 (`assets/`), ruote, colori delle squadre, parti staccabili
- `src/carModel.js` – geometria di riferimento e modello procedurale di riserva
- `src/scenery.js` – ambientazione: cielo con nuvole, montagne, campagna, lago, boschi, tribune con bandiere, spettatori, paddock, ponte, paese, pale eoliche, mongolfiere
- `src/sceneryBaku.js` – Baku: edifici estrusi dalle piante vere, strade, lungomare e Mar Caspio, mura merlate della Città Vecchia, Torre della Vergine, Flame Towers, torre della TV, Crystal Hall con la bandiera, box e tribune
- `src/ai.js` – pilota automatico dei bot (la forza cambia aderenza sfruttata, frenata, potenza e riflessi)
- `src/pit.js` – corsia box (ingresso prima della chicane finale tenendo la destra, limitatore 80 km/h); la vettura va da sola alla piazzola mentre scegli gomme e riparazioni
- `src/safetyCar.js` – safety car: entra dopo incidenti con rottami in pista, fila senza sorpassi (penalità), pulizia, rientro e ripartenza
- `src/race.js` – gara: griglia, contatti tra vetture, giri, classifica e distacchi
- `src/racingLine.js` – linea ideale (verde/giallo/rosso) e profilo di velocità
- `src/effects.js` – particelle, segni delle gomme, detriti
- `src/audio.js` – suoni sintetizzati: motore costruito scoppio per scoppio (V6 turbo F1 / boxer aspirato GT3), cambiate, scoppiettii, turbo, gomme, cordoli, ghiaia, vento, urti a strati, avversari con doppler, pubblico, box e radio con la voce
- `src/input.js`, `src/main.js` – comandi, loop di gioco e HUD

## Comandi
Telefono (in orizzontale): ◀ ▶ a sinistra per sterzare, FRENO e GAS a destra. Nel menu "Sterzo: Inclinazione" attiva lo sterzo col giroscopio (tieni premuto a destra per accelerare, a sinistra per frenare).

Tastiera: ↑/W gas · ↓/S freno (tenuto da fermo = retromarcia) · ←→ sterzo · E/Q marce (manuale) · C telecamera · R rimetti in pista · M audio · P pausa. Supporta anche il gamepad.

## Crediti
Modello 3D "2026 Red Bull Racing RB22" di [Dave Love](https://sketchfab.com/Tyler_Dave) ([Sketchfab](https://sketchfab.com/3d-models/2026-red-bull-racing-rb22-8e5a68a7991c4a46bd66a879c060b3c5)), licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): versioni modificate in `assets/f1_rb22_*.glb`.

Modello 3D "Porsche 992 GT3 R" di [MattDoesBlender](https://sketchfab.com/MattDoesBlender) ([Sketchfab](https://sketchfab.com/3d-models/porsche-992-gt3-r-03ea07f7972648aa9350853b2a1a942a)), licenza [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Le versioni ottimizzate in `assets/` (abitacolo rimosso, poligoni ridotti, texture WebP) sono distribuite con la stessa licenza. Progetto non commerciale. Dettagli in `assets/CREDITS.md`.

Baku City Circuit (tracciato, larghezze, corsia box) e la città intorno (edifici, strade, parchi, costa): dati © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licenza ODbL. Il modulo `src/tracks/bakuData.js` è generato dai dati OSM.
