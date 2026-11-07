#!/usr/bin/env python3
"""Bordi pista veri dalle foto satellitari (Esri World Imagery, usate solo per l'analisi).

Per ogni metro di pista misura, a sinistra e a destra: dove finisce l'asfalto (larghezza vera, anche
asimmetrica), se c'è un cordolo, che cosa c'è oltre (ghiaia, via di fuga in asfalto o dipinta, prato)
e fin dove arriva la via di fuga (lì sta la barriera). Aggiunge a src/tracks/<id>Data.js:
  edges: per punto [bordo sx, bordo dx, cordolo sx, cordolo dx]
  side:  per punto [cordolo sx, cordolo dx, tipo sx, tipo dx, barriera sx, barriera dx] (tipo 2 ghiaia, 3 asfalto)
  surf:  mappa delle superfici attorno alla pista (PNG in base64: righe ogni metro, colonne ogni 0,5 m da -40 a +40 m)
Uso: python3 tools/sat_side.py <id> [--png anteprima.png]
"""
import base64, io, json, math, os, sys
import numpy as np
from PIL import Image
import sat_strip as S

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, RES = 40, 0.5
RUNOFF = (S.ASPH, S.GRAVEL, S.RED, S.WHITE, S.BLUE, S.GREENP)


def mode_filter(c, ka=5, kd=3):
    """classe più frequente in una finestra ka (lungo) × kd (di traverso)"""
    cnt = np.zeros((8,) + c.shape, np.int16)
    for a in range(-(ka // 2), ka // 2 + 1):
        for b in range(-(kd // 2), kd // 2 + 1):
            sh = np.roll(np.roll(c, a, 0), b, 1)
            for k in range(8): cnt[k] += (sh == k)
    return cnt.argmax(0).astype(np.uint8)


def runmed(x, k):
    n = len(x); h = k // 2
    xp = np.concatenate([x[-h:], x, x[:h]])
    win = np.lib.stride_tricks.sliding_window_view(xp, k)
    return np.nanmedian(win, axis=1)


def main():
    tid = sys.argv[1]
    cfg = json.load(open(os.path.join(ROOT, 'tools', 'circuits.json')))[tid]
    street = bool(cfg.get('street'))
    D, P, N, d, img = S.strip(tid, ROOT, W=W, res=RES, z=18, ds=1.0)
    n, m = img.shape[0], img.shape[1]; c0 = m // 2
    # bilanciamento: l'asfalto al centro della pista è grigio neutro (le foto hanno dominanti di colore
    # e luminosità diverse da un posto all'altro): guadagni per canale, in finestre di ~150 m
    band = img[:, c0 - 3:c0 + 4].reshape(n, -1, 3)
    blk = 25; ref = []
    for i in range(0, n, blk):
        w = band[max(0, i - 75):i + 75].reshape(-1, 3)
        ref.append(np.median(w, 0))
    ref = np.array(ref); ref = np.repeat(ref, blk, 0)[:n]
    lum = ref.mean(1, keepdims=True)
    gain = np.clip(lum / np.maximum(ref, 8), 0.85, 1.2) * np.clip(80.0 / np.maximum(lum, 8), 1.0, 1.5)   # solo le foto molto scure si schiariscono
    img = np.clip(img * gain[:, None, :], 0, 255)
    raw = S.classify(img)
    if street: raw[raw == S.DARK] = S.ASPH         # in città le ombre dei palazzi cadono sulla strada
    c = mode_filter(raw)
    hw0 = np.array([p[3] for p in D['points']]); npt = len(hw0)
    hw_row = np.repeat(hw0, 4)[:n] if len(np.repeat(hw0, 4)) >= n else np.resize(np.repeat(hw0, 4), n)

    def edge_side(sd):
        out = np.full(n, np.nan)
        k0 = int(2.5 / RES)
        for i in range(n):
            row = c[i]; raw_i = raw[i]
            for k in range(k0, int(16 / RES)):
                j = c0 + sd * k
                if not (0 < j < m - 1): break
                # linea bianca di bordo (in città le strisce delle corsie non contano); le ombre (alberi,
                # palazzi) cadono sull'asfalto e non sono un bordo
                if (raw_i[j] == S.WHITE and not street) or (row[j] not in (S.ASPH, S.DARK) and row[j + sd] not in (S.ASPH, S.DARK)):
                    out[i] = k * RES + (0.25 if raw_i[j] == S.WHITE else 0); break
        return out
    E = {}
    for sd, nm in ((1, 'L'), (-1, 'R')):
        e = edge_side(sd)
        e = runmed(e, 21)
        lo, hi = hw_row * 0.88, hw_row * (1.5 if street else 1.8)
        e = np.where(np.isnan(e), hw_row, e)
        e = np.clip(e, lo, hi)
        e = runmed(e, 9)
        E[nm] = e
    # barriere e reti: linee sottili scure (ombra di rete e guard-rail) parallele alla pista
    dk = (raw == S.DARK).astype(np.float32)
    ker = np.ones(15) / 15
    dk = np.apply_along_axis(lambda v: np.convolve(np.concatenate([v[-7:], v, v[:7]]), ker, 'valid'), 0, dk)
    R_, G_, B_ = img[..., 0], img[..., 1], img[..., 2]
    red = ((raw == S.RED) | ((R_ - np.maximum(G_, B_) > 16) & (R_ > 120))).astype(np.float32)   # cordoli: rossi o rosa (bianco e rosso sfumati)
    # cordoli, tipo di via di fuga e barriera
    side = {}
    for sd, nm in ((1, 'L'), (-1, 'R')):
        e = E[nm]; kerb = np.zeros(n); typ = np.zeros(n, int); wall = np.zeros(n)
        for i in range(n):
            j0 = c0 + sd * int(round(e[i] / RES))
            ks = [c0 + sd * k for k in range(int((e[i] - 0.5) / RES), int((e[i] + 2.0) / RES)) if 0 <= c0 + sd * k < m]
            kerb[i] = red[i, ks].mean() if ks else 0
            bar = None
            for k in range(int((e[i] + 1.5) / RES), int(36 / RES)):
                j = c0 + sd * k
                if not (3 <= j < m - 3): break
                f = dk[i, j]
                if f > 0.4 and dk[i, j - 3] < 0.6 * f and dk[i, j + 3] < 0.6 * f: bar = k * RES; break
            # oltre il bordo: via di fuga contigua (con tratti d'erba fino a 6 m)
            last = e[i]; gap = 0; cnt = np.zeros(8)
            for k in range(int(e[i] / RES), int(W / RES)):
                j = c0 + sd * k
                if not (0 <= j < m): break
                cl = c[i, j]
                if cl in RUNOFF: last = k * RES; gap = 0; cnt[cl] += 1
                else:
                    gap += RES
                    if gap > 6: break
            far = last - e[i]
            # barriera: la linea scura vista nella foto (rete, guard-rail) oppure, se non si vede, oltre la
            # via di fuga con un prato largo come sulle piste vere
            wall[i] = min(32, max(e[i] + 12, last + 2.5)) if not street else e[i] + 1.0
            if bar is not None and not street and bar > max(e[i] + 4, last - 1): wall[i] = min(wall[i], bar)
            tot = cnt.sum()
            if street: typ[i] = 3
            elif tot > 0 and cnt[S.GRAVEL] / tot > 0.35 and far > 5: typ[i] = 2
            elif tot > 0 and far > 4: typ[i] = 3
            else: typ[i] = 0
        kerb = np.convolve(np.concatenate([kerb[-4:], kerb, kerb[:4]]), np.ones(9) / 9, 'valid')
        side[nm] = (kerb > 0.1, typ, runmed(wall, 9))
    # cordoli solo nelle curve (le strisce dipinte lungo i rettilinei non sono cordoli in rilievo)
    Pp = np.array([[q[0], q[2]] for q in D['points']])
    hd = np.arctan2(np.roll(Pp, -1, 0)[:, 1] - Pp[:, 1], np.roll(Pp, -1, 0)[:, 0] - Pp[:, 0])
    dh = (np.roll(hd, -3) - np.roll(hd, 3) + np.pi) % (2 * np.pi) - np.pi
    cmask = np.abs(dh / 24) > 0.006
    cmask = np.array([cmask[[(i + k) % npt for k in range(-8, 9)]].any() for i in range(npt)])
    # per punto dei dati (ogni 4 m)
    edges, sides = [], []
    for p in range(npt):
        i = min(n - 1, p * 4 + 2)
        sl = slice(p * 4, p * 4 + 4)
        kL = bool(side['L'][0][sl].any()) and bool(cmask[p]); kR = bool(side['R'][0][sl].any()) and bool(cmask[p])
        tL = int(np.bincount(side['L'][1][sl], minlength=4).argmax()); tR = int(np.bincount(side['R'][1][sl], minlength=4).argmax())
        edges.append([round(float(E['L'][i]), 2), round(float(E['R'][i]), 2), int(kL), int(kR)])
        sides.append([int(kL), int(kR), tL, tR, round(float(side['L'][2][i]), 1), round(float(side['R'][2][i]), 1)])
    # foto troppo sfocate per vedere i cordoli: si mettono nelle curve, come sulle altre piste
    if np.mean([e[2] for e in edges]) < 0.06 and np.mean([e[3] for e in edges]) < 0.06:
        for p in range(npt):
            k = int(cmask[p]); edges[p][2] = edges[p][3] = k; sides[p][0] = sides[p][1] = k
    D['edges'] = edges
    if not street:
        D['side'] = sides
        buf = io.BytesIO(); Image.fromarray((c * 32).astype(np.uint8)).save(buf, 'PNG', optimize=True)
        D['surf'] = {'png': base64.b64encode(buf.getvalue()).decode(), 'ds': 1.0, 'res': RES, 'w': W}
    else:
        D.pop('side', None); D.pop('surf', None)
        D['walls'] = [[round(float(side['L'][2][min(n - 1, p * 4 + 2)]), 1), round(float(side['R'][2][min(n - 1, p * 4 + 2)]), 1)] for p in range(npt)]
    fn = os.path.join(ROOT, 'src', 'tracks', f'{tid}Data.js')
    head = open(fn).read(); head = head[:head.index('export default')]
    if 'Esri' not in head: head = head.rstrip('\n') + '\n// Bordi pista, cordoli e vie di fuga misurati sulle foto satellitari (Esri World Imagery: solo analisi, nessuna immagine inclusa).\n'
    open(fn, 'w').write(head + 'export default ' + json.dumps(D, separators=(',', ':')) + ';\n')
    hl = np.array([e[0] for e in edges]); hr = np.array([e[1] for e in edges])
    print(f'{tid}: larghezza media {np.mean(hl + hr):.1f} m (min {np.min(hl + hr):.1f}, max {np.max(hl + hr):.1f}) · cordoli {np.mean([e[2] for e in edges]) * 100:.0f}%/{np.mean([e[3] for e in edges]) * 100:.0f}%'
          + ('' if street else f' · ghiaia {np.mean([s[2] == 2 for s in sides]) * 100:.0f}%/{np.mean([s[3] == 2 for s in sides]) * 100:.0f}% · asfalto {np.mean([s[2] == 3 for s in sides]) * 100:.0f}%/{np.mean([s[3] == 3 for s in sides]) * 100:.0f}%')
          + f' · surf {len(D.get("surf", {}).get("png", "")) // 1024} KB')
    if '--png' in sys.argv:
        out = sys.argv[sys.argv.index('--png') + 1]
        vis = S.PAL[c].copy()
        for i in range(n):
            for sd, nm in ((1, 'L'), (-1, 'R')):
                j = c0 + sd * int(E[nm][i] / RES)
                if 0 <= j < m: vis[i, j] = (255, 0, 255)
                j = c0 + sd * int(side[nm][2][i] / RES)
                if 0 <= j < m: vis[i, j] = (255, 255, 0)
        a = np.clip(img, 0, 255).astype(np.uint8)
        Image.fromarray(np.concatenate([a, vis], 1).transpose(1, 0, 2)[::-1]).save(out)


if __name__ == '__main__':
    main()
