import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import AdmZip from "adm-zip";
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
  const directory = installDirectory(target);
  let metadata: Partial<InstallState> = {};
  try {
    metadata = JSON.parse(await fs.readFile(metadataPath(target), "utf8")) as Partial<InstallState>;
  } catch {
    // Metadata may not exist for older/manual installs.
  }

  return {
    installed: await exists(directory),
    installDirectory: directory,
    executablePath: metadata.executablePath,
    version: metadata.version
  };
}

async function extractZip(zipPath: string, staging: string, onProgress: (event: ProgressEvent) => void): Promise<void> {
  onProgress({ phase: "extracting", percent: 0, message: "Reading package…" });
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
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

    const percent = Math.round(((index + 1) / total) * 100);
    onProgress({ phase: "extracting", percent, message: `Extracting… ${percent}%` });
  }
}

async function normalizeExtractedRoot(staging: string): Promise<string> {
  const entries = await fs.readdir(staging, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    return path.join(staging, entries[0].name);
  }
  return staging;
}

export async function installProduct(
  request: InstallRequest,
  onProgress: (event: ProgressEvent) => void
): Promise<InstallState> {
  const name = productName(request.app);
  const destination = installDirectory(request.app);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), `brickverse-${request.app}-`));
  const archive = path.join(work, `${request.app}.zip`);
  const staging = path.join(work, "staging");

  try {
    onProgress({ phase: "checking", percent: 0, message: `Finding the latest ${name} build…` });
    const binary = await resolveBinary(request.app, request.branch);

    await downloadFile(binary.url, archive, onProgress);
    await extractZip(archive, staging, onProgress);

    onProgress({ phase: "installing", percent: 10, message: `Installing ${name}…` });
    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(path.dirname(destination), { recursive: true });

    const extractedRoot = await normalizeExtractedRoot(staging);

    if (process.platform === "darwin") {
      const appBundles = (await fs.readdir(extractedRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
      const source = appBundles.length === 1 ? path.join(extractedRoot, appBundles[0].name) : extractedRoot;
      await fs.cp(source, destination, { recursive: true });
    } else {
      await fs.cp(extractedRoot, destination, { recursive: true });
    }

    onProgress({ phase: "installing", percent: 85, message: "Locating executable…" });
    const executablePath = await locateExecutable(destination, request.app);

    if (request.createDesktopShortcut) {
      onProgress({ phase: "shortcut", percent: 92, message: "Creating shortcut…" });
      await createShortcut(request.app, executablePath);
    }

    const state: InstallState = {
      installed: true,
      installDirectory: destination,
      executablePath,
      version: binary.createdAt
    };
    await writeMetadata(request.app, state);

    onProgress({ phase: "complete", percent: 100, message: `${name} is installed.` });
    return state;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

export async function uninstallProduct(
  target: BrickVerseApp,
  onProgress: (event: ProgressEvent) => void
): Promise<InstallState> {
  const name = productName(target);
  onProgress({ phase: "uninstalling", percent: 20, message: `Removing ${name}…` });
  await fs.rm(installDirectory(target), { recursive: true, force: true });

  onProgress({ phase: "uninstalling", percent: 70, message: "Removing shortcuts…" });
  await removeShortcuts(target);
  await fs.rm(metadataPath(target), { force: true });

  const state: InstallState = {
    installed: false,
    installDirectory: installDirectory(target)
  };
  onProgress({ phase: "complete", percent: 100, message: `${name} was uninstalled.` });
  return state;
}
