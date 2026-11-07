#!/usr/bin/env python3
"""Fabbrica di piste: costruisce src/tracks/<id>Data.js per un circuito vero.

Dati: OpenStreetMap (API 0.6, a riquadri; © OpenStreetMap contributors, ODbL) e quote del terreno
mondiali "Terrarium" (Mapzen/AWS Terrain Tiles: SRTM, GMTED, ETOPO1 e altri; include il fondale del mare).

Uso:  python3 tools/build_track.py <id> [--cache DIR] [--png anteprima.png]
La configurazione dei circuiti è in tools/circuits.json.

Il tracciato di gara si ricava dalle strade "highway=raceway": si cerca l'anello chiuso di lunghezza più vicina
a quella ufficiale (i circuiti hanno spesso più varianti). Il verso di gara viene dai tratti "oneway",
altrimenti da circuits.json. La corsia box sono i tratti marcati come pit lane. Il traguardo si mette
all'altezza del centro della corsia box.
"""
import json, math, os, sys, subprocess, time, zlib, struct, xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
R_EARTH = 6378137.0


def curl(url, out=None, tries=4):
    for k in range(tries):
        args = ['curl', '-sS', '-m', '120', '-A', 'NovaGP-trackbuilder/1.0 (hobby game)', '-w', '%{http_code}', url]
        if out: args[1:1] = ['-o', out]
        r = subprocess.run(args, capture_output=True)
        code = r.stdout.decode()[-3:] if r.stdout else '000'
        if code == '200':
            return True if out else r.stdout[:-3]
        if code in ('400', '509'):
            return code
        time.sleep(2 * (k + 1))
    return False


# ------------------------------------------------------------------ OSM a riquadri
def fetch_osm(lat, lon, half_m, cache):
    os.makedirs(cache, exist_ok=True)
    dlat = half_m / 111320.0
    dlon = half_m / (111320.0 * math.cos(math.radians(lat)))
    tiles = []

    def get(s, w, n, e, depth=0):
        name = os.path.join(cache, f'{s:.5f}_{w:.5f}_{n:.5f}_{e:.5f}.osm')
        if os.path.exists(name) and os.path.getsize(name) > 100:
            tiles.append(name); return
        url = f'https://api.openstreetmap.org/api/0.6/map?bbox={w:.6f},{s:.6f},{e:.6f},{n:.6f}'
        r = curl(url, name)
        if r is True:
            tiles.append(name); time.sleep(0.6); return
        if os.path.exists(name): os.remove(name)
        if (r in ('400', '509') or r is False) and depth < 4:
            mlat, mlon = (s + n) / 2, (w + e) / 2
            for a in ((s, w, mlat, mlon), (s, mlon, mlat, e), (mlat, w, n, mlon), (mlat, mlon, n, e)):
                get(*a, depth + 1)
            return
        print('  riquadro non scaricato', s, w, n, e, r, file=sys.stderr)

    step = 0.009
    s0, s1, w0, w1 = lat - dlat, lat + dlat, lon - dlon, lon + dlon
    nlat = max(1, math.ceil((s1 - s0) / step)); nlon = max(1, math.ceil((w1 - w0) / (step / math.cos(math.radians(lat)))))
    for i in range(nlat):
        for j in range(nlon):
            get(s0 + (s1 - s0) * i / nlat, w0 + (w1 - w0) * j / nlon, s0 + (s1 - s0) * (i + 1) / nlat, w0 + (w1 - w0) * (j + 1) / nlon)
    nodes, ways, rels = {}, {}, {}
    for t in tiles:
        try:
            root = ET.parse(t).getroot()
        except ET.ParseError:
            continue
        for el in root:
            if el.tag == 'node':
                nodes[int(el.get('id'))] = (float(el.get('lat')), float(el.get('lon')), {c.get('k'): c.get('v') for c in el if c.tag == 'tag'})
            elif el.tag == 'way':
                ways[int(el.get('id'))] = ([int(c.get('ref')) for c in el if c.tag == 'nd'], {c.get('k'): c.get('v') for c in el if c.tag == 'tag'})
            elif el.tag == 'relation':
                rels[int(el.get('id'))] = ([(c.get('type'), int(c.get('ref')), c.get('role')) for c in el if c.tag == 'member'], {c.get('k'): c.get('v') for c in el if c.tag == 'tag'})
    return nodes, ways, rels


