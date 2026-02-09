/**
 * Electron Main Process — Expert Agent Desktop App
 *
 * Forks the Express server as a child process and loads the
 * web admin UI in a BrowserWindow pointed at localhost.
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Suppress EPIPE errors when writing to closed stdout/stderr (e.g., when child process disconnects)
process.stdout?.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
  throw err;
});
process.stderr?.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

const SERVER_PORT = process.env.PORT || '4100';
const IS_DEV = !app.isPackaged;

function getServerEntryPath(): string {
  if (IS_DEV) {
    // In dev, __dirname = desktop/dist/, go up 2 levels to project root
    // Use compiled JS (not TS) — avoids ts-node/ESM issues with system Node.js
    return path.join(__dirname, '..', '..', 'server', 'dist', 'index.js');
  }
  // In production (packaged), server is unpacked to app.asar.unpacked
  // __dirname is inside app.asar/desktop/dist/, but we need app.asar.unpacked/server/dist/
  const asarPath = path.join(__dirname, '..', '..', 'server', 'dist', 'index.js');
  // Replace app.asar with app.asar.unpacked for the forked server process
  return asarPath.replace('app.asar', 'app.asar.unpacked');
}

async function startServer(): Promise<void> {
  const serverEntry = getServerEntryPath();
  const dataDir = app.getPath('userData');

  console.log(`[desktop] Starting server: ${serverEntry}`);
  console.log(`[desktop] Data directory: ${dataDir}`);

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    IS_DESKTOP: 'true',
    EXPERT_AGENT_DATA_DIR: dataDir,
    PORT: SERVER_PORT,
    NODE_ENV: IS_DEV ? 'development' : 'production',
    BROWSER_HEADLESS: 'false', // Show browser window for user visibility
    // License key is loaded from {dataDir}/license.key by the server on startup.
    // No dev mode bypass — customers must enter a valid license key in the setup wizard.
  };

  // In dev mode, enable all features via env vars so tools work without a license key
  if (IS_DEV) {
    env.AGENTICLEDGER_DEV_MODE = 'true';
    env.FEATURE_MULTI_AGENT = 'true';
    env.FEATURE_MAX_AGENTS = '10';
    env.FEATURE_MULTIMODAL = 'true';
    env.FEATURE_MCP_HUB = 'true';
    env.FEATURE_CAPABILITIES = '*';
    env.FEATURE_CUSTOM_BRANDING = 'true';
    env.FEATURE_SOUL_MEMORY = 'true';
    env.FEATURE_DEEP_TOOLS = 'true';
    env.FEATURE_PROACTIVE = 'true';
    env.FEATURE_BACKGROUND_AGENTS = 'true';
    env.FEATURE_MULTI_CHANNEL = 'true';
  }

  // Use spawn with system Node.js to avoid ABI mismatch with native modules (better-sqlite3).
  // Electron's fork() uses Electron's bundled Node, which has a different ABI than
  // the Node.js that compiled the native modules.
  const nodePath = process.platform === 'win32' ? 'node.exe' : 'node';
  
  if (IS_DEV) {
    // Dev mode: run compiled JS (same as prod) to avoid ts-node/ESM issues with system Node
    serverProcess = spawn(nodePath, [serverEntry], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
  } else {
    serverProcess = spawn(nodePath, [serverEntry], { 
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
  }

  // Capture server stdout/stderr for debugging
  serverProcess.stdout?.on('data', (data: Buffer) => {
    const output = data.toString().trim();
    console.log(`[server] ${output}`);
    // Check for server ready signal in stdout (since we can't use IPC with spawn)
    if (output.includes('[server] HTTP listening on')) {
      console.log('[desktop] Server is ready (detected via stdout)');
      serverReadyResolve?.();
    }
  });
  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[server:err] ${data.toString().trim()}`);
  });

  // Wait for server to signal readiness via stdout
  let serverReadyResolve: (() => void) | null = null;
  
  return new Promise<void>((resolve) => {
    serverReadyResolve = resolve;
    
    const timeout = setTimeout(() => {
      console.warn('[desktop] Server did not signal ready in 15s, continuing...');
      resolve();
    }, 15000);

    serverProcess!.on('error', (err) => {
      console.error('[desktop] Server process error:', err);
      clearTimeout(timeout);
      resolve();
    });

    serverProcess!.on('exit', (code) => {
      console.log(`[desktop] Server process exited with code ${code}`);
      serverProcess = null;
      clearTimeout(timeout);
      resolve();
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
  // In dev: __dirname = desktop/dist/, assets at desktop/assets/
  // In prod: __dirname = app.asar/desktop/dist/, assets at app.asar/desktop/assets/
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
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
