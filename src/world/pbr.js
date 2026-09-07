import * as THREE from 'three';

/**
 * Ritocchi agli shader dei materiali standard di three.
 *
 * Tutto passa da onBeforeCompile: si riscrivono i pezzi di codice
 * (`ShaderChunk`) che campionano le texture, senza toccare il resto
 * dell'illuminazione. Questo permette di aggiungere parallax, variazione
 * a grande scala e tessuti restando su MeshStandardMaterial, che continua
 * a ricevere ombre, nebbia e mappa d'ambiente come prima.
 */

/* ------------------------------------------------------------- parallax */

/*
 * Parallax occlusion mapping.
 *
 * La normal map fa credere che la superficie sia scolpita finche' non la
 * guardi di taglio: allora torna piatta, perche' i pixel non si spostano.
 * Il POM sposta davvero le coordinate della texture seguendo il raggio di
 * vista dentro la mappa di altezza, quindi crepe e giunti hanno profondita'
 * e si occludono a vicenda. E' il singolo effetto che cambia di piu' la resa
 * dell'asfalto visto da un'auto.
 *
 * L'altezza sta nel canale B della mappa "pack" (vedi tools/pack-textures).
 */
const POM_FUNCS = /* glsl */`
uniform sampler2D novaPackMap;
uniform float novaPomScale;
uniform vec2 novaPomFade;      // x = distanza piena, y = distanza nulla
uniform float novaMacroScale;
uniform float novaMacroAmount;

// Base tangente ricavata dalle derivate: non servono tangenti nella geometria.
// Attenzione: dFdx/dFdy vanno chiamate SEMPRE, mai dentro un if. Dentro un
// ramo non uniforme il risultato non e' definito e su alcune schede esce NaN;
// il NaN poi finisce nel bloom, che lo sfoca su tutto il fotogramma e lo
// schermo diventa nero. E' esattamente il "mezzo schermo nero" gia' visto.
mat3 novaTBN(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  // superficie degenere (quad visto di taglio): senza il minimo qui
  // inversesqrt(0) darebbe infinito
  float d = max(dot(T, T), dot(B, B));
  float invmax = inversesqrt(max(d, 1e-12));
  return mat3(T * invmax, B * invmax, N);
}

vec2 novaParallax(vec2 uv, vec3 viewPos) {
  vec3 N = normalize(vNormal);
  mat3 tbn = novaTBN(N, -viewPos, uv);        // fuori da ogni ramo: vedi sopra

  float dist = length(viewPos);
  float near = 1.0 - smoothstep(novaPomFade.x, novaPomFade.y, dist);
  if (near <= 0.002 || novaPomScale <= 0.0) return uv;

  vec3 V = normalize(viewPos);                // dal punto verso la camera
  vec3 Vt = vec3(dot(tbn[0], V), dot(tbn[1], V), dot(tbn[2], V));

  // di sbieco il passo si allunga: piu' campioni dove serve, meno di fronte
  float steps = mix(8.0, 26.0, near * (1.0 - abs(Vt.z)) + near * 0.35);
  float layer = 1.0 / steps;
  vec2 maxOffset = (Vt.xy / max(0.30, abs(Vt.z))) * (novaPomScale * near);
  vec2 delta = maxOffset * layer;

  vec2 cur = uv;
  float depth = 0.0;
  float h = 1.0 - texture2D(novaPackMap, cur).b;
  for (int i = 0; i < 26; i++) {
    if (float(i) >= steps || depth >= h) break;
    cur -= delta;
    h = 1.0 - texture2D(novaPackMap, cur).b;
    depth += layer;
  }
  // il punto d'impatto sta fra l'ultimo passo fuori e il primo dentro
  vec2 prev = cur + delta;
  float after = h - depth;
  float before = (1.0 - texture2D(novaPackMap, prev).b) - (depth - layer);
  float w = clamp(after / max(1e-4, after - before), 0.0, 1.0);
  vec2 res = mix(cur, prev, w);
  // rete di sicurezza: se qualcosa e' andato storto si torna alle UV originali
  // (il confronto con se stesso e' falso solo per NaN)
  return mix(uv, res, vec2(equal(res, res)));
}
`;

