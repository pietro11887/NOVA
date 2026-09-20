import { rand, randInt, pick } from '../core/utils.js';
import { NEGOZI, LARGHEZZA_NEGOZIO } from './textures.js';

/*
 * Piano terra: quanto e' largo un negozio e quanta texture occupa.
 *
 * L'atlante mette in fila NEGOZI vetrine diverse, quindi per farne
 * scorrere una ogni LARGHEZZA_NEGOZIO metri la scala orizzontale deve
 * valere un'intera cella su quella distanza. Lo scostamento, a passi di
 * cella, decide da quale negozio comincia questo edificio: senza, un
 * isolato intero ripeteva bar-lavanderia-elettronica sempre nello stesso
 * ordine, che e' un altro modo di sembrare tutti uguali.
 */
const SCALA_NEGOZI = 1 / (LARGHEZZA_NEGOZIO * NEGOZI);

/*
 * Quello che sporge dal muro: tende, insegne a bandiera, pensiline.
 *
 * Il parallasse scava DENTRO la parete, e una vetrina incassata la fa bene,
 * ma non rompe mai la sagoma: il profilo dell'edificio resta una scatola.
 * Queste escono davvero — fanno ombra sul marciapiede e si vedono in
 * prospettiva lungo tutta la via, che e' quello che da' spessore a una
 * strada.
 *
 * E non sono messe a caso. Si sa quale negozio cade in quale campata:
 * l'atlante scorre di una cella ogni LARGHEZZA_NEGOZIO metri a partire dallo
 * scostamento di questo edificio, e sulle facce perpendicolari a Z le UV
 * corrono lungo +X, su quelle perpendicolari a X lungo +Z. Cosi' la tenda
 * finisce sopra il bar e l'alimentari, la pensilina sopra il portone, e
 * sulla serranda chiusa non c'e' niente — che e' il punto: una tenda sopra
 * una saracinesca abbassata si nota piu' di una tenda che manca.
 */
const TENDA = { 0: 0xc8452f, 3: 0x2f6b32 };                 // bar, alimentari
const BANDIERA = { 1: 0x9fd3ff, 2: 0x3fc6ff, 6: 0x6cf0a0 }; // lavanderia, elettronica, farmacia
const PENSILINA = 5;                                        // portone di casa

