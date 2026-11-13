// Nova Grand Prix per PC (Windows): il gioco gira in una finestra sua, senza browser.
// I file del gioco stanno nella cartella "game" accanto a questo file e vengono serviti con l'indirizzo
// nova://game/... (come un sito, così moduli, record e impostazioni funzionano come online).
// F11 = schermo intero, F5 = ricarica, Ctrl+Shift+I = strumenti per sviluppatori.
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'nova', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// scheda video: niente liste nere, la più potente disponibile, nessun rallentamento in secondo piano
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const ROOT = path.join(__dirname, 'game');

app.whenReady().then(() => {
  protocol.handle('nova', req => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const f = path.normalize(path.join(ROOT, p));
    if (!f.startsWith(ROOT)) return new Response('vietato', { status: 403 });
    return net.fetch(pathToFileURL(f).toString());
  });
  const win = new BrowserWindow({
    width: 1600, height: 900, backgroundColor: '#0d0f14', autoHideMenuBar: true, title: 'Nova Grand Prix',
    icon: path.join(ROOT, 'icon-512.png'), show: false,
    webPreferences: { backgroundThrottling: false, spellcheck: false },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('nova://game/index.html');
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === 'F5') { win.webContents.reloadIgnoringCache(); e.preventDefault(); }
    else if (i.control && i.shift && (i.key === 'I' || i.key === 'i')) { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // link esterni (crediti, autori dei modelli): nel browser normale
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  // prova automatica (solo per chi costruisce l'app): foto della finestra dopo qualche secondo, poi esce
  if (process.env.NOVA_SHOT) win.webContents.on('console-message', (e, level, msg, line, src) => { if (level >= 2) console.log('[pagina]', msg.slice(0, 300), src ? String(src).split('/').pop() + ':' + line : ''); });
  if (process.env.NOVA_SHOT) setTimeout(async () => {
    const img = await win.webContents.capturePage();
    require('fs').writeFileSync(process.env.NOVA_SHOT, img.toPNG());
    app.quit();
  }, +(process.env.NOVA_SHOT_MS || 25000));
});
app.on('window-all-closed', () => app.quit());
