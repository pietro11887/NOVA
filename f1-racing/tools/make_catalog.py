#!/usr/bin/env python3
"""Scrive src/tracks/realList.js: elenco dei circuiti veri (dati del menu + sagoma leggera) dai file <id>Data.js presenti."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
C = json.load(open(os.path.join(HERE, 'circuits.json')))
out = []
for tid, c in sorted(C.items(), key=lambda kv: kv[1].get('round', 99)):
    fn = os.path.join(ROOT, 'src', 'tracks', f'{tid}Data.js')
    if not os.path.exists(fn): continue
    s = open(fn).read(); d = json.loads(s[s.index('{'):s.rindex('}') + 1])
    P = d['points']; k = max(1, len(P) // 90)
    outline = [[round(p[0]), round(p[2])] for p in P[::k]]
    out.append({'id': tid, 'name': c['name'], 'short': c.get('short'), 'place': c['place'], 'flag': c['flag'], 'km': c['km'], 'corners': c['corners'],
                'info': c['info'], 'round': c.get('round'), 'climate': c.get('climate', 'temperate'), 'street': bool(c.get('street')), 'hw': c.get('hw', 6.5),
                'fans': c.get('fans'), 'outline': outline, **({'armco': True} if c.get('armco') else {})})
with open(os.path.join(ROOT, 'src', 'tracks', 'realList.js'), 'w') as f:
    f.write('// Circuiti veri del calendario costruiti con tools/build_track.py (scritto da tools/make_catalog.py)\n')
    f.write('export const REAL_TRACKS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(out), 'circuiti nel catalogo')