function sporgenze(B, offCella, x, y0, z, w, h, d) {
  const facce = [
    { nx: 0, nz: 1, lung: w, base: x - w / 2, fissa: z + d / 2, asse: 'x' },
    { nx: 0, nz: -1, lung: w, base: x - w / 2, fissa: z - d / 2, asse: 'x' },
    { nx: 1, nz: 0, lung: d, base: z - d / 2, fissa: x + w / 2, asse: 'z' },
    { nx: -1, nz: 0, lung: d, base: z - d / 2, fissa: x - w / 2, asse: 'z' },
  ];
  for (const f of facce) {
    const campate = Math.max(1, Math.round(f.lung / LARGHEZZA_NEGOZIO));
    const passo = f.lung / campate;
    for (let t = 0; t < campate; t++) {
      const lungo = (t + 0.5) * passo;                      // centro della campata
      const cella = (offCella + Math.floor(lungo / LARGHEZZA_NEGOZIO)) % NEGOZI;
      const px = f.asse === 'x' ? f.base + lungo : f.fissa;
      const pz = f.asse === 'x' ? f.fissa : f.base + lungo;
      // lungo il muro e fuori dal muro, secondo come e' girata la facciata
      const lungoMuro = (v, fuori) => (f.asse === 'x' ? v : fuori);
      const fuoriMuro = (v, fuori) => (f.asse === 'x' ? fuori : v);
      const larg = passo * 0.78;

      if (TENDA[cella] !== undefined) {
        /*
         * La tenda va appena sotto la fascia dell'insegna, non a meta'
         * vetrina: piu' in basso copriva il negozio invece di ripararlo, e
         * da lontano spariva contro il muro. E deve uscire abbastanza da
         * fare ombra sul marciapiede — l'ombra si vede da molto piu'
         * lontano della tenda.
         */
        const sp = 1.35;                                    // quanto esce dal muro
        const cy = y0 + h * 0.735;
        const ox = px + f.nx * sp / 2, oz = pz + f.nz * sp / 2;
        B.detail.box(ox, cy, oz, lungoMuro(larg, sp), 0.16, fuoriMuro(larg, sp), TENDA[cella]);
        // il bordo che pende davanti: e' quello che la fa leggere come tenda
        const bx = px + f.nx * sp, bz = pz + f.nz * sp;
        B.detail.box(bx, cy - 0.20, bz, lungoMuro(larg, 0.12), 0.36,
          fuoriMuro(larg, 0.12), TENDA[cella]);
      } else if (BANDIERA[cella] !== undefined) {
        /*
         * Insegna a bandiera. Di giorno la faccia accesa e' spenta insieme
         * ai lampioni, quindi il pannello deve reggersi da solo: colorato e
         * grande abbastanza da leggersi. Prima era un rettangolino grigio
         * di dieci centimetri, e di fronte non lo vedevi proprio.
         */
        const sp = 1.05;
        const cy = y0 + h * 0.80;
        const ox = px + f.nx * (sp / 2 + 0.05), oz = pz + f.nz * (sp / 2 + 0.05);
        B.detail.box(ox, cy, oz, lungoMuro(0.14, sp), 0.86, fuoriMuro(0.14, sp), BANDIERA[cella]);
        // il braccio che la tiene attaccata al muro
        B.detail.box(px + f.nx * 0.16, cy, pz + f.nz * 0.16,
          lungoMuro(0.08, 0.32), 0.1, fuoriMuro(0.08, 0.32), 0x4a515a);
        // la faccia accesa compare solo di notte, insieme ai lampioni
        B.lamp.box(ox, cy, oz, lungoMuro(0.17, sp * 0.9), 0.66,
          fuoriMuro(0.17, sp * 0.9), BANDIERA[cella]);
      } else if (cella === PENSILINA) {
        const sp = 1.0;
        const cy = y0 + h * 0.68;
        const ox = px + f.nx * sp / 2, oz = pz + f.nz * sp / 2;
        B.detail.box(ox, cy, oz, lungoMuro(passo * 0.5, sp), 0.14,
          fuoriMuro(passo * 0.5, sp), 0x8f959c);
      }
    }
  }
}

/**
 * Piano terra di un edificio: la fila di negozi piu' quello che sporge.
 *
 * Esportata perche' un paio di costruzioni non passano dai generatori qui
 * dentro — il chiosco del molo e il negozio del distributore sono disegnati
 * a mano in city.js — e prima si tiravano dietro la scala vecchia: con
 * l'atlante nuovo quel 1/9 schiacciava tutti e otto i negozi dentro nove
 * metri, e ne usciva una fila di fessure.
 */
export function pianoTerra(B, rng, x, y, z, w, h, d) {
  const offCella = Math.floor(rng() * NEGOZI);
  B.store.uvOff = offCella / NEGOZI;
  B.store.box(x, y, z, w, h, d, 0xffffff, SCALA_NEGOZI, 0, null, 1 / h);
  B.store.uvOff = 0;
  sporgenze(B, offCella, x, y - h / 2, z, w, h, d);
}

/**
 * Generatore di edifici: ogni palazzo e' fatto di volumi (basamento, corpo,
 * arretramenti, coronamento) piu' i dettagli che rendono lo skyline
 * credibile — cornicioni, condizionatori, serbatoi, tettoie, balconi.
 * Tutto finisce dentro i GeoBuilder passati in `B`, uno per materiale.
 */

