import path from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import type { BrickVerseApp, InstallRequest, ProgressEvent } from "./types";
import { getInstallState, installProduct, uninstallProduct } from "./installer";

let mainWindow: BrowserWindow | null = null;
let operationRunning = false;

function emitProgress(progress: ProgressEvent): void {
  mainWindow?.webContents.send("installer:progress", progress);
  if (process.platform === "win32" || process.platform === "linux") {
    const value = progress.phase === "complete" || progress.phase === "error" ? -1 : progress.percent / 100;
    mainWindow?.setProgressBar(value);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 620,
    minWidth: 680,
    minHeight: 560,
    show: false,
    title: "BrickVerse Installer",
    backgroundColor: "#0e1624",
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    void mainWindow.loadURL(developmentUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
}

function configureUpdater(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => mainWindow?.webContents.send("updater:status", "Checking for installer updates…"));
  autoUpdater.on("update-available", () => mainWindow?.webContents.send("updater:status", "Downloading an installer update…"));
  autoUpdater.on("update-not-available", () => mainWindow?.webContents.send("updater:status", "Installer is up to date."));
  autoUpdater.on("download-progress", (info) => {
    mainWindow?.webContents.send("updater:status", `Downloading installer update… ${Math.round(info.percent)}%`);
  });
  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("updater:status", "Installer update ready. It will apply when you close the app.");
  });
  autoUpdater.on("error", (error) => {
    console.error("Auto-update failed:", error);
    mainWindow?.webContents.send("updater:status", "Could not check for installer updates.");
  });

  setTimeout(() => void autoUpdater.checkForUpdates().catch(console.error), 2500);
}

app.whenReady().then(() => {
  app.setAppUserModelId("gg.brickverse.installer");
  createWindow();
  configureUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("installer:get-version", () => app.getVersion());
ipcMain.handle("installer:get-state", (_event, target: BrickVerseApp) => getInstallState(target));

ipcMain.handle("installer:install", async (_event, request: InstallRequest) => {
  if (operationRunning) throw new Error("Another installer operation is already running.");
  operationRunning = true;
  try {
    return await installProduct(request, emitProgress);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitProgress({ phase: "error", percent: 0, message });
    throw error;
  } finally {
    operationRunning = false;
  }
});

ipcMain.handle("installer:uninstall", async (_event, target: BrickVerseApp) => {
  if (operationRunning) throw new Error("Another installer operation is already running.");
  operationRunning = true;
  try {
    return await uninstallProduct(target, emitProgress);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitProgress({ phase: "error", percent: 0, message });
    throw error;
  } finally {
    operationRunning = false;
  }
});

ipcMain.handle("installer:launch", async (_event, target: BrickVerseApp) => {
  const state = await getInstallState(target);
  if (!state.executablePath) throw new Error("No installed executable was recorded.");
  const error = await shell.openPath(state.executablePath);
  if (error) throw new Error(error);
});

ipcMain.handle("installer:open-folder", async (_event, target: BrickVerseApp) => {
  const state = await getInstallState(target);
  const error = await shell.openPath(state.installDirectory);
  if (error) throw new Error(error);
});
