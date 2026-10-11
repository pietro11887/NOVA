import * as THREE from 'three';

// Materiali fotografici (texture CC0 di Poly Haven, in assets/tex): colore, rilievo (normal map) e ruvidità.
// Si applicano "in coordinate del mondo": niente cuciture né ripetizioni allineate ai modelli.
// Il colore originale dell'oggetto resta: la foto aggiunge solo il dettaglio (grana, giunti, crepe),
// diviso per il colore medio della texture così le tinte del gioco non cambiano.

const AVG = {
  asphalt: [0.017, 0.013, 0.012], limestone: [0.261, 0.191, 0.122], oldwall: [0.463, 0.384, 0.294],
  concrete: [0.266, 0.238, 0.163], pavers: [0.171, 0.118, 0.082], grass: [0.319, 0.236, 0.106], bark: [0.099, 0.068, 0.049], gravel: [0.425, 0.402, 0.349],
};
const cache = {};
let aniso = 8;
export function setAniso(a) { aniso = a; }

export function texSet(name) {
  if (cache[name]) return cache[name];
  const L = new THREE.TextureLoader();
  const load = (suf, srgb) => {
    const t = L.load(`assets/tex/${name}_${suf}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return (cache[name] = { c: load('c', true), n: load('n'), r: load('r'), avg: new THREE.Vector3(...AVG[name]) });
}

// funzioni GLSL comuni
export const TRI_GLSL = `
  vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
  vec4 triTex(sampler2D t, vec3 p, vec3 w){ return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
  // rilievo in coordinate del mondo (fusione "whiteout")
  vec3 triNrm(sampler2D t, vec3 p, vec3 N, vec3 w, float k){
    vec3 tx = texture2D(t, p.zy).xyz * 2.0 - 1.0, ty = texture2D(t, p.xz).xyz * 2.0 - 1.0, tz = texture2D(t, p.xy).xyz * 2.0 - 1.0;
    tx.xy *= k; ty.xy *= k; tz.xy *= k;
    vec3 nx = vec3(tx.xy + N.zy, abs(tx.z) * N.x), ny = vec3(ty.xy + N.xz, abs(ty.z) * N.y), nz = vec3(tz.xy + N.xy, abs(tz.z) * N.z);
    return normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
  }
  // piano orizzontale (strade, terreno)
  vec3 flatNrm(vec4 tn, vec3 N, float k){
    vec3 t = tn.xyz * 2.0 - 1.0; t.xy *= k;
    vec3 T = normalize(cross(N, vec3(0.0, 0.0, 1.0))), B = cross(T, N);
    return normalize(T * t.x + B * t.y + N * t.z);
  }
`;

// varying della posizione nel mondo (con le istanze, se ci sono)
export function addWorldPos(sh) {
  if (sh.vertexShader.includes('vWP')) return;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      { vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vWP = (modelMatrix * wp).xyz; }`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\n' + TRI_GLSL);
}

// dettaglio fotografico triplanare su un materiale (muri, palazzi, barriere, tribune...)
// opts: scale (metri per ripetizione), strength (0..1 quanto si vede la foto), normal (forza del rilievo)
export function triplanar(mat, name, opts = {}) {
  const T = texSet(name), prev = mat.onBeforeCompile;
  const S = (1 / (opts.scale || 3)).toFixed(5), K = (opts.strength ?? 0.85).toFixed(3), NK = (opts.normal ?? 1).toFixed(3);
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.tTc = { value: T.c }; sh.uniforms.tTn = { value: T.n }; sh.uniforms.tTr = { value: T.r }; sh.uniforms.tTavg = { value: T.avg };
    addWorldPos(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tTc, tTn, tTr; uniform vec3 tTavg;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gWN = normalize(cross(dFdx(vWP), dFdy(vWP)));
        vec3 tW = triW(gWN), tP = vWP * ${S};
        vec3 tCol = triTex(tTc, tP, tW).rgb / tTavg;
        diffuseColor.rgb *= mix(vec3(1.0), clamp(tCol, 0.0, 2.2), ${K});`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.55 + 0.9 * triTex(tTr, tP, tW).g), 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          vec3 pn = triNrm(tTn, tP, wn, triW(wn), ${NK});
          normal = normalize((viewMatrix * vec4(pn, 0.0)).xyz); }`);
  };
  mat.customProgramCacheKey = () => 'tri-' + name + S + K + NK + (prev ? prev.toString().length : 0);
  mat.needsUpdate = true;
  return mat;
}

// terreno e strade: erba nei parchi (verde), asfalto sulle strade (scuro), lastre di pietra sui marciapiedi
export function ground(mat) {
  const G = texSet('grass'), P = texSet('pavers'), A = texSet('asphalt');
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      gGc: { value: G.c }, gGn: { value: G.n }, gGa: { value: G.avg }, gPc: { value: P.c }, gPn: { value: P.n }, gPa: { value: P.avg },
      gAc: { value: A.c }, gAn: { value: A.n }, gAa: { value: A.avg },
    });
    addWorldPos(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D gGc, gGn, gPc, gPn, gAc, gAn; uniform vec3 gGa, gPa, gAa;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float lumV = dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float park = smoothstep(0.02, 0.08, vColor.g - vColor.r);
        float road = (1.0 - park) * (1.0 - smoothstep(0.08, 0.16, lumV));
        float side = (1.0 - park) * (1.0 - road);
        vec2 gq = vWP.xz;
        // erba: due scale per non vedere la ripetizione
        vec3 gc = texture2D(gGc, gq * 0.33).rgb / gGa * 0.6 + texture2D(gGc, gq * 0.051 + 0.3).rgb / gGa * 0.4;
        vec3 pc = texture2D(gPc, gq * 0.35).rgb / gPa;
        vec3 ac = texture2D(gAc, gq * 0.2).rgb / gAa;
        vec3 det = gc * park + pc * side + ac * road;
        diffuseColor.rgb *= clamp(mix(vec3(1.0), det, 0.85), 0.0, 2.5);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          vec4 tn = texture2D(gGn, gq * 0.33) * park + texture2D(gPn, gq * 0.35) * side + texture2D(gAn, gq * 0.2) * road;
          normal = normalize((viewMatrix * vec4(flatNrm(tn, wn, 1.0), 0.0)).xyz); }`);
  };
  mat.customProgramCacheKey = () => 'ground';
  mat.needsUpdate = true;
  return mat;
}

// prati e campi (piste in campagna): erba fotografica su tutto, a due scale per non vedere ripetizioni
export function meadow(mat) {
  const G = texSet('grass');
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { mGc: { value: G.c }, mGn: { value: G.n }, mGa: { value: G.avg } });
    addWorldPos(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D mGc, mGn; uniform vec3 mGa;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 mq = vWP.xz;
        vec3 mc = texture2D(mGc, mq * 0.3).rgb / mGa * 0.6 + texture2D(mGc, mq * 0.043 + 0.3).rgb / mGa * 0.4;
        float ml = dot(mc, vec3(0.2126, 0.7152, 0.0722));
        // nei campi (gialli, arati) conta solo la grana, non il colore dell'erba
        float green = smoothstep(0.0, 0.08, vColor.g - vColor.r);
        vec3 det = mix(vec3(ml), mc, green);
        diffuseColor.rgb *= clamp(mix(vec3(1.0), det, 0.75), 0.0, 2.2);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          normal = normalize((viewMatrix * vec4(flatNrm(texture2D(mGn, mq * 0.3), wn, 0.8), 0.0)).xyz); }`);
  };
  mat.customProgramCacheKey = () => 'meadow';
  mat.needsUpdate = true;
  return mat;
}
