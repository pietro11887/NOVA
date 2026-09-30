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
  g.fillStyle = '#4a4e55'; g.fillRect(0, 0, 512, 512);
  const r = rand(7);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 26 + (r() < 0.02 ? 25 : 0);
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
  // piccole crepe e macchie
  for (let k = 0; k < 40; k++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '30,30,34' : '95,98,104'},${0.15 + r() * 0.2})`;
    g.beginPath(); g.ellipse(r() * 512, r() * 512, 3 + r() * 14, 2 + r() * 6, r() * 3, 0, 7); g.fill();
  }
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
