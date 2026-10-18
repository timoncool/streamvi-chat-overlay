'use strict';

const {
  app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage,
  ipcMain, screen, shell, dialog
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const RES_DIR = path.join(__dirname, '..');
const APP_DIR = app.isPackaged ? app.getPath('userData') : RES_DIR;
const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const ICON_PATH = path.join(RES_DIR, 'assets', 'icon.png');
const SIM_URL = pathToFileURL(path.join(__dirname, 'sim.html')).href;

const STREAMVI_TOKEN = 'YOUR_TOKEN';
const BASE = 'https://chat.streamvi.io/?lang=ru';
const COLORS = 'background=%2314141400&color=%23F0E8DA&nameColor=%23D9A85F&messageBoxColor=%2300000000&scale=149&messageMargin=10&messageTime=true&messageTheme=compact&messageAlignment=top&messageAnimation=none&messageHiddenDelay=2&messagesHidden=none&messageIcon=platform&messageSound=false';

// mode=widget без elements — ровно то, что уходит в эфир: прозрачный фон, без поля ввода.
const PRESETS = {
  stream_widget: `${BASE}&mode=widget&${COLORS}&token=${STREAMVI_TOKEN}`,
  standalone_dark: `${BASE}&mode=standalone&${COLORS}&token=${STREAMVI_TOKEN}`,
  widget_input: `${BASE}&mode=widget&elements=input%2Cemoji&${COLORS}&token=${STREAMVI_TOKEN}`,
  standalone_white: `${BASE}&mode=standalone&color=%23FFFFFF&background=%2314141400&nameColor=%23ADADAD&messageBoxColor=%2300000000&scale=145&messageMargin=100&messageTime=true&messageTheme=compact&messageAlignment=bottom&messageAnimation=fade&messageHiddenDelay=2&messagesHidden=none&messageIcon=all&token=${STREAMVI_TOKEN}`
};

const DEFAULTS = {
  url: PRESETS.stream_widget,
  width: 420,
  height: 760,
  x: null,
  y: null,
  opacity: 1,
  scale: 149,
  hide: { time: false, icons: false, names: false },
  sound: { enabled: false, file: '' },
  counter: {
    enabled: false,
    url: 'https://plugin-counter.streamvi.io/obs?template_id=69fe0a69a2ce44a8328506c2&token=YOUR_COUNTER_TOKEN',
    x: null,
    y: null,
    width: 360,
    height: 120
  },
  locked: false,
  hideFromCapture: true,
  hotkeys: {
    toggleLock: 'CommandOrControl+Alt+L',
    toggleVisible: 'CommandOrControl+Alt+H',
    reload: 'CommandOrControl+Alt+R',
    settings: 'CommandOrControl+Alt+S',
    resetBounds: 'CommandOrControl+Alt+0',
    demo: 'CommandOrControl+Alt+D',
    counter: 'CommandOrControl+Alt+V',
    zoomIn: 'CommandOrControl+Alt+=',
    zoomOut: 'CommandOrControl+Alt+-'
  }
};

const UI_CSS = `
#__svo_bar {
  position: fixed; top: 0; left: 0; right: 0; height: 28px;
  display: flex; align-items: center; gap: 8px; padding: 0 8px 0 10px;
  background: rgba(124, 58, 237, 0.92);
  color: #fff; font: 600 11px/1 "Segoe UI", Arial, sans-serif;
  letter-spacing: 0.03em;
  z-index: 2147483647; pointer-events: auto;
  cursor: move;
  border-bottom: 1px solid rgba(255,255,255,0.18);
  box-sizing: border-box;
  touch-action: none;
}
#__svo_bar .svo-text {
  flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
html.__svo_unlocked #app { padding-top: 28px; box-sizing: border-box; }
html.__svo_unlocked #chat { padding-top: 28px; }
#__svo_bar button {
  -webkit-app-region: no-drag;
  background: rgba(255,255,255,0.16); color: #fff;
  border: 1px solid rgba(255,255,255,0.25); border-radius: 5px;
  padding: 3px 8px; font: 600 11px "Segoe UI", Arial, sans-serif;
  cursor: pointer; pointer-events: auto;
}
#__svo_bar button:hover { background: rgba(255,255,255,0.3); }
#__svo_grip {
  position: fixed; right: 0; bottom: 0; width: 22px; height: 22px;
  z-index: 2147483647; cursor: nwse-resize; pointer-events: auto;
  -webkit-app-region: no-drag;
  background:
    linear-gradient(135deg, transparent 42%, rgba(155,92,246,0.95) 43%, rgba(155,92,246,0.95) 50%, transparent 51%,
                    transparent 61%, rgba(155,92,246,0.95) 62%, rgba(155,92,246,0.95) 69%, transparent 70%,
                    transparent 80%, rgba(155,92,246,0.95) 81%, rgba(155,92,246,0.95) 88%, transparent 89%);
}
`;

const COUNTER_CSS = `
html, body { overflow: hidden !important; background: transparent !important; margin: 0 !important; }
::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
`;

let cfg = loadConfig();
let win = null;
let settingsWin = null;
let tray = null;
let quitting = false;
let boundsTimer = null;
let dragState = null;
let demoMode = false;
let scaleTimer = null;
let soundWin = null;
let lastSoundAt = 0;
let counterWin = null;
let counterTimer = null;

function ensureSoundWindow() {
  if (soundWin && !soundWin.isDestroyed()) return soundWin;
  soundWin = new BrowserWindow({
    show: false,
    width: 200,
    height: 100,
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  soundWin.loadFile(path.join(__dirname, 'sound.html'));
  soundWin.on('closed', () => { soundWin = null; });
  return soundWin;
}

function playSound(file) {
  const src = file || (cfg.sound && cfg.sound.file) || '';
  if (!src) return false;
  const sw = ensureSoundWindow();
  const url = pathToFileURL(src).href;
  const run = () => sw.webContents.executeJavaScript(`window.playSound(${JSON.stringify(url)})`).catch(() => {});
  if (sw.webContents.isLoading()) sw.webContents.once('did-finish-load', run);
  else run();
  return true;
}

function dbg(tag, data) {
  try {
    fs.appendFileSync(path.join(APP_DIR, 'drag.log'), new Date().toISOString() + ' ' + tag + ' ' + JSON.stringify(data) + '\n');
  } catch (_) { /* ignore */ }
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const merged = {
      ...DEFAULTS,
      ...raw,
      hide: { ...DEFAULTS.hide, ...(raw.hide || {}) },
      sound: { ...DEFAULTS.sound, ...(raw.sound || {}) },
      counter: { ...DEFAULTS.counter, ...(raw.counter || {}) },
      hotkeys: { ...DEFAULTS.hotkeys, ...(raw.hotkeys || {}) }
    };
    try {
      const fromUrl = parseInt(new URL(merged.url).searchParams.get('scale'), 10);
      if (Number.isFinite(fromUrl)) merged.scale = fromUrl;
    } catch (_) { /* ignore */ }
    return merged;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err) {
    console.error('[config] save failed:', err);
  }
}

function saveBoundsSoon() {
  if (!win || win.isDestroyed()) return;
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    cfg.x = b.x; cfg.y = b.y; cfg.width = b.width; cfg.height = b.height;
    saveConfig();
  }, 400);
}

