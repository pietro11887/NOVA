import * as THREE from 'three';
import { ShaderPass } from '../../vendor/examples/postprocessing/ShaderPass.js';

/**
 * Occlusione ambientale in spazio schermo.
 *
 * E' il dettaglio che manca quando una scena sembra "stampata": sotto le
 * auto, negli angoli fra muro e marciapiede, nei solchi fra le lastre non
 * c'e' nessuna ombra, perche' la luce d'ambiente arriva uguale da tutte le
 * direzioni. Qui si guarda quanta volta celeste vede davvero ogni pixel.
 *
 * Il giro completo e':
 *   1. passata di preparazione: la scena ridisegnata con le sole normali,
 *      piu' la profondita' agganciata allo stesso bersaglio;
 *   2. calcolo dell'occlusione a meta' risoluzione, campionando un
 *      emisfero attorno a ogni punto;
 *   3. due sfocature separabili che rispettano i bordi, se no il risultato
 *      e' un brulichio di puntini;
 *   4. moltiplicazione sul colore, dentro la catena di post-produzione.
 *
 * Costa una seconda passata di geometria: sta accesa solo al livello di
 * qualita' piu' alto.
 */

const AO_SHADER = {
  uniforms: {
    tNormal: { value: null },
    tDepth: { value: null },
    projection: { value: new THREE.Matrix4() },
    inverseProjection: { value: new THREE.Matrix4() },
    resolution: { value: new THREE.Vector2() },
    radius: { value: 1.5 },
    bias: { value: 0.02 },
    power: { value: 2.2 },
    strength: { value: 1.55 },
    cameraNear: { value: 0.4 },
    cameraFar: { value: 4200 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tNormal;
    uniform sampler2D tDepth;
    uniform mat4 projection, inverseProjection;
    uniform vec2 resolution;
    uniform float radius, bias, power, strength, cameraNear, cameraFar;
    varying vec2 vUv;

    vec3 viewFromDepth(vec2 uv, float d) {
      vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      vec4 v = inverseProjection * clip;
      return v.xyz / v.w;
    }

    void main() {
      float d = texture2D(tDepth, vUv).x;
      // fondale: niente da occludere
      if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }

      vec3 p = viewFromDepth(vUv, d);
      vec3 n = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);

      // base tangente attorno alla normale, per campionare nell'emisfero
      vec3 up = abs(n.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 t = normalize(cross(up, n));
      vec3 b = cross(n, t);

      // rotazione per pixel: sparpaglia l'errore invece di lasciare bande
      float ang = fract(sin(dot(vUv * resolution, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;

      float occ = 0.0;
      const float N = 12.0;
      for (int i = 0; i < 12; i++) {
        // spirale ad angolo aureo: dodici direzioni ben sparse senza tabelle
        float fi = float(i);
        float a = fi * 2.39996323 + ang;
        float rr = sqrt((fi + 0.5) / N);
        vec3 dir = normalize(t * (cos(a) * rr) + b * (sin(a) * rr) + n * (0.35 + 0.65 * (1.0 - rr)));
        vec3 sp = p + dir * radius * (0.35 + 0.65 * rr);

        vec4 proj = projection * vec4(sp, 1.0);
        vec2 suv = (proj.xy / proj.w) * 0.5 + 0.5;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

        float sd = texture2D(tDepth, suv).x;
        if (sd >= 0.9999) continue;
        float sampleZ = viewFromDepth(suv, sd).z;

        /*
         * Conta solo se quello che si vede in quel punto sta davvero davanti
         * al campione. La sfumatura sulla distanza evita che un oggetto
         * staccato proietti un alone su quello dietro.
         */
        float diff = sampleZ - sp.z;
        float range = smoothstep(0.0, 1.0, radius / max(0.0001, abs(p.z - sampleZ)));
        occ += step(bias, diff) * range;
      }

      float ao = clamp(1.0 - (occ * strength) / N, 0.0, 1.0);
      gl_FragColor = vec4(vec3(pow(ao, power)), 1.0);
    }`,
};

const BLUR_SHADER = {
  uniforms: {
    tAO: { value: null },
    tDepth: { value: null },
    direction: { value: new THREE.Vector2(1, 0) },
    texel: { value: new THREE.Vector2() },
    cameraNear: { value: 0.4 },
    cameraFar: { value: 120 },
  },
  vertexShader: AO_SHADER.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tAO, tDepth;
    uniform vec2 direction, texel;
    uniform float cameraNear, cameraFar;
    varying vec2 vUv;

    // il buffer di profondita' non e' lineare: confrontarlo cosi' com'e'
    // renderebbe il peso quasi costante da lontano, e la sfocatura
    // scavalcherebbe i bordi lasciando aloni
    float linear(float d) {
      float z = d * 2.0 - 1.0;
      return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
    }

    void main() {
      float centre = linear(texture2D(tDepth, vUv).x);
      float sum = 0.0, wsum = 0.0;
      for (int i = -3; i <= 3; i++) {
        vec2 uv = vUv + direction * texel * float(i);
        float d = linear(texture2D(tDepth, uv).x);
        float w = exp(-abs(d - centre) * 3.0) * (1.0 - abs(float(i)) * 0.12);
        sum += texture2D(tAO, uv).r * w;
        wsum += w;
      }
      gl_FragColor = vec4(vec3(sum / max(wsum, 0.0001)), 1.0);
    }`,
};

const APPLY_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tAO: { value: null },
    intensity: { value: 1.0 },
  },
  vertexShader: AO_SHADER.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tAO;
    uniform float intensity;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float ao = mix(1.0, texture2D(tAO, vUv).r, intensity);
      gl_FragColor = vec4(c.rgb * ao, c.a);
    }`,
};

class Quad {
  constructor(shader) {
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(shader.uniforms),
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }
  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
  }
}

export class SSAO {
  constructor(renderer, width, height, scale = 0.5) {
    this.renderer = renderer;
    this.scale = scale;
    this.enabled = true;
    this.intensity = 1.0;

    this.normalMaterial = new THREE.MeshNormalMaterial();
    /*
     * Camera di servizio con il piano lontano a poche decine di metri.
     * Quella del gioco arriva a 4200 e con un buffer a 24 bit la
     * profondita' oltre i cinquanta metri diventa indistinguibile: l'AO
     * uscirebbe a chiazze. L'occlusione ambientale serve comunque solo da
     * vicino, oltre il limite non si calcola.
     */
    this.far = 90;
    this.depthCamera = new THREE.PerspectiveCamera();
    /** Oggetti da saltare nella passata di preparazione (cielo, nuvole…). */
    this.skip = [];
    this.ao = new Quad(AO_SHADER);
    this.blur = new Quad(BLUR_SHADER);
    this.applyPass = new ShaderPass(APPLY_SHADER);
    this._makeTargets(width, height);
  }

  _makeTargets(width, height) {
    const w = Math.max(2, Math.round(width * this.scale));
    const h = Math.max(2, Math.round(height * this.scale));
    for (const t of [this.rtPrep, this.rtAO, this.rtBlur]) if (t) t.dispose();

    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    this.rtPrep = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depth,
    });
    this.rtAO = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
    this.rtBlur = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });

    this.ao.material.uniforms.tNormal.value = this.rtPrep.texture;
    this.ao.material.uniforms.tDepth.value = depth;
    this.ao.material.uniforms.resolution.value.set(w, h);
    this.blur.material.uniforms.tDepth.value = depth;
    this.blur.material.uniforms.texel.value.set(1 / w, 1 / h);
    this.applyPass.uniforms.tAO.value = this.rtBlur.texture;
  }

  setSize(width, height) { this._makeTargets(width, height); }

  /** Forza dell'effetto: 0 lo spegne senza toccare la catena dei passaggi. */
  setIntensity(v) {
    this.intensity = v;
    this.applyPass.uniforms.intensity.value = v;
  }

  /**
   * Da chiamare prima del rendering della catena: prepara la mappa di
   * occlusione per la vista corrente.
   */
  update(scene, camera) {
    if (!this.enabled || this.intensity <= 0.001) return;
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;

    // --- normali e profondita'
    const cam = this.depthCamera;
    cam.fov = camera.fov;
    cam.aspect = camera.aspect;
    cam.near = camera.near;
    cam.far = this.far;
    cam.position.copy(camera.position);
    cam.quaternion.copy(camera.quaternion);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    /*
     * Cupola del cielo, nuvole, stelle e luna vanno nascoste: con il
     * materiale delle normali diventerebbero geometria solida davanti a
     * tutto, e l'occlusione le prenderebbe per un muro.
     */
    const hidden = [];
    for (const o of this.skip) {
      if (o && o.visible) { o.visible = false; hidden.push(o); }
    }

    scene.overrideMaterial = this.normalMaterial;
    scene.background = null;
    r.setRenderTarget(this.rtPrep);
    r.setClearColor(0x8080ff, 1);
    r.clear(true, true, false);
    r.render(scene, cam);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    for (const o of hidden) o.visible = true;

    // --- occlusione
    const u = this.ao.material.uniforms;
    u.projection.value.copy(cam.projectionMatrix);
    u.inverseProjection.value.copy(cam.projectionMatrixInverse);
    u.cameraNear.value = cam.near;
    u.cameraFar.value = cam.far;
    const bu = this.blur.material.uniforms;
    bu.cameraNear.value = cam.near;
    bu.cameraFar.value = cam.far;
    this.ao.render(r, this.rtAO);

    // --- due sfocature che rispettano i bordi
    const b = this.blur.material.uniforms;
    b.tAO.value = this.rtAO.texture;
    b.direction.value.set(1, 0);
    this.blur.render(r, this.rtBlur);
    b.tAO.value = this.rtBlur.texture;
    b.direction.value.set(0, 1);
    this.blur.render(r, this.rtAO);
    this.applyPass.uniforms.tAO.value = this.rtAO.texture;

    r.setRenderTarget(prevTarget);
  }

  dispose() {
    for (const t of [this.rtPrep, this.rtAO, this.rtBlur]) if (t) t.dispose();
  }
}
