import * as THREE from 'three';

/**
 * Veicoli importati dal pacchetto di modelli.
 *
 * Le auto costruite a mano restano (autobus, ambulanza, bici e la riserva
 * se i file non arrivano); queste si affiancano portando carrozzerie vere
 * con ruote separate, che possono girare e sterzare.
 *
 * Due cose vanno sistemate a mano dopo l'importazione:
 *
 * 1. L'origine. Nel pacchetto ogni pezzo e' centrato sul baricentro della
 *    carrozzeria; il gioco vuole invece l'asfalto a quota zero, quindi si
 *    abbassa tutto del punto piu' basso delle gomme.
 * 2. Il colore. In questi modelli la tinta e' cotta nella texture. La
 *    maschera calcolata in fase di preparazione dice quali pixel sono
 *    carrozzeria, e lo shader ne sostituisce solo la tinta tenendo la
 *    luminosita' disegnata: ombre, riflessi e fughe delle portiere restano
 *    quelli dell'originale.
 */

const shared = {
  ready: false,
  cars: {},        // nome -> { body, wheels: [{ geo, pos, front, left }], spec }
  tex: null,
  quality: null,
};

/** Cerchio usato da ogni carrozzeria: viene dal nome della ruota nell'FBX. */
const RIM_OF = {
  compact: 'wheel_c', coupe: 'wheel_1', hatchback: 'wheel_b', minivan: 'wheel_d',
  offroad: 'wheel_g', pickup: 'wheel_e', sedan: 'wheel_a', sport: 'wheel_h',
  suv: 'wheel_e', wagon: 'wheel_a',
};

/**
 * Come si comporta su strada. Il pacchetto da' la forma, non il carattere:
 * massa, spunto e velocita' massima restano decisi qui.
 */
const HANDLING = {
  compact: { mass: 0.78, speed: 0.92 },
  coupe: { mass: 0.95, speed: 1.18 },
  hatchback: { mass: 0.85, speed: 0.98 },
  minivan: { mass: 1.35, speed: 0.84 },
  offroad: { mass: 1.3, speed: 0.88 },
  pickup: { mass: 1.25, speed: 0.9 },
  sedan: { mass: 1.0, speed: 1.0 },
  sport: { mass: 0.82, speed: 1.34 },
  suv: { mass: 1.3, speed: 0.92 },
  wagon: { mass: 1.1, speed: 0.96 },
};

/* --------------------------------------------------------------- shader */

/*
 * Riverniciatura. Il pixel di carrozzeria prende la tinta scelta ma
 * conserva la propria luminosita': si divide per la luminosita' del colore
 * nuovo cosi' un giallo chiaro e un blu scuro danno la stessa ombreggiatura.
 * Il tetto e' li' per non far esplodere i riflessi piu' accesi.
 */
const PAINT_GLSL = /* glsl */`
  float novaMask = texture2D(novaPackMap, vMapUv).r * novaPaintOn;
  if (novaMask > 0.001) {
    const vec3 W = vec3(0.2126, 0.7152, 0.0722);
    float l = dot(diffuseColor.rgb, W);
    float pl = max(dot(novaPaint, W), 0.004);
    diffuseColor.rgb = mix(diffuseColor.rgb, novaPaint * min(l / pl, 3.5), novaMask);
  }
`;

function paintable(mat, packMap) {
  const u = {
    novaPackMap: { value: packMap },
    novaPaint: { value: new THREE.Color(0xffffff) },
    novaPaintOn: { value: 0 },
  };
  mat.userData.paint = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform sampler2D novaPackMap;\nuniform vec3 novaPaint;\nuniform float novaPaintOn;\nvoid main() {')
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment + PAINT_GLSL);
  };
  mat.customProgramCacheKey = () => 'nova-paint';
  return mat;
}

/* ---------------------------------------------------------- costruzione */

/**
 * @param {Object} pack   uscita di loadMeshPack()
 * @param {Object} tex    { car: {nome: {map, packMap}}, rim: {nome: {...}} }
 */
