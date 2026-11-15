// The Endgame is Me, desktop (Steam) build: an Electron window around the browser game.
// The game is served from app://game/ (a standard, secure scheme), so its ES modules, localStorage and saves behave
// exactly as on the website, and saves live in this app's own user data folder.
const { app, BrowserWindow, protocol, net, shell, ipcMain, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const GAME = path.join(__dirname, 'game');
app.setName('The Endgame is Me');
// sound from the first frame: no "click to start" gate as in a browser
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Steam's Linux runtime can't keep chrome-sandbox setuid-root, and Electron refuses to start without it. The game only
// ever loads its own files from inside the app, so Chromium's sandbox is switched off there.
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

// window settings (fullscreen or not, and the windowed size) kept beside the saves
const prefsFile = () => path.join(app.getPath('userData'), 'window.json');
function readPrefs() { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); } catch { return { fullscreen: true, w: 1280, h: 760 }; } }
function writePrefs(p) { try { fs.writeFileSync(prefsFile(), JSON.stringify(p)); } catch {} }

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function create() {
  const prefs = readPrefs();
  win = new BrowserWindow({
    width: prefs.w, height: prefs.h, minWidth: 640, minHeight: 360, fullscreen: !!prefs.fullscreen,
    backgroundColor: '#0a0806', show: false, autoHideMenuBar: true, title: 'The Endgame is Me',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  const remember = () => { if (!win || win.isDestroyed()) return; const p = readPrefs(); p.fullscreen = win.isFullScreen(); if (!p.fullscreen && !win.isMaximized()) { const [w, h] = win.getSize(); p.w = w; p.h = h; } writePrefs(p); };
  win.on('enter-full-screen', remember); win.on('leave-full-screen', remember); win.on('resized', remember);
  // F11 and Alt+Enter toggle fullscreen (Cmd+Ctrl+F on a Mac comes from the app menu)
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11' || (i.key === 'Enter' && i.alt)) { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  // links (the credits, say) open in the player's browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://game/')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadURL('app://game/index.html');
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const u = new URL(req.url);
    const file = path.normalize(path.join(GAME, decodeURIComponent(u.pathname)));
    if (u.host !== 'game' || !file.startsWith(GAME)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // a Mac needs an app menu for Cmd+Q, Cmd+H and fullscreen; elsewhere there is no menu bar at all
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'windowMenu' }]) : null);
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('fullscreen', (_e, on) => win?.setFullScreen(on == null ? !win.isFullScreen() : !!on));
  create();
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