const STUCCO_TINT = [0xffd9a8, 0xf7c9a0, 0xbfe0cf, 0xffc9b4, 0xf2e2b0, 0xc2d8ea, 0xe8b9c4, 0xd8e0a8];
const BRICK_TINT = [0xffffff, 0xe8cfc0, 0xd8bfae, 0xf0d8c8];
const CONCRETE_TINT = [0xe4e2da, 0xd6d8d4, 0xcfd6da, 0xe0d8c8];
const OFFICE_TINT = [0xdce8ef, 0xc8dce8, 0xd2e2e0, 0xe0e6ea];
const ROOF_TINT = [0x8a5a44, 0x9a6b4c, 0x6f6357, 0x7d5442];
const AWNING = [0xc0392b, 0x1f7a4c, 0x2b5fa8, 0xd39a24, 0x7a3fa0, 0x2b8fa8];

const TILE = -12;   // piastrella di facciata da 12 m, adattata per non tagliare i piani

/** Condizionatori, serbatoi, sfiati: il "rumore" che rende vero un tetto. */
function rooftop(B, cx, cy, cz, w, d, rng, big) {
  const det = B.detail;
  const n = big ? randInt(2, 4) : randInt(1, 3);
  for (let i = 0; i < n; i++) {
    const sx = rand(1.2, Math.max(1.4, w * 0.22));
    const sz = rand(1.2, Math.max(1.4, d * 0.22));
    const x = cx + rand(-1, 1) * (w / 2 - sx / 2 - 0.6);
    const z = cz + rand(-1, 1) * (d / 2 - sz / 2 - 0.6);
    const h = rand(0.7, 1.5);
    det.box(x, cy + h / 2, z, sx, h, sz, 0x9aa1a8);
    det.box(x, cy + h + 0.06, z, sx * 0.8, 0.12, sz * 0.8, 0x767c82);
  }
  if (rng() < 0.5) {   // serbatoio dell'acqua su gambe
    const x = cx + rand(-1, 1) * w * 0.25, z = cz + rand(-1, 1) * d * 0.25;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      det.box(x + sx * 0.8, cy + 0.9, z + sz * 0.8, 0.16, 1.8, 0.16, 0x5b5147);
    }
    det.box(x, cy + 2.7, z, 2.4, 1.8, 2.4, 0x7a6552);
    det.box(x, cy + 3.7, z, 2.6, 0.3, 2.6, 0x5b5147);
  }
  if (big && rng() < 0.6) {  // vano scala / locale macchine
    const sx = Math.min(w * 0.34, 6), sz = Math.min(d * 0.34, 6);
    det.box(cx + rand(-1, 1) * w * 0.2, cy + 1.6, cz + rand(-1, 1) * d * 0.2, sx, 3.2, sz, 0xb7bcc2);
  }
  if (rng() < 0.35) {        // antenna con luce di segnalazione
    const x = cx + rand(-1, 1) * w * 0.3, z = cz + rand(-1, 1) * d * 0.3;
    const h = rand(4, 9);
    det.box(x, cy + h / 2, z, 0.22, h, 0.22, 0xb0b6bd);
    B.neon.box(x, cy + h + 0.3, z, 0.5, 0.5, 0.5, 0xff2a2a);
  }
}

/** Parapetto perimetrale (quattro muretti, non un blocco pieno). */
function parapet(B, cx, cy, cz, w, d, h, color) {
  const t = 0.35;
  B.detail.box(cx, cy + h / 2, cz - d / 2 + t / 2, w, h, t, color);
  B.detail.box(cx, cy + h / 2, cz + d / 2 - t / 2, w, h, t, color);
  B.detail.box(cx - w / 2 + t / 2, cy + h / 2, cz, t, h, d - t * 2, color);
  B.detail.box(cx + w / 2 - t / 2, cy + h / 2, cz, t, h, d - t * 2, color);
}

/**
 * Tettoia inclinata sopra la vetrina. Le falde vengono disegnate nei due
 * versi: si vedono sia da sotto (dal marciapiede) sia dall'alto.
 */