/*
 * Variazione a grande scala.
 *
 * Una texture da 8 metri ripetuta su un viale lungo 800 si vede: l'occhio
 * riconosce il motivo e la strada diventa una moquette. Si campiona allora
 * lo stesso colore a una scala molto piu' larga e lo si usa come chiazza di
 * luminosita' e di lucidita': le zone di usura, le macchie di gomma e i
 * rappezzi vengono da li'.
 */
const MACRO_COLOR = /* glsl */`
  vec3 novaMacro = texture2D(map, novaUv * novaMacroScale).rgb;
  float novaVar = dot(novaMacro, vec3(0.3333));
  diffuseColor.rgb *= mix(1.0, novaVar * 2.0, novaMacroAmount);
`;

const MACRO_ROUGH = /* glsl */`
  // dove il macro e' scuro la superficie e' lisciata dal passaggio: piu' lucida
  roughnessFactor *= mix(1.0, 0.62 + novaVar * 0.9, novaMacroAmount);
`;

/**
 * Aggiunge parallax e variazione a un materiale che usa map/normalMap e la
 * mappa "pack" come roughnessMap+aoMap.
 *
 * @param {THREE.MeshStandardMaterial} mat
 * @param {object} o
 *   packMap      la texture R=AO G=rugosita' B=altezza
 *   scale        profondita' del parallax in unita' UV (0 = spento)
 *   fade         [metri pieno, metri spento]
 *   macroScale   quante volte piu' larga la variazione (0 = spenta)
 *   macroAmount  quanto pesa (0..1)
 */
export function enableParallax(mat, o = {}) {
  const packMap = o.packMap || mat.roughnessMap;
  if (!packMap) return mat;
  const u = {
    novaPackMap: { value: packMap },
    novaPomScale: { value: o.scale ?? 0.0 },
    novaPomFade: { value: new THREE.Vector2(o.fade?.[0] ?? 14, o.fade?.[1] ?? 42) },
    novaMacroScale: { value: o.macroScale ?? 0.0 },
    novaMacroAmount: { value: o.macroAmount ?? 0.0 },
  };
  mat.userData.nova = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    const C = THREE.ShaderChunk;
    let f = shader.fragmentShader;
    f = f.replace('void main() {', `${POM_FUNCS}\nvoid main() {\n  vec2 novaUv = novaParallax(vMapUv, vViewPosition);`);
    // gli include vengono espansi da three DOPO onBeforeCompile: per cambiare
    // le coordinate bisogna sostituirli qui, gia' espansi
    f = f.replace('#include <map_fragment>',
      C.map_fragment.replace(/vMapUv/g, 'novaUv') + (u.novaMacroAmount.value > 0 ? MACRO_COLOR : ''));
    f = f.replace('#include <normal_fragment_maps>', C.normal_fragment_maps.replace(/vNormalMapUv/g, 'novaUv'));
    f = f.replace('#include <roughnessmap_fragment>',
      C.roughnessmap_fragment.replace(/vRoughnessMapUv/g, 'novaUv') + (u.novaMacroAmount.value > 0 ? MACRO_ROUGH : ''));
    f = f.replace('#include <aomap_fragment>', C.aomap_fragment.replace(/vAoMapUv/g, 'novaUv'));
    shader.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `nova-pom-${u.novaMacroAmount.value > 0 ? 1 : 0}`;
  mat.needsUpdate = true;
  return mat;
}

/** Spegne il parallax (qualita' bassa) senza ricompilare lo shader. */
export function setParallaxScale(mat, scale) {
  const u = mat.userData && mat.userData.nova;
  if (u) u.novaPomScale.value = scale;
}