function startDrag(mode, target = 'chat') {
  const targetWin = target === 'counter' ? counterWin : win;
  if (!targetWin || targetWin.isDestroyed()) return false;
  stopDrag(false);
  const bounds = targetWin.getBounds();
  const point = screen.getCursorScreenPoint();
  dbg('start', { mode, target, bounds, point });
  dragState = {
    target,
    mode: mode === 'resize' ? 'resize' : 'move',
    startX: point.x,
    startY: point.y,
    bounds,
    startedAt: Date.now(),
    timer: setInterval(tickDrag, 16)
  };
  return true;
}

function tickDrag() {
  if (!dragState) return;
  const targetWin = dragState.target === 'counter' ? counterWin : win;
  if (!targetWin || targetWin.isDestroyed()) return;
  if (Date.now() - dragState.startedAt > 120000) { stopDrag(); return; }
  const point = screen.getCursorScreenPoint();
  const dx = point.x - dragState.startX;
  const dy = point.y - dragState.startY;
  dragState.tickCount = (dragState.tickCount || 0) + 1;
  if (dragState.tickCount % 8 === 0) {
    dbg('tick', { point, dx, dy, mode: dragState.mode, target: dragState.target });
  }
  if (dragState.mode === 'move') {
    targetWin.setPosition(dragState.bounds.x + dx, dragState.bounds.y + dy);
  } else {
    targetWin.setSize(
      Math.max(120, dragState.bounds.width + dx),
      Math.max(60, dragState.bounds.height + dy)
    );
  }
}

function stopDrag(save = true) {
  if (!dragState) return false;
  clearInterval(dragState.timer);
  dbg('stop', { state: { target: dragState.target, mode: dragState.mode, startX: dragState.startX, startY: dragState.startY, bounds: dragState.bounds } });
  const target = dragState.target;
  dragState = null;
  if (save) {
    if (target === 'counter') saveCounterSoon();
    else saveBoundsSoon();
  }
  return true;
}

function defaultBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const width = Math.min(cfg.width || 420, wa.width);
  const height = Math.min(cfg.height || 760, wa.height);
  return {
    width,
    height,
    x: wa.x + wa.width - width - 24,
    y: wa.y + Math.round((wa.height - height) / 2)
  };
}

let viewCssKey = null;

function viewCss() {
  const parts = [];
  if (cfg.hide.time) {
    parts.push('.message [class*="_time_"], .message .time { display: none !important; }');
    parts.push('.msg .time { visibility: hidden !important; }');
  }
  if (cfg.hide.icons) {
    parts.push('.message [class*="_avatar_"], .message .icon { display: none !important; }');
    parts.push('.msg .icon { visibility: hidden !important; }');
  }
  if (cfg.hide.names) parts.push('.message [class*="_name_"], .message .name, .msg .name { display: none !important; }');
  if (cfg.hide.time || cfg.hide.icons) {
    const timeCol = cfg.hide.time ? 0 : 48;
    const iconCol = cfg.hide.icons ? 0 : 20;
    parts.push(`.msg { grid-template-columns: ${timeCol}px ${iconCol}px minmax(0, 1fr) !important; }`);
  }
  return parts.join('\n');
}

function applyViewCss() {
  if (!win || win.isDestroyed()) return;
  const css = viewCss();
  if (viewCssKey) {
    win.webContents.removeInsertedCSS(viewCssKey).catch(() => {});
    viewCssKey = null;
  }
  if (!css) return;
  win.webContents.insertCSS(css).then((key) => { viewCssKey = key; }).catch(() => {});
}

function applyContentOpacity() {
  const value = String(Math.min(1, Math.max(0.2, Number(cfg.opacity) || 1)));
  const script = `document.body.style.opacity = '${value}';`;
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript(script).catch(() => {});
  if (counterWin && !counterWin.isDestroyed()) counterWin.webContents.executeJavaScript(script).catch(() => {});
}

function installMessageObserver() {
  if (!win || win.isDestroyed()) return;
  const script = `(() => {
    if (window.__svoMsgObserver) return;
    window.__svoMsgObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && (node.classList.contains('message') || node.classList.contains('msg'))) {
            try { window.svo.notifyMessage(); } catch (_) {}
          }
        }
      }
    });
    window.__svoMsgObserver.observe(document.body, { childList: true, subtree: true });
  })()`;
  win.webContents.executeJavaScript(script).catch(() => {});
}

function backgroundCss(url) {
  const transparent = 'html,body{background:transparent !important;background-image:none !important;}';
  try {
    const raw = new URL(url).searchParams.get('background') || '';
    const m = raw.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) {
      const alpha = m[2] ? parseInt(m[2], 16) : 255;
      if (alpha === 0) {
        return transparent + ' #app{background:transparent !important;background-image:none !important;}';
      }
      return transparent + ` #app{background:${raw} !important;}`;
    }
  } catch (_) { /* ignore */ }
  return transparent + ' #app{background:transparent !important;background-image:none !important;}';
}

function createOverlay() {
  const d = defaultBounds();
  const x = Number.isInteger(cfg.x) ? cfg.x : d.x;
  const y = Number.isInteger(cfg.y) ? cfg.y : d.y;

  win = new BrowserWindow({
    x, y,
    width: d.width,
    height: d.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    thickFrame: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    title: 'StreamVi Chat Overlay',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  win.setMenuBarVisibility(false);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setContentProtection(!!cfg.hideFromCapture);
  win.setOpacity(cfg.opacity);

  win.once('ready-to-show', () => {
    win.showInactive();
    applyLock();
  });

  win.webContents.on('dom-ready', () => {
    viewCssKey = null;
    win.webContents.insertCSS(backgroundCss(cfg.url)).catch(() => {});
    win.webContents.insertCSS('::-webkit-scrollbar{width:0 !important;height:0 !important;display:none !important;}').catch(() => {});
    applyViewCss();
    installMessageObserver();
    applyContentOpacity();
    if (demoMode) { applySimScale(); applySimColors(); }
    applyLock();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('https://chat.streamvi.io/') && !url.startsWith(SIM_URL)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[overlay] load failed', code, desc);
  });

  win.on('move', saveBoundsSoon);
  win.on('resize', saveBoundsSoon);
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
      updateTrayMenu();
    }
  });
  win.on('closed', () => { win = null; });

  win.loadURL(cfg.url).catch((err) => console.error('[overlay] loadURL', err));

  if (process.argv.includes('--demo')) {
    demoMode = true;
    win.loadURL(SIM_URL).catch(() => {});
  }
}