function awning(B, x, z, nx, nz, along, y, color) {
  const out = 1.7;
  const half = along / 2;
  const ax = nz, az = -nx;                   // direzione lungo la facciata
  const p = (s, o, dy) => [x + ax * s * half + nx * o, y + dy, z + az * s * half + nz * o];
  const a = p(-1, 0.05, 0.62), b = p(1, 0.05, 0.62), c = p(1, out, -0.15), d = p(-1, out, -0.15);
  B.detail.quad(a, b, c, d, color, along / 2, 1);
  B.detail.quad(d, c, b, a, color, along / 2, 1);
  // bordo frontale
  const e = p(-1, out, -0.42), f = p(1, out, -0.42);
  B.detail.quad(d, c, f, e, 0xffffff, along / 2, 0.3);
  B.detail.quad(e, f, c, d, 0xffffff, along / 2, 0.3);
  // staffe di sostegno
  for (const s of [-0.94, 0.94]) {
    B.detail.box(p(s, out * 0.45, 0.2)[0], y + 0.2, p(s, out * 0.45, 0.2)[2], 0.09, 0.7, 0.09, 0x9aa0a6);
  }
}

/** Ingresso: telaio chiaro, anta con vetro, gradino e pensilina. */
function entrance(B, x, z, nx, nz, w, h, color) {
  const across = (t) => (nx !== 0 ? t : w);
  const along = (t) => (nx !== 0 ? w : t);
  // telaio
  B.detail.box(x + nx * 0.1, h / 2, z + nz * 0.1, across(0.26), h, along(0.26), 0xd8d2c6);
  // anta
  B.detail.box(x + nx * 0.26, h * 0.48, z + nz * 0.26, across(0.1), h * 0.9, along(w * 0.86), 0x4a5763);
  // vetro della porta
  B.detail.box(x + nx * 0.33, h * 0.62, z + nz * 0.33, across(0.06), h * 0.45, along(w * 0.6), 0x18222c);
  // maniglia
  B.detail.box(x + nx * 0.38, h * 0.45, z + nz * 0.38 + (nx !== 0 ? 0 : 0), across(0.05), 0.5, along(0.06), 0xc9ccd2);
  // gradino
  B.detail.box(x + nx * 0.55, 0.07, z + nz * 0.55, across(1.2), 0.14, along(w + 0.7), 0xb9b4a8);
  // pensilina
  B.detail.box(x + nx * 0.75, h + 0.22, z + nz * 0.75, across(1.5), 0.2, along(w + 0.9), color);
}

/* ------------------------------------------------------------- grattacielo */

export function tower(B, lot, ctx) {
  const { rng } = ctx;
  const w = lot.x1 - lot.x0 - 1.4, d = lot.z1 - lot.z0 - 1.4;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const h = rand(26, 34) + Math.min(w, d) * rand(0.9, 2.1);
  const tint = pick(OFFICE_TINT);

  // basamento vetrato
  const baseH = 5.4;
  pianoTerra(B, rng, cx, baseH / 2, cz, w, baseH, d);
  B.detail.box(cx, baseH + 0.28, cz, w + 0.7, 0.56, d + 0.7, 0x8f959c);

  // corpo con arretramenti
  let bw = w, bd = d, y = baseH + 0.56;
  const tiers = h > 46 ? 3 : h > 32 ? 2 : 1;
  for (let t = 0; t < tiers; t++) {
    const th = (h - baseH) * (t === tiers - 1 ? 1 : 0.45) / (t === 0 ? 1 : 1.7);
    B.office.box(cx, y + th / 2, cz, bw, th, bd, tint, TILE);
    B.detail.box(cx, y + th + 0.2, cz, bw + 0.5, 0.4, bd + 0.5, 0x9aa0a6);
    y += th + 0.4;
    bw *= rand(0.72, 0.86); bd *= rand(0.72, 0.86);
  }
  parapet(B, cx, y, cz, bw + 0.4, bd + 0.4, 1.1, 0xa8aeb4);
  B.roof.quadY(cx - bw / 2, cz - bd / 2, cx + bw / 2, cz + bd / 2, y + 0.02, 0xffffff, bw / 6, bd / 6);
  rooftop(B, cx, y, cz, bw, bd, rng, true);
  ctx.collider(cx, cz, w / 2, d / 2);

  // luci di posizione sugli spigoli
  if (rng() < 0.7) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B.neon.box(cx + sx * bw / 2, y + 1.3, cz + sz * bd / 2, 0.35, 0.35, 0.35, 0xff5a3a);
    }
  }
  return { height: h, baseH, cx, cz, w, d };
}

