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
  return target === "creator" ? "BrickVerse Creator" : "BrickVerse";
}

export function installDirectory(target: BrickVerseApp): string {
  const name = productName(target);

  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? app.getPath("appData"), "Programs", name);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Applications", `${name}.app`);
  }

  return path.join(os.homedir(), ".local", "share", "brickverse", target);
}

export function metadataPath(target: BrickVerseApp): string {
  return path.join(app.getPath("userData"), "installed", `${target}.json`);
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
  if (process.platform === "darwin" && root.endsWith(".app")) {
    const macos = path.join(root, "Contents", "MacOS");
    const entries = await fs.readdir(macos, { withFileTypes: true });
    const executable = entries.find((entry) => entry.isFile());
    if (executable) return path.join(macos, executable.name);
  }

  const files = await findFiles(root);
  const preferred = target === "creator"
    ? [
        "brickversecreator.exe",
        "brickversecreator.x86_64",
        "brickversecreator",
        "brickverse creator.exe"
      ]
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

export async function createShortcut(target: BrickVerseApp, executablePath: string): Promise<void> {
  const name = productName(target);

  if (process.platform === "win32") {
    const shortcut = path.join(app.getPath("desktop"), `${name}.lnk`);
    const success = shell.writeShortcutLink(shortcut, "create", {
      target: executablePath,
      cwd: path.dirname(executablePath),
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
    await fs.symlink(installDirectory(target), shortcut, "dir");
    return;
  }

  const applications = path.join(os.homedir(), ".local", "share", "applications");
  await fs.mkdir(applications, { recursive: true });
  const desktopFile = path.join(applications, `brickverse-${target}.desktop`);
  const contents = [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${name}`,
    `Exec="${executablePath}"`,
    `Path=${path.dirname(executablePath)}`,
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
  const paths =
    process.platform === "win32"
      ? [path.join(app.getPath("desktop"), `${name}.lnk`)]
      : process.platform === "darwin"
        ? [path.join(app.getPath("desktop"), `${name}.app`)]
        : [
            path.join(os.homedir(), ".local", "share", "applications", `brickverse-${target}.desktop`),
            path.join(app.getPath("desktop"), `${name}.desktop`)
          ];

  await Promise.all(paths.map((file) => fs.rm(file, { recursive: true, force: true })));
}
