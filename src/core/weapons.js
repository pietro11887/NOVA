/**
 * Arsenale. Tutto guidato dai dati: aggiungere un'arma vuol dire aggiungere
 * una riga qui, il resto (fuoco, HUD, negozio, salvataggio) la trova da sola.
 *
 * kind   'melee' corpo a corpo · 'gun' proiettile istantaneo · 'launcher' razzo
 * rate   secondi fra un colpo e l'altro
 * auto   true = tieni premuto e continua a sparare
 * pellets numero di pallini per colpo (fucile a pompa)
 * spread dispersione in radianti
 * wanted stelle che ti becchi usandola in pubblico
 */
export const WEAPONS = {
  fists: {
    name: 'Pugni', icon: '✊', kind: 'melee', slot: 0,
    dmg: 26, range: 2.0, rate: 0.42, wanted: 1,
  },
  bat: {
    name: 'Mazza da baseball', icon: '🏏', kind: 'melee', slot: 1,
    dmg: 52, range: 2.6, rate: 0.55, wanted: 1, price: 220,
    desc: 'Silenziosa e non serve ricaricarla',
  },
  knife: {
    name: 'Coltello', icon: '🔪', kind: 'melee', slot: 1,
    dmg: 70, range: 2.0, rate: 0.34, wanted: 2, price: 340,
    desc: 'Veloce e fa molto male',
  },
  pistol: {
    name: 'Pistola', icon: '🔫', kind: 'gun', slot: 2,
    dmg: 40, range: 55, rate: 0.30, spread: 0.02, wanted: 1,
    price: 420, ammoPrice: 90, ammoQty: 40, ammoMax: 240, free: 24,
    desc: 'Precisa, il classico',
  },
  smg: {
    name: 'Mitraglietta', icon: '🧨', kind: 'gun', slot: 3,
    dmg: 22, range: 42, rate: 0.085, auto: true, spread: 0.055, wanted: 2,
    price: 1600, ammoPrice: 180, ammoQty: 90, ammoMax: 480, free: 60,
    desc: 'Raffica rapida, poco precisa',
  },
  shotgun: {
    name: 'Fucile a pompa', icon: '💥', kind: 'gun', slot: 4,
    dmg: 17, pellets: 8, range: 20, rate: 0.85, spread: 0.16, wanted: 2,
    price: 2100, ammoPrice: 160, ammoQty: 24, ammoMax: 120, free: 16,
    desc: 'Devastante da vicino',
  },
  rifle: {
    name: 'Fucile d’assalto', icon: '🎖️', kind: 'gun', slot: 5,
    dmg: 34, range: 78, rate: 0.11, auto: true, spread: 0.03, wanted: 3,
    price: 3400, ammoPrice: 240, ammoQty: 90, ammoMax: 420, free: 60,
    desc: 'Il compromesso perfetto',
  },
  sniper: {
    name: 'Fucile di precisione', icon: '🎯', kind: 'gun', slot: 6,
    dmg: 130, range: 220, rate: 1.5, spread: 0.002, wanted: 3, zoom: 2.4,
    price: 5200, ammoPrice: 320, ammoQty: 15, ammoMax: 60, free: 10,
    desc: 'Un colpo, un bersaglio. Zoom sulla mira',
  },
  rpg: {
    name: 'Lanciarazzi', icon: '🚀', kind: 'launcher', slot: 7,
    dmg: 220, range: 110, rate: 2.4, blast: 7.5, wanted: 4,
    price: 9000, ammoPrice: 900, ammoQty: 4, ammoMax: 20, free: 3,
    desc: 'Fa saltare in aria qualsiasi cosa',
  },
};

/** Ordine dei tasti / della rotellina: per slot, poi per prezzo. */
export const WEAPON_ORDER = Object.keys(WEAPONS)
  .sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot);

export const isGun = (id) => WEAPONS[id] && WEAPONS[id].kind !== 'melee';