/* ------------------------------------------------- palazzina commerciale */

export function midrise(B, lot, ctx, style) {
  const { rng } = ctx;
  const w = lot.x1 - lot.x0 - 1.2, d = lot.z1 - lot.z0 - 1.2;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const floors = randInt(2, 5);
  const baseH = 4.2;
  const h = baseH + floors * 3.2;
  const tint = style === 'brick' ? pick(BRICK_TINT) : style === 'concrete' ? pick(CONCRETE_TINT) : pick(STUCCO_TINT);

  // piano terra commerciale
  pianoTerra(B, rng, cx, baseH / 2, cz, w, baseH, d);
  // marcapiano
  B.detail.box(cx, baseH + 0.22, cz, w + 0.5, 0.44, d + 0.5, 0xcfc8ba);
  // corpo
  const bodyH = h - baseH - 0.44;
  B[style].box(cx, baseH + 0.44 + bodyH / 2, cz, w, bodyH, d, tint, TILE);
  // cornicione
  B.detail.box(cx, h + 0.3, cz, w + 0.8, 0.6, d + 0.8, 0xd8d2c4);
  parapet(B, cx, h + 0.6, cz, w + 0.6, d + 0.6, 0.9, 0xcdc7ba);
  B.roof.quadY(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h + 0.62, 0xffffff, w / 6, d / 6);
  rooftop(B, cx, h + 0.6, cz, w, d, rng, w * d > 400);
  ctx.collider(cx, cz, w / 2, d / 2);

  // balconi o scala antincendio sul fronte strada
  const f = ctx.face;
  if (f) {
    const along = (f.nx !== 0 ? d : w) * 0.7;
    if (style === 'stucco' && rng() < 0.75) {
      for (let i = 1; i <= floors; i++) {
        const y = baseH + 0.44 + i * 3.2 - 1.2;
        const bx = cx + f.nx * (w / 2 + 0.55), bz = cz + f.nz * (d / 2 + 0.55);
        B.detail.box(bx, y, bz, f.nx !== 0 ? 1.3 : along, 0.16, f.nx !== 0 ? along : 1.3, 0xe8e2d4);
        B.detail.box(bx + f.nx * 0.55, y + 0.5, bz + f.nz * 0.55,
          f.nx !== 0 ? 0.1 : along, 1.0, f.nx !== 0 ? along : 0.1, 0xb6ada0);
      }
    } else if (style === 'brick' && rng() < 0.7) {
      const bx = cx + f.nx * (w / 2 + 0.4), bz = cz + f.nz * (d / 2 + 0.4);
      for (let i = 1; i <= floors; i++) {
        const y = baseH + i * 3.2 - 1.4;
        B.detail.box(bx, y, bz, f.nx !== 0 ? 1.1 : 2.6, 0.1, f.nx !== 0 ? 2.6 : 1.1, 0x3d4249);
        B.detail.box(bx + f.nx * 0.5, y + 0.55, bz + f.nz * 0.5,
          f.nx !== 0 ? 0.08 : 2.6, 1.1, f.nx !== 0 ? 2.6 : 0.08, 0x33383e);
      }
    }
  }
  return { height: h, baseH, cx, cz, w, d };
}

/* ------------------------------------------------------------ villetta */

