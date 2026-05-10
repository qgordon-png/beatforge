const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');

let mainWindow;

// ─── AUTO UPDATER CONFIG ───
autoUpdater.autoDownload = true;         // download silently in background
autoUpdater.autoInstallOnAppQuit = true; // install when user quits

function setupAutoUpdater() {
  // Check for updates 3 seconds after launch
  setTimeout(() => autoUpdater.checkForUpdates().catch(()=>{}), 3000);

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:available', { version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('updater:not-available', { version: info?.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error:', err.message);
    mainWindow?.webContents.send('updater:not-available', { error: err.message });
  });
}

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
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('src/index.html');

  // Catch renderer crash — reload instead of black screen
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details.reason, details.exitCode);
    // Reload after short delay
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.reload();
      }
    }, 500);
  });

  mainWindow.on('unresponsive', () => {
    console.warn('Window unresponsive — forcing reload');
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
    }, 2000);
  });

  // Catch renderer crash — reload instead of black screen
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details.reason, details.exitCode);
    // Reload after short delay
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.reload();
      }
    }, 500);
  });

  mainWindow.on('unresponsive', () => {
    console.warn('Window unresponsive — forcing reload');
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
    }, 2000);
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// Prevent GPU process from killing renderer on audio context crash
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-file-access-from-files');

// Prevent GPU process from killing renderer on audio context crash
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-file-access-from-files');

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC: RESTART & INSTALL UPDATE ───
ipcMain.on('updater:install', () => {
  autoUpdater.quitAndInstall();
});

// ─── IPC: MANUAL CHECK FOR UPDATES ───
ipcMain.on('updater:check', () => {
  autoUpdater.checkForUpdates().catch(err => {
    mainWindow?.webContents.send('updater:not-available', { error: err.message });
  });
});

// ─── IPC: GET APP VERSION ───
ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

// ─── IPC: MIDI OUTPUTS ───
ipcMain.handle('midi:listOutputs', async () => {
  try {
    const JZZ = require('jzz');
    const info = JZZ.info();
    return info.outputs.map(o => ({ name: o.name, id: o.id }));
  } catch (e) { return []; }
});

// ─── IPC: SEND MIDI NOTE ───
ipcMain.handle('midi:sendNote', async (event, { output, channel, note, velocity, duration }) => {
  try {
    const JZZ = require('jzz');
    const port = JZZ().openMidiOut(output);
    port.noteOn(channel, note, velocity);
    setTimeout(() => port.noteOff(channel, note), duration || 200);
    return true;
  } catch (e) { return false; }
});

// ─── IPC: SEND MIDI PATTERN ───
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
  } catch (e) { return false; }
});

// ─── IPC: NATIVE FILE DRAG ───
ipcMain.on('midi:startDrag', (event, { filename, midiBytes }) => {
  try {
    const tmpDir = path.join(os.tmpdir(), 'beatforge_midi');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, Buffer.from(midiBytes));
    const icon = nativeImage.createEmpty();
    event.sender.startDrag({ file: filePath, icon });
  } catch (e) { console.error('Drag error:', e); }
});

// ─── IPC: SAVE MIDI FILE ───
ipcMain.handle('midi:save', async (event, { filename, midiBytes }) => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [{ name: 'MIDI Files', extensions: ['mid'] }]
    });
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, Buffer.from(midiBytes));
      return { saved: true, path: result.filePath };
    }
    return { saved: false };
  } catch (e) { return { saved: false, error: e.message }; }
});

// ─── IPC: AI GENERATION ───
ipcMain.handle('ai:generate', async (event, { prompt, context }) => {
  try {
    const response = await fetch('https://69bef4dcb0f4d4940e8dea6d.base44.app/api/functions/beatforgeAI', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context })
    });
    const data = await response.json();
    return data;
  } catch (e) { return { error: e.message }; }
});
