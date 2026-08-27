import { contextBridge, ipcRenderer } from "electron";
import type { AutoLaunchState, BrickVerseApp, InstallRequest, ProgressEvent } from "./types";

contextBridge.exposeInMainWorld("brickverse", {
  platform: process.platform,
  getState: (target: BrickVerseApp) => ipcRenderer.invoke("installer:get-state", target),
	chooseDirectory: (current?: string) => ipcRenderer.invoke("installer:choose-directory", current),
  install: (request: InstallRequest) => ipcRenderer.invoke("installer:install", request),
  uninstall: (target: BrickVerseApp) => ipcRenderer.invoke("installer:uninstall", target),
  launch: (target: BrickVerseApp) => ipcRenderer.invoke("installer:launch", target),
  openFolder: (target: BrickVerseApp) => ipcRenderer.invoke("installer:open-folder", target),
  getVersion: () => ipcRenderer.invoke("installer:get-version"),
  getRequestedProduct: () => ipcRenderer.invoke("installer:get-requested-product"),
  getAutoLaunchState: () => ipcRenderer.invoke("installer:get-auto-launch-state"),
  onAutoLaunch: (callback: (state: AutoLaunchState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AutoLaunchState) => callback(state);
    ipcRenderer.on("installer:auto-launch", listener);
    return () => ipcRenderer.removeListener("installer:auto-launch", listener);
  },
  onSelectProduct: (callback: (target: BrickVerseApp | null) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, target: BrickVerseApp | null) => callback(target);
    ipcRenderer.on("installer:select-product", listener);
    return () => ipcRenderer.removeListener("installer:select-product", listener);
  },
  onProgress: (callback: (event: ProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ProgressEvent) => callback(progress);
    ipcRenderer.on("installer:progress", listener);
    return () => ipcRenderer.removeListener("installer:progress", listener);
  },
  onUpdaterStatus: (callback: (status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  }
});
