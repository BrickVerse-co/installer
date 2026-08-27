import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import type {
	AutoLaunchState,
	BrickVerseApp,
	InstallRequest,
	InstallState,
	ProgressEvent,
} from "./types";
import { getInstallState, installProduct, uninstallProduct } from "./installer";
import { resolveBinary } from "./binaries";
import {
	creatorFiles,
	creatorExtensions,
	parseProtocol,
	protocolUrls,
	spawnProduct,
} from "./protocol";

let mainWindow: BrowserWindow | null = null;
let operationRunning = false;
const productUpdates = new Map<BrickVerseApp, Promise<InstallState>>();
let installerUpdateReady = false;
let requestedInstallerProduct: BrickVerseApp | null = null;
let installerWindowRequested = false;
let autoLaunchState: AutoLaunchState | null = null;

function beginAutoLaunch(target: BrickVerseApp): void {
	autoLaunchState = {
		active: true,
		target,
		progress: {
			phase: "checking",
			percent: 0,
			message: `Checking ${target === "creator" ? "BrickVerse Creator" : target === "guild-chat" ? "BrickVerse Guild Chat" : "BrickVerse"} for updates…`,
		},
	};
	if (mainWindow) {
		mainWindow.show();
		mainWindow.focus();
		mainWindow.webContents.send("installer:auto-launch", autoLaunchState);
	}
}

function endAutoLaunch(): void {
	if (!autoLaunchState?.active) return;
	autoLaunchState = { ...autoLaunchState, active: false };
	mainWindow?.webContents.send("installer:auto-launch", autoLaunchState);
}

function startUpdateDemo(target: BrickVerseApp): void {
	beginAutoLaunch(target);
	const stages: ProgressEvent[] = [
		{ phase: "checking", percent: 0, message: "Checking for updates…" },
		{ phase: "downloading", percent: 18, message: "Downloading update… 18%" },
		{ phase: "downloading", percent: 54, message: "Downloading update… 54%" },
		{ phase: "extracting", percent: 78, message: "Preparing update…" },
		{ phase: "updating", percent: 94, message: "Applying update…" },
		{ phase: "complete", percent: 100, message: "Update preview complete. The app would open now." },
	];
	stages.forEach((progress, index) => {
		setTimeout(() => emitProgress(progress), 700 + index * 900);
	});
}

async function ensureProductCurrent(
	target: BrickVerseApp,
): Promise<InstallState> {
	let state = await getInstallState(target);
	if (!state.installed || !state.executablePath)
		throw new Error(
			`${target === "creator" ? "BrickVerse Creator" : target === "guild-chat" ? "BrickVerse Guild Chat" : "BrickVerse"} is not installed.`,
		);

	if (state.autoUpdate !== false) {
		const branch = state.branch ?? "main";
		const binary = await resolveBinary(target, branch);

		if (
			!state.version ||
			Date.parse(binary.createdAt) > Date.parse(state.version)
		) {
			const activeUpdate = productUpdates.get(target);
			if (activeUpdate) return await activeUpdate;
			if (operationRunning)
				throw new Error("Another installer operation is already running.");

			const update = (async (): Promise<InstallState> => {
				operationRunning = true;
				try {
					return await installProduct(
						{
							app: target,
							branch,
							installDirectory: state.installDirectory,
							createDesktopShortcut: false,
							createStartMenuShortcut: false,
							autoUpdate: true,
						},
						emitProgress,
					);
				} finally {
					operationRunning = false;
				}
			})();
			productUpdates.set(target, update);
			try {
				state = await update;
			} finally {
				productUpdates.delete(target);
				applyInstallerUpdateWhenIdle();
			}
		}
	}
	return state;
}

async function launchProduct(
	target: BrickVerseApp,
	args: string[],
): Promise<void> {
	const state = await ensureProductCurrent(target);
	if (!state.executablePath)
		throw new Error("No installed executable was recorded.");
	await spawnProduct(state.executablePath, args);
}

