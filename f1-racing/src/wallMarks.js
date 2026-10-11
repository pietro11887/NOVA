import * as THREE from 'three';
import { DENTS } from './track.js';

// Danni ai muri dopo un urto:
// - cemento: il muro non si muove, ma resta segnato (gomma nera, vernice della vettura, scaglie di cemento)
// - TecPro / gomme: la barriera assorbe e si ammacca, e l'ammaccatura resta

function scuffTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  // strisciate orizzontali: nere (gomma) e grigio chiaro (cemento scheggiato)
  for (let k = 0; k < 70; k++) {
    const y = 10 + Math.random() * 44, x = Math.random() * 60, len = 120 + Math.random() * 130;
    const dark = Math.random() < 0.65;
    g.strokeStyle = dark ? `rgba(15,12,10,${0.25 + Math.random() * 0.5})` : `rgba(235,230,220,${0.3 + Math.random() * 0.5})`;
    g.lineWidth = 0.6 + Math.random() * (dark ? 3 : 1.5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(Math.min(250, x + len), y + (Math.random() - 0.5) * 6); g.stroke();
  }
  // scheggiature
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(200,195,185,${0.5 + Math.random() * 0.4})`;
    g.beginPath(); g.ellipse(30 + Math.random() * 200, 14 + Math.random() * 36, 2 + Math.random() * 5, 1 + Math.random() * 3, Math.random(), 0, 7); g.fill();
  }
  // bordi sfumati
  const img = g.getImageData(0, 0, 256, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) {
    const ex = Math.min(1, x / 30, (255 - x) / 30), ey = Math.min(1, y / 8, (63 - y) / 8);
    img.data[(y * 256 + x) * 4 + 3] *= Math.max(0, Math.min(ex, ey));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function paintTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  for (let k = 0; k < 25; k++) {
    g.strokeStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`; g.lineWidth = 0.5 + Math.random() * 2.5;
    const y = 6 + Math.random() * 20, x = 20 + Math.random() * 60;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 80 + Math.random() * 140, y + (Math.random() - 0.5) * 4); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WallMarks {
  constructor(scene, track, particles) {
    this.scene = scene; this.track = track; this.particles = particles;
    this.group = new THREE.Group(); scene.add(this.group);
    this.scuffMat = new THREE.MeshStandardMaterial({ map: scuffTexture(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.paintT = paintTexture();
    this.paintMats = new Map();
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.marks = [];
    this.max = 70;
  }

  paintMat(color) {
    const key = color ?? 0x888888;
    if (!this.paintMats.has(key)) this.paintMats.set(key, new THREE.MeshStandardMaterial({ map: this.paintT, color: key, transparent: true, depthWrite: false, roughness: 0.4, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
    return this.paintMats.get(key);
  }

  // e: evento d'urto della fisica; vx, vz: velocità della vettura; color: colore della carrozzeria
  hit(e, vx, vz, color) {
    if (!e.wall || e.i == null || e.impact < 2) return;
    const s = this.track.samples[e.i], side = e.side;
    const wall = side > 0 ? (s.wallLVis ?? s.wallL) : (s.wallRVis ?? s.wallR);
    // punto sul muro alla stessa altezza della pista
    const along = (e.x - s.x) * s.tx + (e.z - s.z) * s.tz;
    const d = (wall - 0.03) * side;
    const x = s.x + s.nx * d + s.tx * along, z = s.z + s.nz * d + s.tz * along;
    const y = e.y ?? s.y;
    if (e.soft) return this.dent(e, x, z, y, side, s);
    // cemento: segni e scaglie
    const vt = vx * s.tx + vz * s.tz;
    const len = Math.min(6, 0.8 + e.scrape * 0.12 + e.impact * 0.05);
    const near = this.marks.find(m => (m.x - x) ** 2 + (m.z - z) ** 2 < 1.2);
    if (near) {
      // stesso punto: il segno si allunga e diventa più marcato
      near.mesh.scale.x = Math.min(8, near.mesh.scale.x + len * 0.4);
      near.mesh.scale.y = Math.min(0.9, Math.abs(near.mesh.scale.y) + 0.08);
    } else {
      const ry = Math.atan2(-s.nx * side, -s.nz * side);
      const h = 0.35 + Math.min(0.5, e.impact * 0.02);
      const mk = (mat, hh, yy, lenK) => {
        const m = new THREE.Mesh(this.geo, mat);
        m.position.set(x - s.tx * Math.sign(vt) * len * 0.35, yy, z - s.tz * Math.sign(vt) * len * 0.35);
        m.rotation.y = ry;
        m.scale.set(len * lenK, hh, 1);
        if (Math.sign(vt) < 0) m.scale.x *= -1;
        m.receiveShadow = true;
        this.group.add(m);
        return m;
      };
      const sc = mk(this.scuffMat, h, y + 0.3 + Math.random() * 0.15, 1);
      const pt = e.impact > 4 ? mk(this.paintMat(color), h * 0.4, y + 0.35 + Math.random() * 0.2, 0.7) : null;
      this.marks.push({ x, z, mesh: sc, paint: pt });
      while (this.marks.length > this.max) { const o = this.marks.shift(); this.group.remove(o.mesh); if (o.paint) this.group.remove(o.paint); }
    }
    // scaglie di cemento e polvere
    if (this.particles && e.impact > 5) {
      const n = Math.min(25, Math.floor(e.impact * 1.2));
      for (let k = 0; k < n; k++) this.particles.emit(x - s.nx * side * 0.1, y + 0.3 + Math.random() * 0.5, z - s.nz * side * 0.1, {
        color: k % 3 ? [0.72, 0.7, 0.66] : [0.5, 0.48, 0.45], size: 0.06 + Math.random() * 0.08, life: 0.8 + Math.random() * 0.6, alpha: 1,
        vx: -s.nx * side * (1 + Math.random() * 3) + vx * 0.2 + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 3, vz: -s.nz * side * (1 + Math.random() * 3) + vz * 0.2 + (Math.random() - 0.5) * 2, grav: 9.8, drag: 0.6 });
      this.particles.emit(x, y + 0.6, z, { color: [0.8, 0.78, 0.74], size: 1.2, grow: 2.5, life: 1.5, alpha: 0.25, vy: 0.4, drag: 1.5 });
    }
  }

  dent(e, x, z, y, side, s) {
    // vicino a un'ammaccatura già fatta: diventa più profonda
    const A = DENTS.a.value, D = DENTS.d.value;
    let k = A.findIndex(a => a.z > 0 && (a.x - x) ** 2 + (a.y - z) ** 2 < 2.5);
    const depth = Math.min(0.95, 0.12 + e.impact * 0.05);
    if (k >= 0) { A[k].z = Math.min(0.9, A[k].z + depth * 0.5); A[k].w = Math.min(3.2, A[k].w + 0.2); }
    else {
      k = DENTS.next; DENTS.next = (DENTS.next + 1) % A.length;
      A[k].set(x, z, depth, 1.3 + Math.min(1.6, e.impact * 0.06));
      D[k].set(s.nx * side, s.nz * side, y, 0);   // verso l'esterno della pista
    }
    // pezzetti di schiuma e fasce che volano
    if (this.particles && e.impact > 4) {
      const n = Math.min(18, Math.floor(e.impact));
      for (let q = 0; q < n; q++) this.particles.emit(x, y + 0.3 + Math.random() * 0.7, z, {
        color: q % 2 ? [0.82, 0.12, 0.14] : [0.93, 0.93, 0.92], size: 0.08 + Math.random() * 0.08, life: 0.9, alpha: 1,
        vx: -s.nx * side * (1 + Math.random() * 2) + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2.5, vz: -s.nz * side * (1 + Math.random() * 2) + (Math.random() - 0.5) * 2, grav: 9.8, drag: 0.8 });
    }
  }

  clear() {
    for (const m of this.marks) { this.group.remove(m.mesh); if (m.paint) this.group.remove(m.paint); }
    this.marks = [];
    for (const a of DENTS.a.value) a.set(0, 0, 0, 0);
    DENTS.next = 0;
  }
}
