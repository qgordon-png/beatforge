const { contextBridge, ipcMain } = require('electron');

contextBridge.exposeInMainWorld('beatforge', {
  // MIDI API
  midi: {
    listOutputs: () => ipcMain.invoke('midi:listOutputs'),
    sendNote: (params) => ipcMain.invoke('midi:sendNote', params),
    sendPattern: (params) => ipcMain.invoke('midi:sendPattern', params),
  },
  // AI API
  ai: {
    generate: (prompt, context) => ipcMain.invoke('ai:generate', { prompt, context }),
  },
  // App info
  app: {
    getVersion: () => '0.1.0',
  }
});
