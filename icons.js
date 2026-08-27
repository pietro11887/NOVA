// ============================================================
// NOVA — libreria di illustrazioni SVG (ingredienti, strumenti, piatti)
// Stile: flat, senza contorni, ombra morbida a terra per coerenza.
// ============================================================

(function () {
  // --- palette condivisa ---
  const K = {
    red: "#d94f3d", red2: "#b13a2c", tom: "#e2574a",
    green: "#5f9e4a", green2: "#437534", leaf: "#6fae53", dgreen: "#3f6b31",
    cream: "#f6ead2", cream2: "#e9d7ae",
    pasta: "#eec96f", pasta2: "#d9a83f",
    brown: "#9a6b42", brown2: "#77492a",
    choco: "#5d3a24", choco2: "#432a19",
    cheese: "#f4c14f", cheese2: "#dfa32e",
    white: "#faf6ee", off: "#efe9db",
    pink: "#eb9486", meat: "#c96b5b", meat2: "#a34c3e",
    salmon: "#ef8f6a", salmon2: "#d76f4b",
    orange: "#ef9b3f", purple: "#6f4a85",
    metal: "#aab2ba", metal2: "#828b93", dark: "#4a4f54",
    glass: "#dfe5e8", blue: "#4a7fb5",
    shadow: "rgba(0,0,0,.09)",
  };

  const wrap = (inner, size, vb) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

  // ombra a terra comune (griglia 48)
  const sh = `<ellipse cx="24" cy="42" rx="13" ry="3" fill="${K.shadow}"/>`;

  // --- primitive riusabili (griglia 48) ---
  const can = (label, dots = "") =>
    sh +
    `<rect x="13" y="12" width="22" height="26" rx="3" fill="${K.metal}"/>
     <ellipse cx="24" cy="12" rx="11" ry="3.4" fill="${K.glass}"/>
     <ellipse cx="24" cy="12" rx="8" ry="2.2" fill="${K.metal2}"/>
     <rect x="13" y="19" width="22" height="12" fill="${label}"/>${dots}`;
  const jar = (content, lid = K.metal2) =>
    sh +
    `<rect x="14" y="15" width="20" height="24" rx="5" fill="${content}"/>
     <rect x="14" y="15" width="6" height="24" rx="3" fill="rgba(255,255,255,.22)"/>
     <rect x="12" y="9" width="24" height="8" rx="3" fill="${lid}"/>`;
  const tub = (band) =>
    sh +
    `<path d="M12 20h24l-2.5 18a3 3 0 01-3 2.6h-13A3 3 0 0114.5 38z" fill="${K.white}"/>
     <rect x="10" y="15" width="28" height="7" rx="3.5" fill="${band}"/>`;
  const carton = (band) =>
    sh +
    `<path d="M15 16h18v22a2 2 0 01-2 2H17a2 2 0 01-2-2z" fill="${K.white}"/>
     <path d="M15 16l4-7h10l4 7z" fill="${K.off}"/>
     <rect x="15" y="24" width="18" height="7" fill="${band}"/>`;
  const spiceJar = (powder) =>
    sh +
    `<rect x="16" y="17" width="16" height="22" rx="4" fill="${K.glass}"/>
     <path d="M16 27h16v8a4 4 0 01-4 4h-8a4 4 0 01-4-4z" fill="${powder}"/>
     <rect x="15" y="11" width="18" height="7" rx="2.5" fill="${K.metal2}"/>`;
  const wedge = (body, rind, spots = "") =>
    sh +
    `<path d="M6 36 L42 36 L24 12 Z" fill="${body}"/>
     <path d="M6 36h36v4a2 2 0 01-2 2H8a2 2 0 01-2-2z" fill="${rind}"/>${spots}`;
  const leaves = (color, d1, d2, d3 = "") =>
    sh + `<path d="${d1}" fill="${color}"/><path d="${d2}" fill="${color}" opacity=".82"/>${d3 ? `<path d="${d3}" fill="${color}" opacity=".65"/>` : ""}`;

  // --- icone ingredienti (griglia 48) ---
  const ICONS = {
    // dispensa
    spaghetti: sh + `<rect x="17" y="6" width="14" height="36" rx="2" fill="${K.pasta}"/>
      <path d="M20 6v36M24 6v36M28 6v36" stroke="${K.pasta2}" stroke-width="1.6"/>
      <rect x="14" y="20" width="20" height="9" rx="2" fill="${K.red}"/>`,
    penne: sh + `<g>
      <rect x="7" y="18" width="21" height="8" rx="4" fill="${K.pasta}" transform="rotate(-24 17 22)"/>
      <rect x="17" y="24" width="21" height="8" rx="4" fill="${K.pasta}" transform="rotate(-24 27 28)"/>
      <rect x="13" y="31" width="21" height="8" rx="4" fill="${K.pasta2}" transform="rotate(-24 23 35)"/></g>`,
    rice: sh + `<path d="M9 25a15 15 0 0030 0z" fill="${K.tom}"/>
      <ellipse cx="24" cy="24" rx="13" ry="5.5" fill="${K.white}"/>
      <circle cx="18" cy="22" r="1.3" fill="${K.off}"/><circle cx="25" cy="21" r="1.3" fill="${K.off}"/><circle cx="30" cy="23" r="1.3" fill="${K.off}"/>`,
    gnocchi: sh + `<g fill="${K.cream}">
      <ellipse cx="15" cy="30" rx="7" ry="5.5"/><ellipse cx="30" cy="30" rx="7" ry="5.5"/><ellipse cx="22.5" cy="19" rx="7" ry="5.5"/></g>
      <path d="M11 30h8M26 30h8M19 19h8" stroke="${K.cream2}" stroke-width="1.6" stroke-linecap="round"/>`,
    couscous: sh + `<path d="M9 25a15 15 0 0030 0z" fill="${K.brown}"/>
      <ellipse cx="24" cy="24" rx="13" ry="5.5" fill="${K.pasta}"/>
      <circle cx="18" cy="23" r="1.4" fill="${K.pasta2}"/><circle cx="24" cy="21.5" r="1.4" fill="${K.pasta2}"/><circle cx="30" cy="23.5" r="1.4" fill="${K.pasta2}"/>`,
    noodles: sh + `<path d="M13 16h22l-2.6 22a3 3 0 01-3 2.7H18.6a3 3 0 01-3-2.7z" fill="${K.tom}"/>
      <rect x="13" y="21" width="22" height="6" fill="${K.white}" opacity=".9"/>
      <path d="M15 12c3 3 6-3 9 0s6-3 9 0" stroke="${K.pasta}" stroke-width="3" stroke-linecap="round"/>`,
    flour: sh + `<path d="M13 15c0-3 22-3 22 0v20a5 5 0 01-5 5H18a5 5 0 01-5-5z" fill="${K.off}"/>
      <path d="M13 15c0-3 22-3 22 0" stroke="${K.cream2}" stroke-width="2"/>
      <rect x="17" y="22" width="14" height="10" rx="2" fill="${K.white}"/>
      <path d="M20 27h8" stroke="${K.pasta2}" stroke-width="2" stroke-linecap="round"/>`,
    crumbs: jar(K.cream2) + `<circle cx="21" cy="24" r="1.2" fill="${K.brown}"/><circle cx="28" cy="29" r="1.2" fill="${K.brown}"/><circle cx="23" cy="33" r="1.2" fill="${K.brown}"/>`,
    sugar: sh + `<g fill="${K.white}" stroke="${K.off}" stroke-width="1.4">
      <rect x="12" y="24" width="12" height="12" rx="2"/>
      <rect x="24" y="24" width="12" height="12" rx="2"/>
      <rect x="18" y="13" width="12" height="12" rx="2"/></g>`,
    packet: sh + `<rect x="12" y="12" width="24" height="28" rx="3" fill="${K.tom}"/>
      <path d="M12 18h24" stroke="${K.white}" stroke-width="2" stroke-dasharray="3 2"/>
      <path d="M24 24l2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7z" fill="${K.pasta}"/>`,
    passata: sh + `<rect x="16" y="14" width="16" height="26" rx="4" fill="${K.red}"/>
      <rect x="16" y="14" width="5" height="26" rx="2.5" fill="rgba(255,255,255,.2)"/>
      <rect x="19" y="8" width="10" height="8" rx="2" fill="${K.green2}"/>
      <rect x="16" y="24" width="16" height="9" fill="${K.white}" opacity=".85"/>
      <circle cx="24" cy="28.5" r="3" fill="${K.red}"/>`,
    "can-tuna": sh + `<ellipse cx="24" cy="31" rx="15" ry="6" fill="${K.metal2}"/>
      <rect x="9" y="22" width="30" height="9" fill="${K.blue}"/>
      <ellipse cx="24" cy="22" rx="15" ry="6" fill="${K.glass}"/>
      <ellipse cx="24" cy="22" rx="11" ry="4" fill="${K.metal}"/>`,
    "can-ceci": can(K.pasta, `<circle cx="19" cy="25" r="2" fill="${K.cream}"/><circle cx="26" cy="25" r="2" fill="${K.cream}"/><circle cx="22.5" cy="28.5" r="2" fill="${K.cream}"/>`),
    "can-cannellini": can(K.green, `<ellipse cx="20" cy="25" rx="2.5" ry="1.6" fill="${K.white}"/><ellipse cx="27" cy="26" rx="2.5" ry="1.6" fill="${K.white}"/>`),
    "can-lenticchie": can(K.brown, `<circle cx="19" cy="25" r="1.7" fill="${K.cream}"/><circle cx="25" cy="27" r="1.7" fill="${K.cream}"/><circle cx="29" cy="24" r="1.7" fill="${K.cream}"/>`),
    "can-mais": can(K.cheese, `<circle cx="19" cy="25" r="1.8" fill="#fbe27a"/><circle cx="25" cy="27" r="1.8" fill="#fbe27a"/><circle cx="29" cy="24" r="1.8" fill="#fbe27a"/>`),
    "can-cocco": can(K.white, `<circle cx="24" cy="25" r="3" fill="${K.brown2}"/><circle cx="23" cy="24" r="1" fill="${K.white}"/>`),
    olives: sh + `<path d="M10 26a14 14 0 0028 0z" fill="${K.cream}"/>
      <g fill="${K.green}"><ellipse cx="17" cy="24" rx="4" ry="3.2"/><ellipse cx="25" cy="22" rx="4" ry="3.2"/><ellipse cx="31" cy="25" rx="4" ry="3.2"/></g>
      <circle cx="17" cy="24" r="1.2" fill="${K.red}"/><circle cx="25" cy="22" r="1.2" fill="${K.red}"/>`,
    "jar-pesto": jar(K.leaf),
    dado: sh + `<rect x="13" y="17" width="22" height="20" rx="3" fill="${K.cheese}"/>
      <path d="M13 24h22M24 17v20" stroke="${K.cheese2}" stroke-width="1.6"/>
      <path d="M13 17l4-5h18l-4 5z" fill="${K.cheese2}"/>`,
    zafferano: sh + `<rect x="13" y="14" width="22" height="24" rx="3" fill="${K.cream}"/>
      <path d="M18 22c2 4 1 8-1 11M24 21c1 5 0 9-1 12M30 22c0 4-1 8-3 11" stroke="${K.red}" stroke-width="2" stroke-linecap="round"/>`,
    "bottle-oil": sh + `<path d="M20 8h8v7c4 2 6 5 6 10v11a4 4 0 01-4 4H18a4 4 0 01-4-4V25c0-5 2-8 6-10z" fill="#e8c34e"/>
      <rect x="19" y="5" width="10" height="5" rx="1.5" fill="${K.dark}"/>
      <path d="M17 27v9" stroke="rgba(255,255,255,.4)" stroke-width="2.5" stroke-linecap="round"/>`,
    // verdure
    cherrytomato: sh + `<circle cx="17" cy="28" r="8.5" fill="${K.tom}"/><circle cx="31" cy="26" r="7" fill="${K.tom}"/>
      <path d="M17 19l-2-4M31 19l2-4" stroke="${K.green2}" stroke-width="2" stroke-linecap="round"/>
      <path d="M13 21h8M28 20h6" stroke="${K.green}" stroke-width="2" stroke-linecap="round"/>`,
    tomato: sh + `<circle cx="24" cy="27" r="13" fill="${K.tom}"/>
      <path d="M24 14c-2-2-5-3-7-2 2 2 4 3 7 2zm0 0c2-2 5-3 7-2-2 2-4 3-7 2z" fill="${K.green}"/>
      <circle cx="19" cy="23" r="3" fill="rgba(255,255,255,.25)"/>`,
    onion: sh + `<circle cx="24" cy="27" r="12.5" fill="#d9955d"/>
      <path d="M24 15v25M16 18c-3 6-3 12 0 17M32 18c3 6 3 12 0 17" stroke="#b9743d" stroke-width="1.8" fill="none"/>
      <path d="M24 14c0-4 2-6 2-6s2 3-2 6z" fill="${K.green}"/>`,
    garlic: sh + `<path d="M24 12c-2 5-11 7-11 17a11 9 0 0022 0c0-10-9-12-11-17z" fill="${K.white}"/>
      <path d="M19 22c-1 4-1 9 0 13M29 22c1 4 1 9 0 13M24 20v16" stroke="${K.off}" stroke-width="1.8"/>
      <path d="M24 12c0-3 1.5-5 1.5-5" stroke="${K.green}" stroke-width="2" stroke-linecap="round"/>`,
    zucchini: sh + `<rect x="8" y="19" width="32" height="12" rx="6" fill="${K.green}" transform="rotate(-18 24 25)"/>
      <path d="M12 25h24" stroke="#79b862" stroke-width="2.4" stroke-linecap="round" transform="rotate(-18 24 25)"/>
      <circle cx="39" cy="18" r="2.6" fill="${K.green2}"/>`,
    eggplant: sh + `<path d="M28 16c8 2 10 9 8 15-2 7-10 10-16 7-7-3-8-11-3-16 4-4 7-4 11-6z" fill="${K.purple}"/>
      <path d="M28 16c1-3 4-5 4-5" stroke="${K.green2}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M23 14c3 3 8 3 10 2-1 3-5 5-8 4z" fill="${K.green}"/>`,
    bellpepper: sh + `<path d="M15 20c-3 3-4 9-2 13 2 5 7 7 11 7s9-2 11-7c2-4 1-10-2-13-3-4-15-4-18 0z" fill="${K.orange}"/>
      <path d="M19 21c-1 5-1 10 1 15M29 21c1 5 1 10-1 15" stroke="#d67f26" stroke-width="1.8"/>
      <rect x="22" y="10" width="4" height="8" rx="2" fill="${K.green2}"/>`,
    potato: sh + `<ellipse cx="24" cy="27" rx="14" ry="10.5" fill="#c99a63" transform="rotate(-12 24 27)"/>
      <circle cx="18" cy="24" r="1.3" fill="#a87b46"/><circle cx="28" cy="29" r="1.3" fill="#a87b46"/><circle cx="30" cy="22" r="1.3" fill="#a87b46"/>`,
    carrot: sh + `<path d="M14 38 L30 15 c3-4 8 0 5 4 L21 41 c-3 3 -8 0 -7-3z" fill="${K.orange}"/>
      <path d="M22 30l5 3M27 24l4 3" stroke="#d67f26" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M33 14l3-6M35 17l6-3M31 12l0-6" stroke="${K.green}" stroke-width="2.4" stroke-linecap="round"/>`,
    mushroom: sh + `<path d="M10 24c0-8 7-13 14-13s14 5 14 13c0 2-1 3-3 3H13c-2 0-3-1-3-3z" fill="#b58455"/>
      <path d="M19 27h10l-1.5 11a3 3 0 01-3 2.7A3 3 0 0121 38z" fill="${K.cream}"/>
      <circle cx="18" cy="20" r="2" fill="#d3a97b"/><circle cx="28" cy="18" r="2" fill="#d3a97b"/>`,
    spinach: leaves(K.dgreen,
      "M14 38c-4-8 0-16 8-19 1 8-1 15-8 19z",
      "M24 38c-2-9 3-16 11-18 0 9-3 15-11 18z",
      "M22 20c0-5 3-9 7-10 0 5-2 8-7 10z"),
    lettuce: sh + `<circle cx="24" cy="26" r="13.5" fill="${K.leaf}"/>
      <path d="M13 22c3-4 8-6 11-6M35 22c-3-4-8-6-11-6" stroke="#8cc474" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M15 32c2-6 6-9 9-10M33 32c-2-6-6-9-9-10" stroke="#8cc474" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
    rucola: leaves(K.green2,
      "M16 40c-2-10 1-19 5-24 2 6 2 17-5 24z",
      "M25 40c0-10 4-18 9-22 1 7-2 16-9 22z"),
    basil: leaves(K.leaf,
      "M13 36c-2-9 4-17 11-18 2 8-2 16-11 18z",
      "M26 34c0-8 5-13 10-14 1 7-3 13-10 14z"),
    parsley: sh + `<path d="M24 40V24" stroke="${K.green}" stroke-width="2.2" stroke-linecap="round"/>
      <g fill="${K.leaf}"><circle cx="16" cy="18" r="5"/><circle cx="24" cy="13" r="5.5"/><circle cx="32" cy="18" r="5"/><circle cx="19" cy="24" r="4.5"/><circle cx="29" cy="24" r="4.5"/></g>`,
    rosemary: sh + `<path d="M24 42V10" stroke="#7c9a6d" stroke-width="2.4" stroke-linecap="round"/>
      <g stroke="${K.dgreen}" stroke-width="2" stroke-linecap="round">
      <path d="M24 14l-6-4M24 14l6-4M24 20l-7-3M24 20l7-3M24 26l-7-2M24 26l7-2M24 32l-6-2M24 32l6-2"/></g>`,
    // frutta
    lemon: sh + `<ellipse cx="24" cy="27" rx="14" ry="10" fill="#f2d13c"/>
      <circle cx="9.5" cy="27" r="2.2" fill="#e0bd25"/><circle cx="38.5" cy="27" r="2.2" fill="#e0bd25"/>
      <path d="M30 16c2-3 6-4 8-3-1 3-4 5-8 3z" fill="${K.leaf}"/>`,
    banana: sh + `<path d="M10 18c2 12 12 20 24 18 3 0 4 3 1 4-16 4-30-8-29-22 0-3 3-3 4 0z" fill="#f2d13c"/>
      <rect x="7" y="13" width="5" height="6" rx="2" fill="#8a6d3b"/>`,
    apple: sh + `<path d="M24 17c6-6 15-2 15 7 0 8-6 15-11 15-2 0-3-1-4-1s-2 1-4 1c-5 0-11-7-11-15 0-9 9-13 15-7z" fill="${K.tom}"/>
      <path d="M24 16c0-4 2-6 4-7" stroke="#6d4a2a" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M27 11c3-2 6-1 7 0-1 2-4 3-7 0z" fill="${K.leaf}"/>`,
    strawberry: sh + `<path d="M24 40c-8-3-13-9-13-16 0-6 5-9 13-9s13 3 13 9c0 7-5 13-13 16z" fill="${K.red}"/>
      <g fill="#f7dfae"><circle cx="18" cy="24" r="1.2"/><circle cx="26" cy="22" r="1.2"/><circle cx="31" cy="27" r="1.2"/><circle cx="21" cy="31" r="1.2"/><circle cx="27" cy="33" r="1.2"/></g>
      <path d="M18 15l6-3 6 3-6 3z" fill="${K.leaf}"/>`,
    berries: sh + `<circle cx="16" cy="24" r="8" fill="#5b5ea6"/><circle cx="30" cy="20" r="6.5" fill="#7b4f8f"/><circle cx="28" cy="32" r="7" fill="#3f4e9c"/>
      <circle cx="16" cy="24" r="2.4" fill="rgba(255,255,255,.28)"/><circle cx="30" cy="20" r="1.8" fill="rgba(255,255,255,.28)"/>`,
    orange: sh + `<circle cx="24" cy="27" r="13.5" fill="${K.orange}"/>
      <circle cx="24" cy="27" r="9" fill="#f7b25c"/>
      <path d="M24 18v18M15 27h18M18 21l12 12M30 21L18 33" stroke="${K.orange}" stroke-width="1.8"/>
      <path d="M28 14c2-3 6-4 8-3-1 3-4 5-8 3z" fill="${K.leaf}"/>`,
    // carne e pesce
    chicken: sh + `<ellipse cx="20" cy="22" rx="12" ry="10.5" fill="#e8b287" transform="rotate(-20 20 22)"/>
      <path d="M28 30l8 8" stroke="${K.white}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="38" cy="40" r="3.4" fill="${K.white}"/><circle cx="34" cy="42.5" r="3.4" fill="${K.white}"/>`,
    mince: sh + `<path d="M10 34a14 9 0 0128 0z" fill="${K.meat}"/>
      <g stroke="${K.pink}" stroke-width="2" stroke-linecap="round">
      <path d="M15 30c2-2 4-2 6 0M23 27c2-2 4-2 6 0M28 31c2-2 4-2 6 0M18 24c2-2 4-2 6 0"/></g>`,
    sausage: sh + `<rect x="6" y="22" width="17" height="10" rx="5" fill="${K.meat2}" transform="rotate(-14 14 27)"/>
      <rect x="25" y="20" width="17" height="10" rx="5" fill="${K.meat2}" transform="rotate(14 34 25)"/>
      <path d="M23 24l2-1" stroke="${K.brown2}" stroke-width="2" stroke-linecap="round"/>`,
    cutlet: sh + `<ellipse cx="24" cy="26" rx="15" ry="10" fill="${K.pink}" transform="rotate(-8 24 26)"/>
      <ellipse cx="24" cy="26" rx="9" ry="5.5" fill="#f3b3a4" transform="rotate(-8 24 26)"/>`,
    salmon: sh + `<path d="M9 33c1-10 8-17 18-19 6-1 13 1 12 4-6 13-14 17-24 17-4 0-6-1-6-2z" fill="${K.salmon}"/>
      <path d="M15 30c4-1 9-5 12-10M21 32c4-2 8-6 10-11" stroke="${K.white}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
    // uova e latticini
    egg: sh + `<path d="M24 9c7 0 12 9 12 17a12 12 0 01-24 0c0-8 5-17 12-17z" fill="${K.white}"/>
      <path d="M18 20c-1 2-2 4-2 6" stroke="${K.off}" stroke-width="2.4" stroke-linecap="round"/>`,
    milk: carton(K.blue),
    butter: sh + `<path d="M10 26h28v8a3 3 0 01-3 3H13a3 3 0 01-3-3z" fill="${K.cheese}"/>
      <path d="M10 26l5-7h28l-5 7z" fill="#f7d97c"/><path d="M38 26l5-7v8l-5 7z" fill="${K.cheese2}"/>`,
    cream: carton(K.pink),
    yogurt: sh + `<path d="M14 18h20l-2 19a3 3 0 01-3 2.7h-10A3 3 0 0116 37z" fill="${K.white}"/>
      <rect x="12" y="13" width="24" height="6" rx="2" fill="${K.blue}"/>
      <rect x="14" y="24" width="20" height="6" fill="${K.blue}" opacity=".18"/>`,
    "yogurt-greek": sh + `<path d="M14 18h20l-2 19a3 3 0 01-3 2.7h-10A3 3 0 0116 37z" fill="${K.white}"/>
      <rect x="12" y="13" width="24" height="6" rx="2" fill="#3a6ea5"/>
      <path d="M17 27c2-2.4 4-2.4 6 0s4 2.4 6 0" stroke="#3a6ea5" stroke-width="2" stroke-linecap="round" fill="none"/>`,
    // formaggi
    parm: wedge("#f2d888", "#c9a144", `<circle cx="22" cy="28" r="1.1" fill="#e0bd5c"/><circle cx="28" cy="32" r="1.1" fill="#e0bd5c"/><circle cx="18" cy="33" r="1.1" fill="#e0bd5c"/>`),
    pecorino: wedge(K.cream, "#8a6d3b"),
    mozzarella: sh + `<path d="M9 27a15 15 0 0030 0z" fill="#bcd3e8"/>
      <circle cx="24" cy="25" r="10.5" fill="${K.white}"/>
      <path d="M19 21c1-2 4-3 6-2" stroke="${K.off}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
    "tub-mascarpone": tub("#3a6ea5"),
    "tub-spread": tub(K.green),
    "cheese-slices": sh + `<rect x="11" y="14" width="26" height="26" rx="2" fill="#f7d97c" transform="rotate(-4 24 27)"/>
      <rect x="11" y="18" width="26" height="22" rx="2" fill="${K.cheese}" transform="rotate(3 24 29)"/>
      <path d="M37 22l-6 6v-6z" fill="#f7d97c" transform="rotate(3 24 29)"/>`,
    // salumi
    bacon: sh + `<rect x="10" y="14" width="28" height="26" rx="4" fill="${K.pink}"/>
      <path d="M15 14v26M22 14v26M29 14v26" stroke="${K.white}" stroke-width="3.4"/>
      <path d="M18.5 14v26M25.5 14v26M33 14v26" stroke="${K.meat}" stroke-width="2.6"/>`,
    bacon2: sh + `<circle cx="24" cy="26" r="13.5" fill="${K.pink}"/>
      <path d="M24 26m-9 0a9 9 0 019-9 9 9 0 016 15 6 6 0 01-9-6 3.5 3.5 0 013.5-3.5" stroke="${K.white}" stroke-width="3" fill="none"/>`,
    ham: sh + `<path d="M10 30c0-7 6-12 14-12s14 5 14 12c0 3-2 5-4 4-2-1-4 2-7 2s-4-3-7-2c-3 1-6 1-8-1-1-1-2-2-2-3z" fill="#efa8a0"/>
      <path d="M14 27c2-4 6-6 10-6" stroke="${K.white}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
    prosciutto: sh + `<path d="M10 30c0-7 6-12 14-12s14 5 14 12c0 3-2 5-4 4-2-1-4 2-7 2s-4-3-7-2c-3 1-6 1-8-1-1-1-2-2-2-3z" fill="#c96b6b"/>
      <path d="M13 28c2-4 6-7 11-7M19 33c3-2 6-4 8-7" stroke="${K.white}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`,
    // pane
    bread: sh + `<path d="M8 30c0-9 7-15 16-15s16 6 16 15c0 4-3 7-7 7H15c-4 0-7-3-7-7z" fill="#d8a35c"/>
      <path d="M17 20l-3 8M25 19l-3 9M33 20l-3 8" stroke="#b9834a" stroke-width="2.2" stroke-linecap="round"/>`,
    toastbread: sh + `<path d="M10 20c0-5 4-8 7-8 2-2 12-2 14 0 3 0 7 3 7 8 0 2-1 3-2 4v14a3 3 0 01-3 3H15a3 3 0 01-3-3V24c-1-1-2-2-2-4z" fill="#e3b877"/>
      <path d="M16 24h16v13H16z" fill="${K.cream}"/>`,
    piadina: sh + `<path d="M8 30a16 16 0 0132 0z" fill="#eed9a9"/>
      <path d="M8 30h32" stroke="#d8b96e" stroke-width="2"/>
      <circle cx="18" cy="24" r="1.4" fill="#d8b96e"/><circle cx="27" cy="21" r="1.4" fill="#d8b96e"/><circle cx="33" cy="26" r="1.4" fill="#d8b96e"/>`,
    bun: sh + `<path d="M9 26c0-7 7-12 15-12s15 5 15 12z" fill="#e3a95c"/>
      <rect x="9" y="27" width="30" height="4" rx="2" fill="${K.leaf}"/>
      <path d="M9 33h30v2a5 5 0 01-5 5H14a5 5 0 01-5-5z" fill="#e3a95c"/>
      <g fill="${K.cream}"><ellipse cx="17" cy="19" rx="1.6" ry="1"/><ellipse cx="24" cy="17" rx="1.6" ry="1"/><ellipse cx="31" cy="19" rx="1.6" ry="1"/></g>`,
    // spezie
    chili: sh + `<path d="M13 36C13 24 20 15 32 13c4-1 6 2 3 4-8 5-12 12-14 20-1 4-8 3-8-1z" fill="${K.red}"/>
      <path d="M33 13c2-2 5-3 7-2" stroke="${K.green2}" stroke-width="2.4" stroke-linecap="round"/>`,
    "spice-curry": spiceJar("#d99a2b"),
    "spice-paprika": spiceJar("#c1442e"),
    "spice-origano": spiceJar("#7c9a56"),
    cinnamon: sh + `<rect x="9" y="20" width="30" height="7" rx="3.5" fill="#a5653a" transform="rotate(-14 24 24)"/>
      <rect x="11" y="28" width="30" height="7" rx="3.5" fill="#8a4f2c" transform="rotate(-14 26 31)"/>
      <circle cx="10" cy="23" r="2.6" fill="#7a4526" transform="rotate(-14 24 24)"/>`,
    soy: sh + `<path d="M19 16h10v5c3 2 5 5 5 9v6a4 4 0 01-4 4H18a4 4 0 01-4-4v-6c0-4 2-7 5-9z" fill="#3b2a20"/>
      <rect x="19" y="10" width="10" height="7" rx="2" fill="${K.red}"/>
      <rect x="17" y="26" width="14" height="8" rx="2" fill="${K.cream}"/>`,
    // dolci
    "jar-choc": jar(K.choco),
    "jar-jam": jar("#c13f4e"),
    "jar-cacao": jar(K.brown2),
    honey: sh + `<path d="M14 18h20v16a6 6 0 01-6 6h-8a6 6 0 01-6-6z" fill="#e8a53c"/>
      <path d="M14 24h20M14 30h20" stroke="#d18f28" stroke-width="2.4"/>
      <rect x="13" y="12" width="22" height="7" rx="3" fill="#8a6d3b"/>`,
    cookie: sh + `<circle cx="24" cy="26" r="13.5" fill="#dda85e"/>
      <g fill="${K.choco}"><circle cx="19" cy="21" r="2.2"/><circle cx="29" cy="24" r="2.2"/><circle cx="21" cy="31" r="2.2"/><circle cx="28" cy="31.5" r="1.7"/></g>`,
    savoiardi: sh + `<rect x="8" y="17" width="32" height="10" rx="5" fill="#eeca82"/>
      <rect x="8" y="29" width="32" height="10" rx="5" fill="#e3b866"/>
      <g fill="${K.white}"><circle cx="16" cy="22" r="1"/><circle cx="24" cy="21" r="1"/><circle cx="32" cy="22" r="1"/></g>`,
    chocolate: sh + `<rect x="11" y="11" width="26" height="30" rx="3" fill="${K.choco}"/>
      <path d="M11 21h26M11 31h26M24 11v30" stroke="${K.choco2}" stroke-width="2"/>
      <rect x="11" y="11" width="26" height="10" fill="${K.red}" opacity=".85"/>`,
    chips: sh + `<g fill="${K.choco}">
      <path d="M16 20c4 0 6 3 6 6a6 6 0 11-12 0c0-3 2-6 6-6z" transform="translate(0 4)"/>
      <path d="M30 14c4 0 6 3 6 6a6 6 0 11-12 0c0-3 2-6 6-6z"/>
      <path d="M30 28c3.4 0 5 2.5 5 5a5 5 0 11-10 0c0-2.5 1.6-5 5-5z"/></g>`,
    icecream: sh + `<path d="M17 24h14l-5.5 16a1.8 1.8 0 01-3 0z" fill="#e3a95c"/>
      <circle cx="24" cy="17" r="9" fill="${K.cream}"/>
      <circle cx="20" cy="14" r="1.4" fill="${K.cream2}"/><circle cx="27" cy="18" r="1.4" fill="${K.cream2}"/>`,
    coffee: sh + `<path d="M13 14h22v22a4 4 0 01-4 4H17a4 4 0 01-4-4z" fill="#6d4a2a"/>
      <path d="M13 14c0-3 22-3 22 0" stroke="#57391f" stroke-width="2"/>
      <ellipse cx="24" cy="28" rx="6" ry="7.5" fill="#8a6135"/>
      <path d="M24 21c-2 3-2 12 0 15" stroke="#57391f" stroke-width="2" fill="none"/>`,
    walnut: sh + `<circle cx="24" cy="26" r="13" fill="#b58455"/>
      <path d="M24 13v26M24 26c-5-2-7-7-6-11M24 26c5-2 7-7 6-11M24 26c-5 2-7 7-6 10M24 26c5 2 7 7 6 10" stroke="#8a5f36" stroke-width="2" fill="none"/>`,
  };

  // --- icone strumenti (griglia 48) ---
  const APPS = {
    stove: sh + `<rect x="8" y="14" width="32" height="26" rx="4" fill="${K.dark}"/>
      <circle cx="24" cy="27" r="10" fill="#2e3236"/>
      <circle cx="24" cy="27" r="6.5" stroke="${K.orange}" stroke-width="2.4" fill="none"/>
      <circle cx="24" cy="27" r="2" fill="${K.orange}"/>
      <path d="M24 17v3M14 27h3M31 27h3M24 34v3" stroke="${K.metal2}" stroke-width="2" stroke-linecap="round"/>`,
    oven: sh + `<rect x="9" y="10" width="30" height="30" rx="4" fill="${K.metal}"/>
      <rect x="13" y="20" width="22" height="16" rx="2.5" fill="#2e3236"/>
      <rect x="16" y="23" width="16" height="10" rx="1.5" fill="${K.orange}" opacity=".8"/>
      <circle cx="15" cy="15" r="1.8" fill="${K.dark}"/><circle cx="21" cy="15" r="1.8" fill="${K.dark}"/>
      <rect x="28" y="13.5" width="8" height="3" rx="1.5" fill="${K.dark}"/>`,
    microwave: sh + `<rect x="6" y="13" width="36" height="24" rx="4" fill="${K.metal}"/>
      <rect x="10" y="17" width="20" height="16" rx="2" fill="#2e3236"/>
      <rect x="13" y="20" width="14" height="10" rx="1.5" fill="#54606b"/>
      <circle cx="36" cy="20" r="2" fill="${K.dark}"/><circle cx="36" cy="26" r="2" fill="${K.dark}"/>
      <rect x="34" y="31" width="4" height="3" rx="1" fill="${K.red}"/>`,
    airfryer: sh + `<path d="M14 10h20a6 6 0 016 6v20a6 6 0 01-6 6H14a6 6 0 01-6-6V16a6 6 0 016-6z" fill="${K.dark}"/>
      <rect x="14" y="13" width="20" height="5" rx="2.5" fill="#2e3236"/>
      <path d="M8 27h32" stroke="#2e3236" stroke-width="2.4"/>
      <rect x="19" y="29" width="10" height="4" rx="2" fill="${K.metal2}"/>
      <circle cx="24" cy="18.5" r="4.6" fill="#2e3236" stroke="${K.metal2}" stroke-width="1.6"/>
      <path d="M24 15.5v6M21 18.5h6" stroke="${K.metal2}" stroke-width="1.4"/>`,
    blender: sh + `<path d="M16 8h16l-2.5 20h-11z" fill="${K.glass}"/>
      <path d="M17.5 14h13l-1.6 12h-9.8z" fill="#e6a1d0" opacity=".75"/>
      <rect x="14" y="28" width="20" height="6" rx="2" fill="${K.metal2}"/>
      <path d="M15 34h18l-2 6H17z" fill="${K.dark}"/>
      <rect x="20" y="4" width="8" height="5" rx="2" fill="${K.dark}"/>`,
    moka: sh + `<path d="M17 26h14l3 11a2.5 2.5 0 01-2.5 3h-15A2.5 2.5 0 0114 37z" fill="${K.metal}"/>
      <path d="M18 25l-2.5-11h17L30 25z" fill="${K.metal2}"/>
      <rect x="21" y="8" width="6" height="5" rx="2" fill="${K.dark}"/>
      <path d="M33 16c4 1 5 5 3 8" stroke="${K.dark}" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M14 17l-3-2" stroke="${K.metal2}" stroke-width="3" stroke-linecap="round"/>`,
    kettle: sh + `<path d="M14 18h20l-2 20a3 3 0 01-3 2.7H19A3 3 0 0116 38z" fill="${K.metal}"/>
      <path d="M14 18c0-3 20-3 20 0" stroke="${K.metal2}" stroke-width="2"/>
      <path d="M34 22c4 0 5 4 2 6" stroke="${K.metal2}" stroke-width="3" stroke-linecap="round" fill="none"/>
      <rect x="21" y="11" width="6" height="5" rx="2" fill="${K.dark}"/>
      <rect x="16" y="26" width="4" height="8" rx="2" fill="${K.glass}"/>`,
  };

  // ============================================================
  // PIATTI (griglia 96)
  // ============================================================
  const plate = (inner) =>
    `<ellipse cx="48" cy="82" rx="35" ry="6" fill="rgba(0,0,0,.13)"/>
     <circle cx="48" cy="47" r="37" fill="#ece5d6"/>
     <circle cx="48" cy="47" r="29.5" fill="#faf7f0"/>${inner}`;
  const bowlBase = (content, inner = "") =>
    `<ellipse cx="48" cy="80" rx="30" ry="5.5" fill="rgba(0,0,0,.13)"/>
     <path d="M14 42h68a34 30 0 01-68 0z" fill="${K.white}"/>
     <path d="M14 42h68a34 30 0 01-1.5 9H15.5a34 30 0 01-1.5-9z" fill="#ece5d6"/>
     <ellipse cx="48" cy="42" rx="34" ry="9" fill="${content}"/>${inner}`;
  const leafG = (x, y, s = 1, c = K.leaf) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0c4-6 10-7 13-6-1 4-6 8-13 6z" fill="${c}"/></g>`;

  const strands = (color) =>
    `<g stroke="${color}" stroke-width="3.6" stroke-linecap="round" fill="none">
      <path d="M27 50c7-11 35-11 42-1"/>
      <path d="M25 44c9-10 37-9 45 1"/>
      <path d="M28 39c9-8 32-8 40 1"/>
      <path d="M33 33c8-6 23-6 30 1"/>
      <path d="M30 55c8 6 28 6 36 0"/>
     </g>`;

  const DISHES = {
    spag: (s) => plate(
      `<circle cx="48" cy="46" r="24" fill="${s.a}" opacity=".35"/>` +
      strands(s.a) +
      (s.g === "chili" ? `<g fill="${K.red}"><circle cx="40" cy="42" r="2"/><circle cx="55" cy="38" r="2"/><circle cx="49" cy="50" r="2"/></g>` + leafG(52, 30) :
       s.g === "guanciale" ? `<g fill="${K.meat}"><rect x="37" y="39" width="7" height="5" rx="1.5"/><rect x="52" y="35" width="7" height="5" rx="1.5"/><rect x="46" y="48" width="7" height="5" rx="1.5"/></g>` :
       s.g === "pepper" ? `<g fill="#3d3d3d"><circle cx="40" cy="41" r="1.5"/><circle cx="54" cy="37" r="1.5"/><circle cx="48" cy="49" r="1.5"/><circle cx="59" cy="46" r="1.5"/></g>` :
       leafG(52, 30))
    ),
    short: (s) => plate(
      `<circle cx="48" cy="46" r="23" fill="${s.a}"/>
       <g fill="${K.pasta}" stroke="${s.a === "#6fae53" ? K.green2 : K.pasta2}" stroke-width="1.4">
        <rect x="32" y="36" width="17" height="7.5" rx="3.7" transform="rotate(-22 40 40)"/>
        <rect x="47" y="32" width="17" height="7.5" rx="3.7" transform="rotate(14 55 36)"/>
        <rect x="36" y="49" width="17" height="7.5" rx="3.7" transform="rotate(8 44 53)"/>
        <rect x="52" y="46" width="17" height="7.5" rx="3.7" transform="rotate(-16 60 50)"/></g>` +
      (s.g === "basil" ? leafG(50, 30) :
       s.g === "chili" ? `<g fill="${K.red2}"><circle cx="42" cy="34" r="2.2"/><circle cx="58" cy="56" r="2.2"/></g>` :
       s.g === "tuna" ? `<g fill="${K.pink}"><circle cx="42" cy="33" r="3.4"/><circle cx="60" cy="55" r="3.4"/><circle cx="36" cy="54" r="3"/></g>` :
       s.g === "cheese" ? `<g fill="${K.white}" opacity=".9"><rect x="40" y="32" width="6" height="4" rx="1" transform="rotate(14 43 34)"/><rect x="56" y="53" width="6" height="4" rx="1" transform="rotate(-10 59 55)"/></g>` : "")
    ),
    gnocchi: () => plate(
      `<circle cx="48" cy="46" r="23" fill="${K.tom}"/>
       <g fill="${K.cream}"><ellipse cx="39" cy="40" rx="6.5" ry="5"/><ellipse cx="55" cy="38" rx="6.5" ry="5"/><ellipse cx="46" cy="50" rx="6.5" ry="5"/><ellipse cx="60" cy="50" rx="6" ry="4.6"/><ellipse cx="34" cy="52" rx="5.6" ry="4.4"/></g>
       <g fill="${K.white}"><circle cx="48" cy="41" r="3.4"/><circle cx="56" cy="46" r="2.8"/></g>` + leafG(50, 28)
    ),
    risotto: (s) => plate(
      `<circle cx="48" cy="46" r="23" fill="${s.a}"/>
       <circle cx="48" cy="45" r="17" fill="${s.a}" filter="none" opacity=".7"/>
       <g fill="rgba(255,255,255,.65)"><circle cx="41" cy="40" r="1.5"/><circle cx="50" cy="37" r="1.5"/><circle cx="57" cy="44" r="1.5"/><circle cx="44" cy="50" r="1.5"/><circle cx="54" cy="52" r="1.5"/><circle cx="36" cy="46" r="1.5"/></g>` +
      (s.g === "mush" ? `<g fill="${K.brown}"><ellipse cx="42" cy="42" rx="4.4" ry="3.2"/><ellipse cx="56" cy="48" rx="4.4" ry="3.2"/><ellipse cx="49" cy="53" rx="3.8" ry="2.8"/></g>` + leafG(53, 32) : "")
    ),
    soup: (s) => bowlBase(s.a,
      (s.g === "pasta" ? `<g fill="${K.pasta}"><rect x="38" y="36" width="9" height="5" rx="2.4" transform="rotate(-14 42 38)"/><rect x="52" y="39" width="9" height="5" rx="2.4" transform="rotate(10 56 41)"/><rect x="44" y="43" width="9" height="5" rx="2.4" transform="rotate(-4 48 45)"/></g>` :
       `<g fill="rgba(255,255,255,.4)"><circle cx="40" cy="39" r="1.8"/><circle cx="52" cy="37" r="1.8"/><circle cx="58" cy="43" r="1.8"/><circle cx="45" cy="44" r="1.8"/></g>`) +
      `<path d="M36 34c3-2 6-2 9 0" stroke="rgba(255,255,255,.5)" stroke-width="2" stroke-linecap="round" fill="none"/>` + leafG(54, 33, .85)
    ),
    couscous: () => plate(
      `<circle cx="48" cy="46" r="23" fill="${K.pasta}"/>
       <g fill="${K.pasta2}"><circle cx="39" cy="39" r="1.4"/><circle cx="49" cy="36" r="1.4"/><circle cx="58" cy="42" r="1.4"/><circle cx="42" cy="49" r="1.4"/><circle cx="53" cy="52" r="1.4"/><circle cx="34" cy="45" r="1.4"/><circle cx="60" cy="51" r="1.4"/></g>
       <g fill="${K.tom}"><circle cx="42" cy="35" r="3.6"/><circle cx="59" cy="49" r="3.6"/></g>
       <g fill="${K.pink}"><circle cx="36" cy="50" r="3.2"/><circle cx="54" cy="38" r="3"/></g>
       <circle cx="47" cy="55" r="3" fill="${K.green}"/>`
    ),
    noodles: () => bowlBase("#e8c46a",
      `<g stroke="${K.pasta2}" stroke-width="2.6" stroke-linecap="round" fill="none">
        <path d="M28 40c8-5 32-5 40 0"/><path d="M32 36c8-4 24-4 32 0"/></g>
       <circle cx="58" cy="37" r="5.5" fill="${K.white}"/><circle cx="58" cy="37" r="2.6" fill="${K.cheese}"/>
       <rect x="35" y="35" width="8" height="4" rx="2" fill="${K.orange}"/>
       <path d="M62 14l14 22M70 12l10 24" stroke="#a5653a" stroke-width="3" stroke-linecap="round"/>`
    ),
    meat: (s) => plate(
      `<ellipse cx="43" cy="46" rx="17" ry="12" fill="${s.a}" transform="rotate(-10 43 46)"/>
       <path d="M32 42c4-3 12-4 18-2M34 50c5-2 12-3 17-1" stroke="rgba(120,70,30,.35)" stroke-width="2.2" stroke-linecap="round" fill="none"/>` +
      (s.g === "lemon" ? `<circle cx="65" cy="52" r="7" fill="#f2d13c"/><circle cx="65" cy="52" r="5" fill="#f8e88a"/><path d="M65 47v10M60 52h10M61.5 48.5l7 7M68.5 48.5l-7 7" stroke="#e0bd25" stroke-width="1.2"/>` + `<path d="M60 34c3-2 6-2 8 0" stroke="${K.dgreen}" stroke-width="2.2" stroke-linecap="round" fill="none"/>` : leafG(62, 36))
    ),
    curry: () => plate(
      `<path d="M48 24a23 23 0 010 46z" fill="#e0912f"/>
       <path d="M48 24a23 23 0 000 46z" fill="${K.white}"/>
       <g fill="rgba(255,255,255,.5)"><circle cx="38" cy="40" r="1.4"/><circle cx="41" cy="48" r="1.4"/><circle cx="37" cy="55" r="1.4"/></g>
       <g fill="#b96f1e"><ellipse cx="58" cy="40" rx="4.6" ry="3.6"/><ellipse cx="63" cy="50" rx="4.6" ry="3.6"/><ellipse cx="55" cy="55" rx="4" ry="3.2"/></g>` +
      leafG(57, 30, .85)
    ),
    frittata: () => plate(
      `<circle cx="48" cy="46" r="23" fill="#f2c94c"/>
       <circle cx="48" cy="46" r="17.5" fill="#f7dd7f"/>
       <g fill="${K.green}"><ellipse cx="41" cy="41" rx="3.8" ry="2.8"/><ellipse cx="55" cy="43" rx="3.8" ry="2.8"/><ellipse cx="47" cy="52" rx="3.6" ry="2.6"/></g>
       <path d="M48 23v46M25 46h46" stroke="#e0b73a" stroke-width="1.4" opacity=".6"/>`
    ),
    scrambled: () => plate(
      `<g fill="#f2c94c"><ellipse cx="43" cy="43" rx="12" ry="8"/><ellipse cx="55" cy="49" rx="11" ry="7.5"/><ellipse cx="40" cy="53" rx="9" ry="6.5"/></g>
       <g fill="#f7dd7f"><circle cx="45" cy="42" r="3"/><circle cx="55" cy="48" r="3"/><circle cx="41" cy="53" r="2.6"/></g>
       <path d="M62 32c3-2 6-2 8 0" stroke="${K.dgreen}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`
    ),
    poached: () => plate(
      `<rect x="28" y="32" width="40" height="30" rx="4" fill="#e3b877"/>
       <rect x="32" y="36" width="32" height="22" rx="3" fill="${K.cream}"/>
       <ellipse cx="48" cy="46" rx="14" ry="10.5" fill="${K.white}"/>
       <circle cx="48" cy="45" r="6" fill="#f2b52e"/>
       <circle cx="46" cy="43" r="1.8" fill="#f7d97c"/>`
    ),
    strips: () => plate(
      `<g fill="#e3a95c" stroke="#c98940" stroke-width="1.6">
        <rect x="30" y="36" width="24" height="9" rx="4.5" transform="rotate(-18 42 40)"/>
        <rect x="42" y="33" width="24" height="9" rx="4.5" transform="rotate(8 54 37)"/>
        <rect x="34" y="49" width="24" height="9" rx="4.5" transform="rotate(-4 46 53)"/></g>
       <circle cx="64" cy="55" r="7" fill="${K.white}"/><circle cx="64" cy="55" r="4.6" fill="#e8b0a2"/>` +
      leafG(30, 32, .8)
    ),
    fish: () => plate(
      `<path d="M31 50c2-9 9-15 19-16 6-1 13 1 12 4-5 11-13 15-22 15-5 0-9-1-9-3z" fill="${K.salmon}"/>
       <path d="M37 48c4-1 8-4 11-9M43 50c4-2 7-5 9-9" stroke="${K.white}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
       <circle cx="64" cy="55" r="6.5" fill="#f2d13c"/><circle cx="64" cy="55" r="4.6" fill="#f8e88a"/>
       <path d="M64 50.5v9M59.5 55h9" stroke="#e0bd25" stroke-width="1.2"/>` + leafG(30, 33, .8)
    ),
    fries: () => plate(
      `<g fill="#f2c063" stroke="#d9a23c" stroke-width="1.4">
        <rect x="34" y="30" width="7" height="26" rx="3" transform="rotate(-12 37 43)"/>
        <rect x="44" y="27" width="7" height="28" rx="3"/>
        <rect x="54" y="30" width="7" height="26" rx="3" transform="rotate(12 57 43)"/>
        <rect x="39" y="36" width="7" height="24" rx="3" transform="rotate(-5 42 48)"/>
        <rect x="50" y="36" width="7" height="24" rx="3" transform="rotate(6 53 48)"/></g>
       <path d="M60 60c2-1 4-1 6 0" stroke="${K.dgreen}" stroke-width="2" stroke-linecap="round"/>`
    ),
    burger: () =>
      `<ellipse cx="48" cy="82" rx="32" ry="6" fill="rgba(0,0,0,.13)"/>
       <path d="M20 42c0-14 13-22 28-22s28 8 28 22z" fill="#e3a95c"/>
       <g fill="${K.cream}"><ellipse cx="34" cy="30" rx="2.6" ry="1.6"/><ellipse cx="48" cy="26" rx="2.6" ry="1.6"/><ellipse cx="62" cy="30" rx="2.6" ry="1.6"/></g>
       <path d="M20 44h56c0 4-4 5-9 4-4-1-6 3-11 3s-7-3-11-3c-5 1-9 3-13 1-2-1-3-3-2-5z" fill="${K.leaf}"/>
       <rect x="22" y="50" width="52" height="7" rx="3" fill="${K.cheese}"/>
       <rect x="20" y="57" width="56" height="10" rx="5" fill="#8a5432"/>
       <path d="M20 69h56v3a8 8 0 01-8 8H28a8 8 0 01-8-8z" fill="#e3a95c"/>`,
    meatballs: () => plate(
      `<circle cx="48" cy="46" r="23" fill="${K.tom}"/>
       <g fill="#8a5432"><circle cx="40" cy="41" r="7"/><circle cx="57" cy="41" r="7"/><circle cx="48" cy="54" r="7"/></g>
       <g fill="rgba(255,255,255,.25)"><circle cx="38" cy="39" r="2.2"/><circle cx="55" cy="39" r="2.2"/><circle cx="46" cy="52" r="2.2"/></g>` + leafG(58, 30, .85)
    ),
    sausage: () => plate(
      `<g fill="#f2c063"><ellipse cx="38" cy="52" rx="6" ry="5"/><ellipse cx="49" cy="56" rx="6" ry="5"/><ellipse cx="60" cy="52" rx="6" ry="5"/></g>
       <rect x="27" y="34" width="26" height="10" rx="5" fill="${K.meat2}" transform="rotate(-8 40 39)"/>
       <rect x="45" y="32" width="26" height="10" rx="5" fill="${K.meat2}" transform="rotate(7 58 37)"/>
       <path d="M33 37c4-1 9-2 13-1M51 36c4 0 9 0 13 1" stroke="#8a3d30" stroke-width="1.8" stroke-linecap="round" fill="none"/>
       <path d="M30 58c2-1 4-1 6 0" stroke="${K.dgreen}" stroke-width="2" stroke-linecap="round"/>`
    ),
    roastveg: () => plate(
      `<g>
        <rect x="32" y="35" width="12" height="9" rx="3" fill="${K.orange}"/>
        <rect x="48" y="32" width="12" height="9" rx="3" fill="${K.green}"/>
        <rect x="38" y="48" width="12" height="9" rx="3" fill="${K.purple}"/>
        <rect x="54" y="46" width="11" height="9" rx="3" fill="#f2c063"/>
        <rect x="27" y="47" width="9" height="8" rx="3" fill="${K.tom}"/>
        <circle cx="60" cy="38" r="2" fill="#3f7a33"/><circle cx="38" cy="40" r="2" fill="#d67f26"/></g>
       <path d="M44 30c2-1 4-1 6 0" stroke="${K.dgreen}" stroke-width="2" stroke-linecap="round"/>`
    ),
    parmigiana: () => plate(
      `<g transform="translate(30 26)">
        <rect x="0" y="26" width="36" height="7" rx="2" fill="${K.purple}"/>
        <rect x="0" y="20" width="36" height="7" rx="2" fill="${K.tom}"/>
        <rect x="0" y="13" width="36" height="7" rx="2" fill="${K.purple}"/>
        <rect x="0" y="7" width="36" height="7" rx="2" fill="${K.tom}"/>
        <path d="M0 7c6-5 30-5 36 0v3H0z" fill="${K.cheese}"/>
        <path d="M6 8c0 3 2 5 2 5M18 7c0 4 2 6 2 6M29 8c0 3 2 5 2 5" stroke="${K.cheese}" stroke-width="2.4" stroke-linecap="round"/></g>` +
      leafG(52, 22, .9)
    ),
    caprese: () => plate(
      `<g>
        <ellipse cx="36" cy="44" rx="9" ry="7" fill="${K.tom}"/>
        <ellipse cx="48" cy="41" rx="9" ry="7" fill="${K.white}"/>
        <ellipse cx="60" cy="44" rx="9" ry="7" fill="${K.tom}"/>
        <ellipse cx="42" cy="53" rx="9" ry="7" fill="${K.white}"/>
        <ellipse cx="55" cy="54" rx="9" ry="7" fill="${K.tom}"/></g>` +
      leafG(44, 30) + leafG(58, 48, .75)
    ),
    salad: () => bowlBase("#f3ecdc",
      `<g fill="${K.white}"><ellipse cx="38" cy="38" rx="4" ry="2.8"/><ellipse cx="52" cy="41" rx="4" ry="2.8"/><ellipse cx="60" cy="37" rx="3.6" ry="2.6"/></g>
       <g fill="${K.pink}"><circle cx="44" cy="36" r="3.4"/><circle cx="57" cy="43" r="3"/></g>
       <g fill="#b03060" opacity=".8"><path d="M33 40a3 3 0 006 0z"/><path d="M46 44a3 3 0 006 0z"/></g>` +
      leafG(40, 30, .8)
    ),
    toast: () =>
      `<ellipse cx="48" cy="80" rx="30" ry="5.5" fill="rgba(0,0,0,.13)"/>
       <g transform="translate(20 22)">
        <path d="M4 14h48l-3 34a5 5 0 01-5 4H12a5 5 0 01-5-4z" fill="#e3b877" transform="skewX(-3)"/>
        <rect x="2" y="24" width="52" height="6" fill="${K.cheese}"/>
        <path d="M6 30h44M10 30c0 4-1 6-1 6M28 30c0 4-1 6-1 6M46 30c0 4-1 6-1 6" stroke="${K.cheese}" stroke-width="3" stroke-linecap="round"/>
        <rect x="2" y="18" width="52" height="6" rx="2" fill="${K.pink}"/>
        <path d="M2 18h52l2-8a4 4 0 00-4-5H4a4 4 0 00-4 5z" fill="#eed09b"/>
        <path d="M8 34l38-22M14 40l36-21" stroke="rgba(120,70,30,.25)" stroke-width="3" stroke-linecap="round"/></g>`,
    piadina: () => plate(
      `<path d="M22 52a26 26 0 0152 0z" fill="#eed9a9"/>
       <path d="M22 52h52" stroke="#d8b96e" stroke-width="2.4"/>
       <path d="M26 52c4 3 8 5 12 5M70 52c-4 3-8 5-12 5" stroke="${K.pink}" stroke-width="4" stroke-linecap="round" fill="none"/>
       <path d="M40 56c3 2 6 3 8 3s5-1 8-3" stroke="${K.green}" stroke-width="3.4" stroke-linecap="round" fill="none"/>
       <circle cx="34" cy="44" r="1.6" fill="#d8b96e"/><circle cx="50" cy="40" r="1.6" fill="#d8b96e"/><circle cx="63" cy="45" r="1.6" fill="#d8b96e"/>`
    ),
    greens: () => plate(
      `<g fill="${K.dgreen}"><ellipse cx="43" cy="43" rx="13" ry="8"/><ellipse cx="55" cy="49" rx="12" ry="7.5"/><ellipse cx="40" cy="52" rx="10" ry="6.5"/></g>
       <g fill="${K.leaf}"><ellipse cx="46" cy="42" rx="5" ry="3"/><ellipse cx="54" cy="48" rx="4.6" ry="2.8"/><ellipse cx="40" cy="51" rx="4" ry="2.5"/></g>
       <g fill="${K.white}" opacity=".85"><rect x="48" y="38" width="6" height="3.6" rx="1" transform="rotate(12 51 40)"/><rect x="38" y="47" width="6" height="3.6" rx="1" transform="rotate(-8 41 49)"/></g>`
    ),
    mug: () =>
      `<ellipse cx="48" cy="82" rx="26" ry="5" fill="rgba(0,0,0,.13)"/>
       <path d="M26 34h38v34a10 10 0 01-10 10H36a10 10 0 01-10-10z" fill="${K.tom}"/>
       <path d="M64 40h6a8 8 0 010 16h-6" stroke="${K.tom}" stroke-width="5" fill="none"/>
       <path d="M26 34h38v6H26z" fill="${K.red2}"/>
       <g fill="${K.choco}"><path d="M27 33c4-8 12-12 21-12s17 4 20 12c1 2-1 4-3 3-3-1-4 2-7 2s-4-3-7-3-4 3-7 3-4-3-7-2c-3 1-6 1-8-1-1-1-2-1-2-2z"/></g>
       <circle cx="42" cy="26" r="2" fill="${K.choco2}"/><circle cx="54" cy="24" r="2" fill="${K.choco2}"/>`,
    tiramisu: () => plate(
      `<g transform="translate(28 22)">
        <rect x="0" y="28" width="40" height="9" rx="2" fill="#eeca82"/>
        <rect x="0" y="20" width="40" height="9" rx="2" fill="${K.cream}"/>
        <rect x="0" y="12" width="40" height="9" rx="2" fill="#e3b866"/>
        <rect x="0" y="4" width="40" height="9" rx="2" fill="${K.cream}"/>
        <rect x="0" y="0" width="40" height="6" rx="2" fill="${K.brown2}"/>
        <g fill="${K.brown2}" opacity=".55"><circle cx="8" cy="-2" r="1.2"/><circle cx="18" cy="-3" r="1.2"/><circle cx="28" cy="-2" r="1.2"/><circle cx="35" cy="-3" r="1.2"/></g></g>`
    ),
    affogato: () =>
      `<ellipse cx="48" cy="82" rx="24" ry="5" fill="rgba(0,0,0,.13)"/>
       <path d="M28 30h40l-4 40a8 8 0 01-8 7H40a8 8 0 01-8-7z" fill="${K.glass}" opacity=".55"/>
       <path d="M31 48h34l-2 22a7 7 0 01-7 6H40a7 7 0 01-7-6z" fill="#6d4a2a"/>
       <circle cx="48" cy="40" r="13" fill="${K.cream}"/>
       <circle cx="44" cy="36" r="2" fill="${K.cream2}"/><circle cx="52" cy="42" r="2" fill="${K.cream2}"/>
       <path d="M62 22c3 2 4 6 3 9" stroke="#6d4a2a" stroke-width="4" stroke-linecap="round" fill="none"/>`,
    cake: () => plate(
      `<g transform="translate(27 24)">
        <path d="M0 14 L42 8 L42 38 L0 40 Z" fill="#6b4226"/>
        <path d="M0 22l42-5M0 30l42-4" stroke="${K.choco2}" stroke-width="3"/>
        <path d="M0 14 C 10 4, 32 2, 42 8 L 42 12 C 32 6, 10 8, 0 18 Z" fill="${K.choco}"/>
        <path d="M8 14c0 3 2 5 2 5M24 11c0 4 2 6 2 6M36 10c0 3 2 5 2 5" stroke="${K.choco}" stroke-width="3" stroke-linecap="round"/></g>`
    ),
    bundt: () => plate(
      `<g transform="translate(48 44)">
        <path d="M-26 4 C-26 -12 26 -12 26 4 C26 16 14 22 0 22 C-14 22 -26 16 -26 4Z" fill="#d8a35c"/>
        <path d="M-26 2 C-16 -8 -6 -12 0 -12 C6 -12 16 -8 26 2 C20 -2 10 -5 0 -5 C-10 -5 -20 -2 -26 2Z" fill="${K.white}"/>
        <ellipse cx="0" cy="4" rx="8" ry="4.5" fill="#b9834a"/>
        <path d="M-14 -8 C-14 -4 -12 -1 -12 -1M12 -8 C12 -4 10 -1 10 -1M0 -11v6" stroke="${K.white}" stroke-width="3.4" stroke-linecap="round"/></g>`
    ),
    cookies: () => plate(
      `<g><circle cx="39" cy="40" r="11" fill="#dda85e"/><circle cx="58" cy="44" r="10" fill="#d89c4e"/><circle cx="45" cy="55" r="9.5" fill="#dda85e"/></g>
       <g fill="${K.choco}"><circle cx="36" cy="37" r="1.8"/><circle cx="43" cy="42" r="1.8"/><circle cx="55" cy="41" r="1.8"/><circle cx="61" cy="47" r="1.8"/><circle cx="43" cy="54" r="1.8"/><circle cx="48" cy="58" r="1.6"/></g>`
    ),
    pancakes: () => plate(
      `<g transform="translate(48 46)">
        <ellipse cx="0" cy="10" rx="23" ry="7" fill="#d89c4e"/>
        <ellipse cx="0" cy="4" rx="22" ry="7" fill="#e8b467"/>
        <ellipse cx="0" cy="-2" rx="21" ry="7" fill="#d89c4e"/>
        <ellipse cx="0" cy="-8" rx="20" ry="7" fill="#e8b467"/>
        <path d="M-14 -12 C-14 -4 -10 -2 -8 -8 C-6 -2 -2 -2 0 -9 C2 -2 6 -2 8 -8 C10 -2 14 -4 14 -12 C8 -16 -8 -16 -14 -12Z" fill="#e0912f"/>
        <rect x="-6" y="-19" width="12" height="6" rx="2" fill="${K.cheese}"/></g>`
    ),
    crepes: () => plate(
      `<path d="M30 38 L66 38 L48 62 Z" fill="#eed09b"/>
       <path d="M34 38 L62 38 L48 57 Z" fill="#e3b877"/>
       <path d="M40 44c3 1 5 3 6 6M52 43c-2 2-3 4-4 7" stroke="${K.choco}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
       <g fill="${K.red}"><circle cx="61" cy="55" r="3"/><circle cx="66" cy="50" r="2.4"/></g>`
    ),
    salame: () => plate(
      `<g>
        <circle cx="40" cy="42" r="10" fill="${K.choco}"/>
        <circle cx="58" cy="48" r="10" fill="${K.choco}"/>
        <circle cx="43" cy="57" r="8.5" fill="${K.choco}"/></g>
       <g fill="${K.cream}"><circle cx="36" cy="39" r="2"/><circle cx="44" cy="44" r="2"/><circle cx="55" cy="45" r="2"/><circle cx="61" cy="51" r="2"/><circle cx="41" cy="58" r="1.8"/><circle cx="46" cy="53" r="1.6"/></g>`
    ),
    fruit: () => bowlBase("#f3ecdc",
      `<g>
        <circle cx="38" cy="38" r="4" fill="${K.tom}"/>
        <circle cx="47" cy="36" r="4" fill="#f2d13c"/>
        <circle cx="56" cy="38" r="4" fill="${K.orange}"/>
        <circle cx="42" cy="44" r="3.6" fill="${K.red}"/>
        <circle cx="52" cy="44" r="3.6" fill="#7b4f8f"/>
        <circle cx="61" cy="43" r="3" fill="${K.leaf}"/></g>`
    ),
    smoothie: () =>
      `<ellipse cx="48" cy="82" rx="22" ry="4.5" fill="rgba(0,0,0,.13)"/>
       <path d="M30 26h36l-4 46a7 7 0 01-7 6H41a7 7 0 01-7-6z" fill="${K.glass}" opacity=".5"/>
       <path d="M32 36h32l-3 36a6 6 0 01-6 6H41a6 6 0 01-6-6z" fill="#d6537a"/>
       <path d="M33 44h30" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
       <rect x="52" y="8" width="5" height="34" rx="2.5" fill="${K.red}" transform="rotate(9 54 25)"/>
       <circle cx="38" cy="30" r="3.4" fill="${K.red}"/><path d="M36 27l2-3 2 3z" fill="${K.leaf}"/>`,
    yogurtcup: () =>
      `<ellipse cx="48" cy="82" rx="22" ry="4.5" fill="rgba(0,0,0,.13)"/>
       <path d="M31 30h34l-3 40a7 7 0 01-7 6H41a7 7 0 01-7-6z" fill="${K.glass}" opacity=".45"/>
       <path d="M32 42h32l-2.5 29a6 6 0 01-6 5.5H40.5a6 6 0 01-6-5.5z" fill="${K.white}"/>
       <path d="M33 50h30" stroke="#e8a53c" stroke-width="4"/>
       <g fill="#8a5f36"><circle cx="41" cy="37" r="2.6"/><circle cx="49" cy="35" r="2.6"/><circle cx="56" cy="38" r="2.4"/></g>
       <g fill="#5b5ea6"><circle cx="45" cy="40" r="2"/><circle cx="53" cy="41" r="2"/></g>`,
    apples: () => plate(
      `<g fill="${K.tom}">
        <path d="M36 52c-7 0-11-5-11-10 0-6 5-9 9-8 2-4 8-4 10 0 4-1 9 2 9 8 0 5-4 10-11 10z" transform="translate(2 -2) scale(.9)"/>
        <path d="M36 52c-7 0-11-5-11-10 0-6 5-9 9-8 2-4 8-4 10 0 4-1 9 2 9 8 0 5-4 10-11 10z" transform="translate(28 6) scale(.9)"/></g>
       <g stroke="#8a4f2c" stroke-width="2.4" stroke-linecap="round"><path d="M37 32v-4M63 40v-4"/></g>
       <g fill="#b9834a" opacity=".8"><circle cx="43" cy="58" r="1.6"/><circle cx="52" cy="61" r="1.6"/><circle cx="35" cy="61" r="1.4"/></g>`
    ),
    loaf: () => plate(
      `<g transform="translate(26 26)">
        <path d="M2 16 C2 6 42 6 42 16 L42 34 a4 4 0 01-4 4 H6 a4 4 0 01-4-4Z" fill="#a5653a"/>
        <path d="M6 14 C6 8 38 8 38 14 L38 32 H6Z" fill="#eed09b"/>
        <g fill="#8a5f36"><circle cx="14" cy="18" r="1.8"/><circle cx="26" cy="16" r="1.8"/><circle cx="32" cy="24" r="1.8"/><circle cx="18" cy="27" r="1.8"/></g>
        <path d="M12 4c4-2 16-2 20 0" stroke="#8a4f2c" stroke-width="2.4" stroke-linecap="round" fill="none"/></g>`
    ),
    crumble: () => bowlBase("#e8b467",
      `<g fill="#d89c4e"><circle cx="38" cy="37" r="3"/><circle cx="46" cy="34" r="3.2"/><circle cx="55" cy="37" r="3"/><circle cx="42" cy="42" r="2.8"/><circle cx="52" cy="43" r="2.8"/><circle cx="60" cy="41" r="2.4"/></g>
       <g fill="${K.tom}" opacity=".8"><circle cx="44" cy="39" r="1.8"/><circle cx="56" cy="39" r="1.8"/></g>`
    ),
  };

  // --- interfaccia UI (tab bar, stati vuoti): stroke = currentColor ---
  const UI = {
    basket: `<path d="M5 13h22l-2.6 12.5a3 3 0 01-3 2.5H10.6a3 3 0 01-3-2.5z"/><path d="M10 13l5-8m7 8l-5-8"/><path d="M11 17.5v6m5-6v6m5-6v6"/>`,
    tools: `<circle cx="11" cy="14" r="7"/><path d="M18 14h9"/><path d="M11 10.5a3.5 3.5 0 013.5 3.5"/>`,
    dish: `<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="5"/><path d="M2.5 8v7m0-7v3.5a2 2 0 002 2M29.5 8v7"/>`,
  };
  const uiIcon = (key, size, sw = 2) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI[key]}</svg>`;

  // --- API pubblica ---
  window.NOVA_ICON = (key, size = 20) =>
    wrap(ICONS[key] || APPS[key] || `<circle cx="24" cy="26" r="12" fill="${K.off}"/>`, size, 48);
  window.NOVA_DISH = (spec, size = 48) => {
    const fn = DISHES[spec && spec.k];
    return wrap(fn ? fn(spec) : plate(""), size, 96);
  };
  window.NOVA_UI = uiIcon;
})();
