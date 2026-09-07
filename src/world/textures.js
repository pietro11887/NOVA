import * as THREE from 'three';
import { mulberry32 } from '../core/utils.js';

/* ------------------------------------------------------------------ utils */

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rumore a valori con interpolazione morbida, base di tutto lo sporco. */
function valueNoise(seed) {
  const rng = mulberry32(seed);
  const G = 256;
  const grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (x, y) => grid[((y & (G - 1)) * G + (x & (G - 1)))];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function fbm(noise, x, y, oct = 4, gain = 0.5, lac = 2) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { v += noise(x * f, y * f) * amp; norm += amp; amp *= gain; f *= lac; }
  return v / norm;
}

/** Sporco/graffi sovrapposti a una texture gia' disegnata. */
function grime(ctx, S, seed, strength = 0.18, scale = 6) {
  const n = valueNoise(seed);
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm(n, (x / S) * scale, (y / S) * scale, 4);
      const k = 1 - (v - 0.5) * strength * 2;
      const i = (y * S + x) * 4;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Colature verticali sotto i davanzali: dettaglio che "invecchia" tutto. */
function streaks(ctx, S, seed, count = 60, alpha = 0.06) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const h = 20 + rng() * (S * 0.5);
    const w = 1 + rng() * 4;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, `rgba(30,26,20,${alpha * 2})`);
    g.addColorStop(1, 'rgba(30,26,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
}

/** Mappa normali derivata dalla luminanza di un canvas (Sobel). */
export function normalFrom(srcCanvas, strength = 2.2) {
  const S = srcCanvas.width;
  const sctx = srcCanvas.getContext('2d');
  const src = sctx.getImageData(0, 0, S, S).data;
  const [c, ctx] = canvas(S);
  const out = ctx.createImageData(S, S);
  const lum = (x, y) => {
    const i = (((y + S) % S) * S + ((x + S) % S)) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return tex(c, { srgb: false });
}

/** Canvas in scala di grigi -> texture lineare (rugosita', metallicita'…). */
function dataTex(c) { return tex(c, { srgb: false }); }

/* --------------------------------------------------------------- facciate */

const WINDOW_GLASS = ['#2b3b48', '#334352', '#243039', '#3b4d5c', '#1e272f'];

function drawWindow(ctx, x, y, w, h, rng, opts = {}) {
  const glass = opts.glass || WINDOW_GLASS[(rng() * WINDOW_GLASS.length) | 0];
  // vetro con riflesso del cielo in alto e interno scuro in basso
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, opts.sky || '#7fa8c4');
  g.addColorStop(0.38, glass);
  g.addColorStop(1, '#0f151b');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // tende / persiane in alcune finestre
  if (rng() < 0.32) {
    ctx.fillStyle = 'rgba(230,226,214,0.75)';
    ctx.fillRect(x, y, w, h * (0.2 + rng() * 0.4));
  }
  // telaio
  ctx.strokeStyle = opts.frame || '#f0ebe0';
  ctx.lineWidth = Math.max(2.5, w * 0.09);
  ctx.strokeRect(x, y, w, h);
  // montante centrale
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
  ctx.lineWidth = Math.max(1, w * 0.035);
  ctx.stroke();
  // davanzale con ombra sotto
  if (opts.sill) {
    ctx.fillStyle = opts.sill;
    ctx.fillRect(x - w * 0.06, y + h, w * 1.12, h * 0.07);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x - w * 0.06, y + h + h * 0.07, w * 1.12, h * 0.05);
  }
}

/**
 * Un set di facciata = colore + emissiva notturna + rugosita'.
 * Ogni stile copre 12 x 12 metri di parete (uvScale 1/12).
 */
