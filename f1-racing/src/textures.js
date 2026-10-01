import * as THREE from 'three';

// Texture procedurali generate su canvas (nessun file esterno).

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function asphalt() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#5d6169'; g.fillRect(0, 0, 512, 512);
  const r = rand(7);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 14 + (r() < 0.01 ? 14 : 0);
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n + 1;
  }
  g.putImageData(img, 0, 0);
  // traiettoria gommata al centro
  const grd = g.createLinearGradient(0, 0, 512, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.35, 'rgba(20,20,22,0.18)');
  grd.addColorStop(0.5, 'rgba(20,20,22,0.25)');
  grd.addColorStop(0.65, 'rgba(20,20,22,0.18)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  const t = finish(c);
  return t;
}

export function kerb() {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#d8231f'; g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#f5f5f5'; g.fillRect(0, 128, 64, 128);
  // bordo interno leggermente più scuro
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 6, 256);
  // leggere nervature
  for (let y = 0; y < 256; y += 16) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, y, 64, 3); }
  return finish(c);
}

export function grass() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#4f9a3a'; g.fillRect(0, 0, 256, 256);
  const r = rand(3);
  for (let k = 0; k < 5000; k++) {
    const v = r();
    g.fillStyle = v < 0.5 ? 'rgba(40,110,40,0.35)' : 'rgba(110,170,70,0.3)';
    g.fillRect(r() * 256, r() * 256, 2, 2 + r() * 3);
  }
  // strisce tagliaerba
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, 256, 128);
  return finish(c);
}

