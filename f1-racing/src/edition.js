// Edizione del gioco.
// - Completa (quella di casa): squadre, piloti, sponsor, circuiti e macchine speciali veri.
// - Pubblica (da distribuire, es. itch.io): stesso gioco ma con nomi e marchi inventati, niente loghi
//   veri sulle macchine e senza le F1 storiche. Si accende con window.NOVA_PUBLIC (lo zip pubblico lo
//   imposta in index.html) oppure, per provarla, con ?public=1 nel link.
export const PUBLIC = typeof window !== 'undefined' && (!!window.NOVA_PUBLIC || /[?&]public=1/.test(window.location.search));

// scuderie 2026 inventate (stessi colori e stesse livree dipinte, nomi, vetture, piloti e sponsor nuovi)
export const PUB_TEAMS = {
  redbull: { name: 'Volt Racing', car: 'VR-26', drivers: ['KOVAC', 'HARDY'], sponsor: 'VOLTAGE' },
  mclaren: { name: 'Orion Racing', car: 'OR-40', drivers: ['NORDSTROM', 'PELLEGRINI'], sponsor: 'ORBITPAY' },
  ferrari: { name: 'Scuderia Rossa', car: 'SR-26', drivers: ['LUCERI', 'HARGREAVE'], sponsor: 'ROSSA' },
  mercedes: { name: 'Silverline', car: 'SL-17', drivers: ['RUSSO', 'ANDERSEN'], sponsor: 'SILVERLINE' },
  aston: { name: 'Verdant GP', car: 'VG-26', drivers: ['ALVAREZ', 'STROMBERG'], sponsor: 'VERDANT' },
  alpine: { name: 'Azur Motorsport', car: 'AZ-26', drivers: ['GARNIER', 'COLOMBO'], sponsor: 'AZUR' },
  williams: { name: 'Kingsway Racing', car: 'KW-48', drivers: ['ALBRECHT', 'SANTOS'], sponsor: 'KINGSWAY' },
  rb: { name: 'Junior Volt', car: 'JV-03', drivers: ['LAMBERT', 'LINDQVIST'], sponsor: 'JUNIOR' },
  audi: { name: 'Nordwerk', car: 'NW-26', drivers: ['HULSER', 'BRANDT'], sponsor: 'NORDWERK' },
  haas: { name: 'Stellar F', car: 'SF-26', drivers: ['OCAMPO', 'BERGMAN'], sponsor: 'STELLAR' },
  cadillac: { name: 'Liberty GP', car: 'LB-01', drivers: ['PEREIRA', 'BOWMAN'], sponsor: 'LIBERTY' },
};

// sponsor dei cartelloni (stessi colori dei veri, nomi inventati)
export const PUB_BRANDS = {
  qatar: 'SKYLINE AIR', lv: 'MAISON LUMIÈRE', tag: 'TEMPO', moet: 'CHÂTEAU NOVA', lenovo: 'Pixelon', aramco: 'petrova',
  heineken: 'Hopfeld 0.0', dhl: 'SWIFTEX', aws: 'cloudly', pirelli: 'GRIPTEC', crypto: 'coinova', msc: 'BLUE WAVE CRUISES',
  salesforce: 'cloudforge', amex: 'MERIDIAN EXPRESS',
};

// circuiti: nomi di luogo invece dei nomi registrati
export const PUB_TRACKS = {
  melbourne: ['Melbourne Park Circuit', 'MELBOURNE GP'], shanghai: ['Shanghai Circuit', 'SHANGHAI GP'],
  suzuka: ['Suzuka Circuit', 'SUZUKA GP'], bahrain: ['Sakhir Circuit', 'SAKHIR GP'], jeddah: ['Jeddah Corniche', 'JEDDAH GP'],
  miami: ['Miami Gardens Circuit', 'MIAMI GP'], montreal: ['Île Notre-Dame Circuit', 'MONTRÉAL GP'], monaco: ['Monte Carlo Street Circuit', 'MONTE CARLO GP'],
  barcelona: ['Montmeló Circuit', 'CATALUNYA GP'], spielberg: ['Styria Ring', 'STYRIA GP'], silverstone: ['Northamptonshire Circuit', 'NORTHANTS GP'],
  hungaroring: ['Mogyoród Circuit', 'BUDAPEST GP'], zandvoort: ['Dune Circuit', 'ZANDVOORT GP'], monza: ['Parco di Monza Circuit', 'MONZA GP'],
  madrid: ['Madrid Street Circuit', 'MADRID GP'], singapore: ['Marina Bay Night Circuit', 'SINGAPORE GP'], austin: ['Austin Hills Circuit', 'AUSTIN GP'],
  mexico: ['Mexico City Circuit', 'MEXICO CITY GP'], interlagos: ['São Paulo Circuit', 'SÃO PAULO GP'], lasvegas: ['Las Vegas Strip', 'LAS VEGAS GP'],
  lusail: ['Lusail Circuit', 'LUSAIL GP'], yasmarina: ['Yas Island Circuit', 'YAS GP'], nurburgring: ['Eifel GP Circuit', 'EIFEL GP'],
  nordschleife: ['Eifel North Loop', 'NORTH LOOP'], spa: ['Ardennes Circuit', 'ARDENNES'], baku: ['Baku Old Town Circuit', 'BAKU GP'],
};

// testi dell'interfaccia: nessun marchio registrato (F1, Porsche…)
const SWAPS = [
  [/Porsche 992 GT3 R|PORSCHE 992 GT3 R|992 GT3 R/g, 'NOVA GT'], [/MANTHEY #91/g, 'NOVA #91'], [/Manthey/g, 'Nova'],
  [/PORSCHE/g, 'NOVA'], [/Porsche/g, 'Nova'], [/GT3/g, 'GT'], [/Formula 1|Formula One/g, 'Formula'], [/FORMULA 1/g, 'FORMULA'],
  [/\bF1\b/g, 'FORMULA'], [/Pirelli|PIRELLI/g, 'Griptec'],
];
export function pubText(s) {
  if (!PUBLIC || typeof s !== 'string') return s;
  for (const [a, b] of SWAPS) s = s.replace(a, b);
  return s;
}
// tutta la pagina: i testi scritti ora e quelli che il gioco scrive dopo (tranne i crediti, che citano gli autori)
export function pubPage() {
  if (!PUBLIC || typeof document === 'undefined') return;
  const fix = root => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement && n.parentElement.closest('#menuCredits, script, style')) continue;
      const v = pubText(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v;
    }
  };
  fix(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') { const n = m.target; if (n.parentElement && n.parentElement.closest('#menuCredits')) continue; const v = pubText(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
      else for (const a of m.addedNodes) { if (a.nodeType === 3) { const v = pubText(a.nodeValue); if (v !== a.nodeValue) a.nodeValue = v; } else if (a.nodeType === 1 && !a.closest('#menuCredits')) fix(a); }
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  document.title = pubText(document.title);
}