export function facadeSet(style) {
  const S = 512;
  const [c, ctx] = canvas(S);
  const [ce, ectx] = canvas(S);
  const [cr, rctx] = canvas(S);
  const rng = mulberry32(style.length * 977 + 13);
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#b4b4b4'; rctx.fillRect(0, 0, S, S);

  const litWindow = (x, y, w, h) => {
    if (rng() > 0.45) return;
    const warm = rng() < 0.78;
    ectx.fillStyle = warm ? '#ffca7a' : '#cfe6ff';
    ectx.globalAlpha = 0.45 + rng() * 0.55;
    ectx.fillRect(x, y, w, h);
    ectx.globalAlpha = 1;
  };

  if (style === 'office') {
    // curtain wall: fasce di solaio + vetro continuo
    ctx.fillStyle = '#79858e'; ctx.fillRect(0, 0, S, S);
    const floors = 4, cols = 6;
    const fh = S / floors, cw = S / cols;
    for (let f = 0; f < floors; f++) {
      // fascia di solaio in alluminio
      ctx.fillStyle = '#98a2a9'; ctx.fillRect(0, f * fh, S, fh * 0.16);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, f * fh, S, 2);
      for (let k = 0; k < cols; k++) {
        const x = k * cw + 3, y = f * fh + fh * 0.18, w = cw - 6, h = fh * 0.74;
        const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
        const tint = rng() < 0.25 ? '#3f6270' : '#2b4655';
        g.addColorStop(0, '#8fb6c9'); g.addColorStop(0.5, tint); g.addColorStop(1, '#141d26');
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#8f9aa2'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
        rctx.fillStyle = '#2a2a2a'; rctx.fillRect(x, y, w, h);     // vetro liscio
        litWindow(x, y, w, h);
      }
    }
    streaks(ctx, S, 7, 40, 0.04);
    grime(ctx, S, 11, 0.10, 4);
  } else if (style === 'stucco') {
    ctx.fillStyle = '#e6d9c0'; ctx.fillRect(0, 0, S, S);
    grime(ctx, S, 21, 0.16, 5);
    const floors = 4, cols = 4;
    const fh = S / floors, cw = S / cols;
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < cols; k++) {
        const w = cw * 0.44, h = fh * 0.46;
        const x = k * cw + (cw - w) / 2, y = f * fh + fh * 0.22;
        drawWindow(ctx, x, y, w, h, rng, { sill: '#d8cdb6', frame: '#f2ece0' });
        litWindow(x, y, w, h);
      }
      // marcapiano
      ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, (f + 1) * fh - 5, S, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, (f + 1) * fh - 9, S, 4);
    }
    streaks(ctx, S, 5, 70, 0.05);
    rctx.fillStyle = '#c8c8c8'; rctx.fillRect(0, 0, S, S);
  } else if (style === 'brick') {
    ctx.fillStyle = '#8d4a35'; ctx.fillRect(0, 0, S, S);
    // corsi di mattoni
    const bh = 11, bw = 26;
    for (let y = 0, row = 0; y < S; y += bh, row++) {
      for (let x = (row % 2) * -bw / 2; x < S; x += bw) {
        const v = 0.82 + rng() * 0.36;
        ctx.fillStyle = `rgb(${Math.min(255, 150 * v)},${Math.min(255, 78 * v)},${Math.min(255, 58 * v)})`;
        ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }
    const floors = 3, cols = 3;
    const fh = S / floors, cw = S / cols;
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < cols; k++) {
        const w = cw * 0.42, h = fh * 0.5;
        const x = k * cw + (cw - w) / 2, y = f * fh + fh * 0.2;
        // architrave in pietra
        ctx.fillStyle = '#c9bfae';
        ctx.fillRect(x - 6, y - 10, w + 12, 10);
        drawWindow(ctx, x, y, w, h, rng, { sill: '#c9bfae', frame: '#3a3128' });
        litWindow(x, y, w, h);
      }
    }
    streaks(ctx, S, 9, 50, 0.06);
    grime(ctx, S, 33, 0.16, 3);
    rctx.fillStyle = '#d2d2d2'; rctx.fillRect(0, 0, S, S);
  } else { // 'concrete'
    ctx.fillStyle = '#b9b4a8'; ctx.fillRect(0, 0, S, S);
    grime(ctx, S, 41, 0.2, 7);
    // pannelli prefabbricati
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * S / 4); ctx.lineTo(S, i * S / 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * S / 4, 0); ctx.lineTo(i * S / 4, S); ctx.stroke();
    }
    const fh = S / 4, cw = S / 4;
    for (let f = 0; f < 4; f++) {
      for (let k = 0; k < 4; k++) {
        const w = cw * 0.5, h = fh * 0.34;
        const x = k * cw + (cw - w) / 2, y = f * fh + fh * 0.3;
        drawWindow(ctx, x, y, w, h, rng, { frame: '#8f8b82' });
        litWindow(x, y, w, h);
      }
    }
    streaks(ctx, S, 13, 80, 0.07);
    rctx.fillStyle = '#dcdcdc'; rctx.fillRect(0, 0, S, S);
  }

  return {
    map: tex(c),
    emissive: tex(ce),
    roughness: dataTex(cr),
    normal: normalFrom(c, style === 'brick' ? 1.6 : 1.0),
  };
}

