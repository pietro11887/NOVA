#!/usr/bin/env bash
# Costruisce l'app per Windows (Electron): il gioco completo in una finestra sua, senza browser, offline.
#   uso:  tools/build_desktop.sh [cartella di lavoro] [piattaforma: win32|linux]
#   esce: <lavoro>/Nova-Grand-Prix-win32-x64.zip  (dentro: "Nova Grand Prix.exe")
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$SRC/../dist-desktop}"
PLAT="${2:-win32}"
ELECTRON="${ELECTRON_VERSION:-33.4.11}"
APP="$WORK/app"
mkdir -p "$WORK"
[ -d "$APP" ] && find "$APP" -mindepth 1 -delete
mkdir -p "$APP/game"
cp "$SRC/desktop/package.json" "$SRC/desktop/main.cjs" "$APP/"
# il gioco (versione completa)
cp "$SRC/index.html" "$SRC/style.css" "$SRC/manifest.webmanifest" "$SRC"/icon-*.png "$APP/game/"
cp -r "$SRC/src" "$SRC/assets" "$APP/game/"
# three.js e il carattere dei menu dentro l'app (niente internet)
TMP="$WORK/tmp"; mkdir -p "$TMP"
if [ ! -d "$TMP/three/package" ]; then
  (cd "$TMP" && npm pack three@0.160.0 --silent >/dev/null && mkdir -p three && tar -xzf three-0.160.0.tgz -C three)
fi
mkdir -p "$APP/game/vendor/three/build" "$APP/game/vendor/three/examples"
cp "$TMP/three/package/build/three.module.js" "$APP/game/vendor/three/build/"
cp -r "$TMP/three/package/examples/jsm" "$APP/game/vendor/three/examples/"
mkdir -p "$APP/game/vendor/fonts"
CSS_URL='https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,400;0,600;0,700;0,900;1,900&display=swap'
curl -s -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' "$CSS_URL" -o "$TMP/fonts.css"
python3 - "$TMP/fonts.css" "$APP/game/vendor/fonts" "$APP/game/index.html" <<'PY'
import sys, re, os, urllib.request
css_p, out, idx = sys.argv[1:4]
css = open(css_p).read()
urls = sorted(set(re.findall(r'url\((https://[^)]+)\)', css)))
for k, u in enumerate(urls):
    name = f'titillium-{k}.woff2'
    with urllib.request.urlopen(u) as r: open(os.path.join(out, name), 'wb').write(r.read())
    css = css.replace(u, name)
open(os.path.join(out, 'fonts.css'), 'w').write(css)
h = open(idx, encoding='utf-8').read()
h = re.sub(r'<link rel="preconnect"[^>]*>\s*', '', h)
h = re.sub(r'<link href="https://fonts\.googleapis\.com[^"]*" rel="stylesheet">', '<link href="vendor/fonts/fonts.css" rel="stylesheet">', h)
h = h.replace('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', './vendor/three/build/three.module.js')
h = h.replace('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/', './vendor/three/examples/jsm/')
open(idx, 'w', encoding='utf-8').write(h)
print('font:', len(urls), 'file')
PY
# Electron e il programma che impacchetta l'app
if [ ! -d "$TMP/tools/node_modules/@electron/packager" ]; then
  mkdir -p "$TMP/tools" && (cd "$TMP/tools" && npm init -y >/dev/null && npm install --silent --ignore-scripts @electron/packager@18 >/dev/null)
fi
(cd "$TMP/tools" && node -e "
const { packager } = require('@electron/packager');
packager({ dir: '$APP', name: 'Nova Grand Prix', platform: '$PLAT', arch: 'x64', electronVersion: '$ELECTRON', out: '$WORK/dist', overwrite: true, asar: false, prune: false })
  .then(p => console.log('fatto:', p.join(', '))).catch(e => { console.error(e); process.exit(1); });
")
OUTDIR="$WORK/dist/Nova Grand Prix-$PLAT-x64"
ZIP="$WORK/Nova-Grand-Prix-$PLAT-x64.zip"
rm -f "$ZIP"
(cd "$WORK/dist" && zip -qr -9 "$ZIP" "Nova Grand Prix-$PLAT-x64")
du -sh "$OUTDIR" "$ZIP"
