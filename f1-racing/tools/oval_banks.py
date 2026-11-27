#!/usr/bin/env python3
"""Ovali veri: dopo tools/build_track.py aggiunge curve sopraelevate, apron interno, muro esterno e corsia box interna.
Uso: python3 tools/oval_banks.py daytona
(OpenStreetMap non ha la sopraelevazione: tratti e pendenze sono scritti qui; pendenza = tan dell'angolo,
negativa = esterno a destra più alto, cioè curve a sinistra. Daytona vera: 31° in curva e 18° nel tri-ovale;
la fisica del gioco regge bene fino a circa 21°)"""
import json, math, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OVALS = {
  # [da m, a m, pendenza]
  'daytona': {'banks': [[880, 1900, -0.38], [2740, 3760, -0.38], [60, 600, -0.3]], 'inside': 1, 'pit_off': 9},
}
tid = sys.argv[1]; O = OVALS[tid]
fn = os.path.join(ROOT, 'src', 'tracks', f'{tid}Data.js')
s = open(fn).read(); head = s[:s.index('export default')]; d = json.loads(s[s.index('{'):s.rindex('}') + 1])
P = [(p[0], p[2]) for p in d['points']]; n = len(P); hw = d['points'][0][3]
def at_d(i, dd):
    a, b = P[(i - 1) % n], P[(i + 1) % n]; l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1; nx, nz = (b[1] - a[1]) / l, -(b[0] - a[0]) / l
    return (P[i % n][0] + nx * dd, P[i % n][1] + nz * dd)
pit = []
for k in range(-70, 71):
    r = min(1, (k + 70) / 22, (70 - k) / 22); r = r * r * (3 - 2 * r)
    x, z = at_d(k, (hw + O['pit_off']) * r * O['inside']); pit.append([round(x, 2), round(z, 2)])
d.update({'banks': O['banks'], 'bankRamp': 150, 'bankPivot': 'inside', 'oval': {'inside': O['inside'], 'apron': 8},
          'kerbW': 0.8, 'kerbH': 0.3, 'pit': pit, 'pitSide': O['inside']})
open(fn, 'w').write(head + 'export default ' + json.dumps(d, separators=(',', ':')) + ';\n')
print(tid, 'ok')
