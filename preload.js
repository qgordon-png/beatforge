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
    getVersion: () => '0.2.0',
    isElectron: true,
  },
  updater: {
    // Listen for update status messages from main process
    onStatus:   (cb) => ipcRenderer.on('updater:status',   (_, data) => cb(data)),
    onProgress: (cb) => ipcRenderer.on('updater:progress', (_, data) => cb(data)),
    // Tell main to quit and install
    install: () => ipcRenderer.send('updater:install'),
  }
});