export function initCarPack(pack, tex, quality) {
  shared.tex = tex;
  shared.quality = quality;
  shared.cars = {};

  for (const [name, parts] of Object.entries(pack)) {
    if (!parts.body) continue;
    const wheelRoles = Object.keys(parts).filter((k) => k !== 'body');
    if (wheelRoles.length < 4) continue;

    // il punto piu' basso e' il battistrada: da li' si ricava l'altezza da terra
    let ground = Infinity;
    for (const role of Object.keys(parts)) {
      parts[role].computeBoundingBox();
      ground = Math.min(ground, parts[role].boundingBox.min.y);
    }

    const body = parts.body.clone();
    body.translate(0, -ground, 0);
    body.computeBoundingBox();

    const wheels = [];
    let radius = 0;
    for (const role of wheelRoles) {
      const g = parts[role].clone();
      const b = g.boundingBox;
      const c = b.getCenter(new THREE.Vector3());
      // la geometria si centra sul mozzo, cosi' ruota attorno a se stessa
      g.translate(-c.x, -c.y, -c.z);
      g.computeBoundingBox();
      wheels.push({
        geo: g,
        pos: new THREE.Vector3(c.x, c.y - ground, c.z),
        front: role.includes('_f'),
        left: role.endsWith('l'),
      });
      radius = Math.max(radius, (b.max.y - b.min.y) / 2);
    }

    // misure reali del modello: la fisica deve corrispondere a quello che si vede
    const bb = body.boundingBox;
    const wx = Math.max(...wheels.map((w) => Math.abs(w.pos.x)));
    const wz = Math.max(...wheels.map((w) => Math.abs(w.pos.z)));
    const h = HANDLING[name] || { mass: 1, speed: 1 };
    shared.cars[name] = {
      body, wheels,
      spec: {
        L: bb.max.x - bb.min.x,
        W: Math.max(bb.max.z - bb.min.z, wz * 2 + 0.1),
        top: bb.max.y,
        wheel: radius,
        wx,
        mass: h.mass,
        speed: h.speed,
        imported: name,
      },
    };
  }
  shared.ready = Object.keys(shared.cars).length > 0;
  return shared.cars;
}

export const carPackReady = () => shared.ready;
export const carPackNames = () => Object.keys(shared.cars);
export const carPackSpec = (name) => shared.cars[name] && shared.cars[name].spec;
/** Geometria intatta della carrozzeria: serve all'officina per raddrizzarla. */
export const carPackBody = (name) => shared.cars[name] && shared.cars[name].body;

function bodyMaterial(name) {
  const t = shared.tex.car[name];
  const mat = new THREE.MeshPhysicalMaterial({
    map: t.map,
    roughnessMap: t.packMap,
    metalnessMap: t.packMap,
    roughness: 1, metalness: 1,
    envMapIntensity: 1.15,
    // il trasparente sopra la vernice: e' quello che da' il riflesso netto
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
  });
  return paintable(mat, t.packMap);
}

function rimMaterial(name) {
  const t = shared.tex.rim[RIM_OF[name]] || Object.values(shared.tex.rim)[0];
  return new THREE.MeshStandardMaterial({
    map: t.map, roughnessMap: t.packMap, metalnessMap: t.packMap,
    roughness: 1, metalness: 1, envMapIntensity: 1.1,
  });
}

/**
 * Fari e stop: piccoli riquadri luminosi appoggiati ai due estremi della
 * carrozzeria. Nella texture le luci non hanno un canale a parte, quindi si
 * accendono con una geometria dedicata, come sulle auto costruite a mano.
 */
