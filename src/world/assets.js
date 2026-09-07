import * as THREE from 'three';

/**
 * Set di texture PBR fotografiche (sorgente ambientCG, licenza CC0).
 *
 * Ogni set sono tre file preparati da tools/pack-textures.mjs:
 *   _c  colore base            (sRGB)
 *   _n  normali OpenGL         (lineare)
 *   _s  R rugosita' | G altezza | B occlusione   (lineare)
 *
 * Il canale altezza serve al parallax: e' quello che da' profondita' vera
 * a crepe e giunti invece di lasciarli disegnati sul piatto.
 *
 * Nella versione a file unico le immagini sono gia' dentro la pagina come
 * data URI (globalThis.NOVA_TEX); servite da cartella si caricano invece
 * da assets/tex/.
 */
export const PBR_SETS = ['asphalt', 'concrete'];

const BASE = 'assets/tex/';
const url = (name) => (globalThis.NOVA_TEX && globalThis.NOVA_TEX[name]) || BASE + name;

/** Carica un set e restituisce { map, normalMap, packMap }. */
function loadSet(loader, name, aniso) {
  const one = (suffix, srgb) => {
    const t = loader.load(url(`${name}_${suffix}.jpg`));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    return t;
  };
  return { map: one('c', true), normalMap: one('n', false), packMap: one('s', false) };
}

/**
 * Carica tutti i set. Aspetta davvero che le immagini siano decodificate:
 * i materiali si costruiscono dopo, e una texture non ancora pronta
 * lascerebbe la strada bianca al primo fotogramma.
 */
export function loadPBRSets(anisotropy = 8, names = PBR_SETS) {
  return new Promise((resolve) => {
    if (!names.length) { resolve(null); return; }
    const manager = new THREE.LoadingManager();
    const loader = new THREE.TextureLoader(manager);
    let broken = false;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok ? sets : null);
    };
    manager.onError = () => { broken = true; };
    manager.onLoad = () => finish(!broken);
    // rete lenta o file mancanti: dopo 20 s si parte comunque, con le
    // texture disegnate a mano invece delle fotografie
    setTimeout(() => finish(false), 20000);
    const sets = {};
    for (const n of names) sets[n] = loadSet(loader, n, anisotropy);
  });
}
