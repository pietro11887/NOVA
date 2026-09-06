import * as THREE from 'three';
import { mulberry32 } from '../core/utils.js';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function tex(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, size, amount, alpha) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
    if (alpha !== undefined) d[i + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Facciata generica: 4x4 finestre per piastrella (12 metri di lato nel
 * mondo). Il colore dell'edificio arriva dai vertex color, cosi' una sola
 * texture serve tutta la citta'.
 */
export function facadeTextures() {
  const S = 256, W = 4, cell = S / W;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  // fascia orizzontale tra i piani
  ctx.fillStyle = '#d8d8d8';
  for (let r = 0; r < W; r++) ctx.fillRect(0, r * cell, S, 4);

  const [cn, nctx] = makeCanvas(S);
  nctx.fillStyle = '#000000';
  nctx.fillRect(0, 0, S, S);

  const rng = mulberry32(20250906);
  for (let r = 0; r < W; r++) {
    for (let k = 0; k < W; k++) {
      const x = k * cell + cell * 0.18, y = r * cell + cell * 0.22;
      const w = cell * 0.64, h = cell * 0.52;
      // vetro di giorno
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#4a596b'); g.addColorStop(0.55, '#7d93a8'); g.addColorStop(1, '#39465a');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#2c3542'; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      // finestra accesa di notte
      if (rng() < 0.42) {
        const warm = rng() < 0.75;
        nctx.fillStyle = warm ? '#ffd9a0' : '#bfe4ff';
        nctx.globalAlpha = 0.55 + rng() * 0.45;
        nctx.fillRect(x, y, w, h);
        nctx.globalAlpha = 1;
      }
    }
  }
  noise(ctx, S, 16);
  return { day: tex(c), night: tex(cn) };
}

/** Asfalto con linea tratteggiata centrale e strisce laterali. */
export function roadTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, S, S);
  noise(ctx, S, 26);
  // bordi corsia (v = attraverso la strada)
  ctx.fillStyle = '#c9c9c2';
  ctx.fillRect(0, 6, S, 3);
  ctx.fillRect(0, S - 9, S, 3);
  // tratteggio centrale lungo u
  ctx.fillStyle = '#e8e2c0';
  for (let x = 0; x < S; x += 64) ctx.fillRect(x, S / 2 - 2, 38, 4);
  return tex(c);
}

/** Marciapiede a lastre. */
export function pavementTexture() {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#d2d2d2'; ctx.lineWidth = 3;
  for (let i = 0; i <= S; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }
  noise(ctx, S, 12);
  return tex(c);
}

/** Prato / terreno dei parchi. */
export function grassTexture() {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 3, 2);
  }
  return tex(c);
}

/** Insegna al neon per i negozi: testo su fondo scuro. */
export function signTexture(text, color = '#ffd23f') {
  const [c, ctx] = makeCanvas(256);
  ctx.fillStyle = '#0d0f16'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = color;
  ctx.font = 'bold 42px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 22;
  const words = text.split(' ');
  const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : words;
  lines.forEach((l, i) => ctx.fillText(l, 128, 128 + (i - (lines.length - 1) / 2) * 50, 236));
  return tex(c, false);
}

/** Cielo a gradiente, aggiornato dal ciclo giorno/notte. */
export function skyTexture() {
  const [c, ctx] = makeCanvas(64);
  return { canvas: c, ctx, texture: tex(c, false) };
}
