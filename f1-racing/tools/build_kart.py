#!/usr/bin/env python3
"""Pista da kart (Nova Kart Arena): inventata, stretta e piena di tornanti, costruita senza dati OpenStreetMap.
Scrive src/tracks/kartData.js nello stesso formato di tools/build_track.py."""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)

# tracciato ricalcato dal disegno (pixel della foto: x verso destra = est, y verso il basso = sud), in ordine di gara:
# rettilineo dei box (a sinistra) verso nord, curva in alto, esse, discesa a destra, giro attorno alla fontana,
# tornante dentro le tribune di destra, rettilineo in basso verso i grattacieli
# tracciato (unità libere, x = est, y = sud), in ordine di gara: rettilineo dei box verso est, tornante,
# esse nel mezzo, curvone, controcurve in fondo e risalita verso il traguardo
SK = [(0, 0), (120, 0), (240, 0), (320, 8), (365, 45), (362, 95), (320, 120), (265, 112), (225, 85), (180, 72), (130, 88),
      (115, 128), (140, 165), (200, 178), (280, 172), (350, 180), (400, 215), (398, 262), (350, 288), (270, 282), (190, 290),
      (110, 285), (45, 258), (12, 210), (35, 160), (30, 110), (-25, 85), (-60, 50), (-45, 12)]
TARGET = 1250.0

def catmull(P, k=10):
    n = len(P); out = []
    for i in range(n):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
        for j in range(k):
            t = j / k; t2 = t * t; t3 = t2 * t
            f = lambda a, b, c, d: 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
            out.append((f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])))
    return out

def loop_len(P): return sum(math.hypot(P[(i + 1) % len(P)][0] - P[i][0], P[(i + 1) % len(P)][1] - P[i][1]) for i in range(len(P)))

def resample(P, step):
    L = loop_len(P); n = int(round(L / step)); step = L / n
    out = []; seg = 0; acc = 0.0
    segs = [(P[i], P[(i + 1) % len(P)]) for i in range(len(P))]
    lens = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in segs]
    pos = 0.0
    for k in range(n):
        target = k * step
        while acc + lens[seg] < target: acc += lens[seg]; seg += 1
        a, b = segs[seg]; t = (target - acc) / (lens[seg] or 1)
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out, L

px = catmull(SK)
s = TARGET / loop_len(px)
cx = sum(p[0] for p in SK) / len(SK); cy = sum(p[1] for p in SK) / len(SK)
tr = lambda x, y: ((x - cx) * s, (y - cy) * s)
P = [tr(*p) for p in px]
R, L = resample(P, 4.0)
# addolcisce le curve troppo strette (raggio minimo ~16 m)
for it in range(40):
    n = len(R); Rn = []; ch = False
    for i in range(n):
        a, b, c = R[i - 1], R[i], R[(i + 1) % n]
        h1 = math.atan2(b[1] - a[1], b[0] - a[0]); h2 = math.atan2(c[1] - b[1], c[0] - b[0])
        d = abs((h2 - h1 + math.pi) % (2 * math.pi) - math.pi)
        if d > 0.33:
            xs = [R[(i + k) % n] for k in range(-2, 3)]; Rn.append((sum(p[0] for p in xs) / 5, sum(p[1] for p in xs) / 5)); ch = True
        else: Rn.append(b)
    R = Rn
    if not ch: break
R, L = resample(R, 4.0)
nR = len(R)
# verso di gara: sul rettilineo dei box si va verso est (x che aumenta)
start_i = min(range(nR), key=lambda i: math.hypot(R[i][0] - tr(120, 0)[0], R[i][1] - tr(120, 0)[1]))
if R[(start_i + 1) % nR][0] < R[start_i][0]: R = R[::-1]; start_i = nR - 1 - start_i
R = R[start_i:] + R[:start_i]

# piccoli saliscendi (pista quasi piana, come in un parco)
def h_at(i):
    u = i / nR * 2 * math.pi
    return 1.5 + 0.9 * math.sin(u * 2 + 0.7) + 0.4 * math.sin(u * 3 + 2.1)
hw = 4.6
points = [[round(x, 2), round(h_at(i), 2), round(z, 2), hw] for i, (x, z) in enumerate(R)]

def at_d(i, d):
    a, b = R[(i - 1) % nR], R[(i + 1) % nR]
    l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1; nx, nz = (b[1] - a[1]) / l, -(b[0] - a[0]) / l
    return (R[i % nR][0] + nx * d, R[i % nR][1] + nz * d)

# corsia box sul lato sinistro (ovest) del rettilineo: come nel disegno
side_test = at_d(0, 10)
pit_side = 1 if side_test[1] < R[0][1] else -1
pit = []
for k in range(-20, 22):
    ramp = min(1, (k + 20) / 8, (21 - k) / 8); ramp = ramp * ramp * (3 - 2 * ramp)
    pit.append(at_d(k, 11 * ramp * pit_side))

