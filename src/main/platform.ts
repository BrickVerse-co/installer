import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { app, shell } from "electron";
import type { BrickVerseApp } from "./types";

export function apiPlatform(): "windows" | "linux" | "macos" {
  switch (process.platform) {
    case "win32": return "windows";
    case "darwin": return "macos";
    default: return "linux";
  }
}

export function productName(target: BrickVerseApp): string {
  if (target === "creator") return "BrickVerse Creator";
  if (target === "guild-chat") return "BrickVerse Guild Chat";
  return "BrickVerse";
}

export function installDirectory(target: BrickVerseApp, customDirectory?: string): string {
	if (customDirectory?.trim()) return path.resolve(customDirectory.trim());
  const name = productName(target);

  if (process.platform === "win32") {
    const directoryName = target === "guild-chat" ? "BrickVerseGuildChannels" : name;
    return path.join(process.env.LOCALAPPDATA ?? app.getPath("appData"), "Programs", directoryName);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Applications", `${name}.app`);
  }

  return path.join(os.homedir(), ".local", "share", "brickverse", target);
}

export function metadataPath(target: BrickVerseApp): string {
  return path.join(app.getPath("userData"), "installed", `${target}.json`);
}

function startMenuDirectory(): string {
	return path.join(process.env.APPDATA ?? app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs");
}

async function findFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else output.push(full);
    }
  }
  await walk(root);
  return output;
}

export async function locateExecutable(root: string, target: BrickVerseApp): Promise<string> {
  if (process.platform === "darwin") {
    const macExecutable = await locateMacExecutable(root, target);
    if (macExecutable) return macExecutable;
  }

  const files = await findFiles(root);
  const preferred = target === "creator"
    ? [
        "brickversecreator.exe",
        "brickversecreator.x86_64",
        "brickversecreator",
        "brickverse creator.exe"
      ]
    : target === "guild-chat"
      ? ["brickverseguildchannels.exe", "brickverse guild channels.exe", "brickverseguildchannels", "brickverseguildchannels.x86_64"]
      : [
        "brickverse.exe",
        "brickverse.x86_64",
        "brickverse"
      ];

  for (const wanted of preferred) {
    const match = files.find((file) => path.basename(file).toLowerCase() === wanted);
    if (match) return match;
  }

  const extension = process.platform === "win32" ? ".exe" : ".x86_64";
  const fallback = files.find((file) => file.toLowerCase().endsWith(extension));
  if (!fallback) throw new Error(`Could not find a runnable ${productName(target)} executable after extraction.`);
  return fallback;
}

async function locateMacExecutable(root: string, target: BrickVerseApp): Promise<string | undefined> {
  const bundleRoots: string[] = [];
  if (root.endsWith(".app")) bundleRoots.push(root);

  try {
    const contents = path.join(root, "Contents", "MacOS");
    const entries = await fs.readdir(contents, { withFileTypes: true });
    if (entries.length > 0) bundleRoots.push(root);
  } catch {
    // The root may contain an app bundle instead of being one itself
  }

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    bundleRoots.push(
      ...entries
        .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
        .map((entry) => path.join(root, entry.name)),
    );
  } catch {
    return undefined;
  }

  const preferred = target === "creator"
    ? ["brickversecreator", "brickverse creator", "brickverse"]
    : target === "guild-chat"
      ? ["brickverseguildchannels", "brickverse guild channels"]
      : ["brickverse"];

  for (const bundleRoot of [...new Set(bundleRoots)]) {
    const macos = path.join(bundleRoot, "Contents", "MacOS");
    let entries;
    try {
      entries = await fs.readdir(macos, { withFileTypes: true });
    } catch {
      continue;
    }

    const files = entries.filter((entry) => entry.isFile());
    for (const wanted of preferred) {
      const match = files.find((entry) => entry.name.toLowerCase() === wanted);
      if (match) return path.join(macos, match.name);
    }

    for (const entry of files) {
      try {
        const stats = await fs.stat(path.join(macos, entry.name));
        if ((stats.mode & 0o111) !== 0) return path.join(macos, entry.name);
      } catch {
        // Ignore files that disappear while the package is being inspected
      }
    }
  }

  return undefined;
}

export async function createShortcut(target: BrickVerseApp, executablePath: string, installRoot: string, startMenu = false): Promise<void> {
  const name = productName(target);

  if (process.platform === "win32") {
	const shortcutDirectory = startMenu ? startMenuDirectory() : app.getPath("desktop");
	await fs.mkdir(shortcutDirectory, { recursive: true });
	const shortcut = path.join(shortcutDirectory, `${name}.lnk`);
	const success = shell.writeShortcutLink(shortcut, "create", {
	  target: process.execPath,
	  args: `brickverse://${target}`,
	  cwd: path.dirname(process.execPath),
      description: `Launch ${name}`,
      icon: executablePath,
      iconIndex: 0
    });
    if (!success) throw new Error(`Windows could not create ${shortcut}.`);
    return;
  }

  if (process.platform === "darwin") {
    const shortcut = path.join(app.getPath("desktop"), `${name}.app`);
    await fs.rm(shortcut, { recursive: true, force: true });
	await fs.symlink(installRoot, shortcut, "dir");
    return;
  }

  const applications = path.join(os.homedir(), ".local", "share", "applications");
  await fs.mkdir(applications, { recursive: true });
  const desktopFile = path.join(applications, `brickverse-${target}.desktop`);
  const contents = [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${name}`,
	`Exec="${process.execPath}" "brickverse://${target}"`,
	`Path=${path.dirname(process.execPath)}`,
    "Terminal=false",
    "Categories=Game;",
    "StartupNotify=true",
    ""
  ].join("\n");
  await fs.writeFile(desktopFile, contents, { mode: 0o755 });

  const desktop = app.getPath("desktop");
  try {
    await fs.access(desktop);
    await fs.copyFile(desktopFile, path.join(desktop, `${name}.desktop`));
    await fs.chmod(path.join(desktop, `${name}.desktop`), 0o755);
  } catch {
    // Desktop folders are optional on Linux.
  }
}

export async function removeShortcuts(target: BrickVerseApp): Promise<void> {
  const name = productName(target);
	const names = target === "guild-chat" ? [name, "BrickVerseGuildChannels"] : [name];
  const paths =
    process.platform === "win32"
      ? names.flatMap((shortcutName) => [
		  path.join(app.getPath("desktop"), `${shortcutName}.lnk`),
		  path.join(startMenuDirectory(), `${shortcutName}.lnk`),
		])
      : process.platform === "darwin"
        ? [path.join(app.getPath("desktop"), `${name}.app`)]
        : [
            path.join(os.homedir(), ".local", "share", "applications", `brickverse-${target}.desktop`),
            path.join(app.getPath("desktop"), `${name}.desktop`)
          ];

  await Promise.all(paths.map((file) => fs.rm(file, { recursive: true, force: true })));
}
