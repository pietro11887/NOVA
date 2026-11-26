#!/usr/bin/env python3
"""Nova Speedway: ovale inventato (tri-ovale da ~2,4 km come le piste NASCAR da un miglio e mezzo).
Curve sopraelevate, si gira in senso antiorario (sempre a sinistra), muri SAFER a filo pista.
Scrive src/tracks/ovalData.js nello stesso formato di tools/build_track.py."""
import json, math, os, random
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
S, RT, BULGE = 620.0, 170.0, 45.0          # rettilinei, raggio delle curve, "gobba" del tri-ovale (m)
BANK = -0.32                               # pendenza trasversale in curva (~18°; esterno più alto)
hw = 9.5                                   # pista larga 19 m

def resample(P, step):
    L = sum(math.hypot(P[(i + 1) % len(P)][0] - P[i][0], P[(i + 1) % len(P)][1] - P[i][1]) for i in range(len(P)))
    n = int(round(L / step)); step = L / n
    segs = [(P[i], P[(i + 1) % len(P)]) for i in range(len(P))]
    lens = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in segs]
    out = []; seg = 0; acc = 0.0
    for k in range(n):
        t0 = k * step
        while acc + lens[seg] < t0: acc += lens[seg]; seg += 1
        a, b = segs[seg]; t = (t0 - acc) / (lens[seg] or 1)
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out, L

# sagoma: rettilineo d'arrivo in basso (verso est) con la gobba, curva 1-2 a est, rettilineo opposto, curva 3-4 a ovest
P = []
for k in range(160):
    u = k / 160; P.append((-S / 2 + S * u, RT + BULGE * math.sin(math.pi * u) ** 2))
for k in range(120):
    f = math.pi * k / 120; P.append((S / 2 + RT * math.sin(f), RT * math.cos(f)))
for k in range(160):
    u = k / 160; P.append((S / 2 - S * u, -RT))
for k in range(120):
    f = math.pi * k / 120; P.append((-S / 2 - RT * math.sin(f), -RT * math.cos(f)))
R, _ = resample(P, 2.0)
# raccordi a curvatura crescente (come le spirali delle piste vere): medie mobili
for it in range(5):
    n = len(R); W = 14
    R = [(sum(R[(i + k) % n][0] for k in range(-W, W + 1)) / (2 * W + 1), sum(R[(i + k) % n][1] for k in range(-W, W + 1)) / (2 * W + 1)) for i in range(n)]
R, L = resample(R, 4.0)
nR = len(R)
# partenza a metà del rettilineo d'arrivo; verso: est (curve a sinistra)
start_i = min(range(nR), key=lambda i: abs(R[i][0]) + (0 if R[i][1] > 0 else 1e9))
if R[(start_i + 1) % nR][0] < R[start_i][0]: R = R[::-1]; start_i = nR - 1 - start_i
R = R[start_i:] + R[:start_i]
points = [[round(x, 2), 2.0, round(z, 2), hw] for x, z in R]

def at_d(i, d):
    a, b = R[(i - 1) % nR], R[(i + 1) % nR]
    l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1; nx, nz = (b[1] - a[1]) / l, -(b[0] - a[0]) / l
    return (R[i % nR][0] + nx * d, R[i % nR][1] + nz * d)
def curv(i):
    a, b, c = R[(i - 3) % nR], R[i], R[(i + 3) % nR]
    h1 = math.atan2(b[1] - a[1], b[0] - a[0]); h2 = math.atan2(c[1] - b[1], c[0] - b[0])
    return ((h2 - h1 + math.pi) % (2 * math.pi) - math.pi) / 12.0
# curve sopraelevate: dove la curvatura è da curva vera (raggio < 400 m)
banks = []; i = 0
mask = [abs(curv(i)) > 1 / 400 for i in range(nR)]
while i < nR:
    if mask[i] and not mask[i - 1]:
        j = i
        while mask[j % nR] and j - i < nR: j += 1
        banks.append([(i - 30) * 4, (j + 30) * 4, BANK]); i = j
    else: i += 1
# il lato interno (sinistra) è dentro l'ovale
inside = 1
# corsia box all'interno del rettilineo d'arrivo
pit = []
for k in range(-62, 63):
    ramp = min(1, (k + 62) / 20, (62 - k) / 20); ramp = ramp * ramp * (3 - 2 * ramp)
    pit.append(at_d(k, 22 * ramp * inside))

