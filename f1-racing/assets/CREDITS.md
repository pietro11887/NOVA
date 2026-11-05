# Crediti dei modelli 3D

**Porsche 992 GT3 R** — autore: [MattDoesBlender](https://sketchfab.com/MattDoesBlender)
Fonte: https://sketchfab.com/3d-models/porsche-992-gt3-r-03ea07f7972648aa9350853b2a1a942a
Licenza: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

File in questa cartella (`gt3r_hi.glb`, `gt3r_mid.glb`, `gt3r_int.glb` = abitacolo; `f1_rb22_int.glb` = volante e abitacolo della RB22) = versioni modificate per il gioco:
abitacolo rimosso, numero di poligoni ridotto (meshoptimizer), texture ridimensionate e convertite in WebP.
Queste versioni modificate sono distribuite con la stessa licenza CC BY-NC-SA 4.0. Uso non commerciale.

**2026 Red Bull Racing RB22** — autore: [Dave Love](https://sketchfab.com/Tyler_Dave)
Fonte: https://sketchfab.com/3d-models/2026-red-bull-racing-rb22-8e5a68a7991c4a46bd66a879c060b3c5
Licenza: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

File `f1_rb22_hi.glb`, `f1_rb22_mid.glb` = versioni modificate per il gioco: volante, cinture e led
dell'abitacolo rimossi (nella versione per i bot anche sospensioni e freni), poligoni ridotti
(meshoptimizer), texture ridimensionate e convertite in WebP. Nel gioco le livree dei bot sono
ridipinte con altri colori.

## Texture fotografiche (Baku)
Da [Poly Haven](https://polyhaven.com), licenza **CC0** (pubblico dominio), ridimensionate e ricompresse:
- `tex/asphalt_*` — "Asphalt Track"
- `tex/limestone_*` — "Seaworn Sandstone Brick"
- `tex/oldwall_*` — "White Sandstone Blocks 02"
- `tex/concrete_*` — "Concrete Wall 008"
- `tex/pavers_*` — "Concrete Pavers 02"
- `tex/grass_*` — "Leafy Grass"
- `tex/bark_*` — "Bark Platanus"
- `tex/leaves.webp` — ciuffi di foglie composti dalle foto delle foglie di "Island Tree 01"
- `tex/gravel_*` — "Gravel Floor 02" (Poly Haven, CC0)

## Spa-Francorchamps
Ricostruita da zero con dati pubblici: tracciato, corsia box, boschi, prati, strade ed edifici da
© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL); quote del terreno dal modello
EU-DEM 25 m (Copernicus Land Monitoring Service, via OpenTopoData). Il modulo `src/tracks/spaData.js` è generato da questi dati.

## Suoni (`sounds/`)
- `eng-f1/1..10.mp3` (V12 "v12d") e `eng-gt/1..8.mp3` (6 in linea "b-i6r"): motori registrati a giri costanti (1000 giri per file)
  da **CryHam** per [Stunt Rally 3](https://github.com/stuntrally/stuntrally3) con engine-sim — licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- `sfx/turbo.mp3`: CryHam (Stunt Rally), CC0.
- `sfx/crash01..12.mp3`, `sfx/scrap.mp3`, `sfx/screech.mp3`, `sfx/shift.mp3`: **Halleck** su Freesound (metal hits, roll cage hits, metal screech),
  tagliati per Stunt Rally — licenza [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Le versioni convertite qui restano CC BY-SA 3.0.
- `sfx/squeal.mp3`: "Car tire squeal skid loop" di **qubodup** su [OpenGameArt](https://opengameart.org/content/car-tire-squeal-skid-loop) — CC BY 3.0.
Modifiche: conversione in mp3 mono; nel gioco i file vengono resi ciclici (dissolvenza tra fine e inizio) e uniformati di volume.
- `amb/crowd.mp3`, `amb/cheer1..3.mp3`: "Free Crowd Cheering Sounds" di **Gregor Quendel** ([OpenGameArt](https://opengameart.org/content/free-crowd-cheering-sounds)) — CC BY 4.0 (tagliati, mono).
- `amb/thunder.mp3`: "Thunder, Very Close, Rain, 01" di **InspectorJ** (www.jshaw.co.uk) — CC BY 3.0 (tagliato, dissolvenza).
- `amb/rain.mp3`: "Rain (loopable)" di ylmir — CC0. `amb/water.mp3`: "40 CC0 water/splash" di rubberduck — CC0.
- `amb/gun1-2.mp3`, `drop`, `jack`, `clatter`: "68 Workshop Sounds" di Bart Kelsey — CC0. `amb/static.mp3`: "Static" di xhunterko — CC0.
