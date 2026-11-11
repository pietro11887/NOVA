#!/usr/bin/env bash
# Crea l'edizione pubblica del gioco (da caricare su itch.io come gioco HTML):
# stessi file della versione completa, ma con l'interruttore NOVA_PUBLIC acceso in index.html
# (nomi, sponsor e circuiti inventati, niente loghi veri) e senza i file delle F1 storiche.
#   uso:  tools/build_public.sh [cartella di uscita]   ->  <uscita>/nova-grand-prix/ e <uscita>/nova-grand-prix.zip
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$SRC/../dist-public}"
DIR="$OUT/nova-grand-prix"
rm -rf "$DIR" "$OUT/nova-grand-prix.zip"
mkdir -p "$DIR"
cp "$SRC/index.html" "$SRC/style.css" "$SRC/manifest.webmanifest" "$SRC"/icon-*.png "$DIR/"
cp -r "$SRC/src" "$DIR/src"
mkdir -p "$DIR/assets"
# modelli: solo F1 2026 (RB22 ridipinta) e GT; niente F1 storiche
for f in f1_rb22_hi.glb f1_rb22_mid.glb f1_rb22_int.glb gt3r_hi.glb gt3r_mid.glb gt3r_int.glb CREDITS.md; do cp "$SRC/assets/$f" "$DIR/assets/"; done
cp -r "$SRC/assets/tex" "$DIR/assets/tex"
mkdir -p "$DIR/assets/sounds"
for d in amb sfx eng-f1 eng-gt; do cp -r "$SRC/assets/sounds/$d" "$DIR/assets/sounds/$d"; done
# interruttore dell'edizione pubblica, prima del codice del gioco
python3 - "$DIR/index.html" <<'PY'
import sys, re
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = s.replace('<script type="module" src="src/main.js', '<script>window.NOVA_PUBLIC = true;</script>\n<script type="module" src="src/main.js', 1)
# crediti: via le righe delle F1 storiche (i loro file non ci sono)
s = re.sub(r'\s*<p>[^<]*(R26|MP4/5|F2002|F2004|RB8|W11|Renault R26)[\s\S]*?</p>', '', s)
open(p, 'w', encoding='utf-8').write(s)
PY
(cd "$DIR" && zip -qr ../nova-grand-prix.zip .)
du -sh "$DIR" "$OUT/nova-grand-prix.zip"