def strip(i0, i1, d, depth):
    a = [at_d(i, d) for i in range(i0, i1 + 1, 3)]
    b = [at_d(i, d + math.copysign(depth, d)) for i in range(i1, i0 - 1, -3)]
    return [[round(x, 1), round(z, 1)] for x, z in a + b]
buildings = []
# tribune enormi lungo il rettilineo d'arrivo e nelle curve, all'esterno
buildings.append({'p': strip(nR - 75, nR - 1, -(hw + 14), 45), 'h': 34, 'k': 'grandstand', 'n': 'Tribuna Principale'})
buildings.append({'p': strip(0, 75, -(hw + 14), 45), 'h': 34, 'k': 'grandstand', 'n': 'Tribuna Principale'})
for c in (int(nR * 0.2), int(nR * 0.7)):
    buildings.append({'p': strip(c - 30, c + 30, -(hw + 14), 28), 'h': 20, 'k': 'grandstand', 'n': 'Tribuna'})
# box e garage nell'interno
buildings.append({'p': strip(-50 % nR if False else nR - 50, nR - 1, inside * 40, 14), 'h': 7, 'k': 'commercial', 'n': 'Garage'})
buildings.append({'p': strip(0, 50, inside * 40, 14), 'h': 7, 'k': 'commercial', 'n': 'Garage'})
# torre di controllo
cx, cz = at_d(0, -(hw + 70))
buildings.append({'p': [[round(cx - 12, 1), round(cz - 8, 1)], [round(cx + 12, 1), round(cz - 8, 1)], [round(cx + 12, 1), round(cz + 8, 1)], [round(cx - 12, 1), round(cz + 8, 1)]], 'h': 48, 'k': 'office', 'n': 'Torre'})
water = [[[-150, -40], [-60, -70], [40, -60], [90, -20], [40, 20], [-80, 25], [-160, 5]]]
meadow = [[[-S / 2 + 20, -RT + 30], [S / 2 - 20, -RT + 30], [S / 2 - 20, RT - 50], [-S / 2 + 20, RT - 50]]]
forest = [[[-900, -700], [900, -700], [900, -480], [-900, -480]], [[-900, 520], [900, 520], [900, 700], [-900, 700]]]
random.seed(11)
trees = []
for _ in range(500):
    x, z = random.uniform(-1000, 1000), random.uniform(-750, 750)
    dmin = min(math.hypot(x - p[0], z - p[2]) for p in points[::5])
    if dmin > 120 and not (abs(x) < S / 2 + RT - 60 and abs(z) < RT - 40): trees.append([round(x, 1), round(z, 1)])
xs = [p[0] for p in points]; zs = [p[2] for p in points]
pad = 800; step = 50
x0 = math.floor((min(xs) - pad) / step) * step; z0 = math.floor((min(zs) - pad) / step) * step
nx = int((max(xs) + pad - x0) / step) + 1; nz = int((max(zs) + pad - z0) / step) + 1
grid_h = [2.0] * (nx * nz)
out = {'source': 'Ovale inventato (Nova Speedway)', 'lat0': 35.0, 'lon0': -80.0, 'length': round(L, 1), 'base': 0, 'points': points,
       'pit': [[round(x, 2), round(z, 2)] for x, z in pit], 'pitSide': inside,
       'grid': {'x0': x0, 'z0': z0, 'step': step, 'nx': nx, 'nz': nz, 'h': grid_h},
       'buildings': buildings, 'forest': forest, 'meadow': meadow, 'water': water, 'roads': [], 'trees': trees, 'corners': {}, 'tunnels': [],
       'names': [], 'banks': banks, 'bankRamp': 170, 'bankPivot': 'inside', 'kerbW': 0.8, 'kerbH': 0.3, 'kerbRep': 2.0}
fn = os.path.join(ROOT, 'src', 'tracks', 'ovalData.js')
with open(fn, 'w') as f:
    f.write('// Nova Speedway — ovale inventato. Generato da tools/build_oval.py.\n')
    f.write('export default ' + json.dumps(out, separators=(',', ':')) + ';\n')
rmin = min(1 / max(1e-9, abs(curv(i))) for i in range(nR))
print('scritto', fn, os.path.getsize(fn) // 1024, 'KB · giro', round(L), 'm · raggio minimo', round(rmin), 'm · curve sopraelevate', banks)