async function launchLocalProduct(args: string[]): Promise<void> {
	const options = {
		title: "Select a local BrickVerse build",
		properties: ["openFile"] as Array<"openFile">,
		filters:
			process.platform === "win32"
				? [{ name: "Applications", extensions: ["exe"] }]
				: undefined,
	};
	const result = mainWindow
		? await dialog.showOpenDialog(mainWindow, options)
		: await dialog.showOpenDialog(options);
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
			requestedInstallerProduct =
				request.args[0] === "creator"
					? "creator"
					: request.args[0] === "client"
						? "client"
						: request.args[0] === "guild-chat"
							? "guild-chat"
						: null;
			if (mainWindow) {
				mainWindow.show();
				mainWindow.focus();
				mainWindow.webContents.send(
					"installer:select-product",
					requestedInstallerProduct,
				);
			}
		} else if (request.target === "local")
			await launchLocalProduct(request.args);
		else {
			beginAutoLaunch(request.target);
			await launchProduct(request.target, request.args);
		}
	}

	for (const file of await creatorFiles(argv)) {
		handled = true;
		beginAutoLaunch("creator");
		await launchProduct("creator", ["-file", file]);
	}

	return handled;
}

function emitProgress(progress: ProgressEvent): void {
	if (autoLaunchState?.active) {
		autoLaunchState = { ...autoLaunchState, progress };
		mainWindow?.webContents.send("installer:auto-launch", autoLaunchState);
	}
	mainWindow?.webContents.send("installer:progress", progress);
	if (process.platform === "win32" || process.platform === "linux") {
		const value =
			progress.phase === "complete" || progress.phase === "error"
				? -1
				: progress.percent / 100;
		mainWindow?.setProgressBar(value);
	}
}

