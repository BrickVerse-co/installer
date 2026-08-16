import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { app } from "electron";
import type { BrickVerseApp, InstallRequest, InstallState, ProgressEvent } from "./types";
import { createShortcut, installDirectory, locateExecutable, metadataPath, productName, removeShortcuts } from "./platform";
import { downloadFile, resolveBinary } from "./binaries";

async function exists(file: string): Promise<boolean> {
	try { await fs.access(file); return true; } catch { return false; }
}

async function writeMetadata(target: BrickVerseApp, data: InstallState): Promise<void> {
	const file = metadataPath(target);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export async function getInstallState(target: BrickVerseApp): Promise<InstallState> {
	let metadata: Partial<InstallState> = {};
	try {
		metadata = JSON.parse(await fs.readFile(metadataPath(target), "utf8")) as Partial<InstallState>;
	} catch {
		// Metadata may not exist for older/manual installs.
	}
	const directory = installDirectory(target, metadata.installDirectory);
	return {
		installed: await exists(directory),
		installDirectory: directory,
		executablePath: metadata.executablePath,
		version: metadata.version,
		branch: metadata.branch,
		autoUpdate: metadata.autoUpdate ?? true,
	};
}

async function extractZip(zipPath: string, staging: string, onProgress: (event: ProgressEvent) => void): Promise<void> {
	onProgress({ phase: "extracting", percent: 0, message: "Reading package..." });
	const entries = new AdmZip(zipPath).getEntries();
	const total = Math.max(entries.length, 1);
	await fs.mkdir(staging, { recursive: true });

	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		const normalized = path.normalize(entry.entryName);
		if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
			throw new Error(`Unsafe path in ZIP package: ${entry.entryName}`);
		}
		const destination = path.join(staging, normalized);
		if (entry.isDirectory) {
			await fs.mkdir(destination, { recursive: true });
		} else {
			await fs.mkdir(path.dirname(destination), { recursive: true });
			await fs.writeFile(destination, entry.getData());
			if (process.platform !== "win32" && (destination.endsWith(".x86_64") || destination.includes("/Contents/MacOS/"))) {
				await fs.chmod(destination, 0o755);
			}
		}
		onProgress({ phase: "extracting", percent: Math.round(((index + 1) / total) * 100), message: `Extracting... ${Math.round(((index + 1) / total) * 100)}%` });
	}
}

async function normalizeExtractedRoot(staging: string): Promise<string> {
	const entries = await fs.readdir(staging, { withFileTypes: true });
	return entries.length === 1 && entries[0].isDirectory() ? path.join(staging, entries[0].name) : staging;
}

function cachedArchivePath(target: BrickVerseApp, branch: string, url: string, createdAt: string): string {
	const identity = crypto.createHash("sha256").update(`${url}\n${createdAt}`).digest("hex").slice(0, 20);
	return path.join(app.getPath("userData"), "package-cache", target, branch, `${identity}.zip`);
}

async function isUsableZip(file: string): Promise<boolean> {
	try {
		if (!(await exists(file))) return false;
		return new AdmZip(file).getEntries().length > 0;
	} catch {
		return false;
	}
}

async function acquirePackage(
	target: BrickVerseApp,
	branch: string,
	url: string,
	createdAt: string,
	onProgress: (event: ProgressEvent) => void,
): Promise<string> {
	const archive = cachedArchivePath(target, branch, url, createdAt);
	if (await isUsableZip(archive)) {
		onProgress({ phase: "checking", percent: 100, message: "Using the cached, verified package..." });
		return archive;
	}

	await fs.rm(archive, { force: true });
	const partial = `${archive}.partial-${process.pid}`;
	await fs.rm(partial, { force: true });
	try {
		await downloadFile(url, partial, onProgress);
		if (!(await isUsableZip(partial))) throw new Error("The downloaded package is not a valid ZIP archive.");
		await fs.mkdir(path.dirname(archive), { recursive: true });
		await fs.rename(partial, archive);
		return archive;
	} catch (error) {
		await fs.rm(partial, { force: true });
		throw error;
	}
}

