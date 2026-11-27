#!/usr/bin/env python3
"""Autostrada (guida libera): pista inventata, lunghissima, per girare con le stradali.

Un anello molto allungato: andata e ritorno di ~12 km affiancati come le due carreggiate di una vera
autostrada (guard-rail in mezzo), con curve larghe e saliscendi dolci; alle due estremità un grande
svincolo riporta sull'altra carreggiata. In tutto ~26 km: guidando sembra non finire mai.
Campagna intorno: prati, boschi, filari d'alberi, qualche cascina.

Uso: python3 tools/build_highway.py   ->   src/tracks/autostradaData.js
"""
import json, math, os, random
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HW = 7.0                 # mezza larghezza: 3 corsie da 3,75 m + corsia d'emergenza
SEP = HW + 1.6           # distanza dell'asse di ogni carreggiata dall'asse dell'autostrada (spartitraffico)
LEG = 12000.0            # lunghezza dei rettilinei (con le curve larghe)
rnd = random.Random(7)


def center(x):
    """asse dell'autostrada: curve larghe (raggio minimo ~2,5 km)"""
    return 160 * math.sin(2 * math.pi * x / 4100) + 90 * math.sin(2 * math.pi * x / 2300 + 1.3)


def height(x, z):
    """quota del terreno: colline dolci"""
    return (9 * math.sin(x / 900 + 0.4) + 6 * math.sin(x / 520 + z / 700) + 4 * math.cos(z / 380 - x / 1300)
            + 0.004 * z * math.sin(x / 2600))


def leg_points(sign):
    """carreggiata: sign=+1 verso est (a sud dell'asse, si guida a destra), -1 verso ovest"""
    pts = []
    xs = np.arange(0, LEG + 1, 4.0)
    for x in xs:
        z = center(x)
        dz = (center(x + 1) - center(x - 1)) / 2
        n = np.array([-dz, 1.0]) / math.hypot(1, dz)      # normale verso sud (+z)
        p = np.array([x, z]) + n * SEP * sign
        pts.append(p)
    return pts if sign > 0 else pts[::-1]


def bspline(ctrl, n):
    """curva liscia (Catmull-Rom) per i punti di controllo"""
    P = [np.array(c, float) for c in ctrl]
    out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(0, i - 1)], P[i], P[i + 1], P[min(len(P) - 1, i + 2)]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return out


def loop_end(a_end, a_dir, b_start, b_dir, out_sign):
    """svincolo: si allontana dalla carreggiata, gira largo e rientra sull'altra"""
    a_end, b_start = np.array(a_end), np.array(b_start)
    mid = (a_end + b_start) / 2
    fwd = np.array(a_dir) / np.linalg.norm(a_dir)
    side = np.array([-fwd[1], fwd[0]])                       # verso l'altra carreggiata (a sinistra)
    if np.dot(b_start - a_end, side) < 0: side = -side
    C, R = mid + fwd * 1230, 470.0
    arc = [C + fwd * R * math.cos(math.radians(t)) + side * R * math.sin(math.radians(t)) for t in range(-90, 91, 30)]
    ctrl = [a_end - fwd * 60, a_end, a_end + fwd * 450 - side * 70, *arc,
            b_start + fwd * 450 + side * 70, b_start, b_start + np.array(b_dir) / np.linalg.norm(b_dir) * 60]
    c = bspline(ctrl, 40)
    return c[40 + 1:(len(ctrl) - 2) * 40]                    # solo il tratto tra le due carreggiate


