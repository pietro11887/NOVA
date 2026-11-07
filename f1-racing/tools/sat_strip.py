#!/usr/bin/env python3
"""Foto satellitari lungo la pista: "srotola" la pista in una striscia (lungo il giro × di traverso)
per leggere larghezza vera, cordoli, ghiaia, vie di fuga in asfalto e prato.
Immagini: Esri World Imagery (solo analisi, non vengono incluse nel gioco)."""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image

R_EARTH = 6378137.0
CACHE = os.environ.get('SAT_CACHE', '/tmp/satcache')


def load_track(tid, root):
    s = open(os.path.join(root, 'src', 'tracks', f'{tid}Data.js')).read()
    return json.loads(s[s.index('{'):s.rindex('}') + 1])


class Sat:
    def __init__(self, z):
        self.z = z; self.t = {}; os.makedirs(CACHE, exist_ok=True)

    def tile(self, x, y):
        k = (x, y)
        if k not in self.t:
            fn = f'{CACHE}/{self.z}_{x}_{y}.jpg'
            if not os.path.exists(fn) or os.path.getsize(fn) < 500:
                for _ in range(3):
                    subprocess.run(['curl', '-sS', '-m', '60', '-o', fn,
                                    f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{self.z}/{y}/{x}'])
                    if os.path.exists(fn) and os.path.getsize(fn) > 500: break
            try: self.t[k] = np.asarray(Image.open(fn).convert('RGB'), dtype=np.float32)
            except Exception: self.t[k] = np.zeros((256, 256, 3), np.float32)
        return self.t[k]

    def px(self, lat, lon):
        n = 2 ** self.z; lr = np.radians(lat)
        fx = (lon + 180) / 360 * n * 256
        fy = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n * 256
        return fx, fy

    def sample(self, lat, lon):
        """lat, lon: array; bilineare"""
        fx, fy = self.px(lat, lon)
        fx = fx - 0.5; fy = fy - 0.5
        x0 = np.floor(fx).astype(np.int64); y0 = np.floor(fy).astype(np.int64)
        u = (fx - x0)[..., None]; v = (fy - y0)[..., None]
        out = np.zeros(lat.shape + (3,), np.float32)
        def get(X, Y):
            r = np.zeros(X.shape + (3,), np.float32)
            tx, ty = X // 256, Y // 256
            for k in set(zip(tx.ravel().tolist(), ty.ravel().tolist())):
                m = (tx == k[0]) & (ty == k[1])
                r[m] = self.tile(*k)[Y[m] % 256, X[m] % 256]
            return r
        a, b, c, d = get(x0, y0), get(x0 + 1, y0), get(x0, y0 + 1), get(x0 + 1, y0 + 1)
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def strip(tid, root, W=45, res=0.5, z=18, ds=1.0):
    D = load_track(tid, root)
    P0 = np.array([[p[0], p[2]] for p in D['points']])
    # ricampionato ogni ds metri (in proporzione ai punti dei dati: riga r = punto r*ds/4)
    m = len(P0); k = int(round(m * 4 / ds))
    u = np.arange(k) * m / k; i0 = np.floor(u).astype(int); f = (u - i0)[:, None]
    P = P0[i0 % m] * (1 - f) + P0[(i0 + 1) % m] * f
    n = len(P)
    T = np.roll(P, -4, 0) - np.roll(P, 4, 0); T /= np.linalg.norm(T, axis=1)[:, None]
    N = np.stack([T[:, 1], -T[:, 0]], 1)            # sinistra = +N (come nel gioco)
    d = np.arange(-W, W + 1e-6, res)
    X = P[:, 0][:, None] + N[:, 0][:, None] * d[None]
    Z = P[:, 1][:, None] + N[:, 1][:, None] * d[None]
    lat0, lon0 = D['lat0'], D['lon0']
    kx = math.radians(1) * R_EARTH * math.cos(math.radians(lat0)); kz = math.radians(1) * R_EARTH
    lat = lat0 - Z / kz; lon = lon0 + X / kx
    img = Sat(z).sample(lat, lon)
    return D, P, N, d, img


if __name__ == '__main__':
    tid = sys.argv[1]; root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    D, P, N, d, img = strip(tid, root, z=int(sys.argv[3]) if len(sys.argv) > 3 else 18)
    # immagine: una riga per campione (4 m), colonne di traverso; sinistra in alto
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8).transpose(1, 0, 2)[::-1])
    im.save(sys.argv[2])
    print(im.size)


# ------------------------------------------------------------------ classi di superficie
GRASS, ASPH, GRAVEL, RED, WHITE, BLUE, GREENP, DARK = range(8)
PAL = np.array([[70, 120, 50], [95, 95, 98], [215, 190, 140], [210, 40, 40], [240, 240, 240], [40, 80, 200], [40, 160, 90], [20, 30, 20]], np.uint8)


def classify(img):
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    mx = img.max(-1); mn = img.min(-1); sat = (mx - mn) / np.maximum(mx, 1)
    c = np.full(r.shape, GRASS, np.uint8)
    grey = sat < 0.16
    c[grey & (mx >= 60)] = ASPH
    c[(sat < 0.3) & (mx >= 40) & (mx < 100) & ~((g > r + 6) & (g > b))] = ASPH     # asfalto scuro nuovo (con dominante di colore)
    c[(sat < 0.3) & (g >= r) & (g > b + 6) & (mx < 175)] = GRASS                    # prato pallido, grigio-verde (l'asfalto è neutro o azzurrino)
    c[grey & (mx >= 175)] = WHITE
    c[(mx < 40)] = DARK
    # ghiaia e sabbia: chiare e poco sature (l'erba secca d'inverno è più scura e più gialla)
    warm = (r > b + 12) & (g > b + 6) & (r - g < 40) & (mx > 150) & (sat < 0.22)
    c[warm] = GRAVEL
    c[(r > g + 45) & (r > b + 40) & (r > 110)] = RED
    c[(b > r + 35) & (b > g + 12) & (mx > 70)] = BLUE
    veg = (g > r + 3) & (g > b - 2) & ~grey & ((g > r + 6) | (mx > 90))
    dry = (r > b + 12) & (sat >= 0.22) & (mx < 215) & ~((r > g + 45) & (r > b + 40))
    c[dry] = GRASS
    c[veg & (mx < 55)] = DARK
    c[veg & (mx >= 55)] = GRASS
    # verde vivo uniforme (vernice o erba sintetica): saturo e chiaro
    c[veg & (sat > 0.45) & (mx > 120) & (g > r + 40)] = GREENP
    return c


def area(tid, root, x, z, hw, hh, res=0.5, zoom=18):
    """foto satellitare (nord in alto) di un riquadro attorno al punto x, z della pista"""
    D = load_track(tid, root)
    lat0, lon0 = D['lat0'], D['lon0']
    kx = math.radians(1) * R_EARTH * math.cos(math.radians(lat0)); kz = math.radians(1) * R_EARTH
    xs = x + np.arange(-hw, hw, res); zs = z + np.arange(-hh, hh, res)
    X, Z = np.meshgrid(xs, zs)
    return Sat(zoom).sample(lat0 - Z / kz, lon0 + X / kx)