/** Piano terra commerciale: vetrine, porta, insegna, zoccolo. */
export function storefrontTexture() {
  const S = 512;
  const [c, ctx] = canvas(S);
  const [ce, ectx] = canvas(S);
  const rng = mulberry32(5150);
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, S, S);

  // muro
  ctx.fillStyle = '#d9d2c4'; ctx.fillRect(0, 0, S, S);
  // fascia insegna in alto
  ctx.fillStyle = '#3a4450'; ctx.fillRect(0, 0, S, S * 0.16);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, S * 0.16 - 4, S, 4);
  // vetrine
  const bays = 4, bw = S / bays;
  for (let i = 0; i < bays; i++) {
    const x = i * bw + 10, y = S * 0.22, w = bw - 20, h = S * 0.56;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#7f96a6'); g.addColorStop(0.35, '#2b3742'); g.addColorStop(1, '#161d24');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // riflesso diagonale
    ctx.save();
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.75); ctx.lineTo(x + w * 0.55, y); ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h * 0.2); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
    ctx.restore();
    // merce/manichini appena accennati
    ctx.fillStyle = 'rgba(220,200,160,0.35)';
    for (let k = 0; k < 3; k++) ctx.fillRect(x + 14 + k * (w / 3.4), y + h * 0.55, w / 6, h * 0.3);
    ctx.strokeStyle = '#9aa2aa'; ctx.lineWidth = 6; ctx.strokeRect(x, y, w, h);
    // luce interna di notte
    ectx.fillStyle = '#ffe6b0'; ectx.globalAlpha = 0.5; ectx.fillRect(x, y, w, h); ectx.globalAlpha = 1;
  }
  // zoccolo in piastrelle
  ctx.fillStyle = '#6d6257'; ctx.fillRect(0, S * 0.84, S, S * 0.16);
  for (let x = 0; x < S; x += 32) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, S * 0.84, 2, S * 0.16);
  }
  streaks(ctx, S, 17, 30, 0.05);
  grime(ctx, S, 19, 0.12, 5);
  return { map: tex(c), emissive: tex(ce), normal: normalFrom(c, 1.0) };
}

/* ----------------------------------------------------------------- strade */