function counterBounds() {
  const c = cfg.counter;
  const width = c.width || 360;
  const height = c.height || 120;
  if (Number.isInteger(c.x) && Number.isInteger(c.y)) {
    return { x: c.x, y: c.y, width, height };
  }
  const wa = screen.getPrimaryDisplay().workArea;
  let x = wa.x + wa.width - width - 24;
  let y = wa.y + 24;
  if (win && !win.isDestroyed()) {
    const b = win.getBounds();
    x = b.x + b.width - width;
    y = b.y - height - 12;
    if (y < wa.y) y = b.y + b.height + 12;
  }
  return { x, y, width, height };
}

function saveCounterSoon() {
  if (!counterWin || counterWin.isDestroyed()) return;
  clearTimeout(counterTimer);
  counterTimer = setTimeout(() => {
    if (!counterWin || counterWin.isDestroyed()) return;
    const b = counterWin.getBounds();
    cfg.counter.x = b.x; cfg.counter.y = b.y;
    cfg.counter.width = b.width; cfg.counter.height = b.height;
    saveConfig();
  }, 400);
}

function createCounter() {
  if (!cfg.counter.enabled) return;
  if (counterWin && !counterWin.isDestroyed()) return;
  const b = counterBounds();
  counterWin = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    thickFrame: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    title: 'StreamVi Viewer Counter',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  counterWin.setMenuBarVisibility(false);
  counterWin.setAlwaysOnTop(true, 'screen-saver');
  counterWin.setContentProtection(!!cfg.hideFromCapture);
  counterWin.loadURL(cfg.counter.url).catch(() => {});
  counterWin.once('ready-to-show', () => {
    counterWin.showInactive();
    applyCounterLock();
  });
  counterWin.webContents.on('dom-ready', () => {
    counterWin.webContents.insertCSS(COUNTER_CSS).catch(() => {});
    applyContentOpacity();
    applyCounterLock();
  });
  counterWin.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[counter] load failed', code, desc);
  });
  counterWin.on('move', saveCounterSoon);
  counterWin.on('resize', saveCounterSoon);
  counterWin.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      counterWin.hide();
    }
  });
  counterWin.on('closed', () => { counterWin = null; });
}

function ensureCounterEditUi(locked) {
  if (!counterWin || counterWin.isDestroyed()) return;
  const script = `(() => {
    const BAR = '__svo_bar';
    const GRIP = '__svo_grip';
    const STYLE = '__svo_style';
    if (!document.getElementById(STYLE)) {
      const st = document.createElement('style');
      st.id = STYLE;
      st.textContent = ${JSON.stringify(UI_CSS)};
      document.documentElement.appendChild(st);
    }
    const oldBar = document.getElementById(BAR);
    const oldGrip = document.getElementById(GRIP);
    if (${locked}) {
      if (oldBar) oldBar.remove();
      if (oldGrip) oldGrip.remove();
      document.documentElement.style.outline = '';
      return;
    }
    if (!oldBar) {
      const bar = document.createElement('div');
      bar.id = BAR;
      const text = document.createElement('span');
      text.className = 'svo-text';
      text.textContent = 'Счётчик · тяни за полосу · Ctrl+Alt+L — закрепить';
      bar.appendChild(text);
      const settings = document.createElement('button');
      settings.textContent = 'Настройки';
      settings.addEventListener('click', (e) => { e.stopPropagation(); window.svo.openSettings(); });
      bar.appendChild(settings);

      const hideBtn = document.createElement('button');
      hideBtn.textContent = 'Скрыть';
      hideBtn.title = 'Выключить счётчик';
      hideBtn.addEventListener('click', (e) => { e.stopPropagation(); window.svo.toggleCounter(); });
      bar.appendChild(hideBtn);

      bar.addEventListener('pointerdown', (e) => {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        e.preventDefault();
        try { bar.setPointerCapture(e.pointerId); } catch (_) {}
        window.svo.dragStart('move', 'counter');
        const onUp = () => { window.svo.dragEnd(); bar.removeEventListener('pointerup', onUp, true); bar.removeEventListener('pointercancel', onUp, true); };
        bar.addEventListener('pointerup', onUp, true);
        bar.addEventListener('pointercancel', onUp, true);
      });
      document.documentElement.appendChild(bar);
    }
    if (!oldGrip) {
      const grip = document.createElement('div');
      grip.id = GRIP;
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { grip.setPointerCapture(e.pointerId); } catch (_) {}
        window.svo.dragStart('resize', 'counter');
        const onUp = () => { window.svo.dragEnd(); grip.removeEventListener('pointerup', onUp, true); grip.removeEventListener('pointercancel', onUp, true); };
        grip.addEventListener('pointerup', onUp, true);
        grip.addEventListener('pointercancel', onUp, true);
      });
      document.documentElement.appendChild(grip);
    }
    document.documentElement.style.outline = '2px solid rgba(155, 92, 246, 0.95)';
    document.documentElement.style.outlineOffset = '-2px';
  })()`;
  counterWin.webContents.executeJavaScript(script, true).catch(() => {});
}

