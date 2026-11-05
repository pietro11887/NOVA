import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Scia di movimento come una telecamera vera: ogni punto dell'immagine si sfoca nella direzione in cui
// si è spostato sullo schermo dall'ultimo fotogramma (ricostruito dalla profondità e dalla telecamera di prima).
// La vettura seguita (vicina alla telecamera) resta nitida, lo sfondo scorre.
const MotionBlurShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uPrevVP: { value: new THREE.Matrix4() }, uStr: { value: 0 }, uNear: { value: 6 }, uMax: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth; uniform mat4 uInvProj, uCamWorld, uPrevVP; uniform float uStr, uNear, uMax; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStr <= 0.0001) { gl_FragColor = base; return; }
      float d = min(texture2D(tDepth, vUv).x, 0.99999);
      vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp /= vp.w;
      float dist = -vp.z;
      vec4 prev = uPrevVP * (uCamWorld * vp);
      vec2 puv = prev.xy / prev.w * 0.5 + 0.5;
      vec2 vel = (vUv - puv) * uStr * smoothstep(uNear, uNear * 2.2, dist);
      // al centro (dove ci sono le vetture davanti, che vanno veloci come te) la scia è leggera
      vel *= mix(0.3, 1.0, smoothstep(0.1, 0.38, length(vUv - vec2(0.5, 0.55))));
      float L = length(vel);
      if (L < 0.0006) { gl_FragColor = base; return; }
      if (L > uMax) vel *= uMax / L;
      float j = h(vUv * 917.0) - 0.5;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 10; i++) { float t = (float(i) + j) / 9.0 - 0.5; acc += texture2D(tDiffuse, vUv + vel * t).rgb; }
      gl_FragColor = vec4(acc / 10.0, base.a);
    }`,
};

// Occhi che si abituano alla luce: si misura la luminosità media dell'immagine (sulla scheda video,
// senza rallentare) e l'esposizione si adatta piano: all'ombra dei palazzi l'immagine si schiarisce,
// uscendo al sole si scurisce. Confronta con la media degli ultimi secondi, così il "look" resta quello della pista.
class ExposurePass extends Pass {
  constructor() {
    super();
    const o = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
    this.small = new THREE.WebGLRenderTarget(32, 32, { ...o, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.avg = new THREE.WebGLRenderTarget(1, 1, o);
    this.ad = [new THREE.WebGLRenderTarget(1, 1, o), new THREE.WebGLRenderTarget(1, 1, o)];
    this.cur = 0; this.dt = 1 / 60; this.reset = 2;
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
    // 1) luminanza (logaritmica, più peso al centro dove si guarda)
    this.qLum = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: vs, depthTest: false,
      fragmentShader: `uniform sampler2D t; varying vec2 vUv;
        void main(){ float s = 0.0; for (int i = 0; i < 4; i++) { vec2 o = vec2(float(i % 2), float(i / 2)) / 64.0 - 1.0 / 128.0;
          vec3 c = texture2D(t, vUv + o).rgb; s += log(0.0005 + min(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1.5)); }   // sole e cielo non contano più del resto
          float w = 1.0 - 0.6 * smoothstep(0.2, 0.7, length(vUv - vec2(0.5, 0.55)));
          gl_FragColor = vec4(s / 4.0 * w, w, 0.0, 1.0); }` }));
    // 2) media su tutta l'immagine
    this.qAvg = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: vs, depthTest: false,
      fragmentShader: `uniform sampler2D t; varying vec2 vUv;
        void main(){ vec2 a = vec2(0.0); for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++) a += texture2D(t, (vec2(x, y) + 0.5) / 32.0).rg;
          gl_FragColor = vec4(exp(a.x / max(a.y, 1e-3)), 0.0, 0.0, 1.0); }` }));
    // 3) adattamento lento: r = luminanza adattata (pochi decimi di secondo), g = riferimento (decine di secondi)
    this.qAd = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tPrev: { value: null }, tCur: { value: null }, uDt: { value: 0 }, uReset: { value: 1 } }, vertexShader: vs, depthTest: false,
      fragmentShader: `uniform sampler2D tPrev, tCur; uniform float uDt, uReset; varying vec2 vUv;
        void main(){ float c = texture2D(tCur, vec2(0.5)).r; vec2 p = texture2D(tPrev, vec2(0.5)).rg;
          if (uReset > 0.5 || p.x <= 0.0 || p.y <= 0.0) p = vec2(c);
          // alla luce forte ci si abitua più in fretta che al buio
          float k = 1.0 - exp(-uDt * (c > p.x ? 2.6 : 1.4));
          float kr = 1.0 - exp(-uDt / 25.0);
          gl_FragColor = vec4(mix(p.x, c, k), mix(p.y, c, kr), 0.0, 1.0); }` }));
    // 4) esposizione applicata all'immagine (in HDR, prima del bagliore e della conversione)
    this.qOut = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tAd: { value: null }, uStr: { value: 0.45 } }, vertexShader: vs, depthTest: false,
      fragmentShader: `uniform sampler2D tDiffuse, tAd; uniform float uStr; varying vec2 vUv;
        void main(){ vec2 a = texture2D(tAd, vec2(0.5)).rg; float e = clamp(pow(max(a.y, 1e-4) / max(a.x, 1e-4), uStr), 0.94, 1.4);     // schiarisce all'ombra, non scurisce quasi mai
          vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(c.rgb * e, c.a); }` }));
  }
  render(renderer, writeBuffer, readBuffer) {
    const src = readBuffer.texture;
    this.qLum.material.uniforms.t.value = src;
    renderer.setRenderTarget(this.small); this.qLum.render(renderer);
    this.qAvg.material.uniforms.t.value = this.small.texture;
    renderer.setRenderTarget(this.avg); this.qAvg.render(renderer);
    const prev = this.ad[this.cur], next = this.ad[1 - this.cur];
    const u = this.qAd.material.uniforms;
    u.tPrev.value = prev.texture; u.tCur.value = this.avg.texture; u.uDt.value = this.dt; u.uReset.value = this.reset > 0 ? 1 : 0;
    if (this.reset > 0) this.reset--;
    renderer.setRenderTarget(next); this.qAd.render(renderer);
    this.cur = 1 - this.cur;
    this.qOut.material.uniforms.tDiffuse.value = src; this.qOut.material.uniforms.tAd.value = next.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.qOut.render(renderer);
  }
}

// Effetti "da ripresa TV" sull'immagine finale (solo con grafica alta):
// - bagliore sulle luci forti (sole, scintille, freni roventi, led)
// - colori da trasmissione: contrasto, saturazione, ombre fredde e luci calde
// - vignettatura, leggera aberrazione cromatica ai bordi, grana fine
// - sfocatura radiale in velocità (il bordo dello schermo "scorre")
// L'immagine viene disegnata in HDR con antialiasing (MSAA) e poi convertita.

// raggi di sole che filtrano tra i palazzi: si "trascinano" le parti più luminose verso il sole
const RaysShader = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uStr: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStr, uAspect; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStr <= 0.001) { gl_FragColor = base; return; }
      vec2 d = (uSun - vUv) / 40.0;
      vec2 uv = vUv + d * h(vUv * 731.0);
      float w = 1.0, acc = 0.0;
      for (int i = 0; i < 40; i++) {
        vec3 c = texture2D(tDiffuse, uv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        acc += smoothstep(0.95, 2.2, l) * w;
        w *= 0.955; uv += d;
      }
      float r = length((vUv - uSun) * vec2(uAspect, 1.0));
      vec3 rays = vec3(1.0, 0.78, 0.5) * acc / 40.0 * uStr * 2.6 / (1.0 + r * 1.5);
      gl_FragColor = vec4(base.rgb + rays, base.a);
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uWarm: { value: 0 },
    uAspect: { value: 1 },
    uLens: { value: 0 },
    uNat: { value: 0 },
    // "look" della pista (come la correzione colore di una ripresa TV): saturazione, contrasto, tinte
    uSat: { value: 0.97 }, uCon: { value: 1.02 }, uShadow: { value: new THREE.Vector3(0.98, 1.0, 1.04) }, uHigh: { value: new THREE.Vector3(1.03, 1.0, 0.97) }, uLift: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uSpeed, uWarm, uAspect, uLens, uNat, uSat, uCon, uLift; uniform vec3 uShadow, uHigh; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 base = vUv;
      // obiettivo TV: leggera distorsione a barile
      vec2 c0 = base - 0.5;
      base = 0.5 + c0 * (1.0 - uLens * 0.045 * dot(c0 * vec2(uAspect, 1.0), c0 * vec2(uAspect, 1.0)) - uLens * 0.012);
      vec2 c = base - 0.5;
      float r = length(c * vec2(uAspect, 1.0));
      // sfocatura radiale in velocità: solo verso i bordi, il centro resta nitido
      vec3 col = vec3(0.0);
      float k = uSpeed * smoothstep(0.25, 0.9, r) * 0.035;
      for (int i = 0; i < 6; i++) {
        float t = float(i) / 5.0;
        vec2 uv = base - c * k * t;
        // aberrazione cromatica ai bordi (più forte con l'obiettivo TV)
        vec2 ca = c * (0.0022 + uLens * 0.004) * smoothstep(0.3, 1.0, r);
        col += vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      }
      col /= 6.0;
      // colori da trasmissione
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, mix(1.12, uSat, uNat));                                   // saturazione
      // contrasto a "S" (ombre più profonde, luci che non bruciano) e un filo di nero sollevato, come in TV
      vec3 cs = clamp(col, 0.0, 1.0);
      col = mix((col - 0.5) * mix(1.06, uCon, uNat) + 0.5, cs * cs * (3.0 - 2.0 * cs), uNat * 0.18) + uLift * (1.0 - cs);
      vec3 shadowT = mix(mix(vec3(0.96, 1.0, 1.05), uShadow, uNat), vec3(0.98, 1.0, 1.04), uWarm);
      vec3 lightT = mix(mix(vec3(1.03, 1.0, 0.97), uHigh, uNat), vec3(1.07, 1.0, 0.92), uWarm);
      col *= mix(shadowT, lightT, smoothstep(0.1, 0.8, l));
      // vignettatura e grana
      col *= 1.0 - (mix(0.32, 0.14, uNat) + uLens * 0.12) * smoothstep(0.45, 1.05, r);
      col += (h(vUv * 1000.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

export class Post {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    // ultra: antialiasing 8x (se la scheda video lo permette)
    const maxS = renderer.capabilities.maxSamples || 4, U = !!opts.ultra;
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: U && renderer.getPixelRatio() <= 1.5 ? Math.min(8, maxS) : 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    // occlusione ambientale: ombre morbide negli angoli, sotto le vetture, tra i palazzi (a metà risoluzione)
    if (opts.ao) {
      // ultra: a piena risoluzione e con più campioni (ombre di contatto più precise)
      const aoDiv = U ? 1 : 2;
      const ao = new GTAOPass(scene, camera, size.x / aoDiv, size.y / aoDiv);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 1.0;
      ao.updateGtaoMaterial({ radius: U ? 1.8 : 1.4, distanceExponent: 1.6, thickness: 2.5, scale: U ? 1.25 : 1.15, samples: U ? 24 : 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: U ? 8 : 6, rings: U ? 3 : 2, samples: U ? 20 : 12 });
      const ss = ao.setSize.bind(ao);
      ao.setSize = (w, h) => ss(Math.max(1, Math.round(w / aoDiv)), Math.max(1, Math.round(h / aoDiv)));
      // le chiome degli alberi (foglie ritagliate) non devono fare "ombra quadrata"
      const ov = ao.overrideVisibility.bind(ao);
      // e nemmeno gli strati trasparenti appoggiati sull'asfalto (gomma, segni di frenata, linea guida)
      ao.overrideVisibility = () => { ov(); scene.traverse(o => { if (o.userData.noAO || (o.material && o.material.transparent)) o.visible = false; }); };
      this.ao = ao;
      this.composer.addPass(ao);
    }
    // scia di movimento (usa la profondità calcolata per l'occlusione ambientale)
    if (this.ao) {
      this.mblur = new ShaderPass(MotionBlurShader);
      this.mblur.uniforms.tDepth.value = this.ao.depthTexture;
      this.composer.addPass(this.mblur);
      this.prevVP = new THREE.Matrix4(); this.hasPrev = false; this.prevPos = new THREE.Vector3();
    }
    // esposizione automatica
    // esposizione automatica: tolta (al tramonto scuriva troppo); per riattivarla basta rimettere queste due righe
    // this.expo = new ExposurePass();
    // this.composer.addPass(this.expo);
    this.rays = new ShaderPass(RaysShader);
    this.rays.enabled = !!opts.rays;
    this.composer.addPass(this.rays);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / (U ? 1 : 2), size.y / (U ? 1 : 2)), opts.bloom ?? 0.32, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uWarm.value = opts.warm ?? 0;
    this.grade.uniforms.uNat.value = opts.natural ? 1 : 0;   // colori naturali, come una ripresa vera
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    // antialiasing sull'immagine finale (in più al multicampionamento): bordi di reti, cartelloni, foglie e
    // riflessi senza scalini né tremolio
    this.smaa = new SMAAPass(size.x, size.y);
    this.composer.addPass(this.smaa);
    this.speed = 0;
  }
  // correzione colore per pista: { sat, con, shadow: [r,g,b], high: [r,g,b], lift }
  setLook(L) {
    const g = this.grade.uniforms;
    if (L.sat != null) g.uSat.value = L.sat;
    if (L.con != null) g.uCon.value = L.con;
    if (L.lift != null) g.uLift.value = L.lift;
    if (L.shadow) g.uShadow.value.set(...L.shadow);
    if (L.high) g.uHigh.value.set(...L.high);
  }
  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
    this.rays.uniforms.uAspect.value = w / h;
  }
  // speed: 0..1 (quanto si vede la sfocatura in velocità)
  // fx: { sunDir, lens 0..1 }
  draw(dt, camera, speed = 0, fx = {}) {
    this.render.camera = camera;
    if (this.ao) this.ao.camera = camera;
    const g = this.grade.uniforms;
    g.uLens.value += ((fx.lens || 0) - g.uLens.value) * Math.min(1, dt * 4);
    if (this.rays.enabled && fx.sunDir) {
      _w.copy(fx.sunDir).multiplyScalar(3000).add(camera.position);
      _v.copy(_w).project(camera);
      camera.getWorldDirection(_d);
      const facing = _d.dot(fx.sunDir);
      const off = Math.max(Math.abs(_v.x), Math.abs(_v.y));
      const str = facing > 0 ? Math.max(0, Math.min(1, facing * 3)) * Math.max(0, Math.min(1, (1.6 - off) / 0.6)) : 0;
      this.rays.uniforms.uSun.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
      this.rays.uniforms.uStr.value = str;
    }
    this.speed += (speed - this.speed) * Math.min(1, dt * 3);
    this.grade.uniforms.uSpeed.value = this.speed;
    this.grade.uniforms.uTime.value = (this.grade.uniforms.uTime.value + dt) % 100;
    if (this.expo) this.expo.dt = Math.min(0.1, Math.max(0.001, dt));
    if (this.mblur) {
      const u = this.mblur.uniforms;
      camera.updateMatrixWorld();
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
      // otturatore di 1/100 di secondo (più lungo del fotogramma solo se il gioco va a meno di 100 fps)
      const jump = this.hasPrev && camera.position.distanceTo(this.prevPos) > 25;     // stacco di inquadratura
      u.uStr.value = this.hasPrev && !jump && dt > 0 && fx.blur !== false ? Math.min(1.2, (1 / 100) / dt) : 0;
      u.uNear.value = fx.near ?? 6;
      u.uPrevVP.value.copy(this.prevVP);
      this.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.prevPos.copy(camera.position); this.hasPrev = true;
    }
    this.composer.render(dt);
  }
  // nuova sessione / stacco: niente scia e l'esposizione riparte da capo
  cut() { this.hasPrev = false; if (this.expo) this.expo.reset = 2; }
}
