'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('svo', {
  getState: () => ipcRenderer.invoke('state:get'),
  save: (patch) => ipcRenderer.invoke('state:save', patch),
  resetBounds: () => ipcRenderer.invoke('overlay:reset-bounds'),
  toggleLock: () => ipcRenderer.invoke('overlay:toggle-lock'),
  getBounds: () => ipcRenderer.invoke('overlay:get-bounds'),
  moveTo: (x, y) => ipcRenderer.invoke('overlay:set-position', x, y),
  setSize: (w, h) => ipcRenderer.invoke('overlay:set-size', w, h),
  dragStart: (mode, target) => ipcRenderer.invoke('overlay:drag-start', mode, target || 'chat'),
  dragEnd: () => ipcRenderer.invoke('overlay:drag-end'),
  toggleDemo: () => ipcRenderer.invoke('overlay:toggle-demo'),
  setCounter: (patch) => ipcRenderer.invoke('counter:set', patch),
  resetCounter: () => ipcRenderer.invoke('counter:reset-bounds'),
  notifyMessage: () => ipcRenderer.send('overlay:message'),
  pickSound: () => ipcRenderer.invoke('sound:pick'),
  setSound: (patch) => ipcRenderer.invoke('sound:set', patch),
  testSound: (file) => ipcRenderer.invoke('sound:test', file),
  setScale: (pct) => ipcRenderer.invoke('overlay:set-scale', pct),
  stepScale: (delta) => ipcRenderer.invoke('overlay:step-scale', delta),
  setView: (patch) => ipcRenderer.invoke('view:set', patch),
  onScaleChanged: (cb) => ipcRenderer.on('scale-changed', (_e, value) => cb(value)),
  openSettings: () => ipcRenderer.invoke('app:open-settings'),
  openDir: () => ipcRenderer.invoke('app:open-dir'),
  quit: () => ipcRenderer.invoke('app:quit')
});