export async function installProduct(request: InstallRequest, onProgress: (event: ProgressEvent) => void): Promise<InstallState> {
	const name = productName(request.app);
	const previous = await getInstallState(request.app);
	const destination = installDirectory(request.app, request.installDirectory || previous.installDirectory);
	const work = await fs.mkdtemp(path.join(os.tmpdir(), `brickverse-${request.app}-`));
	const staging = path.join(work, "staging");
	const replacement = `${destination}.replacement-${process.pid}-${Date.now()}`;
	const backup = `${destination}.backup-${process.pid}-${Date.now()}`;

	try {
		onProgress({ phase: "checking", percent: 0, message: `Finding the latest ${name} build...` });
		const binary = await resolveBinary(request.app, request.branch);
		const archive = await acquirePackage(request.app, request.branch, binary.url, binary.createdAt, onProgress);
		await extractZip(archive, staging, onProgress);
		const isUpdate = previous.installed;
		onProgress({ phase: isUpdate ? "updating" : "installing", percent: 10, message: `${isUpdate ? "Updating" : "Installing"} ${name}...` });
		await fs.mkdir(path.dirname(destination), { recursive: true });

		const extractedRoot = await normalizeExtractedRoot(staging);
		await fs.rm(replacement, { recursive: true, force: true });
		if (process.platform === "darwin") {
			const bundles = (await fs.readdir(extractedRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
			await fs.cp(bundles.length === 1 ? path.join(extractedRoot, bundles[0].name) : extractedRoot, replacement, { recursive: true });
		} else {
			await fs.cp(extractedRoot, replacement, { recursive: true });
		}

		// Never remove a working install until the replacement is complete and runnable.
		await locateExecutable(replacement, request.app);
		try {
			if (await exists(destination)) await fs.rename(destination, backup);
			await fs.rename(replacement, destination);
			await fs.rm(backup, { recursive: true, force: true });
		} catch (error) {
			await fs.rm(destination, { recursive: true, force: true });
			if (await exists(backup)) await fs.rename(backup, destination);
			throw error;
		}

		const executablePath = await locateExecutable(destination, request.app);
		if (request.createDesktopShortcut) {
			onProgress({ phase: "shortcut", percent: 92, message: "Creating desktop shortcut..." });
			await createShortcut(request.app, executablePath, destination, false);
		}
		if (request.createStartMenuShortcut) {
			onProgress({ phase: "shortcut", percent: 95, message: "Creating application menu shortcut..." });
			await createShortcut(request.app, executablePath, destination, true);
		}

		const state: InstallState = {
			installed: true,
			installDirectory: destination,
			executablePath,
			version: binary.createdAt,
			branch: request.branch,
			autoUpdate: request.autoUpdate,
		};
		await writeMetadata(request.app, state);
		if (previous.installed && previous.installDirectory !== destination) {
			await fs.rm(previous.installDirectory, { recursive: true, force: true });
		}
		onProgress({ phase: "complete", percent: 100, message: `${name} was ${isUpdate ? "updated" : "installed"}.` });
		return state;
	} finally {
		await fs.rm(replacement, { recursive: true, force: true });
		await fs.rm(work, { recursive: true, force: true });
	}
}

export async function uninstallProduct(target: BrickVerseApp, onProgress: (event: ProgressEvent) => void): Promise<InstallState> {
	const name = productName(target);
	const current = await getInstallState(target);
	onProgress({ phase: "uninstalling", percent: 20, message: `Removing ${name}...` });
	await fs.rm(current.installDirectory, { recursive: true, force: true });
	onProgress({ phase: "uninstalling", percent: 70, message: "Removing shortcuts..." });
	await removeShortcuts(target);
	await fs.rm(metadataPath(target), { force: true });
	const state: InstallState = { installed: false, installDirectory: current.installDirectory };
	onProgress({ phase: "complete", percent: 100, message: `${name} was uninstalled.` });
	return state;
}