export function asphaltSet() {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = valueNoise(77);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const grain = fbm(n, (x / S) * 90, (y / S) * 90, 3);
      const patch = fbm(n, (x / S) * 4 + 30, (y / S) * 4, 3);
      let v = 46 + grain * 34 + (patch - 0.5) * 20;
      const i = (y * S + x) * 4;
      img.data[i] = v * 0.96; img.data[i + 1] = v * 0.98; img.data[i + 2] = v * 1.08; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // crepe e rappezzi
  const rng = mulberry32(88);
  ctx.strokeStyle = 'rgba(20,20,22,0.55)';
  for (let i = 0; i < 14; i++) {
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath();
    let x = rng() * S, y = rng() * S;
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (rng() - 0.5) * 80; y += (rng() - 0.5) * 80; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(30,30,34,${0.25 + rng() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(rng() * S, rng() * S, 20 + rng() * 60, 14 + rng() * 40, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const [cr, rctx] = canvas(S);
  rctx.drawImage(c, 0, 0);
  rctx.fillStyle = 'rgba(255,255,255,0.45)'; rctx.fillRect(0, 0, S, S);   // asfalto ruvido
  return { map: tex(c), normal: normalFrom(c, 0.9), roughness: dataTex(cr) };
}

export function sidewalkSet() {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = valueNoise(101);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const g = fbm(n, (x / S) * 60, (y / S) * 60, 3);
      const stain = fbm(n, (x / S) * 3, (y / S) * 3 + 12, 4);
      // cemento chiaro da marciapiede californiano, non grigio scuro
      const v = 186 + g * 26 - (1 - stain) * 22;
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 0.995; img.data[i + 2] = v * 0.955; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // inerte: la ghiaietta fine che si vede da vicino nel cemento
  const agg = mulberry32(707);
  for (let i = 0; i < 5200; i++) {
    const a = 0.05 + agg() * 0.09;
    ctx.fillStyle = agg() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(90,86,80,${a})`;
    ctx.fillRect(agg() * S, agg() * S, 1 + agg() * 1.6, 1 + agg() * 1.6);
  }
  // giunti tra le lastre: solco scuro con lo spigolo chiaro accanto
  for (const p of [0, 0.5, 1]) {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(p * S, 0); ctx.lineTo(p * S, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p * S); ctx.lineTo(S, p * S); ctx.stroke();
    ctx.strokeStyle = 'rgba(52,50,46,0.62)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p * S, 0); ctx.lineTo(p * S, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p * S); ctx.lineTo(S, p * S); ctx.stroke();
  }
  const rng = mulberry32(303);
  ctx.strokeStyle = 'rgba(70,68,64,0.4)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    let x = rng() * S, y = rng() * S;
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 60; y += (rng() - 0.5) * 60; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return { map: tex(c), normal: normalFrom(c, 1.15) };
}

/* ------------------------------------------------------------ vegetazione */

export function grassTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = valueNoise(55);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm(n, (x / S) * 22, (y / S) * 22, 4);
      const dry = fbm(n, (x / S) * 3, (y / S) * 3 + 9, 3);
      const i = (y * S + x) * 4;
      img.data[i] = 62 + v * 34 + dry * 34;
      img.data[i + 1] = 118 + v * 58 + dry * 30;
      img.data[i + 2] = 42 + v * 22 + dry * 14;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rng = mulberry32(66);
  for (let i = 0; i < 2200; i++) {
    ctx.strokeStyle = `rgba(${58 + rng() * 40},${132 + rng() * 55},${40 + rng() * 24},0.45)`;
    ctx.lineWidth = 1;
    const x = rng() * S, y = rng() * S;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 4, y - 3 - rng() * 4); ctx.stroke();
  }
  return tex(c);
}

/** Guaina e ghiaia dei tetti piani. */
export function roofTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = valueNoise(313);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const g = fbm(n, (x / S) * 55, (y / S) * 55, 3);
      const patch = fbm(n, (x / S) * 5 + 2, (y / S) * 5, 3);
      const v = 74 + g * 46 + (patch - 0.5) * 30;
      const i = (y * S + x) * 4;
      img.data[i] = v * 1.02; img.data[i + 1] = v; img.data[i + 2] = v * 0.94; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // teli sovrapposti
  ctx.strokeStyle = 'rgba(40,40,42,0.5)'; ctx.lineWidth = 3;
  for (let y = 0; y < S; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
  const rng = mulberry32(314);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(120,118,112,${0.1 + rng() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(rng() * S, rng() * S, 20 + rng() * 50, 15 + rng() * 40, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return { map: tex(c), normal: normalFrom(c, 0.7) };
}

export function sandTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = valueNoise(91);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const ripple = Math.sin((x / S) * 40 + fbm(n, (x / S) * 5, (y / S) * 5, 3) * 8) * 0.5 + 0.5;
      const v = 198 + ripple * 20 + fbm(n, (x / S) * 70, (y / S) * 70, 3) * 26;
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 0.93; img.data[i + 2] = v * 0.76; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c), normal: normalFrom(c, 0.6) };
}

/** Foglia di palma con canale alpha: e' il dettaglio che dice "California". */
export function palmFrondTexture() {
  const W = 256, H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const rng = mulberry32(404);
  // rachide
  ctx.strokeStyle = '#6f7f3a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(4, H / 2); ctx.quadraticCurveTo(W * 0.6, H / 2 - 8, W - 6, H / 2 + 6); ctx.stroke();
  // foglioline
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const x = 8 + t * (W - 20);
    const y = H / 2 - 8 * Math.sin(t * Math.PI) + 6 * t;
    const len = (26 + rng() * 16) * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.85);
    for (const s of [-1, 1]) {
      ctx.strokeStyle = `rgb(${58 + rng() * 30},${100 + rng() * 46},${38 + rng() * 22})`;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 10, y + s * len * 0.5, x + 4 + rng() * 8, y + s * len);
      ctx.stroke();
    }
  }
  return tex(c, { repeat: false });
}

export function palmBarkTexture() {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#8d7a5c'; ctx.fillRect(0, 0, S, S);
  const rng = mulberry32(505);
  for (let y = 0; y < S; y += 11) {
    ctx.fillStyle = `rgba(${74 + rng() * 26},${62 + rng() * 20},${44 + rng() * 16},0.32)`;
    ctx.fillRect(0, y + rng() * 2, S, 3);
    ctx.fillStyle = 'rgba(255,240,210,0.08)';
    ctx.fillRect(0, y + 4, S, 2);
    // fibre verticali
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(${60 + rng() * 40},${50 + rng() * 30},${36 + rng() * 20},0.25)`;
      ctx.fillRect(rng() * S, y, 2 + rng() * 4, 9);
    }
  }
  grime(ctx, S, 12, 0.2, 8);
  return { map: tex(c), normal: normalFrom(c, 1.4) };
}

/* --------------------------------------------------------------- varie ---*/

export function waterNormal() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = valueNoise(707);
  const [h, hctx] = canvas(S);
  const img = hctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm(n, (x / S) * 8, (y / S) * 8, 4) * 0.6 + fbm(n, (x / S) * 26 + 5, (y / S) * 26, 2) * 0.4;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
    }
  }
  hctx.putImageData(img, 0, 0);
  ctx.drawImage(h, 0, 0);
  return normalFrom(c, 2.6);
}

