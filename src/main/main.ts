import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import type { BrickVerseApp, InstallRequest, InstallState, ProgressEvent } from "./types";
import { getInstallState, installProduct, uninstallProduct } from "./installer";
import { resolveBinary } from "./binaries";
import { creatorFiles, parseProtocol, protocolUrls, spawnProduct } from "./protocol";

let mainWindow: BrowserWindow | null = null;
let operationRunning = false;
let requestedInstallerProduct: BrickVerseApp | null = null;
let installerWindowRequested = false;

async function ensureProductCurrent(target: BrickVerseApp): Promise<InstallState> {
  let state = await getInstallState(target);
  if (!state.installed || !state.executablePath) throw new Error(`${target === "creator" ? "BrickVerse Creator" : "BrickVerse"} is not installed.`);
 
  if (state.autoUpdate !== false) {
    const branch = state.branch ?? "main";
		const binary = await resolveBinary(target, branch);

		if (!state.version || Date.parse(binary.createdAt) > Date.parse(state.version)) {
			if (operationRunning) throw new Error("BrickVerse is already being updated.");
			operationRunning = true;
			try {
				state = await installProduct({
					app: target,
					branch,
					installDirectory: state.installDirectory,
					createDesktopShortcut: false,
					createStartMenuShortcut: false,
					autoUpdate: true,
				}, emitProgress);
			} finally {
				operationRunning = false;
			}
		}
  }
  return state;
}

async function launchProduct(target: BrickVerseApp, args: string[]): Promise<void> {
  const state = await ensureProductCurrent(target);
  if (!state.executablePath) throw new Error("No installed executable was recorded.");
  await spawnProduct(state.executablePath, args);
}

async function launchLocalProduct(args: string[]): Promise<void> {
	const options = {
		title: "Select a local BrickVerse build",
		properties: ["openFile"] as Array<"openFile">,
		filters: process.platform === "win32" ? [{ name: "Applications", extensions: ["exe"] }] : undefined,
	};
	const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
	if (result.canceled || !result.filePaths[0]) return;
	await spawnProduct(result.filePaths[0], args);
}

async function processLaunchArguments(argv: string[]): Promise<boolean> {
	let handled = false;

	for (const rawUrl of protocolUrls(argv)) {
		handled = true;
		const request = parseProtocol(rawUrl);
		if (request.target === "installer") {
			installerWindowRequested = true;
			requestedInstallerProduct = request.args[0] === "creator" ? "creator" : request.args[0] === "client" ? "client" : null;
			if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send("installer:select-product", requestedInstallerProduct); }
		}
		else if (request.target === "local") await launchLocalProduct(request.args);
		else await launchProduct(request.target, request.args);
	}

	for (const file of await creatorFiles(argv)) {
		handled = true;
		await launchProduct("creator", ["-file", file]);
	}

	return handled;
}

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

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  app.setAppUserModelId("gg.brickverse.installer");
  app.setAsDefaultProtocolClient("brickverse");
  void processLaunchArguments(process.argv).then((handled) => {
	if (!handled || installerWindowRequested) { if (!mainWindow) createWindow(); }
	else app.quit();
  }).catch((error) => {
    dialog.showErrorBox("Unable to launch BrickVerse", error instanceof Error ? error.message : String(error));
    createWindow();
  });
  configureUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", (_event, argv) => {
  void processLaunchArguments(argv).catch((error) => dialog.showErrorBox("Unable to launch BrickVerse", error instanceof Error ? error.message : String(error)));
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  void processLaunchArguments([url]).catch((error) => dialog.showErrorBox("Unable to launch BrickVerse", error instanceof Error ? error.message : String(error)));
});

app.on("open-file", (event, file) => {
  event.preventDefault();
  void processLaunchArguments([file]).catch((error) => dialog.showErrorBox("Unable to open BrickVerse file", error instanceof Error ? error.message : String(error)));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("installer:get-version", () => app.getVersion());
ipcMain.handle("installer:get-requested-product", () => requestedInstallerProduct);
ipcMain.handle("installer:get-state", (_event, target: BrickVerseApp) => getInstallState(target));
ipcMain.handle("installer:choose-directory", async (_event, current?: string) => {
  const options = {
    title: "Choose BrickVerse install location",
    defaultPath: current,
    properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
});

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
  await launchProduct(target, []);
});

ipcMain.handle("installer:open-folder", async (_event, target: BrickVerseApp) => {
  const state = await getInstallState(target);
  const error = await shell.openPath(state.installDirectory);
  if (error) throw new Error(error);
});