def rect(x0, z0, x1, z1): return [[round(x0, 1), round(z0, 1)], [round(x1, 1), round(z0, 1)], [round(x1, 1), round(z1, 1)], [round(x0, 1), round(z1, 1)]]
def poly_sk(pts): return [[round(tr(*p)[0], 1), round(tr(*p)[1], 1)] for p in pts]
def stand_along(i0, i1, d, depth=16):
    """tribuna lungo la pista tra i campioni i0 e i1, a distanza d dal centro (segno = lato)"""
    a = [at_d(i, d) for i in range(i0, i1 + 1, 3)]
    b = [at_d(i, d + math.copysign(depth, d)) for i in range(i1, i0 - 1, -3)]
    return [[round(x, 1), round(z, 1)] for x, z in a + b]
def near_i(x, z): return min(range(nR), key=lambda i: (R[i][0] - x) ** 2 + (R[i][1] - z) ** 2)

buildings = []
# tribuna lungo il rettilineo (dietro i box) e paddock con i tendoni
buildings.append({'p': stand_along(nR - 16, nR - 1, 32 * pit_side), 'h': 9, 'k': 'grandstand', 'n': 'Tribuna'})
buildings.append({'p': stand_along(0, 18, 32 * pit_side), 'h': 9, 'k': 'grandstand', 'n': 'Tribuna'})
pb = [at_d(k, 19 * pit_side) for k in range(-14, 15, 3)] + [at_d(k, 27 * pit_side) for k in range(14, -15, -3)]
buildings.append({'p': [[round(x, 1), round(z, 1)] for x, z in pb], 'h': 5, 'k': 'commercial', 'n': 'Box'})
for (ux, uy, w, d_, h) in ((150, -90, 60, 25, 6), (260, -95, 40, 22, 5), (60, -85, 35, 20, 4.5)):
    x0, z0 = tr(ux - w / 2, uy - d_ / 2); x1, z1 = tr(ux + w / 2, uy + d_ / 2)
    buildings.append({'p': rect(x0, z0, x1, z1), 'h': h, 'k': 'commercial', 'n': 'Paddock'})
water = []
meadow = [poly_sk([(150, 25), (340, 25), (340, 95), (260, 95), (150, 60)]), poly_sk([(60, 200), (360, 200), (360, 260), (60, 260)])]
forest = [poly_sk([(450, -50), (650, -50), (650, 350), (450, 350)]), poly_sk([(-250, 120), (-120, 120), (-120, 380), (-250, 380)])]
import random
random.seed(7)
trees = []
for _ in range(350):
    x, z = random.uniform(-500, 500), random.uniform(-450, 450)
    dmin = min(math.hypot(x - p[0], z - p[2]) for p in points[::4])
    if dmin > 22: trees.append([round(x, 1), round(z, 1)])
xs = [p[0] for p in points]; zs = [p[2] for p in points]
pad = 700; step = 50
x0 = math.floor((min(xs) - pad) / step) * step; z0 = math.floor((min(zs) - pad) / step) * step
nx = int((max(xs) + pad - x0) / step) + 1; nz = int((max(zs) + pad - z0) / step) + 1
grid_h = []
for j in range(nz):
    for i in range(nx):
        x, z = x0 + i * step, z0 + j * step
        dmin = min(math.hypot(x - p[0], z - p[2]) for p in points[::6])
        base = 2.5
        hill = max(0, dmin - 180) * 0.05           # colline basse lontano dalla pista
        grid_h.append(round(base + min(hill, 45) * (0.6 + 0.4 * math.sin(x * 0.004) * math.cos(z * 0.005)), 1))
out = {'source': 'Pista da kart inventata (Nova Kart Arena)', 'lat0': 45.0, 'lon0': 9.0, 'length': round(L, 1), 'base': 0, 'points': points,
       'pit': [[round(x, 2), round(z, 2)] for x, z in pit], 'pitSide': pit_side,
       'grid': {'x0': x0, 'z0': z0, 'step': step, 'nx': nx, 'nz': nz, 'h': grid_h},
       'buildings': buildings, 'forest': forest, 'meadow': meadow, 'water': water, 'roads': [], 'trees': trees, 'corners': {}, 'tunnels': [],
       'names': [], 'banks': [], 'kerbW': 1.0, 'kerbH': 0.5, 'kerbRep': 1.6}
fn = os.path.join(ROOT, 'src', 'tracks', 'kartData.js')
with open(fn, 'w') as f:
    f.write('// Nova Kart Arena — pista da kart inventata. Generato da tools/build_kart.py.\n')
    f.write('export default ' + json.dumps(out, separators=(',', ':')) + ';\n')
print('scritto', fn, os.path.getsize(fn) // 1024, 'KB · giro', round(L), 'm · lato box', pit_side, '· campioni', nR)
# controllo: raggio minimo e incroci
rmin = 1e9
for i in range(nR):
    a, b, c = R[i - 3], R[i], R[(i + 3) % nR]
    A = math.hypot(b[0]-a[0], b[1]-a[1]); B = math.hypot(c[0]-b[0], c[1]-b[1]); C = math.hypot(c[0]-a[0], c[1]-a[1])
    ar = abs((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])) / 2
    if ar > 1e-6: rmin = min(rmin, A*B*C/(4*ar))
dclose = min(math.hypot(R[i][0]-R[j][0], R[i][1]-R[j][1]) for i in range(0, nR, 2) for j in range(i + 25, nR - 25 + i if i < 25 else nR, 2))
print('raggio minimo', round(rmin), 'm · distanza minima tra tratti diversi', round(dclose), 'm')