/* ------------------------------------------------------------- interni --*/

/** Pavimenti degli interni: piastrelle, scacchi, parquet, cemento. */
export function interiorTextures() {
  const S = 256;

  // --- piastrelle chiare (4 x 4 per piastrella di texture = 50 cm l'una)
  const [ct, tctx] = canvas(S);
  const n1 = valueNoise(611);
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const v = 226 + fbm(n1, tx * 3.1, ty * 3.1, 2) * 22;
      tctx.fillStyle = `rgb(${v},${v * 0.995},${v * 0.97})`;
      tctx.fillRect(tx * S / 4, ty * S / 4, S / 4, S / 4);
    }
  }
  tctx.strokeStyle = 'rgba(120,116,110,0.55)'; tctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    tctx.beginPath(); tctx.moveTo(i * S / 4, 0); tctx.lineTo(i * S / 4, S); tctx.stroke();
    tctx.beginPath(); tctx.moveTo(0, i * S / 4); tctx.lineTo(S, i * S / 4); tctx.stroke();
  }
  grime(tctx, S, 612, 0.08, 4);

  // --- scacchiera da tavola calda
  const [cc, cctx] = canvas(S);
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      cctx.fillStyle = (tx + ty) % 2 ? '#20242b' : '#e8e4da';
      cctx.fillRect(tx * S / 4, ty * S / 4, S / 4, S / 4);
    }
  }
  cctx.strokeStyle = 'rgba(140,136,130,0.5)'; cctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    cctx.beginPath(); cctx.moveTo(i * S / 4, 0); cctx.lineTo(i * S / 4, S); cctx.stroke();
    cctx.beginPath(); cctx.moveTo(0, i * S / 4); cctx.lineTo(S, i * S / 4); cctx.stroke();
  }
  grime(cctx, S, 613, 0.1, 5);

  // --- parquet
  const [cw, wctx] = canvas(S);
  const rng = mulberry32(614);
  const plank = S / 8;
  for (let i = 0; i < 8; i++) {
    const base = 118 + rng() * 46;
    wctx.fillStyle = `rgb(${base},${base * 0.66},${base * 0.42})`;
    wctx.fillRect(0, i * plank, S, plank);
    // venature
    for (let k = 0; k < 26; k++) {
      wctx.strokeStyle = `rgba(${base * 0.6},${base * 0.4},${base * 0.26},${0.2 + rng() * 0.3})`;
      wctx.lineWidth = 1 + rng();
      wctx.beginPath();
      const y = i * plank + rng() * plank;
      wctx.moveTo(0, y);
      wctx.bezierCurveTo(S / 3, y + (rng() - 0.5) * 6, (2 * S) / 3, y + (rng() - 0.5) * 6, S, y + (rng() - 0.5) * 4);
      wctx.stroke();
    }
    // fughe tra le doghe
    wctx.fillStyle = 'rgba(40,26,16,0.5)';
    wctx.fillRect(0, i * plank, S, 2);
    const cut = ((i % 3) + 1) * (S / 4);
    wctx.fillRect(cut, i * plank, 2, plank);
  }

  // --- cemento industriale
  const [cn, nctx] = canvas(S);
  const n2 = valueNoise(615);
  const img = nctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const g = fbm(n2, (x / S) * 40, (y / S) * 40, 3);
      const patch = fbm(n2, (x / S) * 4, (y / S) * 4 + 3, 3);
      const v = 128 + g * 40 + (patch - 0.5) * 44;
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 0.99; img.data[i + 2] = v * 0.96; img.data[i + 3] = 255;
    }
  }
  nctx.putImageData(img, 0, 0);
  nctx.strokeStyle = 'rgba(80,78,74,0.28)'; nctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    nctx.beginPath();
    let x = Math.random() * S, y = Math.random() * S;
    nctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; nctx.lineTo(x, y); }
    nctx.stroke();
  }

  // --- intonaco delle pareti
  const [cp, pctx] = canvas(S);
  const n3 = valueNoise(616);
  const pimg = pctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const g = fbm(n3, (x / S) * 26, (y / S) * 26, 4);
      const v = 228 + g * 26;
      const i = (y * S + x) * 4;
      pimg.data[i] = v; pimg.data[i + 1] = v; pimg.data[i + 2] = v; pimg.data[i + 3] = 255;
    }
  }
  pctx.putImageData(pimg, 0, 0);

  // --- moquette del casino': rombi rossi e oro
  const [cq, qctx] = canvas(S);
  qctx.fillStyle = '#5c1220'; qctx.fillRect(0, 0, S, S);
  const qn = valueNoise(617);
  for (let y = 0; y < S; y += 32) {
    for (let x = 0; x < S; x += 32) {
      qctx.fillStyle = ((x + y) / 32) % 2 ? '#6b1626' : '#4a0e1a';
      qctx.fillRect(x, y, 32, 32);
    }
  }
  qctx.strokeStyle = 'rgba(214,175,90,0.5)';
  qctx.lineWidth = 2;
  for (let i = -S; i < S * 2; i += 32) {
    qctx.beginPath(); qctx.moveTo(i, 0); qctx.lineTo(i + S, S); qctx.stroke();
    qctx.beginPath(); qctx.moveTo(i, S); qctx.lineTo(i + S, 0); qctx.stroke();
  }
  {
    const img2 = qctx.getImageData(0, 0, S, S);
    for (let i = 0; i < img2.data.length; i += 4) {
      const n = fbm(qn, (i / 4 % S) / S * 40, Math.floor(i / 4 / S) / S * 40, 3);
      const k = 0.82 + n * 0.36;
      img2.data[i] *= k; img2.data[i + 1] *= k; img2.data[i + 2] *= k;
    }
    qctx.putImageData(img2, 0, 0);
  }

  return {
    carpet: { map: tex(cq), normal: normalFrom(cq, 0.3) },
    plaster: { map: tex(cp), normal: normalFrom(cp, 0.35) },
    tile: { map: tex(ct), normal: normalFrom(ct, 0.6) },
    checker: { map: tex(cc), normal: normalFrom(cc, 0.25) },
    wood: { map: tex(cw), normal: normalFrom(cw, 0.5) },
    concrete: { map: tex(cn), normal: normalFrom(cn, 0.7) },
  };
}