function applyCounterLock() {
  if (!counterWin || counterWin.isDestroyed()) return;
  counterWin.setIgnoreMouseEvents(cfg.locked, { forward: true });
  ensureCounterEditUi(cfg.locked);
}

function toggleCounter(force) {
  cfg.counter.enabled = typeof force === 'boolean' ? force : !cfg.counter.enabled;
  saveConfig();
  if (cfg.counter.enabled) {
    createCounter();
    if (counterWin && !counterWin.isDestroyed()) {
      counterWin.showInactive();
      applyCounterLock();
    }
  } else if (counterWin && !counterWin.isDestroyed()) {
    counterWin.hide();
  }
  updateTrayMenu();
  return cfg.counter.enabled;
}

function ensureEditUi(locked) {
  if (!win || win.isDestroyed()) return;
  const script = `(() => {
    const BAR = '__svo_bar';
    const GRIP = '__svo_grip';
    const STYLE = '__svo_style';
    if (!document.getElementById(STYLE)) {
      const st = document.createElement('style');
      st.id = STYLE;
      st.textContent = ${JSON.stringify(UI_CSS)};
      document.documentElement.appendChild(st);
    }
    const oldBar = document.getElementById(BAR);
    const oldGrip = document.getElementById(GRIP);
    if (${locked}) {
      if (oldBar) oldBar.remove();
      if (oldGrip) oldGrip.remove();
      document.documentElement.classList.remove('__svo_unlocked');
      document.documentElement.style.outline = '';
      return;
    }
    document.documentElement.classList.add('__svo_unlocked');
    if (!oldBar) {
      const bar = document.createElement('div');
      bar.id = BAR;

      const text = document.createElement('span');
      text.className = 'svo-text';
      text.textContent = 'Тяни за полосу · размер — угол справа снизу · Ctrl+Alt+L — закрепить';
      bar.appendChild(text);

      const settings = document.createElement('button');
      settings.textContent = 'Настройки';
      settings.addEventListener('click', (e) => { e.stopPropagation(); window.svo.openSettings(); });
      bar.appendChild(settings);

      const lock = document.createElement('button');
      lock.textContent = 'Закрепить';
      lock.addEventListener('click', (e) => { e.stopPropagation(); window.svo.toggleLock(); });
      bar.appendChild(lock);

      const demo = document.createElement('button');
      demo.textContent = 'Демо';
      demo.addEventListener('click', (e) => { e.stopPropagation(); window.svo.toggleDemo(); });
      bar.appendChild(demo);

      const counterBtn = document.createElement('button');
      counterBtn.textContent = 'Счётчик';
      counterBtn.title = 'Показать или скрыть счётчик зрителей';
      counterBtn.addEventListener('click', (e) => { e.stopPropagation(); window.svo.toggleCounter(); });
      bar.appendChild(counterBtn);

      const smaller = document.createElement('button');
      smaller.textContent = 'A-';
      smaller.title = 'Уменьшить масштаб';
      smaller.addEventListener('click', (e) => { e.stopPropagation(); window.svo.stepScale(-10); });
      bar.appendChild(smaller);

      const bigger = document.createElement('button');
      bigger.textContent = 'A+';
      bigger.title = 'Увеличить масштаб';
      bigger.addEventListener('click', (e) => { e.stopPropagation(); window.svo.stepScale(10); });
      bar.appendChild(bigger);

      bar.addEventListener('pointerdown', (e) => {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        e.preventDefault();
        try { bar.setPointerCapture(e.pointerId); } catch (_) {}
        window.svo.dragStart('move');
        const onUp = () => {
          window.svo.dragEnd();
          bar.removeEventListener('pointerup', onUp, true);
          bar.removeEventListener('pointercancel', onUp, true);
        };
        bar.addEventListener('pointerup', onUp, true);
        bar.addEventListener('pointercancel', onUp, true);
      });

      document.documentElement.appendChild(bar);
    }
    if (!oldGrip) {
      const grip = document.createElement('div');
      grip.id = GRIP;
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { grip.setPointerCapture(e.pointerId); } catch (_) {}
        window.svo.dragStart('resize');
        const onUp = () => {
          window.svo.dragEnd();
          grip.removeEventListener('pointerup', onUp, true);
          grip.removeEventListener('pointercancel', onUp, true);
        };
        grip.addEventListener('pointerup', onUp, true);
        grip.addEventListener('pointercancel', onUp, true);
      });
      document.documentElement.appendChild(grip);
    }
    document.documentElement.style.outline = '2px solid rgba(155, 92, 246, 0.95)';
    document.documentElement.style.outlineOffset = '-2px';
  })()`;
  win.webContents.executeJavaScript(script, true).catch(() => {});
}