export function gravel() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#cdb68a'; g.fillRect(0, 0, 256, 256);
  const r = rand(11);
  for (let k = 0; k < 9000; k++) {
    const v = 150 + r() * 80;
    g.fillStyle = `rgb(${v},${v * 0.9},${v * 0.72})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  return finish(c);
}

export function barrier() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#eef0f3'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#2257b8'; g.fillRect(0, 40, 256, 10);
  g.fillStyle = '#c7ccd3'; g.fillRect(0, 60, 256, 4);
  g.fillStyle = '#9aa1ab'; for (let x = 0; x < 256; x += 128) g.fillRect(x, 0, 2, 64);
  return finish(c);
}

export function tyreWall() {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, 128, 64);
  const cols = ['#d8231f', '#f2f2f2'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = cols[i % 2]; g.fillRect(i * 32, 8, 32, 48);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 8; y < 56; y += 12) g.fillRect(i * 32, y, 32, 2);
  }
  return finish(c);
}

export function fence() {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(190,200,215,0.85)'; g.lineWidth = 2;
  for (let k = -128; k < 256; k += 16) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke();
  }
  g.fillStyle = '#8d96a3'; g.fillRect(0, 0, 6, 128); g.fillRect(0, 0, 128, 4); g.fillRect(0, 124, 128, 4);
  return finish(c);
}

export function checker() {
  const [c, g] = canvas(64, 256);
  const sq = 16;
  for (let y = 0; y < 256; y += sq) for (let x = 0; x < 64; x += sq) {
    g.fillStyle = ((x + y) / sq) % 2 ? '#111' : '#f6f6f6'; g.fillRect(x, y, sq, sq);
  }
  return finish(c, false);
}

export function text(str, color, w, h, font, bg = null) {
  const [c, g] = canvas(w, h);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(str, w / 2, h / 2 + 2);
  return finish(c, false);
}

// Pubblico sugli spalti: tanti "pixel" colorati come nello stile low-poly
export function crowd() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#6b6e75'; g.fillRect(0, 0, 512, 256);
  const r = rand(21);
  const shirts = ['#e8463a', '#f08a2a', '#f6d24a', '#2f6fd6', '#ffffff', '#1f1f1f', '#d94b8c', '#3aa35a', '#ff7b1c', '#c9a37a'];
  const skins = ['#f1c9a5', '#d9a47a', '#a8744f', '#6e4a33'];
  for (let row = 0; row < 16; row++) {
    const y = row * 16;
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y + 14, 512, 2);
    for (let x = 0; x < 512; x += 5) {
      if (r() < 0.08) continue;
      const cx = x + r() * 2;
      g.fillStyle = shirts[Math.floor(r() * shirts.length)];
      g.fillRect(cx, y + 7, 4, 7);
      g.fillStyle = skins[Math.floor(r() * skins.length)];
      g.fillRect(cx + 0.5, y + 3, 3, 4);
      if (r() < 0.07) { g.fillStyle = shirts[Math.floor(r() * 4)]; g.fillRect(cx - 1, y, 6, 3); } // bandiere / cappelli
    }
  }
  const t = finish(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function pitBuilding() {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 64) {
    g.fillStyle = '#b3272d'; g.fillRect(x + 8, 34, 48, 80);
    g.fillStyle = '#801a1f'; g.fillRect(x + 8, 34, 48, 8);
    g.fillStyle = '#f4f4f2'; g.beginPath(); g.arc(x + 32, 34, 24, Math.PI, 0); g.fill();
  }
  g.fillStyle = '#d7d7d4'; g.fillRect(0, 0, 512, 14);
  return finish(c);
}

export function sponsor(textStr, fg, bg) {
  const [c, g] = canvas(512, 128);
  const grd = g.createLinearGradient(0, 0, 512, 0);
  grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]);
  g.fillStyle = grd; g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg; g.font = 'italic 900 78px "Titillium Web", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(textStr, 256, 68);
  return finish(c, false);
}

export function carbon() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#141416'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
    g.fillStyle = ((x + y) / 8) % 2 ? '#1d1e22' : '#101113'; g.fillRect(x, y, 8, 8);
  }
  return finish(c);
}

// Partner della F1 presenti al GP di Baku 2026: nome scritto con i colori del marchio
// (non i loghi ufficiali)
export const BRANDS = {
  qatar: { name: 'QATAR AIRWAYS', bg: '#5c0632', fg: '#ffffff', font: '600 {s}px Arial, sans-serif', track: 0.08 },
  lv: { name: 'LOUIS VUITTON', bg: '#3a271b', fg: '#e3cfa8', font: '600 {s}px Georgia, "Times New Roman", serif', track: 0.18 },
  tag: { name: 'TAG HEUER', bg: '#0b0b0b', fg: '#ffffff', font: '700 {s}px Arial, sans-serif', track: 0.06, shield: true },
  moet: { name: 'MOËT & CHANDON', bg: '#111111', fg: '#d8b46a', font: '600 {s}px Georgia, serif', track: 0.08 },
  lenovo: { name: 'Lenovo', bg: '#e2231a', fg: '#ffffff', font: '700 {s}px "Titillium Web", Arial, sans-serif' },
  aramco: { name: 'aramco', bg: '#ffffff', fg: '#00a3e0', font: '700 {s}px "Titillium Web", Arial, sans-serif', bar: '#84bd00' },
  heineken: { name: 'Heineken 0.0', bg: '#0c6b33', fg: '#ffffff', font: '700 {s}px "Titillium Web", Arial, sans-serif', star: '#d6202a' },
  dhl: { name: 'DHL', bg: '#ffcc00', fg: '#d40511', font: 'italic 900 {s}px Arial Black, Arial, sans-serif', stripes: '#d40511' },
  aws: { name: 'aws', bg: '#232f3e', fg: '#ffffff', font: '700 {s}px Arial, sans-serif', smile: '#ff9900' },
  pirelli: { name: 'PIRELLI', bg: '#111111', fg: '#fed100', font: 'italic 900 {s}px Arial Black, Arial, sans-serif' },
  crypto: { name: 'crypto.com', bg: '#03316c', fg: '#ffffff', font: '600 {s}px Arial, sans-serif' },
  msc: { name: 'MSC CRUISES', bg: '#0b1f4d', fg: '#ffffff', font: '600 {s}px Georgia, serif', track: 0.1 },
  salesforce: { name: 'salesforce', bg: '#00a1e0', fg: '#ffffff', font: '700 {s}px Arial, sans-serif' },
  amex: { name: 'AMERICAN EXPRESS', bg: '#006fcf', fg: '#ffffff', font: '800 {s}px Arial, sans-serif', track: 0.04 },
};

// disegna il pannello di un marchio nel rettangolo (x, y, w, h)
export function drawBrand(g, b, x, y, w, h) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = b.bg; g.fillRect(x, y, w, h);
  if (b.stripes) { g.fillStyle = b.stripes; for (let k = 0; k < 3; k++) g.fillRect(x + w * 0.06, y + h * (0.3 + k * 0.15), w * 0.14, h * 0.07); }
  let s = h * 0.62;
  const font = () => b.font.replace('{s}', Math.round(s));
  g.font = font();
  const spacing = (b.track || 0) * s;
  const width = () => g.measureText(b.name).width + spacing * (b.name.length - 1);
  while (width() > w * 0.84 && s > 8) { s *= 0.92; g.font = font(); }
  const tw = width();
  let cx = x + (w - tw) / 2;
  if (b.shield || b.star) cx += h * 0.2;
  const cy = y + h * 0.54;
  g.fillStyle = b.fg; g.textBaseline = 'middle';
  if (spacing) { for (const ch of b.name) { g.fillText(ch, cx, cy); cx += g.measureText(ch).width + spacing; } }
  else g.fillText(b.name, cx, cy);
  if (b.bar) { g.fillStyle = b.bar; g.fillRect(x + (w - tw) / 2, y + h * 0.82, tw * 0.35, h * 0.06); }
  if (b.smile) {
    g.strokeStyle = b.smile; g.lineWidth = h * 0.06; g.lineCap = 'round';
    const sx = x + (w - tw) / 2;
    g.beginPath(); g.moveTo(sx + tw * 0.05, y + h * 0.8); g.quadraticCurveTo(sx + tw * 0.5, y + h * 0.95, sx + tw * 0.95, y + h * 0.78); g.stroke();
  }
  if (b.star) {
    const sx = x + (w - tw) / 2 - h * 0.35, sy = y + h * 0.52, r = h * 0.2;
    g.fillStyle = b.star; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    g.fill();
  }
  if (b.shield) {
    const sx = x + (w - tw) / 2 - h * 0.45, sy = y + h * 0.2, sw = h * 0.36, sh = h * 0.6;
    g.fillStyle = '#00843d'; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + sw, sy); g.lineTo(sx + sw, sy + sh * 0.7); g.lineTo(sx + sw / 2, sy + sh); g.lineTo(sx, sy + sh * 0.7); g.fill();
    g.fillStyle = '#d6202a'; g.fillRect(sx, sy + sh * 0.42, sw, sh * 0.14);
  }
  g.restore();
}

// rivestimento dei muri per un marchio: pannello da ripetere ogni 6 m, il nome nella parte
// che sporge dall'asfalto (il muro va da -1,5 a +1,05 m: la parte visibile è il 41% in alto)
const wallCache = {};
export function sponsorWall(key) {
  if (wallCache[key]) return wallCache[key];
  const b = BRANDS[key], P = 340, H = 128;
  const [c, g] = canvas(P, H);
  g.fillStyle = b.bg; g.fillRect(0, 0, P, H);
  drawBrand(g, b, 4, 2, P - 8, H * 0.39);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 0, P, 2);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, 2, H);
  return (wallCache[key] = finish(c));
}

// cartellone singolo
export function brandBoard(b) {
  const [c, g] = canvas(512, 128);
  drawBrand(g, b, 0, 0, 512, 128);
  return finish(c, false);
}