# ------------------------------------------------------------------ quote del terreno (Terrarium)
def png_rgb(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w = 8, b'', 0
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]; typ = data[pos + 4:pos + 8]; chunk = data[pos + 8:pos + 8 + ln]; pos += 12 + ln
        if typ == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', chunk[:10])
            bpp = {2: 3, 6: 4}[ct]
        elif typ == b'IDAT':
            idat += chunk
        elif typ == b'IEND':
            break
    raw = zlib.decompress(idat)
    stride = w * bpp
    out = bytearray(h * stride); prev = bytearray(stride)
    i = 0
    for y in range(h):
        f = raw[i]; i += 1
        line = bytearray(raw[i:i + stride]); i += stride
        if f == 1:
            for x in range(bpp, stride): line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(stride): line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride): line[x] = (line[x] + ((line[x - bpp] if x >= bpp else 0) + prev[x]) // 2) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0; b = prev[x]; c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out[y * stride:(y + 1) * stride] = line; prev = line
    return w, h, bpp, out


class DEM:
    Z = 14

    def __init__(self, cache):
        self.cache = cache; self.tiles = {}
        os.makedirs(cache, exist_ok=True)

    def tile(self, tx, ty):
        k = (tx, ty)
        if k not in self.tiles:
            fn = os.path.join(self.cache, f'dem_{self.Z}_{tx}_{ty}.png')
            if not os.path.exists(fn):
                curl(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{self.Z}/{tx}/{ty}.png', fn)
            w, h, bpp, px = png_rgb(open(fn, 'rb').read())
            self.tiles[k] = (w, bpp, px)
        return self.tiles[k]

    def at(self, lat, lon):
        n = 2 ** self.Z
        fx = (lon + 180) / 360 * n * 256
        lr = math.radians(lat)
        fy = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n * 256
        x0, y0 = int(math.floor(fx - 0.5)), int(math.floor(fy - 0.5)); u, v = fx - 0.5 - x0, fy - 0.5 - y0

        def px(X, Y):
            w, bpp, d = self.tile(X // 256, Y // 256)
            o = ((Y % 256) * w + (X % 256)) * bpp
            return d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768
        a, b, c, e = px(x0, y0), px(x0 + 1, y0), px(x0, y0 + 1), px(x0 + 1, y0 + 1)
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v


class ElevAPI:
    """Rilievi ufficiali ad alta risoluzione (terreno nudo, senza palazzi né alberi), a punti.
    ign: IGN RGE ALTI 1-5 m (Francia e Monaco); usgs: 3DEP 1-10 m (Stati Uniti); gsi: DEM 5 m (Giappone).
    Dove il servizio non ha dati si usa il modello mondiale."""

    def __init__(self, kind, cache, fallback):
        self.kind = kind; self.fb = fallback
        self.fn = os.path.join(cache, f'elev_{kind}.json')
        self.mem = json.load(open(self.fn)) if os.path.exists(self.fn) else {}
        self.gsi = {}

    @staticmethod
    def key(lat, lon): return f'{lat:.6f},{lon:.6f}'

    def many(self, pts):
        todo = [p for p in pts if self.key(*p) not in self.mem]
        B = 180 if self.kind == 'ign' else 100
        for i in range(0, len(todo), B):
            chunk = todo[i:i + B]
            vals = None
            if self.kind == 'ign':
                url = ('https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true'
                       '&lon=' + '|'.join(f'{lo:.6f}' for la, lo in chunk) + '&lat=' + '|'.join(f'{la:.6f}' for la, lo in chunk))
                r = curl(url)
                try: vals = json.loads(r)['elevations']
                except Exception: vals = None
            elif self.kind == 'usgs':
                geo = json.dumps({'points': [[lo, la] for la, lo in chunk], 'spatialReference': {'wkid': 4326}})
                import urllib.parse
                url = ('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples?geometryType=esriGeometryMultipoint'
                       '&returnFirstValueOnly=true&f=json&geometry=' + urllib.parse.quote(geo))
                r = curl(url)
                try:
                    smp = json.loads(r)['samples']; vals = [None] * len(chunk)
                    for q in smp: vals[q['locationId']] = float(q['value'])
                except Exception: vals = None
            elif self.kind == 'gsi':
                vals = [self.gsi_at(la, lo) for la, lo in chunk]
            elif self.kind == 'es':
                vals = [self.es_at(la, lo) for la, lo in chunk]
            if not vals: vals = [None] * len(chunk)
            for (la, lo), v in zip(chunk, vals):
                self.mem[self.key(la, lo)] = v if (v is not None and v > -500) else None
            if i % (B * 10) == 0: json.dump(self.mem, open(self.fn, 'w'))
        json.dump(self.mem, open(self.fn, 'w'))
        out = []
        for la, lo in pts:
            v = self.mem[self.key(la, lo)]
            out.append(v if v is not None else self.fb.at(la, lo))
        return out

    def es_at(self, lat, lon):
        """IGN España MDT 5 m (WCS, riquadri di 0,01°)"""
        S = 0.01; k = (math.floor(lat / S), math.floor(lon / S))
        if k not in self.gsi:
            fn = os.path.join(os.path.dirname(self.fn), f'es_{k[0]}_{k[1]}.tif')
            la0, lo0 = k[0] * S, k[1] * S
            if not os.path.exists(fn):
                curl('https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=Elevacion4258_5'
                     f'&SUBSET=Lat({la0 - 0.0003:.5f},{la0 + S + 0.0003:.5f})&SUBSET=Long({lo0 - 0.0003:.5f},{lo0 + S + 0.0003:.5f})&FORMAT=image/tiff', fn)
            try:
                import tifffile
                pg = tifffile.TiffFile(fn).pages[0]
                sc = pg.tags[33550].value; tp = pg.tags[33922].value
                self.gsi[k] = (pg.asarray(), sc, tp)
            except Exception: self.gsi[k] = None
        t = self.gsi[k]
        if t is None: return None
        a, sc, tp = t
        fx = (lon - tp[3]) / sc[0] - 0.5; fy = (tp[4] - lat) / sc[1] - 0.5
        x0, y0 = int(fx), int(fy); u, v = fx - x0, fy - y0
        if not (0 <= x0 < a.shape[1] - 1 and 0 <= y0 < a.shape[0] - 1): return None
        q = [float(a[y0, x0]), float(a[y0, x0 + 1]), float(a[y0 + 1, x0]), float(a[y0 + 1, x0 + 1])]
        if min(q) < -500: return None
        return (q[0] * (1 - u) + q[1] * u) * (1 - v) + (q[2] * (1 - u) + q[3] * u) * v

    def gsi_at(self, lat, lon):
        Z = 15; n = 2 ** Z
        fx = (lon + 180) / 360 * n * 256; lr = math.radians(lat)
        fy = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n * 256
        x0, y0 = int(fx - 0.5), int(fy - 0.5); u, v = fx - 0.5 - x0, fy - 0.5 - y0

        def px(X, Y):
            k = (X // 256, Y // 256)
            if k not in self.gsi:
                fn = os.path.join(os.path.dirname(self.fn), f'gsi_{Z}_{k[0]}_{k[1]}.png')
                if not os.path.exists(fn):
                    ok = curl(f'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{Z}/{k[0]}/{k[1]}.png', fn)
                    if ok is not True:
                        ok = curl(f'https://cyberjapandata.gsi.go.jp/xyz/dem_png/14/{k[0] // 2}/{k[1] // 2}.png', None)
                        self.gsi[k] = None
                if k not in self.gsi:
                    try: w, h, bpp, d = png_rgb(open(fn, 'rb').read()); self.gsi[k] = (w, bpp, d)
                    except Exception: self.gsi[k] = None
            t = self.gsi[k]
            if t is None: return None
            w, bpp, d = t; o = ((Y % 256) * w + (X % 256)) * bpp
            r, g, b = d[o], d[o + 1], d[o + 2]
            if (r, g, b) == (128, 0, 0): return None
            x = r * 65536 + g * 256 + b
            return (x - 2 ** 24 if x >= 2 ** 23 else x) * 0.01
        a, b, c, e = px(x0, y0), px(x0 + 1, y0), px(x0, y0 + 1), px(x0 + 1, y0 + 1)
        if None in (a, b, c, e): return None
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v


def runs(mask):
    """tratti consecutivi veri di una maschera ad anello: [inizio, fine) in indici"""
    n = len(mask); out = []
    if all(mask): return [[0, n]]
    st = next(i for i in range(n) if not mask[i])
    i = 0
    while i < n:
        k = (st + i) % n
        if mask[k]:
            j = i
            while j < n and mask[(st + j) % n]: j += 1
            out.append([k, k + (j - i)]); i = j
        else: i += 1
    return out


# ------------------------------------------------------------------ geometria
def loop_len(P):
    return sum(math.hypot(P[(i + 1) % len(P)][0] - P[i][0], P[(i + 1) % len(P)][1] - P[i][1]) for i in range(len(P)))


def resample(P, step, closed=True):
    pts = P + [P[0]] if closed else P
    cum = [0.0]
    for i in range(1, len(pts)): cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    L = cum[-1]; n = max(2, round(L / step)); out = []; k = 0
    for i in range(n if closed else n + 1):
        s = L * i / n
        while k < len(cum) - 2 and cum[k + 1] < s: k += 1
        f = (s - cum[k]) / max(1e-9, cum[k + 1] - cum[k])
        out.append((pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f))
    return out, L


def signed_area(P):
    return sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P))) / 2


def rings_from_ways(member_ways, ways):
    """unisce i tratti di un multipoligono in anelli chiusi (liste di id dei nodi)"""
    segs = [list(ways[w][0]) for w in member_ways if w in ways and len(ways[w][0]) >= 2]
    rings = []
    while segs:
        r = segs.pop()
        changed = True
        while r[0] != r[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == r[-1]: r += s[1:]
                elif s[-1] == r[-1]: r += s[::-1][1:]
                elif s[-1] == r[0]: r = s[:-1] + r
                elif s[0] == r[0]: r = s[::-1][:-1] + r
                else: continue
                segs.pop(i); changed = True; break
        if r[0] == r[-1] and len(r) >= 4: rings.append(r)
    return rings


def simplify(P, tol):
    if len(P) < 4: return P
    def rdp(a, b):
        ax, az = P[a]; bx, bz = P[b]; dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz) or 1e-9
        imax, dmax = -1, 0
        for i in range(a + 1, b):
            d = abs((P[i][0] - ax) * dz - (P[i][1] - az) * dx) / L
            if d > dmax: imax, dmax = i, d
        if dmax > tol: return rdp(a, imax)[:-1] + rdp(imax, b)
        return [P[a], P[b]]
    return rdp(0, len(P) - 1)


# ------------------------------------------------------------------ tracciato di gara
import re
PIT_RE = re.compile(r'(\bpits?\b|pit[ _-]?lane|pitlane|boxen|boxengasse|\bbox\b|\bpuits\b|\bboxes\b|corsia box)')
def is_pit(t):
    n = ' '.join(v for k, v in t.items() if k == 'name' or k.startswith('name:') or k == 'description').lower()
    return t.get('service') in ('pit_lane', 'pitlane', 'pit') or t.get('raceway') in ('pit_lane', 'pitlane', 'pit') or bool(PIT_RE.search(n))


def race_loop(ways, nodes, xy, target, cfg, only=None):
    if only:
        # vie della relazione "circuit": il ruolo dice il verso (forward = come la via, backward = al contrario)
        rw = {}
        for wid, role in only.items():
            if wid not in ways or not all(n in nodes for n in ways[wid][0]): continue
            nds, t = ways[wid]; t = dict(t)
            t['oneway'] = 'yes' if role == 'forward' else '-1' if role == 'backward' else t.get('oneway', '')
            rw[wid] = (nds, t)
        return race_loop_ways(rw, xy, target, cfg)
    rw = {wid: (nds, t) for wid, (nds, t) in ways.items()
          if t.get('highway') == 'raceway' and t.get('area') != 'yes' and not is_pit(t) and all(n in nodes for n in nds)
          and t.get('raceway') not in ('karting', 'drag_strip', 'motocross') and t.get('sport') not in ('karting',)}
    return race_loop_ways(rw, xy, target, cfg)


def race_loop_ways(rw, xy, target, cfg):
    # punti quasi coincidenti (a meno di 3 m) di vie diverse diventano lo stesso incrocio
    rep = {}
    cell = {}
    for wid, (nds, t) in rw.items():
        for n in (nds[0], nds[-1]):
            x, z = xy[n]; key = (int(x // 3), int(z // 3))
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for m in cell.get((key[0] + dx, key[1] + dz), []):
                        if m != n and math.hypot(xy[m][0] - x, xy[m][1] - z) < 3 and n not in rep: rep[n] = rep.get(m, m)
            cell.setdefault(key, []).append(n)
    if rep:
        rw = {wid: ([rep.get(n, n) for n in nds], t) for wid, (nds, t) in rw.items()}
    adj = {}
    for wid, (nds, t) in rw.items():
        for a, b in zip(nds, nds[1:]):
            if a == b: continue
            adj.setdefault(a, {})[b] = wid; adj.setdefault(b, {})[a] = wid
    # estremi rimasti staccati (le vie non si toccano per pochi metri): ponte verso il punto più vicino entro 25 m
    dang = [n for n, nb in adj.items() if len(nb) == 1]
    for n in dang:
        best = None
        for m in adj:
            if m == n or m in adj[n]: continue
            d = math.hypot(xy[m][0] - xy[n][0], xy[m][1] - xy[n][1])
            if d < 25 and (best is None or d < best[0]): best = (d, m)
        if best:
            m = best[1]; adj[n][m] = -1; adj[m][n] = -1
    # grafo compresso: incroci (grado != 2) collegati da catene di nodi
    junc = {n for n, nb in adj.items() if len(nb) != 2}
    if not junc and adj:
        junc = {next(iter(adj))}
    edges = []          # (a, b, [nodi], lunghezza)
    seen = set()
    for j in junc:
        for nb in adj[j]:
            if (j, nb) in seen: continue
            chain = [j, nb]; prev, cur = j, nb
            while cur not in junc:
                nxt = [x for x in adj[cur] if x != prev]
                if not nxt: break
                prev, cur = cur, nxt[0]; chain.append(cur)
                if cur == j: break
            seen.add((j, chain[1])); seen.add((chain[-1], chain[-2]))
            L = sum(math.hypot(xy[chain[i + 1]][0] - xy[chain[i]][0], xy[chain[i + 1]][1] - xy[chain[i]][1]) for i in range(len(chain) - 1))
            edges.append((chain[0], chain[-1], chain, L))
    inc = {}
    for k, (a, b, ch, L) in enumerate(edges):
        inc.setdefault(a, []).append(k); inc.setdefault(b, []).append(k)
    best = None; t0 = time.time(); found = 0
    # tratto chiuso su sé stesso (tutto il giro in una sola via)
    for k, (a, b, ch, L) in enumerate(edges):
        if a == b and len(ch) > 10:
            found += 1; err = abs(L - target) / target
            if best is None or err < best[0]: best = (err, [k], L)
    near = cfg.get('near')           # punto (x,z) che il giro deve toccare (facoltativo)
    for start in range(len(edges)):
        a0, b0, ch0, L0 = edges[start]
        stack = [(b0, [start], L0, {a0, b0})]
        while stack and time.time() - t0 < 60:
            node, path, L, visited = stack.pop()
            for k in inc.get(node, []):
                if k in path or k < start: continue
                a, b, ch, Lk = edges[k]
                other = b if a == node else a
                L2 = L + Lk
                if L2 > target * 1.25: continue
                if other == a0:
                    found += 1
                    err = abs(L2 - target) / target
                    if near:
                        nodes_ = [n for kk in path + [k] for n in edges[kk][2]]
                        dmin = min(math.hypot(xy[n][0] - near[0], xy[n][1] - near[1]) for n in nodes_)
                        err += dmin / 2000
                    if best is None or err < best[0]: best = (err, path + [k], L2)
                    continue
                if other in visited: continue
                stack.append((other, path + [k], L2, visited | {other}))
    if not best:
        raise SystemExit('nessun anello trovato tra le strade raceway')
    print(f'  anelli trovati: {found}, scelto {best[2]:.0f} m (ufficiale {target} m)')
    if abs(best[2] - target) / target > 0.08:
        raise SystemExit(f'anello troppo diverso dalla lunghezza ufficiale ({best[2]:.0f} m)')
    # catena di nodi in ordine
    path = best[1]
    a0, b0, ch0, _ = edges[path[0]]
    seq = list(ch0); cur = b0
    for k in path[1:]:
        a, b, ch, _ = edges[k]
        if a == cur: seq += ch[1:]; cur = b
        else: seq += ch[::-1][1:]; cur = a
    if seq[0] == seq[-1]: seq = seq[:-1]
    # verso: dai tratti a senso unico
    vote = 0
    pos = {n: i for i, n in enumerate(seq)}
    for wid, (nds, t) in rw.items():
        ow = t.get('oneway')
        if ow not in ('yes', '-1', 'true', '1'): continue
        sg = -1 if ow == '-1' else 1
        for a, b in zip(nds, nds[1:]):
            if a in pos and b in pos:
                d = pos[b] - pos[a]
                if abs(d) == 1 or abs(d) == len(seq) - 1:
                    fwd = (d == 1) or (d == -(len(seq) - 1))
                    vote += sg if fwd else -sg
    return seq, vote


def pit_chain(ways, nodes, xy, force=False):
    pw = {wid: (nds, t) for wid, (nds, t) in ways.items()
          if (force or (t.get('highway') in ('raceway', 'service', 'track', 'unclassified') and is_pit(t))) and all(n in nodes for n in nds)}
    if not pw: return None
    adj = {}
    for wid, (nds, t) in pw.items():
        for a, b in zip(nds, nds[1:]):
            adj.setdefault(a, set()).add(b); adj.setdefault(b, set()).add(a)
    # percorso più lungo tra due estremità (grafo piccolo)
    ends = [n for n, nb in adj.items() if len(nb) == 1] or list(adj)
    best = None
    def dist(a, b): return math.hypot(xy[a][0] - xy[b][0], xy[a][1] - xy[b][1])
    for s in ends:
        # cammino più lungo semplice via DFS limitata
        stack = [(s, [s], 0.0)]; t0 = time.time()
        while stack and time.time() - t0 < 3:
            n, path, L = stack.pop()
            ext = False
            for m in adj[n]:
                if m in path: continue
                ext = True
                stack.append((m, path + [m], L + dist(n, m)))
            if not ext and (best is None or L > best[0]): best = (L, path)
    return best[1] if best else None


def main():
    if len(sys.argv) < 2:
        print(__doc__); return
    tid = sys.argv[1]
    cfgs = json.load(open(os.path.join(HERE, 'circuits.json')))
    cfg = cfgs[tid]
    cache = os.path.join(os.environ.get('TRACK_CACHE', '/tmp/trackcache'), tid)
    png = None
    if '--png' in sys.argv: png = sys.argv[sys.argv.index('--png') + 1]
    lat0, lon0 = cfg['lat'], cfg['lon']
    half = cfg.get('half', 1800)
    print(f'{tid}: scarico OpenStreetMap ({half} m attorno a {lat0},{lon0})…')
    nodes, ways, rels = fetch_osm(lat0, lon0, half, cache)
    print(f'  nodi {len(nodes)}, vie {len(ways)}, relazioni {len(rels)}')
    kx = math.radians(1) * R_EARTH * math.cos(math.radians(lat0)); kz = math.radians(1) * R_EARTH
    xy = {i: ((lo - lon0) * kx, -(la - lat0) * kz) for i, (la, lo, t) in nodes.items()}
    to_ll = lambda x, z: (lat0 - z / kz, lon0 + x / kx)
    if cfg.get('near_ll'):
        la, lo = cfg['near_ll']; cfg['near'] = ((lo - lon0) * kx, -(la - lat0) * kz)

    # relazione "circuit" (se c'è): vie della pista con il verso, corsia box e partenza
    circ = None
    for rid, (mem, t) in rels.items():
        if t.get('type') != 'circuit' and not (t.get('type') == 'route' and t.get('route') in (None, 'motorsport', 'racing', 'raceway')): continue
        nm = (t.get('name', '') + ' ' + t.get('sport', '') + ' ' + t.get('highway', '')).lower()
        if t.get('type') == 'route' and not any(w in nm for w in ('ring', 'circuit', 'grand prix', 'raceway', 'motor', 'autodrom', 'gp')): continue
        if any(w in nm for w in ('seaway', 'maritime', 'ferry', 'bus', 'tram', 'bicycle', 'hiking')): continue
        if cfg.get('relation') and rid != cfg['relation']: continue
        wm = {ref: role for typ, ref, role in mem if typ == 'way' and role in ('forward', 'backward', '', 'track', 'main')}
        L = 0
        for ref in wm:
            if ref in ways:
                nds = [n for n in ways[ref][0] if n in xy]
                L += sum(math.hypot(xy[b][0] - xy[a][0], xy[b][1] - xy[a][1]) for a, b in zip(nds, nds[1:]))
        if L < cfg['length'] * 0.8: continue
        score = abs(L - cfg['length'])
        if circ is None or score < circ[0]: circ = (score, rid, mem, t, wm)
    only = None; start_node = None; pit_ways = None
    if circ:
        _, rid, mem, t, wm = circ
        print(f'  relazione circuito {rid} «{t.get("name", "")}»: {len(wm)} vie')
        only = wm
        pit_ways = [ref for typ, ref, role in mem if typ == 'way' and 'pit' in (role or '')]
        st = [ref for typ, ref, role in mem if typ == 'node' and role in ('start', 'finish', 'start_finish', 'start-finish', 'start_line', 'finish_line')]
        if st and st[0] in xy: start_node = st[0]
    seq = None
    if circ:
        # prima prova: i pezzi della relazione sono già in ordine di gara: si uniscono uno dopo l'altro
        order = [(ref, role) for typ, ref, role in circ[2] if typ == 'way' and role in ('forward', 'backward', '', 'track', 'main') and ref in ways]
        chain = []
        for ref, role in order:
            nds = [n for n in ways[ref][0] if n in xy]
            if len(nds) < 2: continue
            if role == 'backward': nds = nds[::-1]
            if not chain: chain = nds[:]; continue
            # punto d'incrocio con quanto già unito (la strada può continuare oltre: si taglia lì)
            tail = {n: k for k, n in enumerate(chain[-400:])}
            off = len(chain) - min(400, len(chain))
            hit = None
            for orient in ([nds] if role in ('forward', 'backward') else [nds, nds[::-1]]):
                for j, n in enumerate(orient):
                    if n in tail and j < len(orient) - 1:
                        k = off + tail[n]
                        if hit is None or k > hit[0]: hit = (k, orient, j)
                        break
            if hit:
                k, orient, j = hit
                chain = chain[:k + 1] + orient[j + 1:]
            else:
                end = xy[chain[-1]]
                if role not in ('forward', 'backward') and math.hypot(*(xy[nds[-1]][q] - end[q] for q in (0, 1))) < math.hypot(*(xy[nds[0]][q] - end[q] for q in (0, 1))): nds = nds[::-1]
                chain += nds
        # chiusura: l'ultimo tratto incrocia il primo
        if chain:
            head = {n: k for k, n in enumerate(chain[:400])}
            for k2 in range(len(chain) - 1, len(chain) // 2, -1):
                if chain[k2] in head and head[chain[k2]] < k2 - 10:
                    k1 = head[chain[k2]]; chain = chain[k1:k2 + 1]; break
        if len(chain) > 10:
            Pc = [xy[n] for n in chain]
            Lc = loop_len(Pc)
            gap = math.hypot(Pc[0][0] - Pc[-1][0], Pc[0][1] - Pc[-1][1])
            print(f'  pezzi in ordine: {Lc:.0f} m (chiusura {gap:.0f} m)')
            if abs(Lc - cfg['length']) / cfg['length'] < 0.06 and gap < 60:
                seq = chain[:-1] if chain[0] == chain[-1] else chain
                vote = 1                  # i ruoli forward/backward danno già il verso di gara
    try:
        if seq is None: seq, vote = race_loop(ways, nodes, xy, cfg['length'], cfg, only)
        elif False: pass
    except SystemExit:
        if not only: raise
        print('  la relazione non chiude un anello: provo con le vie raceway')
        seq, vote = race_loop(ways, nodes, xy, cfg['length'], cfg)
    P = [xy[n] for n in seq]
    # tratti in galleria o su ponte: la quota non è quella del terreno sopra/sotto, si raccorda tra gli imbocchi
    cov = {}
    for w, (nds, t) in ways.items():
        tun = t.get('tunnel') in ('yes', 'building_passage', 'covered') or t.get('covered') == 'yes'
        if tun or t.get('bridge') not in (None, 'no'):
            for a, b in zip(nds, nds[1:]): cov[(a, b)] = cov[(b, a)] = 'T' if tun else 'B'
    cov_seg = [(xy[a], xy[b], cov[(a, b)]) for a, b in zip(seq, seq[1:] + seq[:1]) if (a, b) in cov]
    area = signed_area(P)             # x est, z sud: area > 0 = senso orario visto dall'alto
    cw = area > 0
    want_cw = None
    if vote != 0:
        want_cw = cw if vote > 0 else not cw
        print(f'  verso dai sensi unici: {"orario" if want_cw else "antiorario"} (voti {vote})')
    else:
        want_cw = cfg.get('dir', 'cw') == 'cw'
        print(f'  verso da circuits.json: {"orario" if want_cw else "antiorario"}')
    if cfg.get('dir_force'): want_cw = cfg['dir_force'] == 'cw'
    if cw != want_cw: P = P[::-1]

    # corsia box
    pseq = None if cfg.get("pit_synth") else pit_chain({w: ways[w] for w in pit_ways if w in ways} if pit_ways else ways, nodes, xy, force=bool(pit_ways))
    pit = None
    if pseq and len(pseq) > 3:
        pit = [xy[n] for n in pseq]
    else:
        print('  ATTENZIONE: corsia box non trovata nei dati')
    # pulizia: tratti "andata e ritorno" (la catena di strade entra in una via e torna indietro sullo stesso punto)
    R, L = resample(P, 4.0)
    for it in range(6):
        n0 = len(R); cut = None
        for i in range(n0):
            for j in range(i + 6, min(i + 90, i + n0 - 6)):
                q = R[j % n0]
                if math.hypot(q[0] - R[i][0], q[1] - R[i][1]) < 5:
                    cut = (i, j); break
            if cut: break
        if not cut: break
        i, j = cut
        idx = [(i + 1 + k) % n0 for k in range(j - i - 1)]
        drop = set(idx)
        R = [p for k, p in enumerate(R) if k not in drop]
        print(f'  tolto uno spuntone di {len(drop) * 4} m')
    # angoli vivi tra due strade (incroci a 90° in città): si arrotondano un po', le curve vere restano
    for it in range(cfg.get('round_passes', 2)):
        n0 = len(R); Rn = []
        for i in range(n0):
            ax, az = R[i - 1]; bx, bz = R[i]; cx, cz = R[(i + 1) % n0]
            h1 = math.atan2(bz - az, bx - ax); h2 = math.atan2(cz - bz, cx - bx)
            d = abs((h2 - h1 + math.pi) % (2 * math.pi) - math.pi)
            if d > 0.12:          # oltre ~7° in 4 m (raggio < 33 m): media con i vicini
                xs = [R[(i + k) % n0] for k in range(-3, 4)]
                Rn.append((sum(p[0] for p in xs) / 7, sum(p[1] for p in xs) / 7))
            else: Rn.append(R[i])
        R = Rn
    P = R
    R, L = resample(P, 4.0)
    nR = len(R)
    def nearest_i(x, z):
        bi, bd = 0, 1e18
        for i, (px, pz) in enumerate(R):
            d = (px - x) ** 2 + (pz - z) ** 2
            if d < bd: bi, bd = i, d
        return bi, math.sqrt(bd)
    if pit:
        pr, plen = resample(pit, 2.0, closed=False)
        # verso della corsia come la pista
        i0, _ = nearest_i(*pr[len(pr) // 3]); i1, _ = nearest_i(*pr[2 * len(pr) // 3])
        d = (i1 - i0) % nR
        if d > nR / 2: pr = pr[::-1]
        # tieni solo il tratto parallelo vicino alla pista (via d'accesso ai box esclusa)
        mid = pr[len(pr) // 2]
        si, _ = nearest_i(*mid)
        # lato dei box: segno del prodotto vettoriale tangente x (box - pista)
        tx, tz = R[(si + 1) % nR][0] - R[si - 1][0], R[(si + 1) % nR][1] - R[si - 1][1]
        cross = tx * (mid[1] - R[si][1]) - tz * (mid[0] - R[si][0])
        pit_side = 1 if cross < 0 else -1            # +1 = a sinistra nel verso di marcia
        pit = pr
        start_i = si
    else:
        # nessuna corsia box nei dati: partenza davanti al grande edificio dei box (il più grande vicino alla pista)
        # e corsia costruita parallela al rettilineo, dal lato dell'edificio
        best = None
        for wid, (nds, t) in ways.items():
            if 'building' not in t or len(nds) < 4 or not all(n in xy for n in nds): continue
            Pb = [xy[n] for n in nds]; A = abs(signed_area(Pb))
            cx = sum(p[0] for p in Pb) / len(Pb); cz = sum(p[1] for p in Pb) / len(Pb)
            i_, d_ = nearest_i(cx, cz)
            if d_ < 90 and (best is None or A > best[0]): best = (A, i_, cx, cz)
        start_i = best[1] if best else 0
        if cfg.get('start_ll'):             # traguardo scelto: la corsia va lì (Nordschleife: Döttinger Höhe)
            start_i, _ = nearest_i((cfg['start_ll'][1] - lon0) * kx, -(cfg['start_ll'][0] - lat0) * kz); best = None
        si = start_i
        tx, tz = R[(si + 1) % nR][0] - R[si - 1][0], R[(si + 1) % nR][1] - R[si - 1][1]
        if best:
            cross = tx * (best[3] - R[si][1]) - tz * (best[2] - R[si][0]); pit_side = 1 if cross < 0 else -1
        else: pit_side = 1
        # corsia: da 260 m prima a 300 m dopo il traguardo, 15 m di lato, entrata e uscita dolci
        pit = []
        for k in range(-65, 76):
            i_ = (si + k) % nR; a, b = R[i_ - 1], R[(i_ + 1) % nR]
            l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1; nxl, nzl = (b[1] - a[1]) / l, -(b[0] - a[0]) / l
            ramp = min(1, (k + 65) / 22, (75 - k) / 22); ramp = ramp * ramp * (3 - 2 * ramp)
            off = 15 * ramp * pit_side
            pit.append((R[i_][0] + nxl * off, R[i_][1] + nzl * off))
        print(f'  corsia box costruita accanto all\'edificio principale (lato {pit_side})')
    if start_node is not None and not cfg.get('start_ll'):
        start_i, _ = nearest_i(*xy[start_node])
        print('  partenza dal nodo «start» della relazione')
    if cfg.get('start_ll'):
        x, z = ((cfg['start_ll'][1] - lon0) * kx, -(cfg['start_ll'][0] - lat0) * kz)
        start_i, _ = nearest_i(x, z)
    R = R[start_i:] + R[:start_i]
    # quote: terreno lungo la pista, molto lisciato (il modello del terreno ha ±5 m di rumore e in città i palazzi)
    print('  quote del terreno…')
    dem = DEM(os.path.join(cache, 'dem'))
    hires = ElevAPI(cfg['dem'], cache, dem) if cfg.get('dem') else None
    raw = hires.many([to_ll(x, z) for x, z in R]) if hires else [dem.at(*to_ll(x, z)) for x, z in R]
    raw = [h + cfg.get('dem_off', 0) for h in raw] if hires else raw

    def seg_d(p, a, b):
        dx, dz = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dz * dz or 1
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2))
        return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)
    covered = [any(seg_d(p, a, b) < 3 for a, b, k in cov_seg) for p in R]
    tunnel_mask = [any(seg_d(p, a, b) < 3 for a, b, k in cov_seg if k == 'T') for p in R]
    i = 0; ncov = 0
    while i < nR:
        if covered[i] and not covered[i - 1]:
            j = i
            while covered[j % nR] and j - i < nR: j += 1
            a, b = (i - 3) % nR, (j + 2) % nR; n = (b - a) % nR
            for k in range(1, n):
                t = k / n; t = t * t * (3 - 2 * t)
                raw[(a + k) % nR] = raw[a] + (raw[b] - raw[a]) * t
            ncov += n * 4; i = j
        else: i += 1
    if ncov: print(f'  gallerie e ponti: {ncov} m raccordati tra gli imbocchi')
    sea = cfg.get('min_y')
    if sea is not None: raw = [max(sea, h) for h in raw]
    W = int(cfg.get('smooth', 140) / 4)
    sm = []
    for i in range(nR):
        acc = wsum = 0
        for k in range(-W, W + 1):
            w = math.exp(-(k / (W * 0.5)) ** 2); acc += raw[(i + k) % nR] * w; wsum += w
        sm.append(acc / wsum)
    if cfg.get('flat'): m = sum(sm) / nR; sm = [m + (h - m) * cfg['flat'] for h in sm]
    # pendenza massima (il modello del terreno in città vede i palazzi): oltre si appiattisce
    mg = cfg.get('max_grade', 0.12)
    for it in range(300):
        ch = False
        for i in range(nR):
            j = (i + 1) % nR
            dlt = sm[j] - sm[i]
            if abs(dlt) > mg * 4:
                ex = (abs(dlt) - mg * 4) / 2 * (1 if dlt > 0 else -1)
                sm[i] += ex; sm[j] -= ex; ch = True
        if not ch: break
    if cfg.get('bridge'):
        # tracciato a otto: dove la pista si incrocia, il passaggio più avanti nel giro sale su un ponte
        def inter(a, b, c, d):
            def cr(o, p, q): return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
            return cr(a, b, c) * cr(a, b, d) < 0 and cr(c, d, a) * cr(c, d, b) < 0
        for i in range(nR):
            for j in range(i + 60, nR):
                if nR - j + i < 60: continue
                if inter(R[i], R[(i + 1) % nR], R[j], R[(j + 1) % nR]):
                    print(f'  incrocio a {i * 4} m e {j * 4} m: ponte sul secondo')
                    H = cfg['bridge'] if isinstance(cfg['bridge'], (int, float)) else 8.0
                    for k in range(-70, 71):
                        w = 0.5 * (1 + math.cos(math.pi * k / 70))
                        q = (j + k) % nR
                        sm[q] = max(sm[q], sm[i] + H * w) if w > 0.02 else sm[q]

    base = round(min(sm), 1)
    hw = cfg.get('hw', 6.5)
    points = [[round(x, 2), round(h - base, 2), round(z, 2), hw] for (x, z), h in zip(R, sm)]
    # griglia del terreno attorno alla pista
    xs = [p[0] for p in points]; zs = [p[2] for p in points]
    pad = cfg.get('pad', 900); step = 50
    x0 = math.floor((min(xs) - pad) / step) * step; z0 = math.floor((min(zs) - pad) / step) * step
    nx = int((max(xs) + pad - x0) / step) + 1; nz = int((max(zs) + pad - z0) / step) + 1
    grid_h = []
    gll = [to_ll(x0 + i * step, z0 + j * step) for j in range(nz) for i in range(nx)]
    gfast = hires and hires.kind in ('ign', 'gsi', 'es')       # 3DEP a punti è lento: il terreno lontano dal modello mondiale (negli USA è già 3DEP)
    gh = hires.many(gll) if gfast else [dem.at(*q) for q in gll]
    off = cfg.get('dem_off', 0) if gfast else 0
    for h in gh: grid_h.append(round(h + off - base, 1))
    # area utile per edifici e vegetazione
    X0, X1, Z0, Z1 = x0 + 60, x0 + (nx - 1) * step - 60, z0 + 60, z0 + (nz - 1) * step - 60
    inside = lambda p: X0 < p[0] < X1 and Z0 < p[1] < Z1

    def poly(ids):
        P2 = [xy[n] for n in ids if n in xy]
        if len(P2) > 3 and ids[0] == ids[-1]:
            # anello chiuso: si semplifica in due metà (dal primo punto al più lontano e ritorno)
            P2 = P2[:-1]
            far = max(range(len(P2)), key=lambda i: (P2[i][0] - P2[0][0]) ** 2 + (P2[i][1] - P2[0][1]) ** 2)
            P2 = simplify(P2[:far + 1], 1.0)[:-1] + simplify(P2[far:] + [P2[0]], 1.0)[:-1]
        else:
            P2 = simplify(P2, 1.0)
        return [[round(x, 1), round(z, 1)] for x, z in P2]
    buildings, forest, meadow, water, roads, trees, stands = [], [], [], [], [], [], []
    def bh(t):
        h = None
        try:
            if 'height' in t: h = float(t['height'].replace('m', '').strip())
            elif 'building:levels' in t: h = float(t['building:levels']) * 3.2 + 1
        except ValueError: pass
        k = t.get('building', 'yes')
        if h is None: h = {'grandstand': 14, 'industrial': 9, 'commercial': 12, 'apartments': 18, 'hotel': 30, 'office': 20, 'house': 7, 'garage': 3.5, 'shed': 3, 'hangar': 10, 'retail': 8}.get(k, 9 if cfg.get('street') else 7)
        return round(min(h, 220), 1)
    def add_area(t, ids):
        if len(ids) < 4: return
        P2 = poly(ids)
        if len(P2) < 3 or not any(inside(p) for p in P2): return
        if 'building' in t or t.get('man_made') == 'grandstand':
            buildings.append({'p': P2, 'h': bh(t), 'k': 'grandstand' if t.get('building') == 'grandstand' or t.get('man_made') == 'grandstand' else t.get('building', 'yes'), 'n': t.get('name', '')})
        elif t.get('landuse') == 'forest' or t.get('natural') in ('wood', 'scrub'):
            forest.append(P2)
        elif t.get('landuse') in ('grass', 'meadow', 'recreation_ground', 'village_green', 'cemetery', 'farmland') or t.get('leisure') in ('park', 'golf_course', 'garden', 'pitch'):
            meadow.append(P2)
        elif t.get('natural') == 'water' or t.get('landuse') in ('reservoir', 'basin') or t.get('waterway') in ('riverbank', 'dock') or t.get('leisure') == 'marina':
            water.append(P2)
    RW = {'motorway': 14, 'trunk': 12, 'primary': 11, 'secondary': 9, 'tertiary': 8, 'residential': 6, 'unclassified': 6, 'service': 4.5, 'living_street': 5,
          'motorway_link': 7, 'trunk_link': 7, 'primary_link': 7, 'secondary_link': 6}
    for wid, (nds, t) in ways.items():
        if not all(n in xy for n in nds): nds = [n for n in nds if n in xy]
        if len(nds) < 2: continue
        closed = nds[0] == nds[-1]
        if closed and ('building' in t or 'landuse' in t or 'natural' in t or 'leisure' in t or 'waterway' in t or t.get('man_made') == 'grandstand'):
            add_area(t, nds)
        elif t.get('highway') in RW and t.get('area') != 'yes' and not is_pit(t):
            P2 = poly(nds)
            if any(inside(p) for p in P2): roads.append({'w': RW[t['highway']], 'p': P2})
    for rid, (mem, t) in rels.items():
        if t.get('type') != 'multipolygon': continue
        outer = [ref for typ, ref, role in mem if typ == 'way' and role in ('outer', '')]
        for ring in rings_from_ways(outer, ways):
            add_area(t, ring)
    for nid, (la, lo, t) in nodes.items():
        if t.get('natural') == 'tree':
            x, z = xy[nid]
            if inside((x, z)): trees.append([round(x, 1), round(z, 1)])
    # limiti di dimensione (file leggero): gli edifici più vicini alla pista per primi
    def dtrack(p):
        x, z = p
        return min((x - q[0]) ** 2 + (z - q[2]) ** 2 for q in points[::5]) ** 0.5
    buildings.sort(key=lambda b: dtrack(b['p'][0]))
    buildings = [b for b in buildings if dtrack(b['p'][0]) < cfg.get('bmax_d', 1400)][:cfg.get('bmax', 2600)]
    roads = roads[:2500]; trees = trees[:1500]
    # nomi delle curve (vie del circuito con un nome, punti panoramici): posizione lungo il giro
    names = []
    def near_R(x, z, lim):
        bi, bd = None, lim
        for k in range(0, nR):
            d_ = math.hypot(points[k][0] - x, points[k][2] - z)
            if d_ < bd: bi, bd = k, d_
        return bi
    for wid, (nds, t) in ways.items():
        nm = t.get('name')
        if not nm or t.get('highway') != 'raceway' or nm.lower().startswith(('nürburgring', 'anbindung', 'boxengasse', 'variante', 'rallycross')): continue
        if any(n[1] == nm for n in names): continue
        P_ = [xy[n] for n in nds if n in xy]
        if len(P_) < 2: continue
        hits = [near_R(x, z, 8) for x, z in P_]
        hits = [h for h in hits if h is not None]
        if len(hits) >= max(2, len(P_) // 2): names.append([min(hits) * 4, nm])
    for nid, (la, lo, t) in nodes.items():
        nm = t.get('name')
        if nm and t.get('tourism') == 'viewpoint' and not any(n[1] in nm or nm in n[1] for n in names):
            x, z = xy[nid]; k = near_R(x, z, 70)
            if k is not None: names.append([k * 4, nm])
    names.sort()
    # curve sopraelevate (Karussell): [inizio, fine, pendenza trasversale]
    banks = []
    for la, lo, w, sl in cfg.get('banks', []):
        x, z = (lo - lon0) * kx, -(la - lat0) * kz; k = near_R(x, z, 80)
        if k is not None: banks.append([k * 4 - w / 2, k * 4 + w / 2, sl])
    if names: print(f'  nomi delle curve: {len(names)}, sopraelevate: {len(banks)}')
    out = {
        'source': 'OpenStreetMap contributors (ODbL); Terrarium terrain tiles (SRTM, GMTED, ETOPO1 – Mapzen/AWS)',
        'lat0': lat0, 'lon0': lon0, 'length': round(L, 1), 'base': base, 'points': points,
        'pit': [[round(x, 2), round(z, 2)] for x, z in pit[::2]] if pit else None, 'pitSide': pit_side,
        'grid': {'x0': x0, 'z0': z0, 'step': step, 'nx': nx, 'nz': nz, 'h': grid_h},
        'buildings': buildings, 'forest': forest, 'meadow': meadow, 'water': water, 'roads': roads, 'trees': trees, 'corners': {},
        'tunnels': [[a * 4, b * 4] for a, b in runs(tunnel_mask)],
        'names': names, 'banks': banks,
    }
    fn = os.path.join(ROOT, 'src', 'tracks', f'{tid}Data.js')
    with open(fn, 'w') as f:
        DEMS = {'ign': 'IGN RGE ALTI (Francia/Monaco, Licence Ouverte)', 'usgs': 'USGS 3DEP (pubblico dominio)', 'gsi': 'GSI Giappone DEM 5 m', 'es': 'IGN España MDT05 (CC BY 4.0)'}
        f.write(f'// {cfg["name"]} — dati da OpenStreetMap (© OpenStreetMap contributors, ODbL) e quote {DEMS.get(cfg.get("dem"), "Terrarium (SRTM/GMTED/ETOPO1)")}.\n')
        f.write('// Generato da tools/build_track.py: coordinate in metri, x verso est, z verso sud, ordine di gara.\n')
        f.write('export default ' + json.dumps(out, separators=(',', ':')) + ';\n')
    print(f'  scritto {fn}: {os.path.getsize(fn) // 1024} KB · giro {L:.0f} m · box {"sì" if pit else "NO"} lato {pit_side} · edifici {len(buildings)} · boschi {len(forest)} · prati {len(meadow)} · acqua {len(water)} · strade {len(roads)}')
    if png:
        draw_png(points, pit, buildings, water, forest, png)


def draw_png(points, pit, buildings, water, forest, fn):
    """anteprima dall'alto (SVG convertito da Chromium se disponibile; altrimenti SVG)"""
    xs = [p[0] for p in points]; zs = [p[2] for p in points]
    x0, x1, z0, z1 = min(xs) - 150, max(xs) + 150, min(zs) - 150, max(zs) + 150
    W = 900; H = int(W * (z1 - z0) / (x1 - x0))
    sx = lambda x: (x - x0) / (x1 - x0) * W; sz = lambda z: (z - z0) / (z1 - z0) * H
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" style="background:#1d2a1d">']
    for P in forest: parts.append('<polygon fill="#2f4a2a" points="' + ' '.join(f'{sx(x):.1f},{sz(z):.1f}' for x, z in P) + '"/>')
    for P in water: parts.append('<polygon fill="#2a5d8f" points="' + ' '.join(f'{sx(x):.1f},{sz(z):.1f}' for x, z in P) + '"/>')
    for b in buildings: parts.append('<polygon fill="#9a9a9a" points="' + ' '.join(f'{sx(x):.1f},{sz(z):.1f}' for x, z in b['p']) + '"/>')
    parts.append('<polyline fill="none" stroke="#fff" stroke-width="4" points="' + ' '.join(f'{sx(p[0]):.1f},{sz(p[2]):.1f}' for p in points + points[:1]) + '"/>')
    if pit: parts.append('<polyline fill="none" stroke="#ffcc00" stroke-width="3" points="' + ' '.join(f'{sx(x):.1f},{sz(z):.1f}' for x, z in pit) + '"/>')
    p0, p1 = points[0], points[8]
    parts.append(f'<circle cx="{sx(p0[0]):.1f}" cy="{sz(p0[2]):.1f}" r="9" fill="#e10600"/>')
    parts.append(f'<line x1="{sx(p0[0]):.1f}" y1="{sz(p0[2]):.1f}" x2="{sx(p1[0]):.1f}" y2="{sz(p1[2]):.1f}" stroke="#e10600" stroke-width="5"/>')
    parts.append('</svg>')
    open(fn.replace('.png', '.svg'), 'w').write(''.join(parts))


if __name__ == '__main__':
    main()