function applyLock() {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(cfg.locked, { forward: true });
  win.setFocusable(!cfg.locked);
  if (cfg.locked) win.blur();
  ensureEditUi(cfg.locked);
  applyCounterLock();
  updateTrayMenu();
}

function toggleLock() {
  cfg.locked = !cfg.locked;
  applyLock();
  saveConfig();
}

function toggleVisible() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) {
    win.hide();
    if (counterWin && !counterWin.isDestroyed()) counterWin.hide();
  } else {
    win.showInactive();
    if (counterWin && !counterWin.isDestroyed() && cfg.counter.enabled) counterWin.showInactive();
  }
  updateTrayMenu();
}

function reloadChat() {
  if (win && !win.isDestroyed()) win.webContents.reload();
}

function toggleDemo(force) {
  if (!win || win.isDestroyed()) return false;
  demoMode = typeof force === 'boolean' ? force : !demoMode;
  win.loadURL(demoMode ? SIM_URL : cfg.url).catch(() => {});
  updateTrayMenu();
  return demoMode;
}

function applySimScale() {
  if (!win || win.isDestroyed()) return;
  const zoom = Math.max(0.5, cfg.scale / 149);
  win.webContents.executeJavaScript(`document.documentElement.style.zoom = ${zoom.toFixed(3)};`).catch(() => {});
}

function applySimColors() {
  if (!win || win.isDestroyed()) return;
  let c;
  try { c = new URL(cfg.url); } catch (_) { return; }
  const get = (key, fallback) => c.searchParams.get(key) || fallback;
  const script = `
    document.body.style.setProperty('--svo-text', ${JSON.stringify(get('color', '#F0E8DA'))});
    document.body.style.setProperty('--svo-name', ${JSON.stringify(get('nameColor', '#D9A85F'))});
    document.body.style.setProperty('--svo-box', ${JSON.stringify(get('messageBoxColor', 'transparent'))});
    document.body.style.setProperty('--svo-bg', ${JSON.stringify(get('background', 'transparent'))});
  `;
  win.webContents.executeJavaScript(script).catch(() => {});
}

function scheduleReload() {
  clearTimeout(scaleTimer);
  scaleTimer = setTimeout(() => {
    if (win && !win.isDestroyed()) win.loadURL(cfg.url).catch(() => {});
  }, 350);
}

function setScale(pct) {
  const value = Math.min(250, Math.max(80, Math.round(Number(pct) || 100)));
  cfg.scale = value;
  try {
    const u = new URL(cfg.url);
    u.searchParams.set('scale', String(value));
    cfg.url = u.toString();
  } catch (_) { /* ignore */ }
  saveConfig();
  if (demoMode) applySimScale();
  else scheduleReload();
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('scale-changed', value);
  }
  return value;
}

function resetBounds() {
  if (!win || win.isDestroyed()) return;
  const b = defaultBounds();
  cfg.x = null; cfg.y = null;
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
  saveConfig();
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 640,
    height: 780,
    minWidth: 520,
    minHeight: 600,
    title: 'StreamVi Chat Overlay — настройки',
    icon: ICON_PATH,
    backgroundColor: '#12121a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function registerHotkeys() {
  const hk = cfg.hotkeys;
  const reg = (accel, fn, name) => {
    if (!accel) return;
    try {
      const ok = globalShortcut.register(accel, fn);
      if (!ok) console.warn('[hotkey] not registered:', name, accel);
    } catch (err) {
      console.warn('[hotkey] error:', name, accel, err);
    }
  };
  reg(hk.toggleLock, toggleLock, 'toggleLock');
  reg(hk.toggleVisible, toggleVisible, 'toggleVisible');
  reg(hk.reload, reloadChat, 'reload');
  reg(hk.settings, openSettings, 'settings');
  reg(hk.resetBounds, resetBounds, 'resetBounds');
  reg(hk.demo, () => toggleDemo(), 'demo');
  reg(hk.counter, () => toggleCounter(), 'counter');
  reg(hk.zoomIn, () => setScale(cfg.scale + 10), 'zoomIn');
  reg(hk.zoomOut, () => setScale(cfg.scale - 10), 'zoomOut');
  try { globalShortcut.register('CommandOrControl+Alt+Plus', () => setScale(cfg.scale + 10)); } catch (_) { /* ignore */ }
}

