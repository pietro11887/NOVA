# Nova Grand Prix

Gioco di Formula 1 in 3D (Three.js) con grafica low-poly sul Circuito Nova (3,75 km, 26 curve: tornanti, esse e chicane).

Modalità: **Gara contro i bot** (1–30 giri, box dalle gare da 8 giri con mescole morbide/medie/dure e riparazioni, 1–19 avversari, forza dei bot 1–110, posizione di partenza a scelta) e **Prova a tempo** da solo con fantasma del record.

Avvio: servi la cartella con un server statico (es. `npx serve f1-racing` oppure `python3 -m http.server` dentro `f1-racing/`) e apri `index.html`. Three.js viene caricato da jsDelivr.

## Struttura
- `src/trackData.js` – tracciato (spline, cordoli, ghiaia, muri)
- `src/track.js` – mesh della pista e interrogazione della superficie
- `src/physics.js` – dinamica del veicolo (gomme, sospensioni, aerodinamica, motore, collisioni, danni)
- `src/carModel.js` – modello della monoposto
- `src/scenery.js` – terreno, alberi, tribune, box, semaforo
- `src/ai.js` – pilota automatico dei bot (la forza cambia aderenza sfruttata, frenata, potenza e riflessi)
- `src/pit.js` – corsia box (ingresso prima della chicane finale tenendo la destra, limitatore 80 km/h); la vettura va da sola alla piazzola mentre scegli gomme e riparazioni
- `src/race.js` – gara: griglia, contatti tra vetture, giri, classifica e distacchi
- `src/racingLine.js` – linea ideale (verde/giallo/rosso) e profilo di velocità
- `src/effects.js` – particelle, segni delle gomme, detriti
- `src/audio.js`, `src/input.js`, `src/main.js` – audio, comandi, loop di gioco e HUD

## Comandi
Telefono (in orizzontale): ◀ ▶ a sinistra per sterzare, FRENO e GAS a destra. Nel menu "Sterzo: Inclinazione" attiva lo sterzo col giroscopio (tieni premuto a destra per accelerare, a sinistra per frenare).

Tastiera: ↑/W gas · ↓/S freno (tenuto da fermo = retromarcia) · ←→ sterzo · E/Q marce (manuale) · C telecamera · R rimetti in pista · M audio · P pausa. Supporta anche il gamepad.