function lightPanels(spec, bb) {
  const g = new THREE.BufferGeometry();
  const pos = [], col = [], idx = [];
  const quad = (x, y, z, w, h, c) => {
    const base = pos.length / 3;
    pos.push(x, y - h, z - w, x, y - h, z + w, x, y + h, z + w, x, y + h, z - w);
    for (let i = 0; i < 4; i++) col.push(c.r, c.g, c.b);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const front = new THREE.Color(0xfff2cf), rear = new THREE.Color(0xff2a1a);
  const y = bb.min.y + (bb.max.y - bb.min.y) * 0.42;
  const zOff = spec.W * 0.32;
  for (const s of [-1, 1]) {
    quad(bb.max.x + 0.01, y, s * zOff, spec.W * 0.11, 0.07, front);
    quad(bb.min.x - 0.01, y, s * zOff, spec.W * 0.11, 0.06, rear);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

let lightMat = null;

/** Costruisce un veicolo del pacchetto. */
export function makePackCar(name, color = 0xffffff, kind = 'civil') {
  const car = shared.cars[name];
  if (!car) return null;
  const group = new THREE.Group();

  const bodyMat = bodyMaterial(name);
  const body = new THREE.Mesh(car.body, bodyMat);
  body.userData.part = 'body';
  group.add(body);

  const rimMat = rimMaterial(name);
  const wheelMeshes = [];
  for (const w of car.wheels) {
    const m = new THREE.Mesh(w.geo, rimMat);
    m.position.copy(w.pos);
    // prima lo sterzo attorno alla verticale, poi il rotolamento: con
    // l'ordine YZX le due rotazioni non si mescolano
    m.rotation.order = 'YZX';
    m.userData.front = w.front;
    group.add(m);
    wheelMeshes.push(m);
  }

  if (!lightMat) {
    lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  }
  const lights = new THREE.Mesh(lightPanels(car.spec, car.body.boundingBox), lightMat);
  lights.visible = false;
  group.add(lights);

  if (shared.quality.shadows) {
    body.castShadow = true;
    body.receiveShadow = true;
    for (const m of wheelMeshes) m.castShadow = true;
  }

  if (kind === 'police') {
    const barGeo = new THREE.BoxGeometry(0.5, 0.16, 0.36);
    const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
    bar.position.set(-0.3, car.spec.top + 0.1, 0.18);
    const bar2 = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x1030ff, toneMapped: false }));
    bar2.position.set(-0.3, car.spec.top + 0.1, -0.18);
    group.add(bar, bar2);
    group.userData.bar = bar;
    group.userData.bar2 = bar2;
  }

  group.userData.bodyMat = bodyMat;
  group.userData.rimMat = rimMat;
  group.userData.lights = lights;
  group.userData.wheels = wheelMeshes;
  group.userData.wheelMesh = wheelMeshes[0];
  group.userData.imported = name;
  group.userData.dentable = [body];
  paintPackCar(group, color, kind);
  return group;
}

/** Riverniciatura: agisce solo dove la maschera dice "carrozzeria". */
export function paintPackCar(group, color, kind = 'civil') {
  const mat = group.userData.bodyMat;
  const u = mat && mat.userData.paint;
  if (!u) return;
  // taxi e polizia tengono la loro livrea; il resto prende il colore chiesto
  const on = kind === 'civil' || kind === 'police' || kind === 'taxi';
  u.novaPaint.value.setHex(color).convertSRGBToLinear();
  u.novaPaintOn.value = on ? 1 : 0;
}

/** Cerchi: il disegno resta, cambia la tinta del metallo. */
export function tintPackRims(group, hex) {
  const m = group.userData.rimMat;
  if (m) m.color.setHex(hex);
}

/**
 * Ruote: rotolamento e sterzo.
 * @param {number} roll   angolo cumulato di rotolamento (radianti)
 * @param {number} steer  angolo delle ruote anteriori (radianti)
 */
export function spinPackWheels(group, roll, steer) {
  const ws = group.userData.wheels;
  if (!ws) return;
  // le ruote di sinistra sono gia' speculari nel modello: la rotazione da
  // applicare e' la stessa per tutte, il segno non va invertito
  for (const m of ws) {
    m.rotation.z = roll;
    m.rotation.y = m.userData.front ? steer : 0;
  }
}