function updateTrayMenu() {
  if (!tray) return;
  const visible = win && !win.isDestroyed() && win.isVisible();
  const menu = Menu.buildFromTemplate([
    { label: visible ? 'Скрыть оверлей' : 'Показать оверлей', click: toggleVisible },
    { label: cfg.locked ? 'Разблокировать (Ctrl+Alt+L)' : 'Закрепить (Ctrl+Alt+L)', click: toggleLock },
    { type: 'separator' },
    { label: 'Перезагрузить чат (Ctrl+Alt+R)', click: reloadChat },
    { label: 'Сбросить размер и позицию (Ctrl+Alt+0)', click: resetBounds },
    { label: 'Демо-чат: симуляция (Ctrl+Alt+D)', type: 'checkbox', checked: demoMode, click: () => toggleDemo() },
    { label: 'Счётчик зрителей (Ctrl+Alt+V)', type: 'checkbox', checked: !!cfg.counter.enabled, click: () => toggleCounter() },
    { type: 'separator' },
    { label: 'Настройки… (Ctrl+Alt+S)', click: openSettings },
    { label: 'Открыть папку с конфигом', click: () => shell.openPath(APP_DIR) },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  let icon = nativeImage.createFromPath(ICON_PATH);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('StreamVi Chat Overlay');
  tray.on('click', toggleVisible);
  updateTrayMenu();
}

function normalizeUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const gotLock = app.requestSingleInstanceLock();
const firstRun = !fs.existsSync(CONFIG_PATH);
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());

  app.whenReady().then(() => {
    createOverlay();
    if (cfg.counter.enabled) createCounter();
    createTray();
    registerHotkeys();
    if (firstRun) setTimeout(openSettings, 600);

    ipcMain.handle('state:get', () => ({ cfg, presets: PRESETS, appDir: APP_DIR }));

    ipcMain.handle('state:save', (_event, patch) => {
      if (!patch || typeof patch !== 'object') return { ok: false };
      const url = normalizeUrl(patch.url);
      if (!url) return { ok: false, error: 'URL должен начинаться с http:// или https://' };

      const urlChanged = url !== cfg.url;
      cfg.url = url;
      try {
        const fromUrl = parseInt(new URL(url).searchParams.get('scale'), 10);
        if (Number.isFinite(fromUrl)) cfg.scale = fromUrl;
      } catch (_) { /* ignore */ }
      cfg.hideFromCapture = !!patch.hideFromCapture;
      const op = Number(patch.opacity);
      cfg.opacity = Number.isFinite(op) ? Math.min(1, Math.max(0.2, op)) : 1;
      saveConfig();

      if (win && !win.isDestroyed()) {
        win.setContentProtection(cfg.hideFromCapture);
        win.setOpacity(cfg.opacity);
        applyContentOpacity();
        if (urlChanged) {
          demoMode = false;
          win.loadURL(cfg.url).catch(() => {});
        }
      }
      updateTrayMenu();
      return { ok: true };
    });

    ipcMain.handle('overlay:reset-bounds', () => { resetBounds(); return true; });
    ipcMain.handle('overlay:toggle-lock', () => { toggleLock(); return cfg.locked; });
    ipcMain.handle('overlay:get-bounds', () => (win && !win.isDestroyed() ? win.getBounds() : null));
    ipcMain.handle('overlay:set-position', (_event, x, y) => {
      if (!win || win.isDestroyed()) return false;
      win.setPosition(Math.round(Number(x) || 0), Math.round(Number(y) || 0));
      return true;
    });
    ipcMain.handle('overlay:set-size', (_event, w, h) => {
      if (!win || win.isDestroyed()) return false;
      const width = Math.max(220, Math.round(Number(w) || 0));
      const height = Math.max(160, Math.round(Number(h) || 0));
      win.setSize(width, height);
      return true;
    });
    ipcMain.handle('app:open-settings', () => { openSettings(); return true; });
    ipcMain.handle('overlay:drag-start', (_event, mode, target) => startDrag(mode, target === 'counter' ? 'counter' : 'chat'));
    ipcMain.handle('overlay:drag-end', () => stopDrag());
    ipcMain.handle('overlay:toggle-demo', () => toggleDemo());
    ipcMain.handle('overlay:set-scale', (_event, pct) => setScale(pct));
    ipcMain.handle('overlay:set-opacity', (_event, value) => {
      const op = Number(value);
      cfg.opacity = Number.isFinite(op) ? Math.min(1, Math.max(0.2, op)) : 1;
      saveConfig();
      if (win && !win.isDestroyed()) win.setOpacity(cfg.opacity);
      applyContentOpacity();
      return cfg.opacity;
    });
    ipcMain.handle('overlay:step-scale', (_event, delta) => setScale(cfg.scale + (Number(delta) || 0)));
    ipcMain.handle('view:set', (_event, patch) => {
      if (!patch || typeof patch !== 'object') return null;
      if (patch.hide) {
        cfg.hide = { ...cfg.hide, ...patch.hide };
        applyViewCss();
      }
      let reload = false;
      if (patch.param && typeof patch.param === 'object') {
        try {
          const u = new URL(cfg.url);
          for (const [key, value] of Object.entries(patch.param)) {
            if (value === null || value === undefined || value === '') u.searchParams.delete(key);
            else u.searchParams.set(key, String(value));
          }
          cfg.url = u.toString();
          reload = !demoMode;
        } catch (_) { /* ignore */ }
      }
      saveConfig();
      if (demoMode) applySimColors();
      else if (reload) scheduleReload();
      return { hide: cfg.hide, url: cfg.url };
    });
    ipcMain.handle('sound:pick', async () => {
      const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : win;
      const res = await dialog.showOpenDialog(parent, {
        title: 'Выбрать звук нового сообщения',
        properties: ['openFile'],
        filters: [{ name: 'Аудио', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }]
      });
      if (res.canceled || !res.filePaths.length) return null;
      return res.filePaths[0];
    });

    ipcMain.handle('sound:set', (_event, patch) => {
      if (!patch || typeof patch !== 'object') return null;
      cfg.sound = {
        enabled: !!patch.enabled,
        file: typeof patch.file === 'string' ? patch.file : cfg.sound.file
      };
      try {
        const u = new URL(cfg.url);
        u.searchParams.set('messageSound', cfg.sound.enabled && !cfg.sound.file ? 'true' : 'false');
        cfg.url = u.toString();
      } catch (_) { /* ignore */ }
      saveConfig();
      if (!demoMode) scheduleReload();
      return cfg.sound;
    });

    ipcMain.handle('sound:test', (_event, file) => playSound(file));

    ipcMain.on('overlay:message', () => {
      if (!cfg.sound || !cfg.sound.enabled || !cfg.sound.file) return;
      const now = Date.now();
      if (now - lastSoundAt < 250) return;
      lastSoundAt = now;
      playSound();
    });

    ipcMain.handle('counter:set', (_event, patch) => {
      if (!patch || typeof patch !== 'object') return null;
      if (typeof patch.enabled === 'boolean') cfg.counter.enabled = patch.enabled;
      if (typeof patch.url === 'string') {
        const url = patch.url.trim();
        if (/^https?:\/\//i.test(url)) {
          const changed = url !== cfg.counter.url;
          cfg.counter.url = url;
          if (changed && counterWin && !counterWin.isDestroyed()) {
            counterWin.loadURL(url).catch(() => {});
          }
        }
      }
      saveConfig();
      toggleCounter(cfg.counter.enabled);
      return cfg.counter;
    });

    ipcMain.handle('counter:reset-bounds', () => {
      cfg.counter.x = null;
      cfg.counter.y = null;
      cfg.counter.width = 360;
      cfg.counter.height = 120;
      saveConfig();
      if (counterWin && !counterWin.isDestroyed()) {
        counterWin.setBounds(counterBounds());
      }
      return true;
    });

    ipcMain.handle('counter:set-bounds', (_event, b) => {
      if (!b || typeof b !== 'object') return null;
      cfg.counter.width = Math.max(100, Math.round(Number(b.width) || cfg.counter.width || 360));
      cfg.counter.height = Math.max(60, Math.round(Number(b.height) || cfg.counter.height || 120));
      cfg.counter.x = b.x === null || b.x === undefined || b.x === '' ? null : Math.round(Number(b.x));
      cfg.counter.y = b.y === null || b.y === undefined || b.y === '' ? null : Math.round(Number(b.y));
      saveConfig();
      if (counterWin && !counterWin.isDestroyed()) {
        counterWin.setBounds({
          x: cfg.counter.x,
          y: cfg.counter.y,
          width: cfg.counter.width,
          height: cfg.counter.height
        });
      }
      return cfg.counter;
    });

    ipcMain.handle('counter:toggle', () => toggleCounter());

    ipcMain.handle('app:quit', () => { quitting = true; app.quit(); return true; });
    ipcMain.handle('app:open-dir', () => { shell.openPath(APP_DIR); return true; });
  });

  app.on('window-all-closed', (event) => {
    if (event && event.preventDefault) event.preventDefault();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (tray) { tray.destroy(); tray = null; }
  });
}
