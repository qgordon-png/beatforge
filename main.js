const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0a',
      symbolColor: '#C9A84C',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('src/index.html');

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC HANDLERS ───

// MIDI output list
ipcMain.handle('midi:listOutputs', async () => {
  try {
    const JZZ = require('jzz');
    const info = JZZ.info();
    return info.outputs.map(o => ({ name: o.name, id: o.id }));
  } catch (e) {
    return [];
  }
});

// Send MIDI note
ipcMain.handle('midi:sendNote', async (event, { output, channel, note, velocity, duration }) => {
  try {
    const JZZ = require('jzz');
    const port = JZZ().openMidiOut(output);
    port.noteOn(channel, note, velocity);
    setTimeout(() => port.noteOff(channel, note), duration || 200);
    return true;
  } catch (e) {
    return false;
  }
});

// Send full MIDI pattern
ipcMain.handle('midi:sendPattern', async (event, { output, channel, notes }) => {
  try {
    const JZZ = require('jzz');
    const port = JZZ().openMidiOut(output);
    for (const n of notes) {
      setTimeout(() => {
        port.noteOn(channel || 0, n.note, n.velocity || 100);
        setTimeout(() => port.noteOff(channel || 0, n.note), n.duration || 200);
      }, n.time || 0);
    }
    return true;
  } catch (e) {
    return false;
  }
});

// AI generation call (proxied through Base44)
ipcMain.handle('ai:generate', async (event, { prompt, context }) => {
  try {
    const response = await fetch('https://69bef4dcb0f4d4940e8dea6d.base44.app/api/functions/beatforgeAI', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context })
    });
    const data = await response.json();
    return data;
  } catch (e) {
    return { error: e.message };
  }
});