function createWindow(borderless = false): void {
	mainWindow = new BrowserWindow({
		width: borderless ? 560 : 760,
		height: borderless ? 360 : 620,
		...(borderless ? {} : { minWidth: 680, minHeight: 560 }),
		show: false,
		frame: !borderless,
		title: "BrickVerse Installer",
		backgroundColor: "#0e1624",
		autoHideMenuBar: true,
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	const developmentUrl = process.env.VITE_DEV_SERVER_URL;
	if (developmentUrl) {
		void mainWindow.loadURL(`${developmentUrl}${borderless ? "#auto-launch" : ""}`);
	} else {
		void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
			hash: borderless ? "auto-launch" : undefined,
		});
	}

	mainWindow.once("ready-to-show", () => mainWindow?.show());
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

function configureUpdater(): void {
	if (!app.isPackaged) return;

	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.setFeedURL({
		provider: "github",
		owner: "BrickVerse-co",
		repo: "installer",
		releaseType: "release",
	});

	autoUpdater.on("checking-for-update", () =>
		mainWindow?.webContents.send(
			"updater:status",
			"Checking for installer updates…",
		),
	);
	autoUpdater.on("update-available", () =>
		mainWindow?.webContents.send(
			"updater:status",
			"Downloading an installer update…",
		),
	);
	autoUpdater.on("update-not-available", () =>
		mainWindow?.webContents.send("updater:status", "Installer is up to date."),
	);
	autoUpdater.on("download-progress", (info) => {
		mainWindow?.webContents.send(
			"updater:status",
			`Downloading installer update… ${Math.round(info.percent)}%`,
		);
	});
	autoUpdater.on("update-downloaded", () => {
		installerUpdateReady = true;
		mainWindow?.webContents.send(
			"updater:status",
			operationRunning
				? "Installer update ready. It will apply after the current operation."
				: "Installer update ready. Restarting to apply it...",
		);
		applyInstallerUpdateWhenIdle();
	});
	autoUpdater.on("error", (error) => {
		console.error("Auto-update failed:", error);
		mainWindow?.webContents.send(
			"updater:status",
			"Could not check for installer updates.",
		);
	});

	setTimeout(
		() => void autoUpdater.checkForUpdates().catch(console.error),
		2500,
	);
}

function applyInstallerUpdateWhenIdle(): void {
	if (!installerUpdateReady || operationRunning) return;
	installerUpdateReady = false;
	setTimeout(() => autoUpdater.quitAndInstall(false, true), 1200);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

app.whenReady().then(() => {
	if (!gotSingleInstanceLock) return;
	app.setAppUserModelId("gg.brickverse.installer");
	app.setAsDefaultProtocolClient("brickverse");
	const demoArgument = process.argv.find((value) => value.startsWith("--demo-update"));
	if (demoArgument) {
		const requestedTarget = demoArgument.split("=", 2)[1];
		const target: BrickVerseApp = requestedTarget === "creator" || requestedTarget === "guild-chat" ? requestedTarget : "client";
		createWindow();
		startUpdateDemo(target);
		return;
	}
	const hasProductLaunch =
		protocolUrls(process.argv).some((rawUrl) => {
			try {
				const target = parseProtocol(rawUrl).target;
				return target === "client" || target === "creator" || target === "guild-chat";
			} catch {
				return false;
			}
		}) ||
		process.argv.some((value) =>
			creatorExtensions.has(path.extname(value).toLowerCase()),
		);
	if (hasProductLaunch) createWindow(true);
	void processLaunchArguments(process.argv)
		.then((handled) => {
			if (!handled || installerWindowRequested) {
				if (!mainWindow) createWindow();
			} else app.quit();
		})
		.catch((error) => {
			endAutoLaunch();
			dialog.showErrorBox(
				"Unable to launch BrickVerse",
				error instanceof Error ? error.message : String(error),
			);
			if (!mainWindow) createWindow();
			else {
				mainWindow.show();
				mainWindow.focus();
			}
		});
	configureUpdater();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("second-instance", (_event, argv) => {
	void processLaunchArguments(argv).catch((error) => {
		endAutoLaunch();
		dialog.showErrorBox(
			"Unable to launch BrickVerse",
			error instanceof Error ? error.message : String(error),
		);
	});
});

app.on("open-url", (event, url) => {
	event.preventDefault();
	void processLaunchArguments([url]).catch((error) => {
		endAutoLaunch();
		dialog.showErrorBox(
			"Unable to launch BrickVerse",
			error instanceof Error ? error.message : String(error),
		);
	});
});

app.on("open-file", (event, file) => {
	event.preventDefault();
	void processLaunchArguments([file]).catch((error) => {
		endAutoLaunch();
		dialog.showErrorBox(
			"Unable to open BrickVerse file",
			error instanceof Error ? error.message : String(error),
		);
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("installer:get-version", () => app.getVersion());
ipcMain.handle(
	"installer:get-requested-product",
	() => requestedInstallerProduct,
);
ipcMain.handle("installer:get-auto-launch-state", () => autoLaunchState);
ipcMain.handle("installer:get-state", (_event, target: BrickVerseApp) =>
	getInstallState(target),
);
ipcMain.handle(
	"installer:choose-directory",
	async (_event, current?: string) => {
		const options = {
			title: "Choose BrickVerse install location",
			defaultPath: current,
			properties: ["openDirectory", "createDirectory"] as Array<
				"openDirectory" | "createDirectory"
			>,
		};
		const result = mainWindow
			? await dialog.showOpenDialog(mainWindow, options)
			: await dialog.showOpenDialog(options);
		return result.canceled ? null : (result.filePaths[0] ?? null);
	},
);

ipcMain.handle("installer:install", async (_event, request: InstallRequest) => {
	if (operationRunning)
		throw new Error("Another installer operation is already running.");
	operationRunning = true;
	try {
		return await installProduct(request, emitProgress);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		emitProgress({ phase: "error", percent: 0, message });
		throw error;
	} finally {
		operationRunning = false;
		applyInstallerUpdateWhenIdle();
	}
});

ipcMain.handle("installer:uninstall", async (_event, target: BrickVerseApp) => {
	if (operationRunning)
		throw new Error("Another installer operation is already running.");
	operationRunning = true;
	try {
		return await uninstallProduct(target, emitProgress);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		emitProgress({ phase: "error", percent: 0, message });
		throw error;
	} finally {
		operationRunning = false;
		applyInstallerUpdateWhenIdle();
	}
});

ipcMain.handle("installer:launch", async (_event, target: BrickVerseApp) => {
	await launchProduct(target, []);
});

ipcMain.handle(
	"installer:open-folder",
	async (_event, target: BrickVerseApp) => {
		const state = await getInstallState(target);
		const error = await shell.openPath(state.installDirectory);
		if (error) throw new Error(error);
	},
);
