const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let backend;

async function createWindow() {
  const appPath = app.getAppPath();
  const envCandidates = [
    path.join(app.getPath('userData'), '.env'),
    path.join(path.dirname(app.getPath('exe')), '.env'),
    path.join(appPath, '.env'),
  ];
  const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
  if (envPath) require('dotenv').config({ path: envPath });
  const { startServer } = await import(pathToFileURL(path.join(appPath, 'dist-server', 'index.js')).href);
  backend = await startServer({ port: 0, staticDir: path.join(appPath, 'dist') });

  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#0b0c0e',
    icon: path.join(appPath, 'build', 'icon.png'),
    title: 'PteroControl',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  await window.loadURL(`http://127.0.0.1:${backend.port}`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => backend?.server?.close());
