const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beatforge', {
  midi: {
    listOutputs: () => ipcRenderer.invoke('midi:listOutputs'),
    sendNote:    (p)  => ipcRenderer.invoke('midi:sendNote', p),
    sendPattern: (p)  => ipcRenderer.invoke('midi:sendPattern', p),
    startDrag:   (filename, midiBytes) => ipcRenderer.send('midi:startDrag', { filename, midiBytes }),
    save:        (filename, midiBytes) => ipcRenderer.invoke('midi:save', { filename, midiBytes }),
  },
  ai: {
    generate: (prompt, context) => ipcRenderer.invoke('ai:generate', { prompt, context }),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    isElectron: true,
  },
  updater: {
    onStatus:        (cb) => ipcRenderer.on('updater:status',        (_, d) => cb(d)),
    onProgress:      (cb) => ipcRenderer.on('updater:progress',      (_, d) => cb(d)),
    onDownloaded:    (cb) => ipcRenderer.on('updater:downloaded',    (_, d) => cb(d)),
    onNotAvailable:  (cb) => ipcRenderer.on('updater:not-available', (_, d) => cb(d)),
    onAvailable:     (cb) => ipcRenderer.on('updater:available',     (_, d) => cb(d)),
    checkForUpdates: ()   => ipcRenderer.send('updater:check'),
    install:         ()   => ipcRenderer.send('updater:install'),
  }
});

// electronAPI — used by updater UI in app.js
contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateAvailable:    (cb) => ipcRenderer.on('updater:available',     (_, d) => cb(d)),
  onUpdateDownloaded:   (cb) => ipcRenderer.on('updater:downloaded',    (_, d) => cb(d)),
  onUpdateProgress:     (cb) => ipcRenderer.on('updater:progress',      (_, d) => cb(d)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('updater:not-available', (_, d) => cb(d)),
  checkForUpdates:      ()   => ipcRenderer.send('updater:check'),
  installUpdate:        ()   => ipcRenderer.send('updater:install'),
});
