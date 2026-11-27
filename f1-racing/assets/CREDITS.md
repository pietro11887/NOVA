# Crediti dei modelli 3D

**Porsche 992 GT3 R** — autore: [MattDoesBlender](https://sketchfab.com/MattDoesBlender)
Fonte: https://sketchfab.com/3d-models/porsche-992-gt3-r-03ea07f7972648aa9350853b2a1a942a
Licenza: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

File in questa cartella (`gt3r_hi.glb`, `gt3r_mid.glb`, `gt3r_int.glb` = abitacolo; `f1_rb22_int.glb` = volante e abitacolo della RB22) = versioni modificate per il gioco:
abitacolo rimosso, numero di poligoni ridotto (meshoptimizer), texture ridimensionate e convertite in WebP.
Queste versioni modificate sono distribuite con la stessa licenza CC BY-NC-SA 4.0. Uso non commerciale.

**2006 Renault R26** — autore: [Dave Love](https://sketchfab.com/Tyler_Dave) (Sketchfab), CC BY 4.0
Fonte: https://sketchfab.com/3d-models/2006-renault-r26-23a73ec3a9234017b393362fc58b6c10
Licenza: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

File `r26_hi.glb`, `r26_mid.glb` = versioni modificate per il gioco (script `tools/build_r26.mjs`): ruote separate in
quattro, gomme rifatte più leggere, ruote "mosse" finte tolte, poligoni ridotti, texture ridimensionate (jpg/png);
nel gioco le livree delle altre squadre 2006 sono ridipinte sulla texture originale.

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
- `eng-v10/*.mp3` (F1 classiche V10: MP4/5, F2002, F2004): registrazione `renault-v10.wav` di [TORCS](https://torcs.sourceforge.net/) /
  [Speed Dreams](https://www.speed-dreams.net/) — licenza GPL (dati del gioco). Ricampionata a 10 regimi per il gioco.
- `eng-v8/*.mp3` (F1 classiche V8: R26, RB8): `v8_formula.wav` di Speed Dreams (June Ravenmoon), da un passaggio di una vettura GT V8
  registrato da [Heigh-hoo su Freesound](https://freesound.org/people/Heigh-hoo/sounds/128611/) — licenza CC0. Ricampionata a 10 regimi.
- `sfx/crash01..12.mp3`, `sfx/scrap.mp3`, `sfx/screech.mp3`, `sfx/shift.mp3`: **Halleck** su Freesound (metal hits, roll cage hits, metal screech),
  tagliati per Stunt Rally — licenza [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Le versioni convertite qui restano CC BY-SA 3.0.
- `sfx/squeal.mp3`: "Car tire squeal skid loop" di **qubodup** su [OpenGameArt](https://opengameart.org/content/car-tire-squeal-skid-loop) — CC BY 3.0.
Modifiche: conversione in mp3 mono; nel gioco i file vengono resi ciclici (dissolvenza tra fine e inizio) e uniformati di volume.
- `amb/crowd.mp3`, `amb/cheer1..3.mp3`: "Free Crowd Cheering Sounds" di **Gregor Quendel** ([OpenGameArt](https://opengameart.org/content/free-crowd-cheering-sounds)) — CC BY 4.0 (tagliati, mono).
- `amb/thunder.mp3`: "Thunder, Very Close, Rain, 01" di **InspectorJ** (www.jshaw.co.uk) — CC BY 3.0 (tagliato, dissolvenza).
- `amb/rain.mp3`: "Rain (loopable)" di ylmir — CC0. `amb/water.mp3`: "40 CC0 water/splash" di rubberduck — CC0.
- `amb/gun1-2.mp3`, `drop`, `jack`, `clatter`: "68 Workshop Sounds" di Bart Kelsey — CC0. `amb/static.mp3`: "Static" di xhunterko — CC0.

- `mp45_hi.glb`, `mp45_mid.glb`: "McLaren MP4/5 || Formula 1" di **dark_igorek** ([Sketchfab](https://sketchfab.com/3d-models/mclaren-mp45-formula-1-3059d4532ecd48ca8da41e1cac971f22)),
  licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modificato (tools/build_mp45.mjs): scala vera, ruote separate,
  poligoni ridotti, texture compresse (livrea originale del modello).

**2002 Ferrari F2002**, **2004 Ferrari F2004**, **2012 Red Bull RB8** — autore: [Dave Love](https://sketchfab.com/Tyler_Dave) (Sketchfab), licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
Fonti: https://sketchfab.com/3d-models/2002-ferrari-f2002-cf638e7ccd4d42a4bcfdbd4de7eaeddf ·
https://sketchfab.com/3d-models/2004-ferrari-f2004-827e64acecba4f008759ae30a5bfeecc ·
https://sketchfab.com/3d-models/2012-red-bull-rb8-b74446dcd93a49879546d756e3093b3f
File `f2002_*.glb`, `f2004_*.glb`, `rb8_*.glb` = versioni modificate (script `tools/build_classic.mjs`): scala vera, ruote separate
in quattro, ruote "mosse" finte tolte, gomme della F2004 rifatte leggere, poligoni ridotti, texture ridimensionate;
nel gioco le livree delle altre squadre sono ridipinte sulla texture originale.

**2020 F1 Mercedes-Benz W11** — autore: [OUTPISTON](https://sketchfab.com/outpiston)
Fonte: https://sketchfab.com/3d-models/2020-f1-mercedes-benz-w11-6c0e669402c34133b4b516f4ca2ba9e4
Licenza: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — uso non commerciale.
File `w11_hi.glb`, `w11_mid.glb` = versioni modificate (script `tools/build_classic.mjs`): ruote separate in quattro,
poligoni ridotti, texture ridimensionate; distribuite con la stessa licenza CC BY-NC-SA 4.0.

## GT3 (oltre alla Porsche)
**2025 Ferrari 296 GT3 Verstappen Racing**, **Mercedes SLS GT3** — autore: [Dave Love](https://sketchfab.com/Tyler_Dave) (Sketchfab), licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
Fonti: https://sketchfab.com/3d-models/2025-ferrari-296-gt3-verstappen-racing-b2dcbf78f04a4e108321f7cdfc2a5c44 ·
https://sketchfab.com/3d-models/mercedes-sls-gt3-5ec93bea4816494cbe3e7333bbfca5f6
**BMW M4 GT3** — autore: [toddeppe](https://sketchfab.com/toddeppe) (Sketchfab), licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
Fonte: https://sketchfab.com/3d-models/bmw-m4-gt3-cbf6fd3ea47f41b3aad3f385ee0ee853
File `gt_f296_*.glb`, `gt_sls_*.glb`, `gt_m4_*.glb` = versioni modificate (script `tools/build_gt.mjs`): abitacolo tolto,
scala vera dal passo, ruote separate in quattro, poligoni ridotti, texture ridimensionate. Non incluse nell'edizione pubblica.
**2013 Aston Martin Vantage GT3** — modello da Sketchfab (scaricato da Pietro; autore e licenza da riportare qui dalla pagina del modello).
File `gt_aston_*` = `gt_amv_*.glb`: versioni modificate (script `tools/build_gt.mjs`): abitacolo tolto, ruote separate, texture ridotte.
**Mercedes-AMG GT3 Red Bull Racing** — autore: [VTX](https://sketchfab.com/VTX_car) (Sketchfab), licenza [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — uso non commerciale.
Fonte: https://sketchfab.com/3d-models/mercedes-amg-gt3-red-bull-racing-035f061cb6624effbc483d5f9b5ecaba
File `gt_amg_*.glb` = versioni modificate (script `tools/build_gt.mjs`): abitacolo tolto, ruote separate, poligoni e texture ridotti; stessa licenza.
**McLaren 720S GT3 Inception Racing** — autore: [VTX](https://sketchfab.com/VTX_car) (Sketchfab), licenza [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — uso non commerciale.
Fonte: https://sketchfab.com/3d-models/mclaren-720s-gt3-inception-racing-3e2c50dea242474cb74e1f8b196b4315
File `gt_mcl_*.glb` = versioni modificate (script `tools/build_gt.mjs`): abitacolo tolto, ruote separate, poligoni e texture ridotti; stessa licenza.
**Subaru BRZ GT300 2021** — "Subaru Brz GT3 300 2021 | www.vecarz.com" di [vecarz](https://sketchfab.com/heynic) (Sketchfab), licenza [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/)
Fonte: https://sketchfab.com/3d-models/subaru-brz-gt3-300-2021-wwwvecarzcom-2036561eb728405c803b2c57303b961d
File `gt_brz_*.glb` = versioni modificate (script `tools/build_gt.mjs`): abitacolo tolto, ruote separate, poligoni e texture ridotti.

- Kart (`kart_hi.glb`, `kart_mid.glb`): modello "Go-Kart" da Sketchfab (OBJ con texture PBR), convertito con `tools/build_kart_model.mjs`; pilota disegnato dal gioco.
- NASCAR (`nascar_hi.glb`, `nascar_mid.glb`, `nascar_int.glb`): "NASCAR Camaro 2018" (vecarz.com, Sketchfab), convertito con `tools/build_gt.mjs nas`.
- Hypercar: Ferrari 499P (`hy_fer_*`, Dave Love, CC BY 4.0), Porsche 963 (`gt_hpor_*`, DisneyCars, Sketchfab), Cadillac V-Series.R (`gt_hcad_*`, vecarz / Nic Cheung, CC BY 4.0), convertiti con `tools/build_gt.mjs`.
- Hypercar: BMW M Hybrid V8 (`gt_hbmw_*`, vecarz / Nic Cheung, CC BY 4.0), Lamborghini SC63 (`gt_hlam_*`, Sketchfab, FBX convertito con three.js), convertiti con `tools/build_gt.mjs`.
- Stradali: Ferrari F40 (`gt_f40_*`, Sketchfab, OBJ convertito con three.js; vernice rossa), Fiat Uno Turbo i.e. 1995 (`gt_uno_*`, subishi, CC BY 4.0, FBX senza colori: colori veri assegnati con `tools/uno_mats.mjs`), convertiti con `tools/build_gt.mjs`.
- Stradali: Fiat Multipla 1998 (`gt_mul_*`, "Fiat Multipla 1998 3D Model" di Betier Models, https://sketchfab.com/3d-models/fiat-multipla-1998-3d-model-53cb07fa6a264cca811952c7ff3f3b38, CC BY 4.0), Toyota Yaris 2001 (`gt_yar_*`, Sketchfab), convertiti con `tools/build_gt.mjs`.
- Stradali: Mazda MX-5 NA (`gt_mx5_*`, "Mazda Miata mx-5" di Black Snow, https://sketchfab.com/3d-models/mazda-miata-mx-5-e074e29ccc3847dca74ed5e9cb92d3e7, CC BY 4.0), convertita con `tools/build_gt.mjs`; fari a scomparsa animati dal gioco.
- Stradali (giro 1): `gt_panda_*` — "Fiat Panda 1984" di Bratva02 (https://sketchfab.com/3d-models/fiat-panda-1984-72669ecac7564a389f2c7714a16f71fb), licenza CC Attribution, convertito con `tools/build_gt.mjs panda`.
- Stradali (giro 1): `gt_punto_*` — "(FREE) 1995 Fiat Punto GT" di Lionsharp Studios (https://sketchfab.com/3d-models/free-1995-fiat-punto-gt-48db6facb4b64e99b60f36b8c01185e1), licenza CC Attribution, convertito con `tools/build_gt.mjs punto`.
- Stradali (giro 1): `gt_golf_*` — "1992 Volkswagen Golf GTI Mk2" di Ddiaz Design (https://sketchfab.com/3d-models/1992-volkswagen-golf-gti-mk2-1fb8f26b105445fbaa98ca2577f7067e), licenza CC Attribution-NonCommercial-ShareAlike, convertito con `tools/build_gt.mjs golf`.
- Stradali (giro 1): `gt_clio_*` — "Renault Clio Williams" di Mona x Supercars (https://sketchfab.com/3d-models/renault-clio-williams-1dad7e4438c74f3b8bac1ab72acd78ed), licenza CC Attribution, convertito con `tools/build_gt.mjs clio`.
- Stradali (giro 1): `gt_fiesta_*` — "2009 Ford Fiesta Zetec S" di Ddiaz Design (https://sketchfab.com/3d-models/2009-ford-fiesta-zetec-s-5f56074036414cdcb5f1f851b1222a61), licenza CC Attribution-NonCommercial-ShareAlike, convertito con `tools/build_gt.mjs fiesta`.
- Stradali (giro 1): `gt_corsa_*` — "Opel Corsa B 3door 1998" di Nieve5677 (https://sketchfab.com/3d-models/opel-corsa-b-3door-1998-e79106fd735340a8a295f381ce58e7c8), licenza CC Attribution, convertito con `tools/build_gt.mjs corsa`.
- Stradali (giro 1): `gt_e46_*` — "BMW M3 E46" di Lexyc16 (https://sketchfab.com/3d-models/bmw-m3-e46-a067132c75f5456daa4f60c4001337d7), licenza CC Attribution-NonCommercial, convertito con `tools/build_gt.mjs e46`.
- Stradali (giro 1): `gt_delta_*` — "FREE Lancia Delta HF Integrale evo 2" di TARANTULA (https://sketchfab.com/3d-models/free-lancia-delta-hf-integrale-evo-2-85614131e0dc4613a948472aaa935fc7), licenza CC Attribution, convertito con `tools/build_gt.mjs delta`.
- Stradali (giro 1): `gt_countach_*` — "Lamborghini Countach 5000QV | www.vecarz.com" di vecarz (https://sketchfab.com/3d-models/lamborghini-countach-5000qv-wwwvecarzcom-309d92b27c1041a3ab79b8919e7d92b5), licenza CC Attribution, convertito con `tools/build_gt.mjs countach`.
- Stradali (giro 1): `gt_ae86_*` — "Toyota Corolla AE86 Trueno" di Lexyc16 (https://sketchfab.com/3d-models/toyota-corolla-ae86-trueno-fe02fba6302e450ea8424591493341ea), licenza CC Attribution, convertito con `tools/build_gt.mjs ae86`.