def resample(poly, step=4.0):
    P = np.array(poly)
    seg = np.linalg.norm(np.diff(np.vstack([P, P[:1]]), axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    L = s[-1]
    out = []
    PP = np.vstack([P, P[:1]])
    for d in np.arange(0, L, step):
        i = np.searchsorted(s, d, side='right') - 1
        f = (d - s[i]) / max(1e-9, seg[i])
        out.append(PP[i] * (1 - f) + PP[i + 1] * f)
    return np.array(out), L


def smooth(P, k=6, it=3):
    for _ in range(it):
        Q = P.copy()
        for i in range(len(P)):
            Q[i] = P[[(i + j) % len(P) for j in range(-k, k + 1)]].mean(axis=0)
        P = Q
    return P


def main():
    A = leg_points(+1)                    # verso est
    B = leg_points(-1)                    # verso ovest
    dA = A[-1] - A[-2]; dB = B[1] - B[0]
    east = loop_end(A[-1], dA, B[0], dB, 1)
    dB2 = B[-1] - B[-2]; dA2 = A[1] - A[0]
    west = loop_end(B[-1], dB2, A[0], dA2, -1)
    poly = list(A) + east + list(B) + west
    P, L = resample(poly, 4.0)
    P = smooth(P, 30, 4)
    P, L = resample(list(P), 4.0)
    # quote: il terreno lungo la strada, addolcito (pendenze da autostrada, < 3%)
    Y = np.array([height(x, z) for x, z in P])
    for _ in range(40):
        Y = (np.roll(Y, 1) + Y + np.roll(Y, -1)) / 3
    # le due carreggiate affiancate alla stessa quota (si guarda l'altra a pari livello)
    x0, x1 = P[:, 0].min() - 1600, P[:, 0].max() + 1600
    z0, z1 = P[:, 1].min() - 1600, P[:, 1].max() + 1600
    step = 50
    nx, nz = int((x1 - x0) / step) + 1, int((z1 - z0) / step) + 1
    # terreno: colline lontano dalla strada, la quota della strada vicino (raccordo dolce)
    class Near:
        # punto della strada più vicino (griglia a celle da 100 m; oltre 500 m conta solo che è lontano)
        def __init__(self, P):
            self.P, self.cells = P, {}
            for k, (x, z) in enumerate(P): self.cells.setdefault((int(x // 100), int(z // 100)), []).append(k)
        def query(self, q):
            x, z = q; cx, cz = int(x // 100), int(z // 100); best, bk = 1e9, 0
            for i in range(cx - 5, cx + 6):
                for j in range(cz - 5, cz + 6):
                    for k in self.cells.get((i, j), ()):
                        d = (self.P[k][0] - x) ** 2 + (self.P[k][1] - z) ** 2
                        if d < best: best, bk = d, k
            return math.sqrt(best), bk
    tree = Near(P)
    gh = []
    for j in range(nz):
        for i in range(nx):
            x, z = x0 + i * step, z0 + j * step
            d, k = tree.query([x, z])
            hill = height(x, z) * 2.2
            t = min(1.0, max(0.0, (d - 30) / 400))
            t = t * t * (3 - 2 * t)
            gh.append(round(float(Y[k] * (1 - t) + hill * t) - 0.4 * (1 - t), 2))
    base = 0.0
    # tutto più in alto di 80 m: il gioco mette il mare dove il terreno scende sotto lo zero
    # (le valli dell'autostrada finivano sotto un piano d'acqua che rifletteva il cielo)
    LIFT = 80.0
    Y = Y + LIFT
    gh = [round(h + LIFT, 2) for h in gh]
    pts = [[round(float(x), 2), round(float(y), 2), round(float(z), 2), HW] for (x, z), y in zip(P, Y)]
    # campagna: boschi, prati, filari, cascine (mai a meno di 45 m dalla strada)
    forest, meadow, trees, buildings = [], [], [], []
    def far(x, z, r): return tree.query([x, z])[0] > r
    for _ in range(320):
        cx, cz = rnd.uniform(x0 + 300, x1 - 300), rnd.uniform(z0 + 300, z1 - 300)
        if not far(cx, cz, 160): continue
        r = rnd.uniform(60, 220); n = rnd.randint(7, 11)
        poly = [[round(cx + r * (0.6 + 0.5 * rnd.random()) * math.cos(a), 1), round(cz + r * (0.6 + 0.5 * rnd.random()) * math.sin(a), 1)]
                for a in np.linspace(0, 2 * math.pi, n, endpoint=False)]
        if all(far(x, z, 50) for x, z in poly): forest.append(poly)
    for _ in range(260):
        cx, cz = rnd.uniform(x0 + 200, x1 - 200), rnd.uniform(z0 + 200, z1 - 200)
        if not far(cx, cz, 90): continue
        w, h, a = rnd.uniform(80, 260), rnd.uniform(60, 200), rnd.uniform(0, math.pi)
        ca, sa = math.cos(a), math.sin(a)
        poly = [[round(cx + ca * u - sa * v, 1), round(cz + sa * u + ca * v, 1)] for u, v in [(-w, -h), (w, -h), (w, h), (-w, h)]]
        if all(far(x, z, 40) for x, z in poly): meadow.append(poly)
    # filari di pioppi lungo i campi e alberi sparsi
    for _ in range(90):
        cx, cz = rnd.uniform(x0, x1), rnd.uniform(z0, z1)
        a = rnd.uniform(0, math.pi); ca, sa = math.cos(a), math.sin(a)
        for k in range(rnd.randint(8, 22)):
            x, z = cx + ca * k * 9, cz + sa * k * 9
            if far(x, z, 40): trees.append([round(x, 1), round(z, 1)])
    for _ in range(900):
        x, z = rnd.uniform(x0, x1), rnd.uniform(z0, z1)
        if far(x, z, 35): trees.append([round(x, 1), round(z, 1)])
    # cascine: casa + fienile
    for _ in range(70):
        cx, cz = rnd.uniform(x0 + 300, x1 - 300), rnd.uniform(z0 + 300, z1 - 300)
        if not far(cx, cz, 120): continue
        a = rnd.uniform(0, math.pi); ca, sa = math.cos(a), math.sin(a)
        for (ox, oz, w, d, h, k) in [(0, 0, 14, 9, 8, 'house'), (24, 6, 22, 12, 7, 'barn')]:
            px, pz = cx + ca * ox - sa * oz, cz + sa * ox + ca * oz
            poly = [[round(px + ca * u - sa * v, 1), round(pz + sa * u + ca * v, 1)] for u, v in [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]]
            buildings.append({'p': poly, 'h': h, 'k': k, 'n': ''})
    # corsia box finta (il gioco la vuole; in autostrada è nascosta): parallela, oltre il guard-rail di destra
    pit = []
    for k in range(250, 420):
        a, b = P[k - 1], P[k + 1]; t = (b - a) / np.linalg.norm(b - a); nrm = np.array([-t[1], t[0]])   # destra (la normale del gioco, +n, è a sinistra)
        q = P[k] + nrm * 16
        pit.append([round(float(q[0]), 2), round(float(q[1]), 2)])
    out = {
        'source': 'Autostrada inventata (tools/build_highway.py)',
        'lat0': 45.0, 'lon0': 9.0, 'length': round(float(L), 1), 'base': base, 'points': pts,
        'pit': pit, 'pitSide': -1,
        'grid': {'x0': x0, 'z0': z0, 'step': step, 'nx': nx, 'nz': nz, 'h': gh},
        'buildings': buildings, 'forest': forest, 'meadow': meadow, 'water': [], 'roads': [], 'trees': trees[:2500],
        'corners': {}, 'tunnels': [], 'names': [], 'banks': [],
    }
    fn = os.path.join(ROOT, 'src', 'tracks', 'autostradaData.js')
    with open(fn, 'w') as f:
        f.write('// Autostrada (guida libera): pista inventata, generata da tools/build_highway.py. Coordinate in metri.\n')
        f.write('export default ' + json.dumps(out, separators=(',', ':')) + ';\n')
    print(f'scritto {fn}: {os.path.getsize(fn) // 1024} KB · giro {L:.0f} m · punti {len(pts)} · boschi {len(forest)} · prati {len(meadow)} · alberi {len(trees)} · cascine {len(buildings) // 2}')


if __name__ == '__main__':
    main()
