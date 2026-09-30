# Nova Grand Prix

Gioco di Formula 1 in 3D (Three.js) con grafica low-poly: time trial sul Circuito Nova (3,29 km, ispirato a Spa).

Avvio: servi la cartella con un server statico (es. `npx serve f1-racing` oppure `python3 -m http.server` dentro `f1-racing/`) e apri `index.html`. Three.js viene caricato da jsDelivr.

## Struttura
- `src/trackData.js` – tracciato (spline, cordoli, ghiaia, muri)
- `src/track.js` – mesh della pista e interrogazione della superficie
- `src/physics.js` – dinamica del veicolo (gomme, sospensioni, aerodinamica, motore, collisioni, danni)
- `src/carModel.js` – modello della monoposto
- `src/scenery.js` – terreno, alberi, tribune, box, semaforo
- `src/racingLine.js` – linea ideale (verde/giallo/rosso) e profilo di velocità
- `src/effects.js` – particelle, segni delle gomme, detriti
- `src/audio.js`, `src/input.js`, `src/main.js` – audio, comandi, loop di gioco e HUD

## Comandi
Telefono (in orizzontale): ◀ ▶ a sinistra per sterzare, FRENO e GAS a destra. Nel menu "Sterzo: Inclinazione" attiva lo sterzo col giroscopio (tieni premuto a destra per accelerare, a sinistra per frenare).

Tastiera: ↑/W gas · ↓/S freno (tenuto da fermo = retromarcia) · ←→ sterzo · E/Q marce (manuale) · C telecamera · R rimetti in pista · M audio · P pausa. Supporta anche il gamepad.