/** Insegna del negozio: pannello, bordo e testo al neon. */
export function signTexture(text, color = '#ffd23f') {
  const W = 512, H = 160;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#12151c'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.globalAlpha = 0.5;
  ctx.strokeRect(9, 9, W - 18, H - 18);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 26;
  const words = text.split(' ');
  const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [text];
  ctx.font = `900 ${lines.length > 1 ? 46 : 62}px "Segoe UI", Impact, Arial, sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * 54, W - 40));
  return tex(c, { repeat: false });
}

/** Cartelli stradali e targhe generiche. */
export function plateTexture(lines, bg = '#1f2a35', fg = '#e9eef7') {
  const W = 256, H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = fg; ctx.lineWidth = 4; ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => {
    ctx.font = `bold ${i ? 26 : 34}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * 38, W - 24);
  });
  return tex(c, { repeat: false });
}

/** Ciuffo d'erba: fili verticali con alpha, per i piani incrociati istanziati. */
export function grassTuftTexture() {
  const W = 64, H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < 22; i++) {
    const x = 4 + Math.random() * (W - 8);
    const h = H * (0.45 + Math.random() * 0.55);
    const lean = (Math.random() - 0.5) * 16;
    const w = 1.2 + Math.random() * 1.8;
    const g = 118 + Math.random() * 52;
    ctx.strokeStyle = `rgb(${(g * 0.56) | 0},${g | 0},${(g * 0.42) | 0})`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.quadraticCurveTo(x + lean * 0.4, H - h * 0.55, x + lean, H - h);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
