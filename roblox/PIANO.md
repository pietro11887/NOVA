# Nova Grand Prix su Roblox — piano

Il gioco web è in `f1-racing/` (three.js). Questa cartella è per la versione Roblox.
Lavoro fatto in Roblox Studio sul PC di Pietro (cartella "nova gp roblox"), con Rojo + Luau.

## Obiettivo
Corse online: lobby → sala d'attesa → qualifica → gara → podio → ritorno al lobby.

## Fasi
1. **Monza guidabile, giro singolo**: pista costruita dai punti di `f1-racing/src/tracks/monzaData.js`
   (`points`: [x, y, z, mezzaLarghezza] in metri, x est, z sud, ordine di gara; 1447 punti, ~5787 m),
   macchina F1 guidabile (tastiera, gamepad, touch), telecamera da dietro, cronometro con 3 settori.
2. **Più giocatori sulla stessa pista**: posizioni, giri, tempi calcolati dal server (anti-trucco).
3. **Lobby + gare**: tabellone delle gare aperte (MemoryStoreService/MessagingService),
   server riservati per ogni gara (TeleportService:ReserveServer).

## Opzioni di chi crea la gara
- pista e classe (F1 / GT)
- riempi con l'IA: sì/no, quante macchine, forza (IA 60–110)
- qualifica: nessuna, 5, 10, 15 minuti, oppure giro secco
- numero di giri della gara
- piloti minimi per partire, gara privata (amici / invito)

## Note
- 1 m ≈ 3 stud (scala da tarare).
- Ogni giocatore simula la propria macchina sul suo dispositivo (network ownership), il server controlla i giri.
- Il codice va riscritto in Luau; idee da riusare: traiettoria ideale, IA, cronometro/settori, fantasma.
