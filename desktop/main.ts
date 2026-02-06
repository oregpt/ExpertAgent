/**
 * Electron Main Process — Expert Agent Desktop App
 *
 * Forks the Express server as a child process and loads the
 * web admin UI in a BrowserWindow pointed at localhost.
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import { fork, ChildProcess } from 'child_process';
import path from 'path';

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const SERVER_PORT = process.env.PORT || '4100';
const IS_DEV = !app.isPackaged;

function getServerEntryPath(): string {
  if (IS_DEV) {
    // In dev, run the TypeScript source directly via ts-node
    return path.join(__dirname, '..', 'server', 'src', 'index.ts');
  }
  // In production (packaged), __dirname is desktop/dist/, so go up two levels to reach root
  return path.join(__dirname, '..', '..', 'server', 'dist', 'index.js');
}

async function startServer(): Promise<void> {
  const serverEntry = getServerEntryPath();
  const dataDir = app.getPath('userData');

  console.log(`[desktop] Starting server: ${serverEntry}`);
  console.log(`[desktop] Data directory: ${dataDir}`);

  const env = {
    ...process.env,
    IS_DESKTOP: 'true',
    EXPERT_AGENT_DATA_DIR: dataDir,
    PORT: SERVER_PORT,
    NODE_ENV: IS_DEV ? 'development' : 'production',
    // License key is loaded from {dataDir}/license.key by the server on startup.
    // No dev mode bypass — customers must enter a valid license key in the setup wizard.
  };

  if (IS_DEV) {
    // Dev mode: use ts-node to run TypeScript directly
    const tsNodePath = path.join(__dirname, '..', 'server', 'node_modules', '.bin', 'ts-node');
    serverProcess = fork(serverEntry, [], {
      env,
      execArgv: ['--require', 'ts-node/register'],
    });
  } else {
    serverProcess = fork(serverEntry, [], { env });
  }

  // Wait for server to signal readiness
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[desktop] Server did not signal ready in 10s, continuing...');
      resolve();
    }, 10000);

    serverProcess!.on('message', (msg: string) => {
      if (msg === 'ready') {
        clearTimeout(timeout);
        console.log('[desktop] Server is ready');
        resolve();
      }
    });

    serverProcess!.on('error', (err) => {
      console.error('[desktop] Server process error:', err);
      clearTimeout(timeout);
      resolve();
    });

    serverProcess!.on('exit', (code) => {
      console.log(`[desktop] Server process exited with code ${code}`);
      serverProcess = null;
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Expert Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the web admin UI from the local server
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  // Open DevTools in dev mode
  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    if (tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    console.warn('[desktop] Tray icon not found at', iconPath, '— skipping system tray');
    return;
  }

  tray = new Tray(icon);
  tray.setToolTip('Expert Agent');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: `Server: http://localhost:${SERVER_PORT}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray = null; // Allow window close
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  // Register IPC handlers
  ipcMain.handle('get-version', () => app.getVersion());

  await startServer();
  createWindow();
  createTray();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (!mainWindow) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep running until explicit quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Kill the server process on quit
  if (serverProcess) {
    console.log('[desktop] Stopping server process...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
});
