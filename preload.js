const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beatforge', {
  // MIDI API
  midi: {
    listOutputs: () => ipcRenderer.invoke('midi:listOutputs'),
    sendNote: (params) => ipcRenderer.invoke('midi:sendNote', params),
    sendPattern: (params) => ipcRenderer.invoke('midi:sendPattern', params),
    // Native drag — sends bytes to main process which writes temp file + triggers OS drag
    startDrag: (filename, midiBytes) => ipcRenderer.send('midi:startDrag', { filename, midiBytes }),
    // Save dialog fallback
    save: (filename, midiBytes) => ipcRenderer.invoke('midi:save', { filename, midiBytes }),
  },
  // AI API
  ai: {
    generate: (prompt, context) => ipcRenderer.invoke('ai:generate', { prompt, context }),
  },
  // App info
  app: {
    getVersion: () => '0.1.0',
    isElectron: true,
  }
});
