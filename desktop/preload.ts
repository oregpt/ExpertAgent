/**
 * Electron Preload Script — Context Bridge
 *
 * Exposes safe APIs from the main process to the renderer.
 * Uses contextBridge to maintain security isolation.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isDesktop: true,

  // Version info
  getVersion: () => ipcRenderer.invoke('get-version'),
});