export function house(B, lot, ctx) {
  const { rng } = ctx;
  const lw = lot.x1 - lot.x0, ld = lot.z1 - lot.z0;
  const w = Math.min(lw - 4, rand(9, 13)), d = Math.min(ld - 4, rand(8, 12));
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const floors = rng() < 0.35 ? 2 : 1;
  const h = floors * 3.1;
  const tint = pick(STUCCO_TINT);
  const roofCol = pick(ROOF_TINT);

  B.stucco.box(cx, h / 2, cz, w, h, d, tint, TILE);
  B.detail.box(cx, h + 0.12, cz, w + 0.5, 0.24, d + 0.5, 0xe4ded0);
  B.detail.gableRoof(cx, h + 0.24, cz, w, d, w > d ? d * 0.28 : w * 0.28, roofCol, w > d ? 'x' : 'z', 0.55);
  // comignolo
  if (rng() < 0.6) B.detail.box(cx + w * 0.28, h + 1.6, cz - d * 0.2, 0.7, 1.9, 0.7, 0xa8907e);

  const f = ctx.face || { nx: 0, nz: 1 };
  const px = cx + f.nx * (w / 2), pz = cz + f.nz * (d / 2);
  // portico con pilastrini
  B.detail.box(px + f.nx * 0.9, 2.5, pz + f.nz * 0.9, f.nx !== 0 ? 2.2 : 4.2, 0.2, f.nx !== 0 ? 4.2 : 2.2, 0xefe8da);
  for (const s of [-1, 1]) {
    B.detail.box(px + f.nx * 1.7 + (f.nx !== 0 ? 0 : s * 1.8), 1.25, pz + f.nz * 1.7 + (f.nx !== 0 ? s * 1.8 : 0),
      0.22, 2.5, 0.22, 0xf2ece0);
  }
  // porta
  B.detail.box(px + f.nx * 0.12, 1.1, pz + f.nz * 0.12, f.nx !== 0 ? 0.14 : 1.0, 2.2, f.nx !== 0 ? 1.0 : 0.14, 0x6b4a34);
  // garage sul lato
  if (rng() < 0.55 && lw > 16) {
    const gx = cx + (f.nz !== 0 ? (rng() < 0.5 ? -1 : 1) * (w / 2 + 2.6) : 0);
    const gz = cz + (f.nx !== 0 ? (rng() < 0.5 ? -1 : 1) * (d / 2 + 2.6) : 0);
    B.stucco.box(gx, 1.4, gz, 5, 2.8, 5.2, tint, TILE);
    B.detail.gableRoof(gx, 2.8, gz, 5, 5.2, 1.1, roofCol, 'x', 0.4);
    B.detail.box(gx + f.nx * 2.5, 1.15, gz + f.nz * 2.5, f.nx !== 0 ? 0.16 : 3.4, 2.3, f.nx !== 0 ? 3.4 : 0.16, 0xd6d1c6);
    ctx.collider(gx, gz, 2.6, 2.7);
  }
  // piscina in giardino
  if (rng() < 0.3) {
    const bx = cx - f.nx * (w / 2 + 3.4), bz = cz - f.nz * (d / 2 + 3.4);
    B.detail.box(bx, 0.1, bz, 5, 0.2, 3.4, 0xdad3c4);
    B.water.box(bx, 0.16, bz, 4.4, 0.16, 2.8, 0x2f8fb8);
  }
  ctx.collider(cx, cz, w / 2, d / 2);
  return { height: h, baseH: 0, cx, cz, w, d };
}

/* ------------------------------------------- negozio isolato / strip mall */

export function strip(B, lot, ctx) {
  const { rng } = ctx;
  const w = lot.x1 - lot.x0 - 2, d = lot.z1 - lot.z0 - 2;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const h = rand(4.4, 5.6);
  pianoTerra(B, rng, cx, h / 2, cz, w, h, d);
  B.detail.box(cx, h + 0.55, cz, w + 0.9, 1.1, d + 0.9, 0xe0dacd);   // fascione insegna
  parapet(B, cx, h + 1.1, cz, w + 0.7, d + 0.7, 0.5, 0xd2ccbf);
  B.roof.quadY(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h + 1.12, 0xffffff, w / 6, d / 6);
  rooftop(B, cx, h + 1.1, cz, w, d, rng, false);
  ctx.collider(cx, cz, w / 2, d / 2);
  return { height: h, baseH: h, cx, cz, w, d };
}

export { awning, entrance };
